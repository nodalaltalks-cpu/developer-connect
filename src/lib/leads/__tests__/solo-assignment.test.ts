import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignToSoloOwner, soloOwner } from "../solo-assignment.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

const member = (userId: string, active = true) => ({ userId, active, displayName: userId }) as never;
const staffOf = (...members: unknown[]) => ({ async list() { return members as never; } });

test("solo owner: the Founder's own team record, only while nobody else is active", async () => {
  const founders = async () => ["f1"];
  assert.equal((await soloOwner(staffOf(member("f1")), founders))?.userId, "f1");
  assert.equal((await soloOwner(staffOf(member("f1"), member("emp-1")), founders)), null, "a real team member is active: the rule steps aside");
  assert.equal((await soloOwner(staffOf(member("f1"), member("emp-1", false)), founders))?.userId, "f1", "an inactive member does not count");
  assert.equal(await soloOwner(staffOf(), founders), null, "no team record at all");
  assert.equal(await soloOwner(staffOf(member("emp-1")), founders), null, "the Founder has no team record");
});

function fakeRepos(lead: { ownerId: string | null; erasedAt?: Date | null; prospect?: boolean; returnedAt?: Date | null }) {
  const events: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    leads: {
      async getById() { return { id: "l1", erasedAt: null, prospect: false, returnedAt: null, ...lead }; },
      async update(_id: string, patch: unknown) { updates.push(patch); return {}; },
    },
    events: { async append(e: unknown) { events.push(e); } },
  };
  return { repos: { async transaction(work: (t: typeof tx) => Promise<boolean>) { return work(tx); } } as never, events, updates };
}

test("solo assignment: an unowned new lead becomes the Founder's, with a SYSTEM history entry; nothing else is touched", async () => {
  const { repos, events, updates } = fakeRepos({ ownerId: null });
  const owner = await assignToSoloOwner(repos, staffOf(member("f1")), async () => ["f1"], "l1", new Date("2026-10-14T01:09:00Z"));
  assert.equal(owner, "f1");
  assert.equal(events.length, 1);
  assert.match(JSON.stringify(events[0]), /"OWNER_CHANGED".*"SYSTEM".*"via":"SOLO_FOUNDER"/);
  assert.equal((updates[0] as { ownerId: string }).ownerId, "f1");
});

test("solo assignment: never overrides an owner, an erased lead, a returned lead or a prospect; a second call is a no-op", async () => {
  for (const lead of [{ ownerId: "emp-9" }, { ownerId: null, erasedAt: new Date() }, { ownerId: null, returnedAt: new Date() }, { ownerId: null, prospect: true }]) {
    const { repos, events } = fakeRepos(lead);
    assert.equal(await assignToSoloOwner(repos, staffOf(member("f1")), async () => ["f1"], "l1"), null);
    assert.equal(events.length, 0);
  }
  const already = fakeRepos({ ownerId: "f1" });
  assert.equal(await assignToSoloOwner(already.repos, staffOf(member("f1")), async () => ["f1"], "l1"), "f1");
  assert.equal(already.events.length, 0, "already theirs: no duplicate history entry");
  const withTeam = fakeRepos({ ownerId: null });
  assert.equal(await assignToSoloOwner(withTeam.repos, staffOf(member("f1"), member("emp-1")), async () => ["f1"], "l1"), null);
  assert.equal(withTeam.events.length, 0);
});

test("wiring: the gate, the enquiry form and the Founder's own alert poll all use it", () => {
  assert.match(read("src/lib/leads/gate/gate-service.ts"), /deps\.assignNewLead\(captured\.lead\.id, now\)/);
  assert.match(read("src/app/_actions/lead-gate-actions.ts"), /assignNewLead: \(leadId, at\) => assignToSoloOwner\(/);
  assert.match(read("src/app/_actions/enquiry-actions.ts"), /assignToSoloOwner\(/);
  assert.match(read("src/app/api/alerts/new-leads/route.ts"), /assignToSoloOwner\(repos, staff,/);
});
