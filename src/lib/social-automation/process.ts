import { choosePublicReply, decideDm, matchTrigger } from "./logic.ts";
import type { MetaSender } from "./meta/client.ts";
import type { IncomingComment } from "./meta/webhook.ts";
import type { AutomationSettings, PostConfig, ProjectFacts } from "./types.ts";
import { reasonText } from "./view.ts";

/**
 * What happens to one incoming comment, start to finish. The same function serves Dry run and Live: the only difference is
 * whether the two Meta calls are made or just recorded. Everything it needs from outside (database, Meta, the clock) is passed in.
 *
 * Guarantees:
 *  - One comment is handled once. A second delivery is counted as a duplicate and does nothing.
 *  - Nothing is sent unless the global switch is ON, the post is LIVE, and Meta credentials exist for that platform.
 *  - The public reply only says a DM was sent when the DM really was sent.
 *  - Whenever a Live enquiry could not be answered automatically, it lands on the Founder's follow-up list. No comment is lost silently.
 */

/** Meta only allows a private reply within 7 days of the comment. */
const PRIVATE_REPLY_WINDOW_MS = 7 * 86_400_000;

export interface EventPatch {
  automationId?: string | null;
  projectId?: string | null;
  triggerKeyword?: string | null;
  detectedIntent?: string | null;
  modeAtProcessing?: string | null;
  outcome?: "NO_MATCH" | "NOT_CONFIGURED" | "AUTOMATION_OFF" | "PROCESSED" | "NEEDS_MANUAL";
  dmStatus?: "DRY_RUN" | "SENT" | "FAILED" | "INELIGIBLE" | "SKIPPED";
  dmText?: string | null;
  dmFailureReason?: string | null;
  dmMessageId?: string | null;
  dmAttemptedAt?: Date | null;
  replyStatus?: "DRY_RUN" | "SENT" | "FAILED" | "SKIPPED";
  replyText?: string | null;
  replyFailureReason?: string | null;
  replyPlatformId?: string | null;
  replyAttemptedAt?: Date | null;
  followUpRequired?: boolean;
  followUpReason?: string | null;
  followUpStatus?: "OPEN";
}

export interface ProcessorStore {
  getSettings(): Promise<AutomationSettings>;
  findPost(platform: IncomingComment["platform"], postId: string): Promise<{ config: PostConfig; project: ProjectFacts | null } | null>;
  /** Stores the comment, or counts it as a duplicate if this comment was already stored. */
  recordComment(comment: IncomingComment, now: Date): Promise<{ id: string } | "duplicate">;
  updateEvent(id: string, patch: EventPatch): Promise<void>;
}

export type ProcessResult = "IGNORED" | "DUPLICATE" | "NOT_CONFIGURED" | "NO_MATCH" | "AUTOMATION_OFF" | "DRY_RUN" | "SENT" | "NEEDS_MANUAL";

export async function processComment(comment: IncomingComment, deps: { store: ProcessorStore; meta: MetaSender; now: () => Date }): Promise<ProcessResult> {
  const { store, meta } = deps;
  // Our own public reply arrives through the same webhook; it must never be treated as an enquiry.
  if (comment.fromOwnAccount) return "IGNORED";

  const recorded = await store.recordComment(comment, deps.now());
  if (recorded === "duplicate") return "DUPLICATE";
  const eventId = recorded.id;

  const [settings, post] = await Promise.all([store.getSettings(), store.findPost(comment.platform, comment.postId)]);
  if (!post) {
    await store.updateEvent(eventId, { outcome: "NOT_CONFIGURED" });
    return "NOT_CONFIGURED";
  }
  const { config, project } = post;
  const base: EventPatch = { automationId: config.id, projectId: config.projectId, modeAtProcessing: config.mode };

  const trigger = comment.isReply ? null : matchTrigger(comment.text, config.triggers);
  if (!trigger) {
    await store.updateEvent(eventId, { ...base, outcome: "NO_MATCH" });
    return "NO_MATCH";
  }
  const matched: EventPatch = { ...base, triggerKeyword: trigger.keyword, detectedIntent: trigger.intent };

  if (config.mode === "DISABLED") {
    await store.updateEvent(eventId, { ...matched, outcome: "AUTOMATION_OFF", dmStatus: "SKIPPED", replyStatus: "SKIPPED" });
    return "AUTOMATION_OFF";
  }

  const now = deps.now();
  const decision = decideDm(config, trigger, project, settings, now);
  const dmWouldSend = decision.action === "SEND";
  const wouldReply = choosePublicReply(config, dmWouldSend, settings);

  // --- Dry run: record exactly what Live would have done, send nothing ------------------------------------------
  if (config.mode === "DRY_RUN") {
    await store.updateEvent(eventId, {
      ...matched,
      outcome: dmWouldSend ? "PROCESSED" : "NEEDS_MANUAL",
      dmStatus: "DRY_RUN",
      dmText: decision.action === "SEND" ? decision.text : null,
      dmFailureReason: decision.action === "MANUAL" ? `would need your follow-up: ${decision.reasons.map(reasonText).join("; ")}` : null,
      replyStatus: wouldReply ? "DRY_RUN" : "SKIPPED",
      replyText: wouldReply,
    });
    return "DRY_RUN";
  }

  // --- Live -----------------------------------------------------------------------------------------------------
  const followUp = (reason: string): EventPatch => ({ followUpRequired: true, followUpStatus: "OPEN", followUpReason: reason });

  if (!settings.enabled || !meta.canSend(comment.platform)) {
    const reason = !settings.enabled ? "automation is switched off, so nothing was sent" : "this platform is not connected, so nothing was sent";
    await store.updateEvent(eventId, { ...matched, outcome: "AUTOMATION_OFF", dmStatus: "SKIPPED", replyStatus: "SKIPPED", ...followUp(reason) });
    return "AUTOMATION_OFF";
  }

  const patch: EventPatch = { ...matched };
  let dmSent = false;

  if (decision.action === "MANUAL") {
    const reason = decision.reasons.map(reasonText).join("; ");
    Object.assign(patch, { dmStatus: "INELIGIBLE", dmFailureReason: reason, outcome: "NEEDS_MANUAL" }, followUp(`could not message automatically: ${reason}`));
  } else if (comment.commentedAt && now.getTime() - comment.commentedAt.getTime() > PRIVATE_REPLY_WINDOW_MS) {
    Object.assign(patch, { dmStatus: "INELIGIBLE", dmFailureReason: "the comment is older than the 7 days Meta allows for a private reply", outcome: "NEEDS_MANUAL" }, followUp("the comment is older than 7 days"));
  } else {
    const sent = await meta.sendPrivateReply(comment.platform, comment.commentId, decision.text);
    Object.assign(patch, { dmText: decision.text, dmAttemptedAt: deps.now() });
    if (sent.ok) {
      dmSent = true;
      Object.assign(patch, { dmStatus: "SENT", dmMessageId: sent.id, outcome: "PROCESSED" });
      // The safe fallback went out instead of the full message: the commenter still needs the real answer from the Founder.
      if (decision.usedFallback) Object.assign(patch, followUp(`the general message was sent because the full one could not be filled: ${decision.reasons.map(reasonText).join("; ")}`));
    } else {
      Object.assign(patch, { dmStatus: "FAILED", dmFailureReason: sent.reason, outcome: "NEEDS_MANUAL" }, followUp(`the message did not go through (${sent.reason})`));
    }
  }

  // The public reply depends on what really happened to the DM.
  const replyText = choosePublicReply(config, dmSent, settings);
  if (replyText) {
    const replied = await meta.replyPublicly(comment.platform, comment.commentId, replyText);
    Object.assign(patch, { replyText, replyAttemptedAt: deps.now() });
    if (replied.ok) Object.assign(patch, { replyStatus: "SENT", replyPlatformId: replied.id });
    else Object.assign(patch, { replyStatus: "FAILED", replyFailureReason: replied.reason });
  } else {
    patch.replyStatus = "SKIPPED";
  }

  await store.updateEvent(eventId, patch);
  return dmSent ? "SENT" : "NEEDS_MANUAL";
}
