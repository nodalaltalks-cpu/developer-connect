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
  | "profile_completion_reached";

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

export interface SearchPerformedEvent extends AnalyticsEventBase {
  eventName: "search_performed";
  query: string;
  resultCount: number;
}

export interface ZeroResultSearchEvent extends AnalyticsEventBase {
  eventName: "zero_result_search";
  query: string;
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

export type AnalyticsEvent =
  | SearchPerformedEvent
  | ZeroResultSearchEvent
  | SearchResultClickedEvent
  | DeveloperPageViewedEvent
  | OfficialWebsiteClickedEvent
  | ProfileStartedEvent
  | ProfileFieldCompletedEvent
  | ProfileUpdatedEvent
  | ProfileCompletionReachedEvent;

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
