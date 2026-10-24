/**
 * Comment-to-DM automation: the shapes shared by the pure logic, the repository and the admin screens.
 * Nothing in this module talks to Meta or to the database.
 */

export type AutomationPlatform = "INSTAGRAM" | "FACEBOOK";
export type AutomationMode = "DISABLED" | "DRY_RUN" | "LIVE";
export type ContentFormat = "REEL" | "POST" | "VIDEO";
export type TriggerIntent = "PRICE" | "LOCATION" | "DETAILS" | "BROCHURE" | "VISIT" | "AVAILABILITY" | "OTHER";
export type AutomationCurrency = "INR" | "AED";

/** What the Founder must type to put a post Live. */
export const LIVE_CONFIRMATION = "GO LIVE";

export const PLATFORMS: readonly AutomationPlatform[] = ["INSTAGRAM", "FACEBOOK"];
export const MODES: readonly AutomationMode[] = ["DISABLED", "DRY_RUN", "LIVE"];
export const CONTENT_FORMATS: readonly ContentFormat[] = ["REEL", "POST", "VIDEO"];
export const INTENTS: readonly TriggerIntent[] = ["PRICE", "LOCATION", "DETAILS", "BROCHURE", "VISIT", "AVAILABILITY", "OTHER"];

/** The part of a `projects` row the automation reads. It is never copied into the post configuration. */
export interface ProjectFacts {
  id: string;
  name: string;
  city: string;
  locality: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: AutomationCurrency | null;
  status: string;
}

export interface TriggerConfig {
  keyword: string;
  intent: TriggerIntent;
  dmTemplate: string;
}

export interface PostConfig {
  id: string;
  platform: AutomationPlatform;
  /** Null while the reel is set up before it is published. A draft never receives comments. */
  postId: string | null;
  postUrl: string | null;
  videoTitle: string;
  contentFormat: ContentFormat;
  mode: AutomationMode;
  projectId: string | null;
  /** The Founder has said this post's price may be sent in a DM. Off until they say so. */
  priceApproved: boolean;
  priceVerifiedAt: Date | null;
  /** The project price at the moment it was verified. If the project's price later changes, the approval no longer applies. */
  priceSnapshot: string | null;
  availabilityText: string | null;
  availabilityVerifiedAt: Date | null;
  approvedDetails: string | null;
  /** Used when the matched template needs a fact that is missing or stale. May only use name and location. */
  safeFallbackTemplate: string | null;
  publicReplyTemplate: string | null;
  /** The public reply when the DM was NOT sent. Must not claim a DM. */
  publicReplyFallbackTemplate: string | null;
  triggers: TriggerConfig[];
}

export interface AutomationSettings {
  /** The global emergency switch. Off by default; while off nothing is ever sent. */
  enabled: boolean;
  priceMaxAgeDays: number;
  availabilityMaxAgeDays: number;
  /** The common public reply for every post that does not write its own. Null = the built-in wording. */
  defaultPublicReply: string | null;
  /** The common public reply for when no DM went out. Null = no public reply. */
  defaultPublicReplyFallback: string | null;
}

export const DEFAULT_SETTINGS: AutomationSettings = { enabled: false, priceMaxAgeDays: 14, availabilityMaxAgeDays: 7, defaultPublicReply: null, defaultPublicReplyFallback: null };

export type DmDecision =
  | { action: "SEND"; text: string; usedFallback: boolean; reasons: string[] }
  | { action: "MANUAL"; reasons: string[] };
