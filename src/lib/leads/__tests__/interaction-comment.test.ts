import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignLead, captureAssistanceLead } from "../lead-service.ts";
import { scheduleFollowUp } from "../follow-up-service.ts";
import { COMMENT_FRESH_MINUTES, COMMENT_REQUIRED_MESSAGE, cleanComment, hasFreshComment, requireInteractionComment } from "../interaction-comment.ts";
import { LeadValidationError } from "../errors.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { createInMemoryStaffRepository } from "../../staff/memory-repository.ts";
import { addStaffMember } from "../../staff/staff-service.ts";
import { resolveEmployee } from "../../staff/employee-access.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

async function world() {
  const repos = createInMemoryLeadRepositories();
  const staff = createInMemoryStaffRepository();
  const priya = await addStaffMember(staff, { userId: "user_priya_0001", displayName: "Priya Nair" }, FOUNDER, minutes(1));
  const rohan = await addStaffMember(staff, { userId: "user_rohan_0002", displayName: "Rohan Das" }, FOUNDER, minutes(1));
  const lead = (await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 49001", name: "Buyer" }), T0)).lead;
  await assignLead(repos, staff, lead.id, priya.id, FOUNDER, minutes(5));
  return { repos, lead, priya: (await resolveEmployee(staff, priya.userId))!.actor, rohan: (await resolveEmployee(staff, rohan.userId))!.actor };
}

test("comment rule: with no comment nothing is recorded, with one it is saved with its time and the update may proceed", async () => {
  const w = await world();
  await assert.rejects(requireInteractionComment(w.repos, w.lead.id, w.priya, undefined, minutes(10)), (e: unknown) => e instanceof LeadValidationError && e.message === COMMENT_REQUIRED_MESSAGE);
  await assert.rejects(requireInteractionComment(w.repos, w.lead.id, w.priya, "   ", minutes(10)), LeadValidationError);
  await assert.rejects(requireInteractionComment(w.repos, w.lead.id, w.priya, "ok", minutes(10)), /few characters/);
  await requireInteractionComment(w.repos, w.lead.id, w.priya, "Spoke for ten minutes; wants 2 BHK in Thane, will visit Sunday.", minutes(10));
  const notes = (await w.repos.events.listByLead(w.lead.id)).filter((e) => e.eventType === "NOTE_ADDED");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].createdAt.getTime(), minutes(10).getTime(), "kept with the exact date, time and day");
  assert.equal(notes[0].actorId, w.priya.actorId);
  // The update the comment unlocks now goes through.
  await scheduleFollowUp(w.repos, w.lead.id, { scheduledAt: minutes(60 * 24), type: "CALL_BACK" }, w.priya, minutes(11));
});

test("comment rule: one comment covers the updates that follow one conversation, a later conversation needs a new one", async () => {
  const w = await world();
  await requireInteractionComment(w.repos, w.lead.id, w.priya, "Call 1: asked to be called back after salary day.", minutes(10));
  await requireInteractionComment(w.repos, w.lead.id, w.priya, undefined, minutes(10 + COMMENT_FRESH_MINUTES - 1));
  await assert.rejects(requireInteractionComment(w.repos, w.lead.id, w.priya, undefined, minutes(10 + COMMENT_FRESH_MINUTES + 1)), LeadValidationError, "a stale comment cannot be reused for a new conversation");
  await requireInteractionComment(w.repos, w.lead.id, w.priya, "Call 2: confirmed Sunday visit.", minutes(60 * 24));
});

test("comment rule: someone else's comment, or another lead's, never counts", async () => {
  const w = await world();
  const second = (await captureAssistanceLead(w.repos, captureInput({ phone: "+91 98765 49002", name: "Other" }), T0)).lead;
  const events = [{ eventType: "NOTE_ADDED" as const, actorId: w.rohan.actorId!, createdAt: minutes(10) }];
  assert.equal(hasFreshComment(events, w.priya.actorId!, minutes(11)), false, "a colleague's note is not mine");
  assert.equal(hasFreshComment([{ eventType: "STATUS_CHANGED" as const, actorId: w.priya.actorId!, createdAt: minutes(10) }], w.priya.actorId!, minutes(11)), false, "a status change is not a comment");
  await requireInteractionComment(w.repos, w.lead.id, w.priya, "A real comment on the first lead.", minutes(10));
  await assert.rejects(requireInteractionComment(w.repos, second.id, w.priya, undefined, minutes(11)), LeadValidationError, "the comment was on a different lead");
});

test("comment rule: cleaning", () => {
  assert.equal(cleanComment("  hello there  "), "hello there");
  assert.equal(cleanComment("ab"), null);
  assert.equal(cleanComment(undefined), null);
  assert.equal(cleanComment(42), null);
});

test("comment rule is wired into every action that records an interaction, and the cold call needs its comment on the server too", () => {
  const source = read("src/app/team/_actions/team-actions.ts");
  const guarded = ["recordMyQualificationAction", "logMyLeadContactAction", "setMyLeadFollowUpAction", "rescheduleMyLeadFollowUpAction", "completeMyLeadFollowUpAction", "cancelMyLeadFollowUpAction", "setMyCallDispositionAction"];
  for (const name of guarded) {
    const body = source.slice(source.indexOf(`export async function ${name}(`));
    const next = body.indexOf("\nexport ", 10);
    assert.ok(body.slice(0, next === -1 ? undefined : next).includes("requireInteractionComment("), `${name} requires a comment`);
  }
  const cold = source.slice(source.indexOf("export async function saveMyColdCallLeadAction("));
  assert.ok(cold.indexOf("cleanComment(payload.note)") !== -1 && cold.indexOf("cleanComment(payload.note)") < cold.indexOf("saveColdCallLead("), "the comment is checked before anything is saved");
});

test("every comment is shown with its date, time AND day of the week, in India time", async () => {
  const { formatDateTimeWithDay } = await import("../format.ts");
  assert.equal(formatDateTimeWithDay(new Date("2026-10-09T05:02:00Z")), "Fri 09 Oct 2026, 10:32 AM");
  assert.equal(formatDateTimeWithDay(new Date("2026-10-11T18:31:00Z")), "Mon 12 Oct 2026, 12:01 AM", "the day follows India time, not UTC");
  assert.match(read("src/components/admin/leads/lead-detail-sections.tsx"), /formatDateTimeWithDay\(line\.at\)/);
});
