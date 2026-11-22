import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HIDDEN_ADMIN_SECTIONS, isHiddenAdminPath } from "../hidden-admin-sections.ts";

test("hidden founder sections match the section and everything under it, nothing else", () => {
  assert.ok(isHiddenAdminPath("/admin/finance"));
  assert.ok(isHiddenAdminPath("/admin/social-automation/new"));
  assert.ok(isHiddenAdminPath("/admin/social/videos"));
  assert.ok(isHiddenAdminPath("/admin/Audit-Log/"));
  assert.ok(!isHiddenAdminPath("/admin/leads"));
  assert.ok(!isHiddenAdminPath("/admin/social-other"));
  assert.ok(!isHiddenAdminPath("/admin"));
});

test("no menu lists a hidden section, the proxy answers 404 for them, and visitor tracking is not mounted", () => {
  const nav = readFileSync("src/components/admin/admin-nav.tsx", "utf8");
  const bottom = readFileSync("src/components/admin/admin-bottom-nav.tsx", "utf8");
  for (const href of HIDDEN_ADMIN_SECTIONS) {
    assert.ok(!nav.includes(`"${href}"`), `${href} still in the side menu`);
    assert.ok(!bottom.includes(`"${href}"`), `${href} still in the phone menu`);
  }
  assert.match(readFileSync("src/proxy.ts", "utf8"), /isHiddenAdminPath\(req\.nextUrl\.pathname\)\) return new NextResponse\("Not found", \{ status: 404 \}\)/);
  assert.doesNotMatch(readFileSync("src/app/layout.tsx", "utf8"), /<BehaviourTracker/);
  assert.match(readFileSync("src/app/api/events/route.ts", "utf8"), /if \(!VISITOR_TRACKING_ON\) return new Response\(null, \{ status: 204 \}\)/);
});
