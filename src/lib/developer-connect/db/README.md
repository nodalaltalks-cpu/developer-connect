# Developer Connect — persistence

Production persistence for the developer directory and verification
pipeline, behind the same `DeveloperConnectRepositories` interfaces the
domain/service layer already depends on (`../repository.ts`). Nothing in
`../*-service.ts` imports anything in this folder directly.

## Environment variables

Set these in `.env.local` for local development (never commit this file —
already covered by `.gitignore`'s `.env*` rule). In Vercel, installing the
Neon integration via the Marketplace provisions them automatically as
Vercel Environment Variables — never hardcode them.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | the app at runtime (`client.ts`) | Neon's **pooled** connection string (PgBouncer, transaction mode) for the **primary** database. Safe for many concurrent short-lived requests. This is the database real product data will live in — nothing that writes test data should ever be pointed at it. |
| `DATABASE_URL_UNPOOLED` | migrations (`drizzle.config.ts`, `npm run db:migrate`) | Neon's **direct** connection string, primary database. Used for schema changes; falls back to `DATABASE_URL` if unset. |
| `TEST_DATABASE_URL` / `TEST_DATABASE_URL_UNPOOLED` | the Postgres integration tests, `db:migrate:test`, `seed-test-data.ts` | A **separate** Neon resource (a distinct project, not a copy of the primary one), provisioned the same way as the primary database but with `--prefix TEST_` and scoped only to the `development` environment. Everything that writes "TEST —" rows uses these, never `DATABASE_URL`. |
| `ALLOW_TEST_SEED` | `seed-test-data.ts` only | Must be exactly `"true"` to allow the dev/test seed script to run. |

These are read only in server-side code (`client.ts`, this folder's
adapters, and scripts run from a terminal) — never referenced from a
Client Component, and nothing here is prefixed `NEXT_PUBLIC_`.

## Migrations

Schema lives in `schema.ts`. Migration SQL lives in `migrations/`, tracked
in `migrations/meta/_journal.json` — this is what makes the schema
reproducible across local, staging, and production rather than something
manually clicked together per environment.

- `npm run db:generate` — diff `schema.ts` against migration history and
  write a new SQL file. Runs entirely offline; no database needed.
- `npm run db:generate:custom` — scaffold an empty migration file for
  hand-written SQL (used for `0001_verification_events_append_only.sql`,
  which adds a trigger Drizzle's schema DSL can't express).
- `npm run db:migrate` — apply pending migrations to the **primary** database (`DATABASE_URL_UNPOOLED`).
- `npm run db:migrate:test` — apply the same migrations to the **disposable test** database instead, via `scripts/with-test-database.cjs` (see Test isolation below). Run this once after provisioning a new test database, and again any time a new migration is added.

## What the database enforces itself (not just application code)

Per the Phase 2B.1 requirement not to rely on TypeScript alone for
critical integrity rules:

- **Unique developer slugs** — unique index on `developers.slug`.
- **Referential integrity** — foreign keys from `website_candidates` →
  `developers`, and from `evidence` / `verification_events` →
  `website_candidates`, all `ON DELETE RESTRICT` (nothing in this domain
  ever hard-deletes a developer or candidate, so this should never fire —
  if it ever does, that's a bug worth seeing loudly, not one that quietly
  cascades).
- **At most one VERIFIED candidate per developer** — a partial unique
  index on `website_candidates (developer_id) WHERE verification_status =
  'VERIFIED'`. Even a bug in `verification-service.ts` cannot produce two
  verified candidates for the same developer; the database rejects the
  second insert/update outright.
- **Verification history is append-only** — `verification_events` has a
  trigger that raises on any `UPDATE` or `DELETE`, regardless of caller.
- **Timestamps** — every timestamp column is `timestamptz`, stored
  consistently across all four tables.

## Transactions

`approveCandidate` (retire the previous verified candidate, verify the
new one, and log both transitions) runs inside one call to
`repos.runInTransaction(...)`. The Postgres adapter (`postgres-repository.ts`)
implements this with `db.transaction(...)` from `drizzle-orm/node-postgres`;
nested calls (e.g. `transitionCandidate` called from within `approveCandidate`)
compose into the same transaction via `SAVEPOINT`s. This is why the
adapter uses `pg` + `drizzle-orm/node-postgres` rather than Neon's HTTP
driver (`@neondatabase/serverless`'s `neon()` function) — the HTTP driver
issues one query per request and cannot hold a multi-statement transaction
open. A module-level `pg.Pool` is safe here because Vercel Fluid Compute
(the default runtime) reuses function instances across invocations instead
of tearing down after each request.

## Seeding

`seed-test-data.ts` inserts one obviously-fake developer
("TEST — Seed Developer") left in `PENDING_VERIFICATION` — it never calls
`approveCandidate`, so it's structurally incapable of producing a fake
verified record. It refuses to run unless `TEST_DATABASE_URL` is
configured and `ALLOW_TEST_SEED=true` is set — and, via `test-db-guard.ts`,
it can only ever write to the test database, never the primary one,
regardless of what `DATABASE_URL` happens to be set to. Real Mumbai
developers are added later, one at a time, only after actual founder
verification — never through a seed script.

## Test isolation

Integration testing that exercises real writes (unique-slug conflicts,
the one-VERIFIED-per-developer constraint, the append-only trigger,
transaction rollback) **must** run against a database that isn't the one
holding real product data. This is enforced two ways, not just one:

1. **`test-db-guard.ts`** — imported first by
   `__tests__/postgres-repository.integration.test.ts` and by
   `seed-test-data.ts`. It refuses to proceed if `TEST_DATABASE_URL`
   resolves to the same database as `DATABASE_URL`, and otherwise remaps
   `DATABASE_URL`/`DATABASE_URL_UNPOOLED` to the test database for that
   process only — so these files exercise the exact same
   `createPostgresRepositories()` code that runs in production, just
   pointed somewhere disposable.
2. **`scripts/with-test-database.cjs`** — the same check, for tools that
   don't go through our TypeScript (Drizzle Kit's CLI). `npm run
   db:migrate:test` runs through it.

The Postgres integration test suite is skipped entirely — not run against
`DATABASE_URL` as a fallback — when `TEST_DATABASE_URL` isn't set. There
is no code path in this repo that lets the integration tests silently
default to the primary database if the test database is missing.

Run `npm run test:db` to load `.env.local` and run the complete suite
(unit tests + the guarded integration tests) against the test database.
Plain `npm test` (no env loaded) always skips the integration tests.

## Testing

`__tests__/postgres-repository.integration.test.ts` exercises the real
database: the unique-slug constraint, the partial unique index, the
append-only trigger (`UPDATE` and `DELETE` both rejected), foreign-key
integrity, a rejected candidate remaining historically queryable, a full
submit→approve round trip, and — critically — that a failed multi-step
approve transaction rolls back completely rather than partially applying.
These tests always run against `TEST_DATABASE_URL` (see Test isolation
above) and will leave "TEST —" rows behind there; that's expected and
disposable.

The always-on unit suite in `../__tests__/` runs against the in-memory
adapter and does not require a database.
