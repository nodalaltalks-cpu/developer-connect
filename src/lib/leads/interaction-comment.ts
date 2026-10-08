import { LeadValidationError } from "./errors.ts";
import { addNote } from "./lead-service.ts";
import type { LeadRepositories } from "./repository.ts";
import type { LeadActor, LeadEvent } from "./types.ts";

/**
 * THE COMMENT RULE. Nothing about a conversation is recorded without a comment on it. Saving the outcome of an interaction (an outcome,
 * a qualification, a follow-up done / set / moved / cancelled, a logged contact) needs a FRESH comment from the same person on that
 * lead: a note written in the last COMMENT_FRESH_MINUTES. One comment covers the several updates that follow one conversation (the
 * outcome, then the next follow-up), and a new conversation needs a new comment. Without one nothing is updated: a new lead stays NEW,
 * and an old lead stays where it was (a missed follow-up stays missed). Every comment is a timestamped lead event, so it is kept with its
 * date, time and day.
 */

/** How long a comment stays "fresh": long enough to record one conversation's outcome and its next step, short enough that it cannot be reused tomorrow. */
export const COMMENT_FRESH_MINUTES = 15;

export const COMMENT_REQUIRED_MESSAGE =
  "Add a comment on this interaction first. It is saved with the date, time and day, and the lead is not updated without it.";

export const MIN_COMMENT_LENGTH = 3;

/** Pure. True when this actor wrote a note on the lead within the last COMMENT_FRESH_MINUTES. */
export function hasFreshComment(events: ReadonlyArray<Pick<LeadEvent, "eventType" | "actorId" | "createdAt">>, actorId: string, now: Date): boolean {
  const earliest = now.getTime() - COMMENT_FRESH_MINUTES * 60_000;
  return events.some((event) => event.actorId === actorId && event.eventType === "NOTE_ADDED" && event.createdAt.getTime() >= earliest && event.createdAt.getTime() <= now.getTime() + 60_000);
}

export function cleanComment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\u0000/g, "").trim();
  return text.length >= MIN_COMMENT_LENGTH ? text : null;
}

/**
 * Call BEFORE recording an interaction. If a comment was typed with the action it is saved first (as a note, with the current time);
 * then a fresh comment must exist or the action is refused with LeadValidationError and nothing else changes.
 */
export async function requireInteractionComment(
  repos: LeadRepositories,
  leadId: string,
  actor: LeadActor,
  comment: unknown,
  now: Date = new Date(),
): Promise<void> {
  const text = cleanComment(comment);
  if (typeof comment === "string" && comment.trim().length > 0 && !text) throw new LeadValidationError("comment", "Write a little more: a comment needs at least a few characters.");
  if (text) await addNote(repos, leadId, text, actor, now);
  if (!actor.actorId) throw new LeadValidationError("comment", COMMENT_REQUIRED_MESSAGE);
  const events = await repos.events.listByLead(leadId);
  if (!hasFreshComment(events, actor.actorId, now)) throw new LeadValidationError("comment", COMMENT_REQUIRED_MESSAGE);
}
