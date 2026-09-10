/**
 * Safety boundary between the integration test suite and the production
 * database. Import this FIRST — before any other import that might touch
 * `client.ts` — in any file that runs real writes against Postgres.
 *
 * What it does:
 *  1. Refuses outright if TEST_DATABASE_URL resolves to the same database
 *     as DATABASE_URL. Integration tests write, roll back, and leave
 *     "TEST —" rows behind; they must never be able to do that to the
 *     database real product data will eventually live in.
 *  2. If safe, points the app's normal DATABASE_URL / DATABASE_URL_UNPOOLED
 *     env vars at the disposable test database for the remainder of this
 *     process only. This is what lets tests exercise the real
 *     `createPostgresRepositories()` / `getDb()` code path — the same
 *     code that runs in production — without that code needing to know
 *     it's being tested.
 *
 * This process's env is the only thing mutated; it has no effect on any
 * other process (a real `next dev`/`next build`/`next start`, or another
 * terminal) which reads its own environment independently.
 */

function databaseIdentity(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}${parsed.pathname}`;
}

export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);

if (hasTestDatabase) {
  const testUrl = process.env.TEST_DATABASE_URL!;
  const productionUrl = process.env.DATABASE_URL;

  if (productionUrl && databaseIdentity(testUrl) === databaseIdentity(productionUrl)) {
    throw new Error(
      "Refusing to run: TEST_DATABASE_URL resolves to the same database as DATABASE_URL. " +
        "Integration tests must run against a separate, disposable database — never the one " +
        "production data will live in. Provision a distinct Neon resource for TEST_DATABASE_URL.",
    );
  }

  process.env.DATABASE_URL = testUrl;
  process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL_UNPOOLED ?? testUrl;
}
