# Neon Postgres -> Firestore migration (Phase 0 output)

Status: **built and verified on the emulator** (see `docs/firestore-cutover-runbook.md` for how to go live). Postgres stays
the source of truth until `DATA_BACKEND=firestore` is set. What exists: adapters for every domain (leads/CRM, developer
directory, staff, testimonials, engagement, enquiries, notifications, profiles, social, social automation, analytics log,
behaviour, retention, platform health, all 16 founder-dashboard queries), a transaction layer, a Postgres -> Firestore copy
script, a parity-check script, generated indexes, and the existing lead test-suite running against Firestore (697 of 700
pass; the 3 that fail also fail on the original code).

Implementation notes that differ from the first sketch below: lead events use a time-based sequence instead of a counter
document (a shared counter would serialise all CRM activity); calling-batch items and requirement locations are embedded
in their parent document; the developer document carries a copy of its verified website and an `isPublished` flag so the
public directory is a single query; history rows carry `_ord` to keep same-timestamp rows in write order; text ordering uses
code-point order because the PostgreSQL database sorts that way.

## What the code looks like today
- ~50 tables in `src/lib/developer-connect/db/schema.ts` (Drizzle, 45 migrations).
- Every domain is behind a repository interface (`repository.ts`) with a Postgres adapter (`db/postgres-*.ts`) and an in-memory adapter used by unit tests. Services never touch SQL. This is the seam: a Firestore adapter implements the same interface.
- ~55 `repos.transaction(...)` call sites in the leads domain, plus testimonials, engagement, staff, social-automation.
- Heavy aggregates: `leads/db/postgres-repository.ts` (~100), `admin-analytics/queries.ts` (~75), social (18), retention report (15).

## Invariants Postgres enforces that Firestore does not (must be re-implemented in code)
| Postgres feature | Where | Firestore replacement |
|---|---|---|
| Unique index on phone (partial, non-null) | `leads_phone_e164_key` | Document id = `phone:<E164>` lookup doc (`leadPhones/{e164} -> leadId`) created in the same transaction as the lead |
| Unique email, lower() | staff, newsletter | Lookup docs keyed by lowercased email |
| Unique lower(name) | projects, campaigns | Lookup docs keyed by normalised name |
| One VERIFIED candidate / developer | `website_candidates_one_verified_per_developer` | Field `verifiedCandidateId` on the developer doc, set inside a transaction |
| One ACTIVE requirement / lead; one open follow-up / lead; one open site visit / lead+project | partial unique indexes | Pointer fields on the lead doc (`activeRequirementId`, `openFollowUpId`) updated transactionally |
| Idempotency keys (`automation_actions.dedupe_key`, call events `(provider, eventId)`, social comment `(platform, commentId)`) | unique indexes | Use the key as the **document id** and `create()` (fails if it exists) |
| Append-only triggers (events, touches, consents, audit) | migrations 0014/0021/0023/0027 | Repository exposes only `create`; Firestore security rules deny update/delete for client SDKs (server code uses Admin SDK, so this is enforced by the adapter having no update/delete methods) |
| CHECK constraints (budget ranges, status sets, text lengths) | schema | Validate in the adapter before write (shared validators) |
| Sequence `employee_id` (DC2, DC3...) | staff_members | Counter doc `counters/employeeId`, incremented in a transaction |
| Identity `seq` for lead_events ordering | lead_events | Per-lead counter or `createdAt` + `seq` from counter doc `counters/leadEvents` |
| Foreign keys `restrict` | everywhere | Nothing deletes these rows; erase path already redacts instead of deleting |

## Collections (top-level, ids preserved from Postgres UUIDs)
Top-level collections (not deep subcollections) so existing cross-entity queries keep working with a single collection query.

Developer directory: `developers`, `websiteCandidates`, `evidence`, `verificationEvents`, `developerEditEvents`
Public engagement: `analyticsEvents` (see cost note), `profiles` (id = Clerk userId), `notifications`, `inaccuracyReports`, `contactSubmissions`, `contactStatusHistory`, `newsletterSubscribers` (id = email hash)
Leads/CRM: `leads`, `leadEvents`, `leadConsents`, `leadRequirements`, `leadRequirementLocations` (embedded as array `locations[]` + `locationKeys[]` on the requirement), `leadFollowUps`, `leadImportBatches`, `callingBatches`, `callingBatchItems`, `leadCalls`, `leadCallEvents`, `projects`, `leadProjectShortlist`, `siteVisits`, `siteVisitEvents`, `bookings`, `marketingTouches`
Business: `campaigns`, `marketingSpend`, `automationSettings`, `automationActions`
Team: `staffMembers`, `staffEvents`
Content: `testimonials`, `testimonialEvents`, `socialVideos`, `socialEvents`, `enquirySubmissions`, `buyerEnquiries`
Social automation: `socialAutomationSettings` (id `global`), `socialPostAutomations`, `socialPostTriggers` (embedded as `triggers[]` on the automation), `socialCommentEvents` (id = `platform:commentId`)
Infrastructure: `counters`, `lookups` (unique-key docs), `aggregates/{name}/days/{yyyy-mm-dd}`

Conventions: timestamps stored as Firestore `Timestamp`; money as integers (no change); enums as strings; `jsonb` -> map; `text[]` -> array.

## Aggregates
Firestore cannot GROUP BY. Plan:
1. Use Firestore `count()` / `sum()` / `average()` aggregation queries for plain counts and sums with filters (billed at 1 read per 1000 index entries, cheap).
2. Time-bucketed analytics (`admin-analytics`, `retention`, `social insights`, `behaviour`) read from daily rollup docs maintained by the event writer (`increment()` in the same batch as the event write), keyed by day, event name and (where needed) developer.
3. Anything left (cohort funnels, source analytics) is computed in application code over a bounded, indexed query (date range), as the Postgres versions already do per cohort.

## Cost controls (the reason for migrating)
- `analyticsEvents`, `socialEvents`, `marketingTouches` are the write-heavy collections. Keep writes, but do NOT read them for dashboards; dashboards read the daily rollups only. Add a TTL policy (e.g. 90 days) on raw analytics events.
- Public directory reads stay behind the existing 5-minute cache (`cached-public.ts`); Firestore is billed per read so that cache is now worth money.
- The 5s live refresh must use one cheap query (count/last-id), not a list.

## Transactions
Firestore (Admin SDK) transactions require **all reads before any writes** and retry the callback on contention. Existing services interleave reads and writes inside `repos.transaction`. The adapter's `transaction()` will run the callback inside `db.runTransaction`, with writes buffered and applied at commit (a `TxContext` that records writes and serves read-your-writes from its buffer). Service code stays unchanged; callbacks must be idempotent (they already are, because they are retry-safe by design).
Hard limit: 500 writes per transaction. `lead-import-service` must chunk (it already batches).

## Indexes
Every Postgres index with a filter+order becomes a composite index in `firestore.indexes.json`. Partial indexes (`where x is not null`) need no equivalent: Firestore indexes only documents that have the field. `lower(email)` etc. become stored `emailLower` fields.

## Order of work
1. Infra: `firebase-admin`, `firestore/client.ts`, emulator config, backend flag `DATA_BACKEND=postgres|firestore` per domain.
2. Domains, smallest first, each with the existing integration tests re-pointed at the emulator: profiles, notifications, newsletter/contact, testimonials, enquiries, staff, engagement, social, social-automation, developers/directory, behaviour/analytics, leads/CRM (largest).
3. Migration script `scripts/migrate-postgres-to-firestore.ts` (idempotent, batched, verifies counts), dry-run by default.
4. Cutover and rollback runbook.

## Needs from the owner (cannot be done by the code)
- Firebase project + Firestore (Native mode, `asia-south1`), service account JSON in Vercel as `FIREBASE_SERVICE_ACCOUNT`.
Everything before cutover runs against the local Firestore emulator.
