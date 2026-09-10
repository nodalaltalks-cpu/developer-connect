import type { Config } from "drizzle-kit";

/**
 * Migrations are generated offline from schema.ts (no live database
 * needed for `drizzle-kit generate`). Applying them (`drizzle-kit migrate`)
 * needs DATABASE_URL_UNPOOLED — see src/lib/developer-connect/db/README.md
 * for why the unpooled connection is used for DDL.
 */
export default {
  schema: "./src/lib/developer-connect/db/schema.ts",
  out: "./src/lib/developer-connect/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
