import { test } from "node:test";
import assert from "node:assert/strict";
import { captureAssistanceLead, getLeadTimeline, restoreLead, sendLeadToReturned, trashLead } from "../lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadStateError, UnauthorizedLeadActionError } from "../errors.ts";
import { BUYER, FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/** The Founder's clean-up path: erase -> Returned leads -> Trash -> (restore | permanent erasure). Nothing is destroyed before the last step. */

async function lead() {
  const repos = createInMemoryLeadRepositories();
  const { lead: created } = await captureAssistanceLead(repos, captureInput(), T0);
  return { repos, id: created.id };
}

test("an erased lead lands in Returned leads with its details and history intact", async () => {
  const { repos, id } = await lead();
  const sent = await sendLeadToReturned(repos, id, FOUNDER, minutes(5));
  assert.equal(sent.ownerId, null);
  assert.ok(sent.returnedAt);
  assert.ok(sent.phoneE164, "personal data is kept");
  assert.equal((await repos.leads.listReturned(10)).length, 1);
  const types = (await getLeadTimeline(repos, id)).map((e) => e.eventType);
  assert.ok(types.includes("RETURNED_TO_FOUNDER"));
});

test("sending a lead that is already in Returned leads again is refused", async () => {
  const { repos, id } = await lead();
  await sendLeadToReturned(repos, id, FOUNDER, minutes(5));
  await assert.rejects(() => sendLeadToReturned(repos, id, FOUNDER, minutes(6)), LeadStateError);
});

test("only a returned lead can be trashed; trashing hides it from Returned leads, restoring brings it back", async () => {
  const { repos, id } = await lead();
  await assert.rejects(() => trashLead(repos, id, FOUNDER, minutes(5)), LeadStateError, "not returned yet");

  await sendLeadToReturned(repos, id, FOUNDER, minutes(5));
  const trashed = await trashLead(repos, id, FOUNDER, minutes(6));
  assert.ok(trashed.trashedAt);
  assert.equal((await repos.leads.listReturned(10)).length, 0);
  assert.equal((await repos.leads.listTrashed(10)).length, 1);
  await assert.rejects(() => trashLead(repos, id, FOUNDER, minutes(7)), LeadStateError, "already in Trash");

  const restored = await restoreLead(repos, id, FOUNDER, minutes(8));
  assert.equal(restored.trashedAt, null);
  assert.equal((await repos.leads.listReturned(10)).length, 1);
  assert.equal((await repos.leads.listTrashed(10)).length, 0);
  const types = (await getLeadTimeline(repos, id)).map((e) => e.eventType);
  assert.ok(types.includes("LEAD_TRASHED") && types.includes("LEAD_RESTORED"));
});

test("restoring a lead that is not in Trash is refused", async () => {
  const { repos, id } = await lead();
  await assert.rejects(() => restoreLead(repos, id, FOUNDER, minutes(5)), LeadStateError);
});

test("only the founder may send, trash or restore", async () => {
  const { repos, id } = await lead();
  await assert.rejects(() => sendLeadToReturned(repos, id, BUYER, minutes(5)), UnauthorizedLeadActionError);
  await assert.rejects(() => trashLead(repos, id, BUYER, minutes(5)), UnauthorizedLeadActionError);
  await assert.rejects(() => restoreLead(repos, id, BUYER, minutes(5)), UnauthorizedLeadActionError);
});
