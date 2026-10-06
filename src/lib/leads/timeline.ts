import { formatMoney } from "./format.ts";
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
  /** Who did it, in words: "Buyer", "You", "System". */
  by: string;
  headline: string;
  detail: string | null;
}

const label = (value: unknown): string => (typeof value === "string" && value ? value.toLowerCase().replace(/_/g, " ") : "none");

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

function requirementSummary(fields: unknown): string | null {
  if (!fields || typeof fields !== "object") return null;
  const names = Object.keys(fields as Record<string, unknown>).map((name) => name.replace(/([A-Z])/g, " $1").toLowerCase());
  return names.length ? names.join(", ") : null;
}

function headlineFor(event: LeadEvent): { headline: string; detail: string | null } {
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
    case "STATUS_CHANGED":
      return {
        headline: `Status: ${label(event.fromStatus)} → ${label(event.toStatus)}${p.reasonCode ? ` (${label(p.reasonCode)})` : ""}`,
        detail: text(p.note),
      };
    case "TEMPERATURE_CHANGED":
      return { headline: `Temperature: ${label(p.from)} → ${label(p.to)}`, detail: null };
    case "OWNER_CHANGED":
      return { headline: p.to ? "Owner changed" : "Owner cleared (back to your queue)", detail: null };
    case "NOTE_ADDED":
      return { headline: "Note added", detail: text(p.note) };
    case "CONTACT_LOGGED": {
      const channel = p.channel === "WHATSAPP" ? "WhatsApp" : "Call";
      return { headline: `${channel}: ${label(p.outcome)}`, detail: text(p.note) };
    }
    case "FOLLOW_UP_SET":
      return { headline: p.cleared === true ? "Follow-up cleared" : "Follow-up set", detail: text(p.note) };
    case "FOLLOW_UP_COMPLETED":
      return { headline: "Follow-up completed", detail: text(p.note) };
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

export function describeTimeline(events: LeadEvent[]): TimelineLine[] {
  return events.map((event) => {
    const { headline, detail } = headlineFor(event);
    const by = event.actorType === "BUYER" ? "Buyer" : event.actorType === "FOUNDER" ? "You" : "System";
    return { id: event.id, at: event.createdAt, by, headline, detail: isRedacted(event.payload) ? null : detail };
  });
}
