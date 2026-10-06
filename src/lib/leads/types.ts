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
  "DEVELOPER_CONNECT_REQUESTED",
  "REQUIREMENT_CREATED",
  "REQUIREMENT_STATUS_CHANGED",
  "FOLLOW_UP_MISSED",
  "FOLLOW_UP_RESCHEDULED",
  "FOLLOW_UP_CANCELLED",
  "RETURNED_TO_FOUNDER",
  "CALL_PLACED",
  "CALL_ENDED",
  "CALL_DISPOSITION_SET",
] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

// EMPLOYEE: an ACTIVE team member (staff_members). Built only by authorizeStaffActor; see lead-access.ts for what they may do.
export type LeadActorType = "BUYER" | "FOUNDER" | "SYSTEM" | "EMPLOYEE";

/** Who did something to a lead. `actorId` is the Clerk user id for a FOUNDER or EMPLOYEE, absent for BUYER/SYSTEM. */
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
  /** WHERE it came from (separate from the calls made to it): DIGITAL or SELF_GENERATED. */
  sourceType: LeadSourceType;
  /** For DIGITAL: WEBSITE, GOOGLE, META, REFERRAL, ORGANIC or OTHER_DIGITAL; for SELF_GENERATED: the campaign or list name, if any. */
  sourceDetail: string | null;
  /** How it entered the system: one of CREATION_METHODS. */
  creationMethod: string;
  /** The Excel/CSV import batch it came from, if any. */
  importBatchId: string | null;
  /** The team member or Founder who created it by hand or by import (null for website leads). */
  createdBy: string | null;
  /** Set when a team member returned the lead to the Founder queue; cleared when the Founder assigns it again. */
  returnedAt: Date | null;
  /** The team member (Clerk user id) who returned it. */
  returnedFrom: string | null;
  /** One of RETURN_REASONS. */
  returnReason: string | null;
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

export const LEAD_SOURCE_TYPES = ["DIGITAL", "SELF_GENERATED"] as const;
export type LeadSourceType = (typeof LEAD_SOURCE_TYPES)[number];

/** How a lead entered the system. Independent of how it is later contacted. */
export const CREATION_METHODS = ["WEBSITE_GATE", "EXCEL_IMPORT", "COLD_CALLING", "EMPLOYEE_CREATED", "FOUNDER_CREATED", "DIALER_GENERATED"] as const;
export type CreationMethod = (typeof CREATION_METHODS)[number];

/** Digital source detail. */
export const DIGITAL_SOURCES = ["WEBSITE", "GOOGLE", "META", "REFERRAL", "ORGANIC", "OTHER_DIGITAL"] as const;
export type DigitalSource = (typeof DIGITAL_SOURCES)[number];

export const CALL_STATUSES = ["INITIATED", "RINGING", "CONNECTED", "COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "REJECTED"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
/** A finished call: the provider will say nothing more about it that can change its outcome. */
export const TERMINAL_CALL_STATUSES: readonly CallStatus[] = ["COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "REJECTED"];
/** The call was answered (provider-reported). */
export const CONNECTED_CALL_STATUSES: readonly CallStatus[] = ["CONNECTED", "COMPLETED"];

/** What the conversation led to — chosen by the person who made the call, once. NOT what the network did (that is the status). */
export const CALL_DISPOSITIONS = ["INTERESTED", "NOT_INTERESTED", "FOLLOW_UP_REQUIRED", "CALLBACK_REQUESTED", "SWITCHED_OFF", "INVALID_NUMBER", "OTHER"] as const;
export type CallDisposition = (typeof CALL_DISPOSITIONS)[number];

/** A call placed through the internal dialer. See the lead_calls schema comment for what makes a call "official". */
export interface LeadCall {
  id: string;
  leadId: string;
  staffUserId: string;
  direction: "OUTBOUND";
  status: CallStatus;
  source: "INTERNAL_DIALER";
  provider: string;
  providerCallId: string | null;
  phoneLast4: string | null;
  initiatedAt: Date;
  ringingAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  endReason: string | null;
  disposition: CallDisposition | null;
  dispositionBy: string | null;
  dispositionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadImportBatch {
  id: string;
  name: string;
  originalFilename: string | null;
  campaign: string | null;
  importedBy: string;
  importedAt: Date;
  rowCount: number;
  createdCount: number;
  duplicateCount: number;
  rejectedCount: number;
}

export const FOLLOW_UP_TYPES = [
  "CALL_BACK",
  "WHATSAPP_FOLLOW_UP",
  "SITE_VISIT_FOLLOW_UP",
  "PAYMENT_FOLLOW_UP",
  "DOCUMENT_FOLLOW_UP",
  "GENERAL_FOLLOW_UP",
] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export const FOLLOW_UP_STATUSES = ["SCHEDULED", "COMPLETED", "MISSED", "CANCELLED"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/** Why a team member sends a lead back to the Founder. Mandatory; a note is optional (and only expected for OTHER). */
export const RETURN_REASONS = ["CLIENT_NOT_RESPONDING", "WRONG_NUMBER", "NOT_INTERESTED", "TIMING_NOT_RIGHT", "NEEDS_REASSIGNMENT", "OTHER"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

/** Why a follow-up is cancelled by a person. (The system adds RETURNED_TO_FOUNDER, REASSIGNED and LEAD_ERASED itself.) */
export const CANCEL_REASONS = ["CLIENT_NOT_RESPONDING", "NOT_INTERESTED", "TIMING_NOT_RIGHT", "NO_LONGER_NEEDED", "OTHER"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];
export type SystemCancelReason = "RETURNED_TO_FOUNDER" | "REASSIGNED" | "LEAD_ERASED";

/** A scheduled piece of sales work on a lead. See the lead_follow_ups schema comment for the lifecycle. */
export interface LeadFollowUp {
  id: string;
  leadId: string;
  type: FollowUpType;
  status: FollowUpStatus;
  scheduledAt: Date;
  originalScheduledAt: Date;
  ownerId: string | null;
  note: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  completedBy: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  cancelNote: string | null;
  missedCount: number;
  lastMissedAt: Date | null;
  rescheduleCount: number;
  dueNotifiedAt: Date | null;
}

export const REQUIREMENT_STATUSES = ["ACTIVE", "FULFILLED", "ON_HOLD", "CLOSED"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/**
 * A buyer's structured requirement (Phase 2, Step 3). A lead has a history of these; at most one is ACTIVE.
 * Vocabulary (purpose, timeline, currency) is the lead system's own.
 */
export interface LeadRequirement {
  id: string;
  leadId: string;
  status: RequirementStatus;
  /** Preferred locations in the order the team member listed them. Empty when the buyer has not said. */
  locations: string[];
  propertyType: string | null;
  configuration: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: LeadCurrency | null;
  purpose: LeadPurpose | null;
  timeline: LeadTimeline | null;
  /** Free text a person typed; personal data, cleared on erasure. */
  notes: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What a caller supplies to create or update a requirement. Every field is optional except where noted in the service. */
export interface RequirementInput {
  locations?: string[];
  propertyType?: string | null;
  configuration?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  budgetCurrency?: LeadCurrency | null;
  purpose?: LeadPurpose | null;
  timeline?: LeadTimeline | null;
  notes?: string | null;
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
