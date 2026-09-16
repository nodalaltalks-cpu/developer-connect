import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Platform Health V2 adds real infrastructure detail (database size,
 * per-table breakdown, deployment identifiers) to a page that must stay
 * Founder-only. This can't be proven by rendering the page in
 * `node --test` (the admin layout imports `@clerk/nextjs/server`, which
 * this project's Node test runner can't load — see
 * authorization-boundary.test.ts for the same constraint), so this is a
 * static source check: the admin layout that wraps every /admin/* page,
 * including /admin/platform-health, must call requireFounder()
 * unconditionally — not inside an `if` that could skip it.
 *
 * This no longer greps layout.tsx's source for a literal
 * "/admin/platform-health" string — the admin nav's route list moved out
 * to admin-nav.tsx (Part 12 of the admin UX polish task) so the active
 * section can be highlighted, and duplicating that list back into
 * layout.tsx just to keep this string check passing would be exactly the
 * "don't create a duplicate system" mistake that task warned against.
 * The real guarantee this test cares about — that
 * /admin/platform-health is actually wrapped by this layout — comes from
 * Next.js App Router's own routing rule (any route folder under
 * src/app/admin/ is wrapped by src/app/admin/layout.tsx), which this
 * checks directly by confirming the route folder exists on disk.
 */
test("authorization: admin/layout.tsx (which wraps /admin/platform-health) calls requireFounder() unconditionally", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const layoutPath = path.resolve(here, "../../../app/admin/layout.tsx");
  const source = readFileSync(layoutPath, "utf8");

  assert.ok(source.includes("requireFounder()"), "admin/layout.tsx must call requireFounder()");

  const platformHealthRouteDir = path.resolve(here, "../../../app/admin/platform-health");
  assert.ok(
    existsSync(platformHealthRouteDir) && statSync(platformHealthRouteDir).isDirectory(),
    "src/app/admin/platform-health must exist as a route folder under src/app/admin/ — Next.js's App Router " +
      "wraps every such folder with app/admin/layout.tsx automatically, which is what actually protects it",
  );

  // The call must not be nested inside a conditional guard that could
  // skip it for some request — it must run before anything else renders.
  const callIndex = source.indexOf("requireFounder()");
  const before = source.slice(0, callIndex);
  const openBraces = (before.match(/\{/g) ?? []).length;
  const closeBraces = (before.match(/\}/g) ?? []).length;
  const netNestingBeforeCall = openBraces - closeBraces;
  assert.ok(
    netNestingBeforeCall <= 1,
    "requireFounder() appears to be nested inside a conditional block rather than always running",
  );
});
