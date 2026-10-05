/**
 * Analytics event contracts only — no dashboard, no collection backend,
 * and no generated/fake data here. Defining these now means instrumenting
 * real product events later doesn't require redesigning their shape.
 */

export type AnalyticsEventName =
  | "search_performed"
  | "zero_result_search"
  | "search_result_clicked"
  | "developer_page_viewed"
  | "official_website_clicked"
  | "profile_started"
  | "profile_field_completed"
  | "profile_updated"
  | "profile_completion_reached"
  | "developer_shared"
  | "assistance_gate_shown"
  | "assistance_form_started"
  | "lead_submitted"
  | "official_website_redirected";

export type DeviceType = "mobile" | "desktop" | "unknown";

interface AnalyticsEventBase {
  occurredAt: Date;
  sessionId: string;
  /** Session/device-scoped identifier; never required, never tied to auth. */
  anonymousUserId?: string;
  /**
   * The authenticated account (Clerk user id) at the moment this event
   * fired, when the request happened to be signed in — never inferred,
   * never backfilled onto earlier anonymous activity.
   */
  userId?: string;
  /** Coarse classification only, derived from User-Agent — never fingerprinting. */
  deviceType?: DeviceType;
}

/** `country`/`state`/`city`, when present, are the visitor's active geography filter at search time (see GeoFilters) — never a guess about the searcher's own location. */
export interface SearchPerformedEvent extends AnalyticsEventBase {
  eventName: "search_performed";
  query: string;
  resultCount: number;
  country?: string;
  state?: string;
  city?: string;
}

export interface ZeroResultSearchEvent extends AnalyticsEventBase {
  eventName: "zero_result_search";
  query: string;
  country?: string;
  state?: string;
  city?: string;
}

export interface SearchResultClickedEvent extends AnalyticsEventBase {
  eventName: "search_result_clicked";
  query: string;
  developerId: string;
  position: number;
}

export interface DeveloperPageViewedEvent extends AnalyticsEventBase {
  eventName: "developer_page_viewed";
  developerId: string;
  referrerQuery?: string;
}

export interface OfficialWebsiteClickedEvent extends AnalyticsEventBase {
  eventName: "official_website_clicked";
  developerId: string;
  targetDomain: string;
}

/** Fires once, the first time a profile row is created for a user. */
export interface ProfileStartedEvent extends AnalyticsEventBase {
  eventName: "profile_started";
}

/** Fires when a configured field transitions from empty to filled. Dormant until PROFILE_FIELD_CONFIG is non-empty. */
export interface ProfileFieldCompletedEvent extends AnalyticsEventBase {
  eventName: "profile_field_completed";
  fieldKey: string;
}

/** Fires on every successful profile field update, regardless of which field(s) changed. */
export interface ProfileUpdatedEvent extends AnalyticsEventBase {
  eventName: "profile_updated";
}

/** Fires when completion crosses into a new band (see profile/completion.ts). Dormant until PROFILE_FIELD_CONFIG is non-empty. */
export interface ProfileCompletionReachedEvent extends AnalyticsEventBase {
  eventName: "profile_completion_reached";
  band: string;
  percentage: number;
}

/** Which sharing method the user chose — for understanding which channels people actually use, never for anything else. */
export type ShareMethod = "whatsapp" | "email" | "copy_link" | "native_share";

/** Fires when a user shares a developer's public page via any of the share options. Never fires just from viewing the page. */
export interface DeveloperSharedEvent extends AnalyticsEventBase {
  eventName: "developer_shared";
  developerId: string;
  method: ShareMethod;
}

/**
 * The property-assistance funnel (Revenue OS Phase 1): page view -> official
 * website click -> gate shown -> form started -> lead submitted -> redirected.
 *
 * These are ANONYMOUS analytics events. They deliberately carry no phone,
 * email, name, note or lead id — only coarse, non-identifying facts. The
 * private side of the same journey lives in the leads/lead_events tables,
 * which analytics never reads and which never feed back into analytics.
 */
export interface AssistanceGateShownEvent extends AnalyticsEventBase {
  eventName: "assistance_gate_shown";
  developerId: string;
  /** Which public surface the buyer clicked from (for example "developer_page", "directory_card"). */
  sourceCta: string;
  /** True when the gate recognised a recent lead and offered one-tap continue. */
  returningVisitor: boolean;
}

export interface AssistanceFormStartedEvent extends AnalyticsEventBase {
  eventName: "assistance_form_started";
  developerId: string;
  sourceCta: string;
}

export interface LeadSubmittedEvent extends AnalyticsEventBase {
  eventName: "lead_submitted";
  developerId: string;
  sourceCta: string;
  contactPreference: "WHATSAPP" | "PHONE_CALL";
  /** True when this submission created the lead, false when it matched an existing one. */
  newLead: boolean;
}

export interface OfficialWebsiteRedirectedEvent extends AnalyticsEventBase {
  eventName: "official_website_redirected";
  developerId: string;
  targetDomain: string;
}

export type AnalyticsEvent =
  | SearchPerformedEvent
  | ZeroResultSearchEvent
  | SearchResultClickedEvent
  | DeveloperPageViewedEvent
  | OfficialWebsiteClickedEvent
  | ProfileStartedEvent
  | ProfileFieldCompletedEvent
  | ProfileUpdatedEvent
  | ProfileCompletionReachedEvent
  | DeveloperSharedEvent
  | AssistanceGateShownEvent
  | AssistanceFormStartedEvent
  | LeadSubmittedEvent
  | OfficialWebsiteRedirectedEvent;

/** Swappable sink so a real collector can be dropped in later without touching call sites. */
export interface AnalyticsEventSink {
  record(event: AnalyticsEvent): Promise<void> | void;
}

/** Default sink: records nothing. Used until a real destination is chosen. */
export const noopAnalyticsSink: AnalyticsEventSink = {
  record: () => {},
};

/**
 * Analytics must never be able to break the primary user action (a
 * search, a page view, an outbound click). Call sites use this instead
 * of `sink.record` directly so a database hiccup only means one missing
 * analytics row, never a broken page.
 */
export async function safeRecordAnalyticsEvent(
  sink: AnalyticsEventSink,
  event: AnalyticsEvent,
): Promise<void> {
  try {
    await sink.record(event);
  } catch (error) {
    console.error(`Failed to record analytics event "${event.eventName}":`, error);
  }
}
