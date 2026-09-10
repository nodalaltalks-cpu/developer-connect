import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

/**
 * Lazily-initialized connection pool + Drizzle instance.
 *
 * Lazy on purpose: Next.js evaluates top-level module code during
 * `next build` (for type-checking / page data collection), so touching
 * `process.env.DATABASE_URL` at import time would crash the build on any
 * environment where the database hasn't been provisioned yet. Nothing
 * here talks to Postgres until `getDb()` is actually called.
 *
 * Runs on Vercel Fluid Compute's persistent Node.js runtime, so a
 * module-level pool is reused across invocations rather than opened per
 * request.
 */

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. See src/lib/developer-connect/db/README.md for required environment variables.",
    );
  }
  return url;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    pool = new Pool({ connectionString: requireDatabaseUrl() });
    db = drizzle(pool, { schema });
  }
  return db;
}

/** For graceful shutdown in long-lived environments (tests, scripts). Not needed per-request. */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
