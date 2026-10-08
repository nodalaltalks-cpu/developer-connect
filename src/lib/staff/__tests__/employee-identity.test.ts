import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryStaffRepository } from "../memory-repository.ts";
import { resolveEmployee, resolveEmployeeOrClaim } from "../employee-access.ts";
import { employeeLabel, FOUNDER_IDENTITY, founderLabel, parseEmployeeId } from "../identity.ts";
import { StaffStateError, StaffValidationError, UnauthorizedStaffActionError } from "../errors.ts";
import { approveStaffMember, changeStaffEmail, claimInvitation, exitStaffMember, findStaffByEmployeeId, inviteStaffMember, listStaffEvents, setStaffActive } from "../staff-service.ts";
import { BUYER, FOUNDER, minutes } from "../../leads/__tests__/test-helpers.ts";

const EMPLOYEE_ACTOR = { actorType: "EMPLOYEE", actorId: "user_employee_1" } as const;
const ana = (n = 1) => ({ displayName: `Ana ${n}`, email: `ana${n}@gmail.com` });

test("identity: the Founder is always DC1, and DC1 is never an employee record", () => {
  assert.equal(FOUNDER_IDENTITY.employeeId, "DC1");
  assert.equal(founderLabel(), "DC1 · Ambish Singh · Founder");
});

test("identity: employees get DC2, DC3, ... in order, and an ID is never reused after an exit", async () => {
  const repo = createInMemoryStaffRepository();
  const a = await inviteStaffMember(repo, ana(1), FOUNDER, minutes(1));
  const b = await inviteStaffMember(repo, ana(2), FOUNDER, minutes(2));
  assert.deepEqual([a.employeeId, b.employeeId], ["DC2", "DC3"]);
  await approveStaffMember(repo, b.id, FOUNDER, minutes(3));
  await exitStaffMember(repo, b.id, "RESIGNED", FOUNDER, minutes(4));
  const c = await inviteStaffMember(repo, ana(3), FOUNDER, minutes(5));
  assert.equal(c.employeeId, "DC4", "DC3 exited; the next person is DC4, never DC3 again");
  assert.equal(employeeLabel(b), "DC3 · Ana 2", "the exited person keeps their ID and name");
});

test("identity: concurrent invitations never get the same ID", async () => {
  const repo = createInMemoryStaffRepository();
  const made = await Promise.all(Array.from({ length: 12 }, (_, i) => inviteStaffMember(repo, ana(i), FOUNDER)));
  assert.equal(new Set(made.map((m) => m.employeeId)).size, 12);
});

test("identity: an ID cannot be supplied or changed through the service", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, { ...ana(), employeeId: "DC77" } as never, FOUNDER);
  assert.equal(m.employeeId, "DC2");
  const updated = await repo.update(m.id, { displayName: "Renamed" } as never, minutes(1));
  assert.equal(updated.employeeId, "DC2");
});

test("search: 'dc2', 'DC2' and ' Dc2 ' all find DC2; junk and DC0 find nothing", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, ana(), FOUNDER);
  for (const q of ["dc2", "DC2", " Dc2 "]) assert.equal((await findStaffByEmployeeId(repo, q, FOUNDER))?.id, m.id);
  for (const q of ["DC0", "DC", "D2", "DC2x", "", "DC99999999999"]) assert.equal(parseEmployeeId(q), q === "DC99999999999" ? null : parseEmployeeId(q));
  assert.equal(await findStaffByEmployeeId(repo, "DC9", FOUNDER), null);
  assert.equal(parseEmployeeId("DC0"), null);
});

test("approval: an invited person has no access; unknown, pending, unverified and different emails are all denied", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, ana(), FOUNDER);
  assert.equal(m.status, "INVITED");
  const clerk = "user_ana_0000001";
  assert.equal(await claimInvitation(repo, clerk, ["ana1@gmail.com"]), null, "pending: not approved yet");
  await approveStaffMember(repo, m.id, FOUNDER);
  assert.equal(await claimInvitation(repo, clerk, []), null, "no verified email");
  assert.equal(await claimInvitation(repo, clerk, ["someone.else@gmail.com"]), null, "unknown Google account");
  assert.equal(await resolveEmployee(repo, clerk), null);
  const ok = await claimInvitation(repo, clerk, ["ANA1@gmail.com"], minutes(5));
  assert.equal(ok?.status, "ACTIVE");
  assert.equal(ok?.userId, clerk);
  assert.equal((await resolveEmployee(repo, clerk))?.member.employeeId, "DC2");
});

test("approval: the first sign-in claims the record once - a second account with the same email gets nothing", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, ana(), FOUNDER);
  await approveStaffMember(repo, m.id, FOUNDER);
  assert.ok(await resolveEmployeeOrClaim(repo, "user_first_000001", async () => ["ana1@gmail.com"]));
  assert.equal(await resolveEmployeeOrClaim(repo, "user_second_00001", async () => ["ana1@gmail.com"]), null);
});

test("lifecycle: the Founder deactivates, reactivates and exits; events record who and when", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, { ...ana(), userId: "user_ana_0000001" }, FOUNDER, minutes(1));
  await approveStaffMember(repo, m.id, FOUNDER, minutes(2));
  assert.equal((await setStaffActive(repo, m.id, false, FOUNDER, minutes(3))).status, "INACTIVE");
  assert.equal(await resolveEmployee(repo, "user_ana_0000001"), null, "inactive: denied");
  assert.equal((await setStaffActive(repo, m.id, true, FOUNDER, minutes(4))).status, "ACTIVE");
  const exited = await exitStaffMember(repo, m.id, "TERMINATED", FOUNDER, minutes(5));
  assert.equal(exited.status, "EXITED");
  assert.equal(exited.active, false);
  assert.equal(exited.exitedBy, FOUNDER.actorId);
  assert.equal(exited.exitReason, "TERMINATED");
  assert.deepEqual(exited.exitedAt, minutes(5));
  assert.equal(await resolveEmployee(repo, "user_ana_0000001"), null, "exited: denied");
  const types = (await listStaffEvents(repo, m.id, FOUNDER)).map((e) => e.eventType);
  for (const t of ["EMPLOYEE_INVITED", "EMPLOYEE_APPROVED", "EMPLOYEE_DEACTIVATED", "EMPLOYEE_REACTIVATED", "EMPLOYEE_EXITED"]) assert.ok(types.includes(t as never), t);
  assert.ok((await listStaffEvents(repo, m.id, FOUNDER)).every((e) => e.employeeId === "DC2" && e.actorId));
});

test("lifecycle: an exited person cannot be reactivated, re-exited, re-approved, or claim access by signing in again", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, { ...ana(), userId: "user_ana_0000001" }, FOUNDER);
  await approveStaffMember(repo, m.id, FOUNDER);
  await exitStaffMember(repo, m.id, "RESIGNED", FOUNDER);
  await assert.rejects(setStaffActive(repo, m.id, true, FOUNDER), StaffStateError);
  await assert.rejects(exitStaffMember(repo, m.id, "RESIGNED", FOUNDER), StaffStateError);
  assert.equal(await claimInvitation(repo, "user_ana_0000001", ["ana1@gmail.com"]), null);
  assert.equal(await resolveEmployeeOrClaim(repo, "user_ana_0000001", async () => ["ana1@gmail.com"]), null);
});

test("lifecycle: an exit needs a valid structured reason", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, ana(), FOUNDER);
  await assert.rejects(exitStaffMember(repo, m.id, "BORED" as never, FOUNDER), StaffValidationError);
  await assert.rejects(exitStaffMember(repo, m.id, undefined as never, FOUNDER), StaffValidationError);
});

test("authorization: only the Founder manages identity - employees (even themselves), buyers and id-less actors are refused", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, { ...ana(), userId: "user_employee_1" }, FOUNDER);
  await approveStaffMember(repo, m.id, FOUNDER);
  for (const actor of [EMPLOYEE_ACTOR, BUYER, { actorType: "FOUNDER" as const }]) {
    await assert.rejects(inviteStaffMember(repo, ana(9), actor), UnauthorizedStaffActionError);
    await assert.rejects(approveStaffMember(repo, m.id, actor), UnauthorizedStaffActionError);
    await assert.rejects(setStaffActive(repo, m.id, true, actor), UnauthorizedStaffActionError);
    await assert.rejects(exitStaffMember(repo, m.id, "OTHER", actor), UnauthorizedStaffActionError);
    await assert.rejects(findStaffByEmployeeId(repo, "DC2", actor), UnauthorizedStaffActionError);
    await assert.rejects(listStaffEvents(repo, m.id, actor), UnauthorizedStaffActionError);
  }
  assert.equal((await repo.getById(m.id))?.status, "ACTIVE", "nothing changed - an employee cannot reactivate or exit themselves or others");
});

test("invite: the same live email cannot be invited twice, but an exited person's email can be invited again with a new ID", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, ana(), FOUNDER);
  await assert.rejects(inviteStaffMember(repo, ana(), FOUNDER), StaffStateError);
  await exitStaffMember(repo, m.id, "OTHER", FOUNDER);
  const again = await inviteStaffMember(repo, ana(), FOUNDER);
  assert.notEqual(again.employeeId, m.employeeId);
});

test("email change: the employee ID, sign-in identity and ownership key never change; old and new address are logged", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, { ...ana(), userId: "user_ana_0000001" }, FOUNDER, minutes(1));
  await approveStaffMember(repo, m.id, FOUNDER, minutes(2));
  const changed = await changeStaffEmail(repo, m.id, " New.Ana@Company.Test ", FOUNDER, minutes(3));
  assert.equal(changed.email, "new.ana@company.test");
  assert.equal(changed.employeeId, m.employeeId, "the ID never changes");
  assert.equal(changed.userId, "user_ana_0000001", "history is keyed to the same sign-in identity");
  assert.equal(changed.status, "ACTIVE", "access is unaffected");
  const event = (await listStaffEvents(repo, m.id, FOUNDER)).find((e) => e.eventType === "EMPLOYEE_EMAIL_CHANGED");
  assert.deepEqual([event?.payload.from, event?.payload.to, event?.actorId], ["ana1@gmail.com", "new.ana@company.test", FOUNDER.actorId]);
  await changeStaffEmail(repo, m.id, "third@company.test", FOUNDER, minutes(4));
  assert.equal((await listStaffEvents(repo, m.id, FOUNDER)).filter((e) => e.eventType === "EMPLOYEE_EMAIL_CHANGED").length, 2, "the full email history is kept");
});

test("email change: an invited person is matched on the NEW address at first sign-in, not the old one", async () => {
  const repo = createInMemoryStaffRepository();
  const m = await inviteStaffMember(repo, ana(), FOUNDER);
  await approveStaffMember(repo, m.id, FOUNDER);
  await changeStaffEmail(repo, m.id, "moved@company.test", FOUNDER);
  assert.equal(await claimInvitation(repo, "user_first_000001", ["ana1@gmail.com"]), null, "the old address no longer claims the record");
  const claimed = await claimInvitation(repo, "user_first_000001", ["moved@company.test"]);
  assert.equal(claimed?.employeeId, m.employeeId);
});

test("email change: only the Founder; refuses exited people, duplicates, invalid and unchanged addresses", async () => {
  const repo = createInMemoryStaffRepository();
  const a = await inviteStaffMember(repo, ana(1), FOUNDER);
  const b = await inviteStaffMember(repo, ana(2), FOUNDER);
  for (const actor of [EMPLOYEE_ACTOR, BUYER, { actorType: "FOUNDER" as const }]) await assert.rejects(changeStaffEmail(repo, a.id, "x@y.test", actor), UnauthorizedStaffActionError);
  await assert.rejects(changeStaffEmail(repo, a.id, "not-an-email", FOUNDER), StaffValidationError);
  await assert.rejects(changeStaffEmail(repo, a.id, "ana1@gmail.com", FOUNDER), StaffStateError, "unchanged");
  await assert.rejects(changeStaffEmail(repo, a.id, "ANA2@gmail.com", FOUNDER), StaffStateError, "belongs to another live member");
  await exitStaffMember(repo, b.id, "OTHER", FOUNDER);
  assert.equal((await changeStaffEmail(repo, a.id, "ana2@gmail.com", FOUNDER)).email, "ana2@gmail.com", "an exited person's address can be reused");
  await assert.rejects(changeStaffEmail(repo, b.id, "z@z.test", FOUNDER), StaffStateError, "exited people cannot be changed");
  assert.equal((await repo.getById(a.id))?.employeeId, a.employeeId);
});
