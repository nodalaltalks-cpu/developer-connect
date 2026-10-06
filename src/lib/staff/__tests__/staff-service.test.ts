import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryStaffRepository } from "../memory-repository.ts";
import { addStaffMember, authorizeStaffActor, listStaff, setStaffActive, staffNameMap } from "../staff-service.ts";
import { StaffNotFoundError, StaffStateError, StaffValidationError, UnauthorizedStaffActionError } from "../errors.ts";
import { BUYER, FOUNDER, SYSTEM, minutes } from "../../leads/__tests__/test-helpers.ts";

const EMPLOYEE_ACTOR = { actorType: "EMPLOYEE", actorId: "user_employee_1" } as const;
const PRIYA = { userId: "user_priya_0001", displayName: "Priya Nair", email: "Priya@Example.com" };

test("staff: the founder adds an employee — active, EMPLOYEE role, email normalised, creator recorded", async () => {
  const repo = createInMemoryStaffRepository();
  const member = await addStaffMember(repo, PRIYA, FOUNDER, minutes(1));
  assert.equal(member.active, true);
  assert.equal(member.role, "EMPLOYEE");
  assert.equal(member.email, "priya@example.com");
  assert.equal(member.createdBy, FOUNDER.actorId);
  assert.equal(member.deactivatedAt, null);
  assert.equal((await listStaff(repo, FOUNDER)).length, 1);
});

test("staff: only the founder may manage the team — employee, buyer, system and id-less actors are refused and nothing changes", async () => {
  const repo = createInMemoryStaffRepository();
  const member = await addStaffMember(repo, PRIYA, FOUNDER, minutes(1));
  for (const actor of [EMPLOYEE_ACTOR, BUYER, SYSTEM, { actorType: "FOUNDER" as const }]) {
    await assert.rejects(addStaffMember(repo, { ...PRIYA, userId: "user_other_0002" }, actor), UnauthorizedStaffActionError);
    await assert.rejects(setStaffActive(repo, member.id, false, actor), UnauthorizedStaffActionError);
    await assert.rejects(listStaff(repo, actor), UnauthorizedStaffActionError);
  }
  assert.equal((await listStaff(repo, FOUNDER)).length, 1);
  assert.equal((await repo.getById(member.id))?.active, true);
});

test("staff: invalid input is refused — bad identity, the founder's own id, bad role, blank or long name, bad email, duplicates", async () => {
  const repo = createInMemoryStaffRepository();
  await assert.rejects(addStaffMember(repo, { ...PRIYA, userId: "not-a-clerk-id" }, FOUNDER), StaffValidationError);
  await assert.rejects(addStaffMember(repo, { ...PRIYA, userId: FOUNDER.actorId! }, FOUNDER), StaffValidationError);
  await assert.rejects(addStaffMember(repo, { ...PRIYA, role: "OWNER" as never }, FOUNDER), StaffValidationError);
  await assert.rejects(addStaffMember(repo, { ...PRIYA, displayName: "   " }, FOUNDER), StaffValidationError);
  await assert.rejects(addStaffMember(repo, { ...PRIYA, displayName: "x".repeat(101) }, FOUNDER), StaffValidationError);
  await assert.rejects(addStaffMember(repo, { ...PRIYA, email: "nope" }, FOUNDER), StaffValidationError);
  assert.equal((await listStaff(repo, FOUNDER)).length, 0);

  await addStaffMember(repo, PRIYA, FOUNDER);
  await assert.rejects(addStaffMember(repo, PRIYA, FOUNDER), StaffStateError);
});

test("staff: deactivation is recorded (when and by whom), never deletes, and reactivation clears it", async () => {
  const repo = createInMemoryStaffRepository();
  const member = await addStaffMember(repo, PRIYA, FOUNDER, minutes(1));

  const off = await setStaffActive(repo, member.id, false, FOUNDER, minutes(5));
  assert.equal(off.active, false);
  assert.equal(off.deactivatedAt?.getTime(), minutes(5).getTime());
  assert.equal(off.deactivatedBy, FOUNDER.actorId);
  await assert.rejects(setStaffActive(repo, member.id, false, FOUNDER), StaffStateError, "already inactive");

  const on = await setStaffActive(repo, member.id, true, FOUNDER, minutes(9));
  assert.equal(on.active, true);
  assert.equal(on.deactivatedAt, null);
  assert.equal(on.deactivatedBy, null);

  await assert.rejects(setStaffActive(repo, "not-a-uuid", false, FOUNDER), StaffNotFoundError);
  await assert.rejects(setStaffActive(repo, "99999999-9999-4999-8999-999999999999", false, FOUNDER), StaffNotFoundError);
  assert.equal((await listStaff(repo, FOUNDER)).length, 1, "a member is never removed");
});

test("staff: only an ACTIVE member becomes a lead actor — unknown or inactive accounts get nothing", async () => {
  const repo = createInMemoryStaffRepository();
  const member = await addStaffMember(repo, PRIYA, FOUNDER);
  assert.deepEqual(authorizeStaffActor(member), { actorType: "EMPLOYEE", actorId: PRIYA.userId });

  const off = await setStaffActive(repo, member.id, false, FOUNDER);
  assert.throws(() => authorizeStaffActor(off), UnauthorizedStaffActionError);
  assert.throws(() => authorizeStaffActor(null), UnauthorizedStaffActionError);
  assert.throws(() => authorizeStaffActor(undefined), UnauthorizedStaffActionError);
});

test("staff: the name map includes inactive members so history keeps showing who they were", async () => {
  const repo = createInMemoryStaffRepository();
  const member = await addStaffMember(repo, PRIYA, FOUNDER);
  await setStaffActive(repo, member.id, false, FOUNDER);
  assert.deepEqual(staffNameMap(await listStaff(repo, FOUNDER)), { [PRIYA.userId]: "Priya Nair" });
});
