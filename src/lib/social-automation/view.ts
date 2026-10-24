import { availabilityBlockers, decideDm, formatProjectPrice, priceBlockers } from "./logic.ts";
import type { AutomationSettings, PostConfig, ProjectFacts } from "./types.ts";

/** Plain-language summaries of the automation state for the admin screens. Pure: no database, no clock of its own. */

export function projectLabel(project: ProjectFacts): string {
  const place = [project.locality, project.city].filter(Boolean).join(", ");
  const price = formatProjectPrice(project);
  return `${project.name} — ${place}${price ? ` — ${price}` : " — no price on file"}`;
}

const PRICE_REASON: Record<string, string> = {
  price_missing: "the project has no price on file",
  price_not_approved: "you have not approved the price for messages",
  price_never_verified: "the price has never been verified",
  price_stale: "the verification is older than your limit",
  price_changed_since_verification: "the project's price changed after you verified it",
};
const AVAILABILITY_REASON: Record<string, string> = {
  availability_missing: "no availability is written",
  availability_never_verified: "availability has never been verified",
  availability_stale: "the verification is older than your limit",
};

export function describePriceState(config: PostConfig, project: ProjectFacts | null, settings: AutomationSettings, now: Date): string {
  if (!project) return "choose a project first";
  const blockers = priceBlockers(config, project, settings, now);
  return blockers.length === 0 ? "verified and current — it can be sent" : `not sent (${blockers.map((b) => PRICE_REASON[b] ?? b).join("; ")})`;
}

export function describeAvailabilityState(config: PostConfig, settings: AutomationSettings, now: Date): string {
  const blockers = availabilityBlockers(config, settings, now);
  return blockers.length === 0 ? "verified and current — it can be sent" : `not sent (${blockers.map((b) => AVAILABILITY_REASON[b] ?? b).join("; ")})`;
}

const DECISION_REASON: Record<string, string> = {
  project_missing: "no project is chosen",
  project_inactive: "the project is inactive",
  template_missing: "this trigger has no message",
  details_missing: "no approved details are written",
  message_too_long: "the message is over 1000 bytes once filled in",
  no_safe_fallback: "no safe fallback message is set",
  ...PRICE_REASON,
  ...AVAILABILITY_REASON,
};

export const reasonText = (code: string): string => DECISION_REASON[code] ?? code.replace(/_/g, " ");

/** What each trigger would send right now: the exact text, or why it would go to manual follow-up instead. */
export function previewTriggers(config: PostConfig, project: ProjectFacts | null, settings: AutomationSettings, now: Date) {
  return config.triggers.map((trigger) => {
    const decision = decideDm(config, trigger, project, settings, now);
    return { keyword: trigger.keyword, decision };
  });
}
