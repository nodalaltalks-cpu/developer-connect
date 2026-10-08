import { formatDateTimeFull, formatMoney } from "./format.ts";
import { isRedacted } from "./redaction.ts";
import type { LeadEvent } from "./types.ts";

/**
 * One timeline line per event, in plain words. Pure. Free text a person typed
 * (a note) is returned separately as `detail` so the screen can show it
 * quietly under the headline; after an erasure it is simply absent.
 */
export interface TimelineLine {
  id: string;
  at: Date;
  /** Who did it, in words: "Buyer", "You", a team member's name, "System". */
  by: string;
  headline: string;
  detail: string | null;
}

const label = (value: unknown): string => (typeof value === "string" && value ? value.toLowerCase().replace(/_/g, " ") : "none");

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

const sentence = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/** "10 Oct 2026, 10:42 AM" from an ISO string in a payload; "an unknown time" when the payload has none (older events). */
function when(value: unknown): string {
  if (typeof value !== "string") return "an unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "an unknown time" : formatDateTimeFull(date);
}
const whenSuffix = (value: unknown): string => (typeof value === "string" ? ` — ${when(value)}` : "");
const typeSuffix = (value: unknown): string => (typeof value === "string" && value ? ` (${sentence(label(value))})` : "");

function requirementSummary(fields: unknown): string | null {
  if (!fields || typeof fields !== "object") return null;
  const names = Object.keys(fields as Record<string, unknown>).map((name) => name.replace(/([A-Z])/g, " $1").toLowerCase());
  return names.length ? names.join(", ") : null;
}

/**
 * "Assigned to Asha", "Reassigned from Asha to Ravi", "Returned to your queue (was Asha)". With no name lookup (the
 * original callers) the wording stays exactly as before; a stored id that cannot be resolved reads "a team member".
 */
function ownerHeadline(payload: Record<string, unknown>, names?: Record<string, string>): string {
  if (!names) return payload.to ? "Owner changed" : "Owner cleared (back to your queue)";
  const name = (id: unknown) => (typeof id === "string" && id ? (names[id] ?? "a team member") : null);
  const from = name(payload.from);
  const to = name(payload.to);
  if (to && from) return `Reassigned from ${from} to ${to}`;
  if (to) return `Assigned to ${to}`;
  if (from) return `Returned to your queue (was ${from})`;
  return "Owner cleared (back to your queue)";
}

function headlineFor(event: LeadEvent, names?: Record<string, string>): { headline: string; detail: string | null } {
  const p = event.payload;
  switch (event.eventType) {
    case "LEAD_CREATED":
      return { headline: "Lead created", detail: null };
    case "LEAD_CAPTURED":
      return { headline: p.repeat === true ? "Came back and re-submitted their details" : "Shared their details", detail: null };
    case "CONSENT_GIVEN":
      return { headline: "Gave consent to be contacted", detail: null };
    case "CONSENT_WITHDRAWN":
      return { headline: "Withdrew consent", detail: null };
    case "CONTACT_PREFERENCE_SELECTED":
      return { headline: `Contact preference: ${label(p.to)}`, detail: null };
    case "OFFICIAL_WEBSITE_CLICKED":
      return { headline: `Opened ${text(p.developerName) ?? "a developer"}'s official website (earlier flow)`, detail: null };
    case "DEVELOPER_CONNECT_REQUESTED":
      return { headline: `Asked to connect with ${text(p.developerName) ?? "a developer"}`, detail: null };
    case "DEVELOPER_WEBSITE_REDIRECTED":
      return { headline: "Sent on to the developer's website (earlier flow)", detail: null };
    case "REQUIREMENT_UPDATED": {
      const changed = requirementSummary(p.fields);
      return { headline: changed ? `Requirement updated (${changed})` : "Requirement updated", detail: null };
    }
    case "REQUIREMENT_CREATED":
      return { headline: p.supersededRequirementId ? "New requirement started (the previous one was closed)" : "Requirement created", detail: null };
    case "REQUIREMENT_STATUS_CHANGED":
      return { headline: `Requirement: ${label(p.from)} → ${label(p.to)}`, detail: null };
    case "STATUS_CHANGED":
      return {
        headline: `Status: ${label(event.fromStatus)} → ${label(event.toStatus)}${p.reasonCode ? ` (${label(p.reasonCode)})` : ""}`,
        detail: text(p.note),
      };
    case "QUALIFICATION_RECORDED":
      return { headline: `Qualification: ${label(p.outcome)}${p.reason ? ` · ${label(p.reason)}` : ""}`, detail: null };
    case "CONTACT_DETAILS_UPDATED":
      return { headline: "Contact details added", detail: Array.isArray(p.fields) ? p.fields.map((f) => label(f)).join(", ") : null };
    case "WHATSAPP_OPENED":
      return { headline: "Opened WhatsApp (the message itself is not tracked)", detail: null };
    case "TEMPERATURE_CHANGED":
      return { headline: `Temperature: ${label(p.from)} → ${label(p.to)}`, detail: null };
    case "OWNER_CHANGED":
      return { headline: ownerHeadline(p, names), detail: null };
    case "NOTE_ADDED":
      return { headline: "Note added", detail: text(p.note) };
    case "CONTACT_LOGGED": {
      // Recorded from the outcome alone — no comment needed; a note, when given, sits quietly underneath.
      const outcome = sentence(label(p.outcome));
      return { headline: p.channel === "WHATSAPP" ? `WhatsApp — ${outcome}` : `Call attempted — ${outcome}`, detail: text(p.note) };
    }
    case "FOLLOW_UP_SET":
      if (p.cleared === true) return { headline: "Follow-up cleared", detail: text(p.note) };
      return { headline: `Follow-up scheduled${whenSuffix(p.dueAt)}${typeSuffix(p.followUpType)}`, detail: text(p.note) };
    case "FOLLOW_UP_COMPLETED":
      return { headline: p.late === true ? "Follow-up completed (late)" : "Follow-up completed", detail: text(p.note) };
    case "CALL_PLACED":
      return { headline: "Outbound call placed", detail: null };
    case "CALL_ENDED": {
      const seconds = typeof p.durationSeconds === "number" ? p.durationSeconds : null;
      const duration = p.connected === true && seconds !== null ? ` · ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : "";
      return { headline: `Outbound call — ${sentence(label(p.status))}${duration}`, detail: null };
    }
    case "CALL_DISPOSITION_SET":
      return { headline: `Call outcome — ${sentence(label(p.disposition))}`, detail: null };
    case "PROJECT_SHORTLISTED":
      return { headline: "Project shortlisted", detail: null };
    case "PROJECT_SHORTLIST_REMOVED":
      return { headline: "Project removed from shortlist", detail: null };
    case "SITE_VISIT_SCHEDULED":
      return { headline: `Site visit scheduled for ${when(p.scheduledAt)}`, detail: null };
    case "SITE_VISIT_UPDATED":
      return { headline: `Site visit ${sentence(label(p.status)).toLowerCase()}${p.status === "RESCHEDULED" && p.rescheduledTo ? ` - moved to ${when(p.rescheduledTo)}` : ""}${p.outcome ? ` - ${sentence(label(p.outcome)).toLowerCase()}` : ""}`, detail: null };
    case "FOLLOW_UP_MISSED":
      return { headline: `Follow-up missed — was due ${when(p.dueAt)}${typeSuffix(p.followUpType)}`, detail: null };
    case "FOLLOW_UP_RESCHEDULED":
      return { headline: `Follow-up rescheduled — from ${when(p.from)} to ${when(p.to)}${typeSuffix(p.followUpType)}`, detail: text(p.note) };
    case "FOLLOW_UP_CANCELLED":
      return { headline: `Follow-up cancelled — ${sentence(label(p.reason))}`, detail: text(p.note) };
    case "RETURNED_TO_FOUNDER":
      return { headline: `Returned to Founder — ${sentence(label(p.reason))}`, detail: text(p.note) };
    case "BOOKING_CREATED":
      return {
        headline:
          typeof p.bookingValue === "number" && (p.currency === "INR" || p.currency === "AED")
            ? `Booking created (${formatMoney(p.bookingValue, p.currency)})`
            : "Booking created",
        detail: null,
      };
    case "BOOKING_UPDATED":
      return { headline: "Booking updated", detail: null };
    case "LEAD_ERASED":
      return { headline: "Personal details erased", detail: null };
  }
}

export function describeTimeline(events: LeadEvent[], names?: Record<string, string>): TimelineLine[] {
  return events.map((event) => {
    const { headline, detail } = headlineFor(event, names);
    const by =
      event.actorType === "BUYER"
        ? "Buyer"
        : event.actorType === "FOUNDER"
          ? "You"
          : event.actorType === "EMPLOYEE"
            ? ((event.actorId && names?.[event.actorId]) || "Team member")
            : "System";
    return { id: event.id, at: event.createdAt, by, headline, detail: isRedacted(event.payload) ? null : detail };
  });
}
