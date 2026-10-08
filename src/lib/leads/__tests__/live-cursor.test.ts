import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead } from "../lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

test("live cursor: moves when something happens in scope, and a team member's cursor ignores other people's leads", async () => {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const mine = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 47001", name: "Mine" }), T0)).lead;
  const theirs = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 47002", name: "Theirs" }), T0)).lead;
  await assignLead(repos, staff, mine.id, priya.id, FOUNDER, minutes(5));
  await assignLead(repos, staff, theirs.id, rohan.id, FOUNDER, minutes(5));

  const before = { founder: await repos.events.latestSeq({}), priya: await repos.events.latestSeq({ personId: priya.userId }) };
  assert.ok(before.founder > 0);
  assert.ok(before.priya > 0 && before.priya < before.founder, "she sees less than the Founder");

  // Something happens on Rohan's lead: the Founder's cursor moves, Priya's does not.
  const { setTemperature } = await import("../lead-service.ts");
  await setTemperature(repos, theirs.id, "HOT", FOUNDER, minutes(10));
  assert.ok((await repos.events.latestSeq({})) > before.founder);
  assert.equal(await repos.events.latestSeq({ personId: priya.userId }), before.priya);

  await setTemperature(repos, mine.id, "HOT", FOUNDER, minutes(11));
  assert.ok((await repos.events.latestSeq({ personId: priya.userId })) > before.priya);
});

test("live cursor: the route answers with a number only, decides scope from the session, and is never cached", () => {
  const route = read("src/app/api/live/route.ts");
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.match(route, /isFounder\(user\)/);
  assert.match(route, /getEmployee\(\)/);
  assert.match(route, /status: 404/);
  assert.ok(!/searchParams|request\.url|new URL/.test(route), "scope is never taken from the query");
  assert.match(route, /Response\.json\(\{ cursor \}/);
});

test("live cursor: the client polls only while visible, never refreshes under a typing hand, and is mounted on the working pages", () => {
  const client = read("src/components/live-refresh.tsx");
  assert.match(client, /visibilityState !== "visible"/);
  assert.match(client, /navigator\.onLine/);
  assert.match(client, /isTyping\(\)/);
  assert.match(client, /router\.refresh\(\)/);
  assert.match(client, /Math\.min\(delay \* 2, MAX_MS\)/, "backs off after errors");
  for (const page of ["src/app/team/page.tsx", "src/app/team/queue/page.tsx", "src/app/team/queue/[batchId]/page.tsx", "src/app/team/follow-ups/page.tsx", "src/app/admin/leads/page.tsx", "src/app/admin/call-activity/page.tsx", "src/app/admin/command-centre/page.tsx"]) {
    assert.match(read(page), /<LiveRefresh \/>/, page);
  }
});
