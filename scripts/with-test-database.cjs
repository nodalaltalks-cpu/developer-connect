#!/usr/bin/env node
/**
 * Runs the given command with DATABASE_URL / DATABASE_URL_UNPOOLED
 * remapped to the disposable TEST_DATABASE_URL(_UNPOOLED). Refuses to run
 * anything if the two resolve to the same database, or if no test
 * database is configured at all.
 *
 * Usage: node scripts/with-test-database.cjs <command> [args...]
 * e.g.:  node scripts/with-test-database.cjs npx drizzle-kit migrate
 */
const { spawnSync } = require("node:child_process");

function identity(url) {
  const parsed = new URL(url);
  return `${parsed.hostname}${parsed.pathname}`;
}

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error(
    "TEST_DATABASE_URL is not set — no disposable test database is configured. Refusing to run.",
  );
  process.exit(1);
}

const productionUrl = process.env.DATABASE_URL;
if (productionUrl && identity(testUrl) === identity(productionUrl)) {
  console.error(
    "Refusing to run: TEST_DATABASE_URL resolves to the same database as DATABASE_URL.",
  );
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-test-database.cjs <command> [args...]");
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    DATABASE_URL: testUrl,
    DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL_UNPOOLED || testUrl,
  },
});

process.exit(result.status ?? 1);
