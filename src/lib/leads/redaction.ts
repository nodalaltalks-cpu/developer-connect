import type { LeadEventType } from "./types.ts";

/**
 * Erasure support: decides what survives in a lead event's payload when a
 * buyer's personal data is erased.
 *
 * The approach is an ALLOWLIST, not a blocklist: only payload keys named
 * below are kept; everything else is dropped. A future event type or a new
 * payload key therefore defaults to being erased rather than accidentally
 * surviving. The kept keys are all non-identifying (ids, enums, counts,
 * developer slugs, status values) — never free text a person typed.
 */

/** Payload keys that never identify a person and are therefore safe to keep after an erasure. */
const SAFE_PAYLOAD_KEYS: Record<LeadEventType, readonly string[]> = {
  LEAD_CREATED: ["developerSlug", "sourceCta", "touchId"],
  LEAD_CAPTURED: ["developerSlug", "sourceCta", "touchId", "repeat"],
  CONSENT_GIVEN: ["consentId", "purpose", "channel", "textVersion"],
  CONSENT_WITHDRAWN: ["purpose", "channel", "textVersion", "via"],
  CONTACT_PREFERENCE_SELECTED: ["from", "to"],
  OFFICIAL_WEBSITE_CLICKED: ["developerSlug", "developerName", "websiteDomain", "websiteUrl", "verifiedAt", "sourceCta", "clickedAt"],
  DEVELOPER_WEBSITE_REDIRECTED: ["developerSlug", "websiteDomain", "websiteUrl"],
  // Requirement changes are structured values (budget band, configuration...), but `location` is free text.
  REQUIREMENT_UPDATED: ["fields", "requirementId"],
  REQUIREMENT_CREATED: ["requirementId", "supersededRequirementId"],
  REQUIREMENT_STATUS_CHANGED: ["requirementId", "from", "to", "reason"],
  STATUS_CHANGED: ["reasonCode"],
  // Free text a person typed (notes, a lost-reason sentence) is NEVER kept.
  NOTE_ADDED: [],
  CONTACT_LOGGED: ["channel", "outcome"],
  FOLLOW_UP_SET: ["cleared", "followUpId", "followUpType"],
  BOOKING_CREATED: ["bookingId", "currency", "bookingValue", "commissionExpected"],
  BOOKING_UPDATED: ["bookingId", "currency"],
  LEAD_ERASED: ["via"],
  TEMPERATURE_CHANGED: ["from", "to"],
  OWNER_CHANGED: ["from", "to"],
  FOLLOW_UP_COMPLETED: ["followUpId", "followUpType", "late"],
  // Follow-up lifecycle and returns: ids, enums and flags only. Times are not personal, but the notes are, and are dropped.
  FOLLOW_UP_MISSED: ["followUpId", "followUpType", "dueAt", "detectedAt"],
  FOLLOW_UP_RESCHEDULED: ["followUpId", "followUpType", "from", "to", "wasMissed"],
  FOLLOW_UP_CANCELLED: ["followUpId", "reason"],
  RETURNED_TO_FOUNDER: ["reason", "previousOwnerId"],
  DEVELOPER_CONNECT_REQUESTED: ["developerSlug", "developerName", "sourceCta", "requestedAt"],
  // Calls: ids, the provider-reported status and the duration only. Nothing a person typed.
  CALL_PLACED: ["callId"],
  CALL_ENDED: ["callId", "status", "durationSeconds", "connected"],
  CALL_DISPOSITION_SET: ["callId", "disposition"],
  // Shortlist and site visits: ids and enums only. Visit notes and next actions are free text and never ride on an event.
  PROJECT_SHORTLISTED: ["projectId", "requirementId"],
  PROJECT_SHORTLIST_REMOVED: ["projectId"],
  // WhatsApp was OPENED to the lead (never a sent message): nothing to keep. A qualification is two codes, never text.
  WHATSAPP_OPENED: [],
  QUALIFICATION_RECORDED: ["outcome", "reason"],
  // Which fields were filled in (names of fields only); the values are personal data and never ride on an event.
  CONTACT_DETAILS_UPDATED: ["fields"],
  SITE_VISIT_SCHEDULED: ["visitId", "projectId", "scheduledAt"],
  SITE_VISIT_UPDATED: ["visitId", "projectId", "status", "scheduledAt", "outcome", "reason", "rescheduledTo"],
};

/** Requirement fields whose values are free text and so are dropped from a REQUIREMENT_UPDATED payload. */
const FREE_TEXT_REQUIREMENT_FIELDS = new Set(["location", "locations", "notes"]);

export const REDACTED_MARKER = "redacted";

/**
 * The payload an event keeps after erasure. Always includes `redacted: true`
 * so the timeline can show "details removed" instead of an empty event.
 */
export function redactPayload(eventType: LeadEventType, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = SAFE_PAYLOAD_KEYS[eventType] ?? [];
  const kept: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in payload)) continue;
    kept[key] = key === "fields" ? redactRequirementFields(payload[key]) : payload[key];
  }
  kept[REDACTED_MARKER] = true;
  return kept;
}

function redactRequirementFields(fields: unknown): unknown {
  if (!fields || typeof fields !== "object") return fields;
  const result: Record<string, unknown> = {};
  for (const [name, change] of Object.entries(fields as Record<string, unknown>)) {
    if (!FREE_TEXT_REQUIREMENT_FIELDS.has(name)) result[name] = change;
  }
  return result;
}

/** True when this payload has already been redacted. */
export function isRedacted(payload: Record<string, unknown>): boolean {
  return payload[REDACTED_MARKER] === true;
}
