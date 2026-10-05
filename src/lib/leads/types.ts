/**
 * Domain types for the Revenue OS Phase 1 lead system. These mirror the
 * tables in developer-connect/db/schema.ts (leads, lead_events,
 * marketing_touches, lead_consents, bookings) but are plain data: nothing in
 * this folder imports Drizzle, Clerk or Next.js outside db/.
 *
 * Everything here is PRIVATE data. None of it is ever returned to a public
 * page or copied into analytics.
 */

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SHORTLISTED",
  "SITE_VISIT_SCHEDULED",
  "SITE_VISIT_DONE",
  "NEGOTIATION",
  "BOOKED",
  "CLOSED",
  "NOT_INTERESTED",
  "UNQUALIFIED",
  "WRONG_NUMBER",
  "DUPLICATE",
  "LOST",
  "REVISIT_LATER",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_TEMPERATURES = ["HOT", "WARM", "COLD"] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

export const CONTACT_PREFERENCES = ["WHATSAPP", "PHONE_CALL", "EMAIL"] as const;
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];

export const LEAD_TIMELINES = [
  "WITHIN_30_DAYS",
  "ONE_TO_THREE_MONTHS",
  "THREE_TO_SIX_MONTHS",
  "SIX_MONTHS_PLUS",
  "JUST_EXPLORING",
] as const;
export type LeadTimeline = (typeof LEAD_TIMELINES)[number];

export const LEAD_PURPOSES = ["SELF_USE", "INVESTMENT"] as const;
export type LeadPurpose = (typeof LEAD_PURPOSES)[number];

export const LEAD_CURRENCIES = ["INR", "AED"] as const;
export type LeadCurrency = (typeof LEAD_CURRENCIES)[number];

export const LEAD_EVENT_TYPES = [
  "LEAD_CREATED",
  "LEAD_CAPTURED",
  "CONSENT_GIVEN",
  "CONSENT_WITHDRAWN",
  "CONTACT_PREFERENCE_SELECTED",
  "OFFICIAL_WEBSITE_CLICKED",
  "DEVELOPER_WEBSITE_REDIRECTED",
  "REQUIREMENT_UPDATED",
  "STATUS_CHANGED",
  "NOTE_ADDED",
  "CONTACT_LOGGED",
  "FOLLOW_UP_SET",
  "BOOKING_CREATED",
  "BOOKING_UPDATED",
  "LEAD_ERASED",
  "TEMPERATURE_CHANGED",
  "OWNER_CHANGED",
  "FOLLOW_UP_COMPLETED",
] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

export type LeadActorType = "BUYER" | "FOUNDER" | "SYSTEM";

/** Who did something to a lead. `actorId` is the Clerk user id for a FOUNDER, absent for BUYER/SYSTEM. */
export interface LeadActor {
  actorType: LeadActorType;
  actorId?: string;
}

export interface MarketingTouch {
  id: string;
  sessionId: string;
  occurredAt: Date;
  landingPath: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
}

export interface Lead {
  id: string;
  name: string | null;
  /** E.164; null only after erasure. */
  phoneE164: string | null;
  email: string | null;
  contactPreference: ContactPreference;
  status: LeadStatus;
  /** HOT/WARM/COLD, set by the founder; null = not yet rated. Independent of `status`. */
  temperature: LeadTemperature | null;
  /** Null = unassigned = the Founder's own queue (Phase 1 is founder-only). */
  ownerId: string | null;
  developerId: string | null;
  sourceCta: string | null;
  location: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: LeadCurrency | null;
  configuration: string | null;
  propertyType: string | null;
  purpose: LeadPurpose | null;
  timeline: LeadTimeline | null;
  sessionId: string | null;
  userId: string | null;
  firstTouchId: string | null;
  lastTouchId: string | null;
  nextFollowUpAt: Date | null;
  lastActivityAt: Date;
  erasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadEvent {
  id: string;
  leadId: string;
  eventType: LeadEventType;
  actorType: LeadActorType;
  actorId: string | null;
  developerId: string | null;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface LeadConsent {
  id: string;
  leadId: string;
  purpose: string;
  channel: ContactPreference;
  textVersion: string;
  textShown: string;
  givenAt: Date;
  withdrawnAt: Date | null;
}

export type BookingStatus = "BOOKED" | "CANCELLED";

export interface Booking {
  id: string;
  leadId: string;
  developerId: string | null;
  projectName: string | null;
  status: BookingStatus;
  bookedAt: Date;
  currency: LeadCurrency;
  bookingValue: number;
  commissionExpected: number;
  commissionReceived: number;
  commissionReceivedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** The buyer's stated requirement — every field optional, filled progressively. */
export interface Requirement {
  location?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  budgetCurrency?: LeadCurrency | null;
  configuration?: string | null;
  propertyType?: string | null;
  purpose?: LeadPurpose | null;
  timeline?: LeadTimeline | null;
}

/** Raw attribution parameters as the browser saw them, before cleaning (see attribution.ts). */
export interface TouchInput {
  sessionId: string;
  landingPath?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  occurredAt?: Date;
}

/** Facts derived from a lead's timeline, used by the Today queue. */
export interface LeadActivitySummary {
  leadId: string;
  /** Latest CONTACT_LOGGED event. */
  lastContactAt: Date | null;
  contactAttempts: number;
  /** Latest thing the BUYER did (submitted the gate, clicked a developer's website). */
  lastBuyerActivityAt: Date | null;
  /** The developer named on that latest website click, as shown to the buyer at the time. */
  lastBuyerActivityDeveloperName: string | null;
  /** The developer named on the FIRST website click — the one the buyer originally researched. */
  firstDeveloperName: string | null;
}
