# Firestore cutover runbook

The code is finished and flag-gated: every repository switches between PostgreSQL and Firestore with one environment
variable, `DATA_BACKEND`. Until it is set to `firestore`, the site runs exactly as before on Neon. Nothing below touches
production until step 4.

Account rule: every Firebase / Google account used for this project is **developerconnects02@gmail.com**.

---

## 1. One-time Firebase setup (needs a person signed in as developerconnects02@gmail.com)

1. https://console.firebase.google.com → **Add project** (e.g. `developer-connects`).
2. **Build → Firestore Database → Create database**: *Native mode*, location **`asia-south1` (Mumbai)**. The location can
   never be changed afterwards.
3. Billing: Firestore's free tier (50,000 reads / 20,000 writes / 20,000 deletes per day, 1 GiB) is small for a live site,
   so switch the project to the **Blaze (pay as you go)** plan and immediately set a **budget alert** (Google Cloud
   console → Billing → Budgets) at, say, 20 / 50 / 100 USD per month.
4. **Project settings → Service accounts → Generate new private key**. A `.json` file downloads. Do not commit it, paste it
   anywhere, or email it. Turn it into one line:

   ```
   node -e "console.log(Buffer.from(require('fs').readFileSync('KEYFILE.json')).toString('base64'))"
   ```

   Put that line in Vercel (Production **and** Preview) as `FIREBASE_SERVICE_ACCOUNT`:

   ```
   vercel env add FIREBASE_SERVICE_ACCOUNT production
   ```

   Then delete the downloaded key file.
5. Sign the CLI in and deploy the rules and indexes (this repo's `firestore.rules` denies every direct client access; all
   data access is server-side):

   ```
   firebase login          # as developerconnects02@gmail.com
   firebase use --add      # pick the project
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   Wait until **Firestore → Indexes** shows every index as *Enabled* (an empty database builds them in a minute or two).

## 2. Rehearse on a staging project (recommended)

Create a second Firebase project the same way (`developer-connects-staging`), point `FIREBASE_SERVICE_ACCOUNT` at it in a
shell, and run the whole procedure in step 4 against the **test** Neon database:

```
npx dotenv -e .env.local -- node scripts/with-test-database.cjs node scripts/migrate-postgres-to-firestore.ts            # dry run
npx dotenv -e .env.local -- node scripts/with-test-database.cjs node scripts/migrate-postgres-to-firestore.ts --apply
npx dotenv -e .env.local -- node scripts/with-test-database.cjs node scripts/migrate-postgres-to-firestore.ts --verify
npx dotenv -e .env.local -- node scripts/with-test-database.cjs node scripts/compare-backends.ts
```

This was already rehearsed against the local emulator with a copy of the test database (about 60,000 rows): every
collection's count matched, and 145 repository reads gave identical answers on both stores. A staging run proves the same
thing on real Firestore, including indexes and latency.

## 3. What is where

| Piece | Location |
|---|---|
| Backend switch | `DATA_BACKEND=firestore` (per domain override: `DATA_BACKEND_<DOMAIN>`, e.g. `DATA_BACKEND_LEADS`) — `src/lib/firestore/backend.ts` |
| Firestore adapters | `src/lib/<domain>/firestore/` (leads in `src/lib/leads/firestore/`) |
| Transactions | `src/lib/firestore/tx.ts` (buffered writes, read-your-writes, retry on lock contention) |
| Data model + reasoning | `docs/firestore-migration-plan.md` |
| Copy script | `scripts/migrate-postgres-to-firestore.ts` (dry run by default; `--apply`; `--verify`; `--only a,b`) |
| Parity check | `scripts/compare-backends.ts` |
| Indexes | `firestore.indexes.json` (generated from real query shapes: `scripts/record-firestore-queries.cjs` + `scripts/build-firestore-indexes.cjs`) |
| Tests | `npm run test:firestore` (adapters) and `npm run test:firestore:leads` (the existing lead tests, run against Firestore) — both start the emulator for you (needs Java) |

## 4. Cutover day

1. **Freeze edits** for the founder and the team for the length of the copy (public pages can keep serving). A copy of
   this size takes minutes; anything written to Neon after the copy starts would be missed.
2. Make sure Neon is reachable (billing/quota fixed). The copy reads each table once.
3. Copy and check, against the real databases:

   ```
   npx dotenv -e .env.local -- node scripts/migrate-postgres-to-firestore.ts              # dry run: counts only
   npx dotenv -e .env.local -- node scripts/migrate-postgres-to-firestore.ts --apply
   npx dotenv -e .env.local -- node scripts/migrate-postgres-to-firestore.ts --verify     # must print "All counts match."
   npx dotenv -e .env.local -- node scripts/compare-backends.ts                          # expect 0 differences
   ```

   (`FIREBASE_SERVICE_ACCOUNT` must be set in that shell, and `FIRESTORE_EMULATOR_HOST` must NOT be.)
4. In Vercel set `DATA_BACKEND=firestore` for Production and **redeploy** (an environment change only applies to a new
   deployment).
5. Smoke test (a few minutes): home and directory, a developer page, search, sign in, `/admin` dashboard, `/admin/leads`,
   submit a test enquiry and see it in the CRM, the team workspace, notifications, newsletter signup, contact form,
   public testimonials, `/admin/retention`.
6. Lift the freeze.

## 5. Rollback

Before real use on Firestore, rollback is instant and lossless: remove `DATA_BACKEND` (or set it to `postgres`) and
redeploy; Neon still holds everything exactly as at the freeze. Once people have worked on Firestore, anything they wrote
exists only there, so keep Neon (read-only) for about two weeks and decide then; do not delete it earlier.

## 6. After a stable week

Remove `DATABASE_URL*` from Vercel, downgrade or delete the Neon project, and (separately, in its own change) delete the
PostgreSQL adapters and Drizzle.

## 7. Things to know

* **Cost shape.** Firestore bills per read/write. The public site is protected by the existing five-minute cache plus a
  30-second in-process cache of the developer list. The founder dashboards read the raw event log of the selected date
  range (Firestore has no GROUP BY), so a very wide range on a busy site reads a lot of documents; keep an eye on the
  Firebase usage page the first weeks. If it grows, the next step is daily roll-up documents.
* **Event retention.** `analyticsEvents` and `socialEvents` grow forever. A Firestore TTL policy can expire old events
  automatically, but the Retention page measures "ever seen before", so expiring events changes that metric. Decide
  before enabling.
* **Index errors.** `firestore.indexes.json` was generated from every query the test suites ran. If a page ever fails with
  "The query requires an index", the error contains a link that creates it; add the same entry to the file.
* **Contention.** Many simultaneous writes to the *same* lead retry automatically (25 at once settle correctly, slowly on
  the emulator). Ordinary traffic never does this.
* **Found on the way.** The PostgreSQL `callingBatches.listAll` reports `itemCount: 0` for every batch (its subquery
  resolves the batch id to the wrong table). Firestore returns the real count, so the Founder's calling-batch list will
  start showing correct numbers.
* **Employee numbers.** The next employee ID continues from the PostgreSQL sequence (`counters/staffEmployeeNumber`).
* **Large imports.** A 500-row CSV import is one transaction with a few thousand writes; the emulator accepts that. Run
  one real import on staging to confirm real Firestore does too.
