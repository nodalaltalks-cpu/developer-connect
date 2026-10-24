import { formatMoney } from "../leads/format.ts";
import type { AutomationSettings, DmDecision, PostConfig, ProjectFacts, TriggerConfig } from "./types.ts";

/**
 * The decisions behind the comment-to-DM automation, as pure functions: which trigger a comment matches, whether a price or
 * availability may be quoted, what the DM says and what the public reply says. Nothing here sends anything; the same functions
 * serve Dry Run and Live, so a Dry Run shows exactly what Live would do.
 */

export const DEFAULT_PUBLIC_REPLY = "Thanks for your enquiry! I've sent you a DM. Please check your messages.";
/** Used when no DM went out. It deliberately does not mention a DM. */
export const DEFAULT_PUBLIC_REPLY_FALLBACK = "Thanks for your comment! Please send us a message and we'll help you personally.";
/** Instagram text messages are capped at 1000 bytes. */
export const MAX_DM_BYTES = 1000;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------------------------
// Price and availability freshness
// ---------------------------------------------------------------------------------------------------------------

/** A fingerprint of the project's current price. Equal fingerprints mean "the price the Founder verified is still the price". */
export function priceFingerprint(project: Pick<ProjectFacts, "priceMin" | "priceMax" | "currency">): string | null {
  if (project.currency === null || (project.priceMin === null && project.priceMax === null)) return null;
  return `${project.priceMin ?? ""}|${project.priceMax ?? ""}|${project.currency}`;
}

/** The project's price as text in its own currency only ("₹1.5 Cr–₹2 Cr", "AED 900K"), or null if there is none. */
export function formatProjectPrice(project: Pick<ProjectFacts, "priceMin" | "priceMax" | "currency">): string | null {
  const { priceMin, priceMax, currency } = project;
  if (currency === null) return null;
  if (priceMin !== null && priceMax !== null && priceMin !== priceMax) return `${formatMoney(priceMin, currency)} – ${formatMoney(priceMax, currency)}`;
  const single = priceMax ?? priceMin;
  if (single === null) return null;
  return priceMin !== null && priceMax === null ? `from ${formatMoney(single, currency)}` : formatMoney(single, currency);
}

function isFresh(verifiedAt: Date | null, maxAgeDays: number, now: Date): boolean {
  if (verifiedAt === null) return false;
  const age = now.getTime() - verifiedAt.getTime();
  // A verification dated in the future is not trusted either.
  return age >= 0 && age <= maxAgeDays * DAY_MS;
}

/** Why the price may NOT go into an automatic DM, or an empty list when it may. */
export function priceBlockers(config: PostConfig, project: ProjectFacts, settings: AutomationSettings, now: Date): string[] {
  const reasons: string[] = [];
  if (priceFingerprint(project) === null) return ["price_missing"];
  if (!config.priceApproved) reasons.push("price_not_approved");
  if (config.priceVerifiedAt === null) reasons.push("price_never_verified");
  else if (!isFresh(config.priceVerifiedAt, settings.priceMaxAgeDays, now)) reasons.push("price_stale");
  if (config.priceSnapshot === null || config.priceSnapshot !== priceFingerprint(project)) reasons.push("price_changed_since_verification");
  return reasons;
}

export function availabilityBlockers(config: PostConfig, settings: AutomationSettings, now: Date): string[] {
  if (!config.availabilityText?.trim()) return ["availability_missing"];
  if (config.availabilityVerifiedAt === null) return ["availability_never_verified"];
  return isFresh(config.availabilityVerifiedAt, settings.availabilityMaxAgeDays, now) ? [] : ["availability_stale"];
}

// ---------------------------------------------------------------------------------------------------------------
// Keyword matching
// ---------------------------------------------------------------------------------------------------------------

/** Lower-case words only: punctuation, emoji and repeated spaces are dropped ("PRICE??" and "price 🙏" both give "price"). */
export function normaliseText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first configured trigger whose keyword appears as whole word(s) in the comment, in the order the Founder listed them. */
export function matchTrigger(commentText: string | null | undefined, triggers: TriggerConfig[]): TriggerConfig | null {
  if (!commentText) return null;
  const haystack = ` ${normaliseText(commentText)} `;
  if (haystack.trim() === "") return null;
  for (const trigger of triggers) {
    const needle = normaliseText(trigger.keyword);
    if (needle !== "" && haystack.includes(` ${needle} `)) return trigger;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------------------------

export const PLACEHOLDERS = ["Property Name", "Location", "Verified Location", "Verified Price", "Availability", "Approved Details"] as const;
const PLACEHOLDER_PATTERN = /\[([^\]\[]{1,40})\]/g;

/** Placeholder names a template uses that this system does not know. Used to reject a typo when saving. */
export function unknownPlaceholders(template: string): string[] {
  const bad = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (!(PLACEHOLDERS as readonly string[]).includes(match[1])) bad.add(match[1]);
  }
  return [...bad];
}

export type RenderResult = { ok: true; text: string } | { ok: false; reasons: string[] };

/**
 * Fills a template from verified facts only. A placeholder with no usable value fails the whole render: the text is never sent
 * with a gap, a guess or another property's value in it.
 * `allow` limits which facts the template may use (the safe fallback may only use the name and location).
 */
export function renderTemplate(
  template: string,
  config: PostConfig,
  project: ProjectFacts,
  settings: AutomationSettings,
  now: Date,
  allow: readonly string[] = PLACEHOLDERS,
): RenderResult {
  const reasons: string[] = [];
  const location = [project.locality, project.city].filter((part) => part && part.trim()).join(", ");
  const resolve = (name: string): string | null => {
    if (!allow.includes(name)) {
      reasons.push(`placeholder_not_allowed:${name}`);
      return null;
    }
    switch (name) {
      case "Property Name":
        return project.name.trim() || null;
      case "Location":
      case "Verified Location":
        return location || null;
      case "Verified Price": {
        const blockers = priceBlockers(config, project, settings, now);
        if (blockers.length > 0) {
          reasons.push(...blockers);
          return null;
        }
        return formatProjectPrice(project);
      }
      case "Availability": {
        const blockers = availabilityBlockers(config, settings, now);
        if (blockers.length > 0) {
          reasons.push(...blockers);
          return null;
        }
        return config.availabilityText!.trim();
      }
      case "Approved Details":
        return config.approvedDetails?.trim() || (reasons.push("details_missing"), null);
      default:
        reasons.push(`unknown_placeholder:${name}`);
        return null;
    }
  };

  const text = template.replace(PLACEHOLDER_PATTERN, (_whole, name: string) => resolve(name) ?? "");
  if (reasons.length > 0) return { ok: false, reasons: [...new Set(reasons)] };
  if (text.trim() === "") return { ok: false, reasons: ["template_empty"] };
  if (new TextEncoder().encode(text).length > MAX_DM_BYTES) return { ok: false, reasons: ["message_too_long"] };
  return { ok: true, text };
}

// ---------------------------------------------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------------------------------------------

/**
 * What to send for a matched trigger. Never invents a fact: when the matched template cannot be filled it falls back to the
 * Founder's safe template (name and location only), and when that is not possible either the comment goes to manual follow-up.
 */
export function decideDm(config: PostConfig, trigger: TriggerConfig, project: ProjectFacts | null, settings: AutomationSettings, now: Date): DmDecision {
  if (config.projectId === null || project === null || project.id !== config.projectId) return { action: "MANUAL", reasons: ["project_missing"] };
  if (project.status !== "ACTIVE") return { action: "MANUAL", reasons: ["project_inactive"] };
  if (!trigger.dmTemplate.trim()) return { action: "MANUAL", reasons: ["template_missing"] };

  const primary = renderTemplate(trigger.dmTemplate, config, project, settings, now);
  if (primary.ok) return { action: "SEND", text: primary.text, usedFallback: false, reasons: [] };

  if (config.safeFallbackTemplate?.trim()) {
    const fallback = renderTemplate(config.safeFallbackTemplate, config, project, settings, now, ["Property Name", "Location", "Verified Location"]);
    if (fallback.ok) return { action: "SEND", text: fallback.text, usedFallback: true, reasons: primary.reasons };
    return { action: "MANUAL", reasons: [...primary.reasons, ...fallback.reasons.map((r) => `fallback:${r}`)] };
  }
  return { action: "MANUAL", reasons: [...primary.reasons, "no_safe_fallback"] };
}

/**
 * The public reply to post. The post's own wording wins, then the common reply from the settings, then (for a sent DM only) the
 * built-in wording. It only says a DM was sent when one really was: if the DM did not go out, the truthful fallback is used, and
 * if there is none configured there is no public reply at all (null) and the comment is flagged for the Founder.
 */
export function choosePublicReply(
  config: Pick<PostConfig, "publicReplyTemplate" | "publicReplyFallbackTemplate">,
  dmSent: boolean,
  common: Pick<AutomationSettings, "defaultPublicReply" | "defaultPublicReplyFallback"> | null = null,
): string | null {
  if (dmSent) return config.publicReplyTemplate?.trim() || common?.defaultPublicReply?.trim() || DEFAULT_PUBLIC_REPLY;
  return config.publicReplyFallbackTemplate?.trim() || common?.defaultPublicReplyFallback?.trim() || null;
}
