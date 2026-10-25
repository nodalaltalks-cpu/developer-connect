import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInMemoryStaffRepository } from "../memory-repository.ts";
import { StaffStateError, StaffValidationError, UnauthorizedStaffActionError } from "../errors.ts";
import { exitStaffMember, inviteStaffMember, setStaffTabAccess } from "../staff-service.ts";
import { ALL_TABS, canUseTab, cleanTabs, DEFAULT_TAB_KEYS, EXTRA_TABS, STANDARD_TABS, tabsOf } from "../tab-access.ts";
import { FOUNDER } from "../../leads/__tests__/test-helpers.ts";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const ana = { displayName: "Ana", email: "ana@gmail.com", phone: "98200 12345" };

test("tab access: a new person gets the standard tabs and NO extra access", () => {
  assert.deepEqual(tabsOf({}), [...DEFAULT_TAB_KEYS]);
  assert.deepEqual(tabsOf({ tabAccess: null }), [...DEFAULT_TAB_KEYS]);
  for (const extra of EXTRA_TABS) assert.equal(canUseTab({}, extra.key), false, `${extra.key} is off by default`);
  for (const tab of STANDARD_TABS) assert.equal(canUseTab({}, tab.key), true);
  assert.ok(DEFAULT_TAB_KEYS.includes("performance"), "everyone can see their own performance");
});

test("tab access: a saved selection is exact, unknown keys are ignored, and the Founder's selection is validated", () => {
  assert.deepEqual(tabsOf({ tabAccess: ["leads", "calls", "nope"] }), ["leads", "calls"]);
  assert.equal(canUseTab({ tabAccess: ["leads"] }, "dial"), false);
  assert.deepEqual(cleanTabs(["calls", "leads", "leads"]), ["leads", "calls"]);
  assert.throws(() => cleanTabs([]), /at least one/i);
  assert.throws(() => cleanTabs(["leads", "admin"]), /does not exist/i);
  assert.throws(() => cleanTabs("leads"));
  assert.equal(new Set(ALL_TABS.map((t) => t.key)).size, ALL_TABS.length, "tab keys are unique");
});

test("tab access: only the Founder can change it, it is recorded, and an exited person cannot be changed", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, ana, FOUNDER);
  const updated = await setStaffTabAccess(repo, m.id, ["leads", "performance", "team-board"], FOUNDER);
  assert.deepEqual(tabsOf(updated), ["leads", "performance", "team-board"]);
  const events = await repo.listEvents(m.id, 20);
  const change = events.find((e) => e.eventType === "EMPLOYEE_ACCESS_CHANGED");
  assert.ok(change && change.actorId === FOUNDER.actorId);
  assert.deepEqual(change.payload.to, ["leads", "performance", "team-board"]);
  await assert.rejects(setStaffTabAccess(repo, m.id, ["leads"], { actorType: "EMPLOYEE", actorId: "user_employee_1" }), UnauthorizedStaffActionError);
  await assert.rejects(setStaffTabAccess(repo, m.id, [], FOUNDER), StaffValidationError);
  await exitStaffMember(repo, m.id, "RESIGNED", FOUNDER);
  await assert.rejects(setStaffTabAccess(repo, m.id, ["leads"], FOUNDER), StaffStateError);
});

test("tab access security: every team page is gated by its own tab, the menu hides switched-off tabs, and the new pages scope to the signed-in member", () => {
  const gates: Array<[string, string]> = [
    ["src/app/team/page.tsx", "leads"],
    ["src/app/team/leads/[id]/page.tsx", "leads"],
    ["src/app/team/queue/page.tsx", "queue"],
    ["src/app/team/queue/[batchId]/page.tsx", "queue"],
    ["src/app/team/dial/page.tsx", "dial"],
    ["src/app/team/cold-call/page.tsx", "dial"],
    ["src/app/team/cold-call/[leadId]/page.tsx", "dial"],
    ["src/app/team/follow-ups/page.tsx", "follow-ups"],
    ["src/app/team/missed/page.tsx", "follow-ups"],
    ["src/app/team/visits/page.tsx", "visits"],
    ["src/app/team/calls/page.tsx", "calls"],
    ["src/app/team/performance/page.tsx", "performance"],
    ["src/app/team/team-board/page.tsx", "team-board"],
  ];
  for (const [file, key] of gates) assert.match(read(file), new RegExp(`await requireTab\\("${key}"\\)`), `${file} must require the ${key} tab`);
  assert.match(read("src/lib/team/session.ts"), /if \(!canUseTab\(employee\.member, key\)\) notFound\(\)/);
  assert.match(read("src/app/team/layout.tsx"), /tabs=\{tabsOf\(member\)\}/, "the menu only lists the member's tabs");

  const performance = read("src/app/team/performance/page.tsx");
  assert.doesNotMatch(performance, /params\.(owner|staff|employee|user)/i, "the member's id never comes from the URL");
  const lib = read("src/lib/leads/team-performance.ts");
  assert.match(lib, /const me = actor\.actorId/);
  assert.match(lib, /staffUserId: me/, "my performance reads only the actor's calls");
  const board = lib.slice(lib.indexOf("export async function getTeamBoard"));
  assert.doesNotMatch(board, /revenue|bookings|phone|\.name\b.*lead|leads\.list\(/i, "the team board carries no revenue, phone numbers or lead names");
  assert.match(board, /m\.status === "ACTIVE"/);

  const action = read("src/app/admin/_actions/staff-actions.ts");
  const body = action.slice(action.indexOf("export async function setStaffTabAccessAction"));
  assert.ok(body.indexOf("requireFounderForAction()") !== -1 && body.indexOf("requireFounderForAction()") < body.indexOf("setStaffTabAccess("), "founder-only, checked first");
});

test("tab access: the migration only adds one column and widens the event-type check", () => {
  const sql = read("src/lib/developer-connect/db/migrations/0044_staff_tab_access.sql");
  assert.match(sql, /ADD COLUMN "tab_access" text\[\]/);
  assert.match(sql, /EMPLOYEE_ACCESS_CHANGED/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|DELETE|TRUNCATE|UPDATE\s/i);
});

test("employee landing: a signed-in team member goes straight to /team, the Founder and the public are left alone", () => {
  const redirect = read("src/components/employee-home-redirect.tsx");
  assert.match(redirect, /if \(!userId\) return null/, "signed-out visitors see the landing page");
  assert.match(redirect, /if \(isFounder\(await currentUser\(\)\)\) return null/, "the Founder is never redirected");
  assert.match(redirect, /getEmployee\(\)/);
  assert.match(redirect, /redirect\("\/team"\)/);
  assert.match(read("src/app/(marketing)/page.tsx"), /<EmployeeHomeRedirect \/>/);
  assert.doesNotMatch(read("src/app/(marketing)/page.tsx"), /["'`]\/team\b|lib\/team/, "the public page itself does not mention the team");
  assert.match(read("src/app/layout.tsx"), /signInFallbackRedirectUrl="\/post-sign-in"/, "a sign-in with no page to return to still passes through /post-sign-in");
  assert.match(read("src/app/post-sign-in/page.tsx"), /redirect\("\/team"\)/);
});
