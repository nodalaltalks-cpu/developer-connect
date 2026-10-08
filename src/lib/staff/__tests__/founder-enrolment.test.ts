import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInMemoryStaffRepository } from "../memory-repository.ts";
import { enrollFounderAsEmployee } from "../staff-service.ts";
import { resolveEmployee } from "../employee-access.ts";
import { StaffValidationError } from "../errors.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");
const FOUNDER_ID = "user_founder_abcd1234";

test("founder enrolment: the Founder becomes the first team member, ACTIVE, with a permanent ID, and can then act as an employee", async () => {
  const repo = createInMemoryStaffRepository();
  const { member, created } = await enrollFounderAsEmployee(repo, { userId: FOUNDER_ID, displayName: "Ambish Singh", email: "nodalaltalks@gmail.com" });
  assert.equal(created, true);
  assert.equal(member.status, "ACTIVE");
  assert.match(member.employeeId, /^DC\d+$/);
  assert.equal(member.userId, FOUNDER_ID);
  const resolved = await resolveEmployee(repo, FOUNDER_ID);
  assert.ok(resolved, "the same sign-in now resolves to an employee, so every team action works for them");
  assert.equal(resolved!.actor.actorType, "EMPLOYEE");
  assert.equal(resolved!.actor.actorId, FOUNDER_ID, "their calls and leads are recorded under their own id, like anyone's");
});

test("founder enrolment: it is idempotent and keeps the same permanent ID", async () => {
  const repo = createInMemoryStaffRepository();
  const first = await enrollFounderAsEmployee(repo, { userId: FOUNDER_ID, displayName: "Ambish Singh" });
  const second = await enrollFounderAsEmployee(repo, { userId: FOUNDER_ID, displayName: "Someone Else" });
  assert.equal(second.created, false);
  assert.equal(second.member.employeeId, first.member.employeeId);
  assert.equal(second.member.displayName, "Ambish Singh");
});

test("founder enrolment: only a real sign-in identity can be enrolled, and the event trail says how", async () => {
  const repo = createInMemoryStaffRepository();
  await assert.rejects(enrollFounderAsEmployee(repo, { userId: "not-a-clerk-id", displayName: "X Y" }), StaffValidationError);
  const { member } = await enrollFounderAsEmployee(repo, { userId: FOUNDER_ID, displayName: "Ambish Singh" });
  const events = await repo.listEvents(member.id, 20);
  assert.ok(events.some((e) => JSON.stringify(e.payload ?? {}).includes("FOUNDER_SELF_ENROLLED")));
});

test("founder enrolment: the action is Founder-only, resolves the Founder first, and the workspace links both ways", () => {
  const action = read("src/app/admin/_actions/staff-actions.ts");
  const body = action.slice(action.indexOf("export async function enableMyWorkspaceAction"));
  assert.ok(body.indexOf("requireFounderForAction()") !== -1 && body.indexOf("requireFounderForAction()") < body.indexOf("enrollFounderAsEmployee("));
  assert.ok(!/userId\s*:\s*[a-z]+\.userId|payload|formData/.test(body), "the identity comes from the session, never from the browser");
  assert.match(read("src/components/admin/admin-nav.tsx"), /\{ href: "\/team", label: "My calling workspace" \}/);
  assert.match(read("src/components/team/team-nav.tsx"), /Founder dashboard/);
  assert.match(read("src/app/team/layout.tsx"), /isFounder\(await currentUser\(\)\)/);
});
