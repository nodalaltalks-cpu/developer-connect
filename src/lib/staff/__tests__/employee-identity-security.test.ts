import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8");

test("security: every staff server action authorizes the Founder before doing anything", () => {
  const text = read("src/app/admin/_actions/staff-actions.ts");
  const bodies = text.split(/export async function /).slice(1);
  assert.ok(bodies.length >= 6);
  for (const body of bodies) {
    const first = body.split("\n").slice(1).find((l) => l.trim() && !l.trim().startsWith("//"));
    assert.match(first ?? "", /await requireFounderForAction\(\)/, `${body.split("(")[0]} must authorize first`);
  }
});

test("security: no action takes an employee ID or Clerk id from the browser to create or change an identity", () => {
  const text = read("src/app/admin/_actions/staff-actions.ts");
  assert.doesNotMatch(text, /employeeId\s*:\s*string[^)]*\)\s*:\s*Promise<StaffActionResult>\s*\{[^}]*create/);
  assert.doesNotMatch(text, /userId\s*:\s*string/, "no action accepts a Clerk user id from the client");
});

test("security: the profile route is Founder-only and the admin layout still gates /admin", () => {
  assert.match(read("src/app/admin/staff/[employeeId]/page.tsx"), /await requireFounder\(\)/);
  assert.match(read("src/app/admin/staff/page.tsx"), /await requireFounder\(\)/);
  assert.match(read("src/app/admin/layout.tsx"), /await requireFounder\(\)/);
});

test("security: the team area shows the friendly not-approved message and never reveals the reason", () => {
  const msg = read("src/components/team/not-approved.tsx");
  assert.match(msg, /Your Google account is not approved for Developer Connects access\. Please contact the Founder\./);
  assert.doesNotMatch(msg.replace(/\/\*[\s\S]*?\*\//g, ""), /pending|exited|invited/i);
});

test("security: access is granted only from a Clerk-verified email", () => {
  assert.match(read("src/lib/team/session.ts"), /verification\?\.status === "verified"/);
});

test("migration 0027: IDs unique and immutable, rows undeletable, events append-only, sequence never reuses", () => {
  const sql = read("src/lib/developer-connect/db/migrations/0027_employee_identity_lifecycle.sql");
  assert.match(sql, /staff_members_employee_id_key/);
  assert.match(sql, /staff_employee_number_seq/);
  assert.match(sql, /guard_staff_member_mutation/);
  assert.match(sql, /staff_events_append_only/);
});

test("mobile: the persistent advisor bar is phone-only, safe-area aware, keeps clear of the footer and hides on private areas", () => {
  const src = read("src/components/advisor/advisor.tsx");
  assert.match(src, /sm:hidden/);
  assert.match(src, /env\(safe-area-inset-bottom\)/);
  assert.match(src, /h-\[calc\(4\.75rem\+env\(safe-area-inset-bottom\)\)\] sm:hidden/, "a spacer so the bar never covers the footer");
  assert.match(src, /!hidden && <AdvisorBar />/);
  for (const prefix of ["/admin", "/team", "/profile", "/testimonial"]) assert.ok(src.includes(`"${prefix}"`), prefix + " has no advisor bar");
  assert.ok(!read("src/components/connect-with-developer-button.tsx").includes("IntersectionObserver"), "one persistent bar, not two");
});

test("mobile: both navigations are bottom bars on phones with safe-area padding, and the Founder one has a More sheet", () => {
  const admin = read("src/components/admin/admin-bottom-nav.tsx");
  const team = read("src/components/team/team-nav.tsx");
  for (const src of [admin, team]) assert.match(src, /env\(safe-area-inset-bottom\)/);
  assert.match(admin, /lg:hidden/);
  assert.match(admin, /BottomSheet/);
  assert.match(team, /sm:hidden/);
});
