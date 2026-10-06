import { test } from "node:test";
import assert from "node:assert/strict";
import { addNote, captureAssistanceLead, getLeadTimeline, logContact } from "../lead-service.ts";
import { ERASE_CONFIRMATION, eraseLeadOnFounderRequest } from "../erasure.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { BUYER, FOUNDER, SYSTEM, captureInput, minutes, T0 } from "./test-helpers.ts";

/**
 * The founder's erasure path (the guard around eraseLead). What erasure itself
 * removes and keeps is covered in lead-service.test.ts; these tests cover who
 * may trigger it, the typed confirmation, and that every refusal changes nothing.
 */

async function lead() {
  const repos = createInMemoryLeadRepositories();
  const { lead: created } = await captureAssistanceLead(repos, captureInput(), T0);
  await addNote(repos, created.id, "Asha's husband Rakesh works at Infosys", FOUNDER, minutes(5));
  await logContact(repos, created.id, { channel: "WHATSAPP", outcome: "CONNECTED", note: "shared brochure" }, FOUNDER, minutes(6));
  return { repos, id: created.id };
}

const snapshot = async (repos: ReturnType<typeof createInMemoryLeadRepositories>, id: string) =>
  JSON.stringify({ lead: await repos.leads.getById(id), events: await getLeadTimeline(repos, id), consents: await repos.consents.listByLead(id) });

test("erasure path: the founder, with the typed confirmation, erases the personal data and records an audit event", async () => {
  const { repos, id } = await lead();
  const before = await getLeadTimeline(repos, id);

  const erased = await eraseLeadOnFounderRequest(repos, id, ERASE_CONFIRMATION, FOUNDER, minutes(100));

  assert.equal(erased.erasedAt?.getTime(), minutes(100).getTime());
  assert.equal(erased.phoneE164, null);
  assert.equal(erased.name, null);
  assert.equal(erased.email, null);

  const after = await getLeadTimeline(repos, id);
  assert.ok(after.length > before.length, "history grows — nothing is silently deleted");
  assert.deepEqual(
    after.slice(0, before.length).map((event) => event.id),
    before.map((event) => event.id),
    "every earlier event is still there, in order",
  );
  const audit = after.filter((event) => event.eventType === "LEAD_ERASED");
  assert.equal(audit.length, 1, "exactly one erasure event is appended");
  assert.equal(audit[0].actorType, "FOUNDER");
  assert.equal(audit[0].actorId, FOUNDER.actorId, "the audit event names the founder who did it");
  assert.equal(audit[0].payload.via, "FOUNDER_ACTION");

  const everything = JSON.stringify({ lead: erased, events: after });
  for (const secret of ["Asha", "asha.verma", "9876543210", "Rakesh", "Infosys", "brochure"]) {
    assert.ok(!everything.includes(secret), `"${secret}" survived erasure`);
  }
});

test("erasure path: the confirmation is case-insensitive and trimmed, but anything else is refused and changes nothing", async () => {
  const { repos, id } = await lead();
  const untouched = await snapshot(repos, id);

  for (const wrong of ["", " ", "erase it", "YES", "DELETE", "ERASE!", "ERAS", undefined, null, 1, {}]) {
    await assert.rejects(
      () => eraseLeadOnFounderRequest(repos, id, wrong, FOUNDER, minutes(100)),
      (error: unknown) => error instanceof LeadValidationError && error.field === "confirmation",
      `confirmation ${JSON.stringify(wrong)} must be refused`,
    );
  }
  assert.equal(await snapshot(repos, id), untouched, "a refused request changes nothing");

  const erased = await eraseLeadOnFounderRequest(repos, id, "  erase  ", FOUNDER, minutes(100));
  assert.ok(erased.erasedAt);
});

test("erasure path: only the founder — a buyer or the system is refused before anything is read or changed", async () => {
  const { repos, id } = await lead();
  const untouched = await snapshot(repos, id);

  for (const actor of [BUYER, SYSTEM]) {
    await assert.rejects(() => eraseLeadOnFounderRequest(repos, id, ERASE_CONFIRMATION, actor, minutes(100)), UnauthorizedLeadActionError);
  }
  // Even an unknown id is an authorization failure first for a non-founder: it must not reveal whether a lead exists.
  await assert.rejects(
    () => eraseLeadOnFounderRequest(repos, "00000000-0000-4000-8000-000000000000", ERASE_CONFIRMATION, BUYER),
    UnauthorizedLeadActionError,
  );
  assert.equal(await snapshot(repos, id), untouched);
});

test("erasure path: an unknown lead is 'not found', and an already-erased lead cannot be erased twice", async () => {
  const { repos, id } = await lead();

  await assert.rejects(
    () => eraseLeadOnFounderRequest(repos, "00000000-0000-4000-8000-000000000000", ERASE_CONFIRMATION, FOUNDER),
    LeadNotFoundError,
  );

  await eraseLeadOnFounderRequest(repos, id, ERASE_CONFIRMATION, FOUNDER, minutes(100));
  const once = await snapshot(repos, id);
  await assert.rejects(() => eraseLeadOnFounderRequest(repos, id, ERASE_CONFIRMATION, FOUNDER, minutes(200)), LeadStateError);
  assert.equal(await snapshot(repos, id), once, "a second attempt adds no second erasure event");
});

test("erasure path: erasing one lead never touches another (no cross-lead effect)", async () => {
  const repos = createInMemoryLeadRepositories();
  const a = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 43210", name: "Asha Verma" }), T0)).lead;
  const b = (await captureAssistanceLead(repos, captureInput({ phone: "+91 91234 56780", name: "Bhavin Shah", email: "bhavin@example.com", sessionId: "session-2" }), T0)).lead;
  const bBefore = await snapshot(repos, b.id);

  await eraseLeadOnFounderRequest(repos, a.id, ERASE_CONFIRMATION, FOUNDER, minutes(100));

  assert.equal(await snapshot(repos, b.id), bBefore, "the other lead is byte-for-byte unchanged");
  assert.equal((await repos.leads.getById(b.id))?.phoneE164, "+919123456780");
});
