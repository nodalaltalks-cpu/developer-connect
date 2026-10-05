import { cleanTouch } from "./attribution.ts";
import { CONSENT_PURPOSE, CONSENT_TEXT_VERSION, consentTextFor } from "./consent.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { normalizePhone, type SupportedPhoneCountry } from "./phone.ts";
import { redactPayload } from "./redaction.ts";
import { DEFAULT_QUEUE_LIMIT } from "./queue-config.ts";
import { buildTodayQueue, type TodayQueueEntry, type TodayQueueInput } from "./today-queue.ts";
import type { LeadEventRepository, LeadRepositories, LeadPatch } from "./repository.ts";
import {
  CONTACT_PREFERENCES,
  LEAD_CURRENCIES,
  LEAD_PURPOSES,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  LEAD_TIMELINES,
  type Booking,
  type ContactPreference,
  type Lead,
  type LeadActor,
  type LeadCurrency,
  type LeadEvent,
  type LeadEventType,
  type LeadStatus,
  type LeadTemperature,
  type Requirement,
  type TouchInput,
} from "./types.ts";

/**
 * The lead domain service — every change to a lead goes through here, and
 * every meaningful change appends an immutable event (who, what, when).
 *
 * Framework-free: no Clerk, no Next.js. Authorization is the CALLER's job
 * (server actions call requireFounderForAction first); this layer adds a
 * second, independent guard — founder-only operations refuse any non-FOUNDER
 * actor — so a mistake in one layer cannot silently grant access.
 *
 * Nothing here logs. Phone numbers, emails and notes pass through this code
 * and must never reach a log line, an analytics event or an error message.
 */

const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_LOCATION = 120;
const MAX_SHORT_TEXT = 60;
const MAX_NOTE = 2000;
const MAX_BUDGET = 100_000_000_000; // 10,000 Cr / AED 100B — a typo guard, far above any real budget

/** The reason categories a LOST lead must carry, so Phase 4 loss analysis has structured data from day one. */
export const LOST_REASON_CODES = [
  "PRICE",
  "LOCATION",
  "BOUGHT_ELSEWHERE",
  "NOT_RESPONDING",
  "FINANCING",
  "TIMING",
  "OTHER",
] as const;
export type LostReasonCode = (typeof LOST_REASON_CODES)[number];

export const CONTACT_CHANNELS = ["WHATSAPP", "PHONE_CALL"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export const CONTACT_OUTCOMES = ["ATTEMPTED", "CONNECTED", "NO_ANSWER", "BUSY", "FAILED", "SENT", "REPLIED", "WRONG_NUMBER"] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

// --- guards and validation ---------------------------------------------------------------------

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) {
    throw new UnauthorizedLeadActionError("Founder authorization required for this lead action.");
  }
}

function optionalText(field: string, value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new LeadValidationError(field, `${field} is too long (max ${max} characters).`);
  return trimmed;
}

function validateEmail(value: string | null | undefined): string | null {
  const email = optionalText("email", value, MAX_EMAIL);
  if (email === null) return null;
  // Deliberately simple: one "@", something either side, a dot in the domain. Real validation is delivery.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LeadValidationError("email", "Enter a valid email address.");
  return email.toLowerCase();
}

function validateAmount(field: string, value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_BUDGET) {
    throw new LeadValidationError(field, `${field} must be a whole number of 0 or more.`);
  }
  return value;
}

function oneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new LeadValidationError(field, `${field} is not a valid choice.`);
  }
  return value as T;
}

/** Normalised, validated requirement fields — only the keys the caller actually supplied. */
function validateRequirement(requirement: Requirement): Requirement {
  const out: Requirement = {};
  if ("location" in requirement) out.location = optionalText("location", requirement.location, MAX_LOCATION);
  if ("budgetMin" in requirement) out.budgetMin = validateAmount("budgetMin", requirement.budgetMin);
  if ("budgetMax" in requirement) out.budgetMax = validateAmount("budgetMax", requirement.budgetMax);
  if ("budgetCurrency" in requirement) {
    out.budgetCurrency = requirement.budgetCurrency == null ? null : oneOf("budgetCurrency", requirement.budgetCurrency, LEAD_CURRENCIES);
  }
  if ("configuration" in requirement) out.configuration = optionalText("configuration", requirement.configuration, MAX_SHORT_TEXT);
  if ("propertyType" in requirement) out.propertyType = optionalText("propertyType", requirement.propertyType, MAX_SHORT_TEXT);
  if ("purpose" in requirement) out.purpose = requirement.purpose == null ? null : oneOf("purpose", requirement.purpose, LEAD_PURPOSES);
  if ("timeline" in requirement) out.timeline = requirement.timeline == null ? null : oneOf("timeline", requirement.timeline, LEAD_TIMELINES);
  return out;
}

/** Cross-field rules, checked on the lead as it WOULD be after the change. */
function assertBudgetConsistent(min: number | null, max: number | null, currency: LeadCurrency | null): void {
  if (min !== null && max !== null && min > max) {
    throw new LeadValidationError("budgetMin", "The minimum budget cannot be higher than the maximum.");
  }
  if ((min !== null || max !== null) && currency === null) {
    throw new LeadValidationError("budgetCurrency", "Choose a currency for the budget.");
  }
}

// --- events ------------------------------------------------------------------------------------

interface EventDetails {
  developerId?: string | null;
  fromStatus?: LeadStatus | null;
  toStatus?: LeadStatus | null;
  payload?: Record<string, unknown>;
}

async function appendEvent(
  events: LeadEventRepository,
  leadId: string,
  eventType: LeadEventType,
  actor: LeadActor,
  now: Date,
  details: EventDetails = {},
): Promise<LeadEvent> {
  return events.append({
    leadId,
    eventType,
    actorType: actor.actorType,
    actorId: actor.actorId ?? null,
    developerId: details.developerId ?? null,
    fromStatus: details.fromStatus ?? null,
    toStatus: details.toStatus ?? null,
    payload: details.payload ?? {},
    createdAt: now,
  });
}

async function requireLead(repos: LeadRepositories, leadId: string): Promise<Lead> {
  const lead = await repos.leads.getById(leadId);
  if (!lead) throw new LeadNotFoundError("Lead not found.");
  return lead;
}

function requireNotErased(lead: Lead): void {
  if (lead.erasedAt) throw new LeadStateError("This lead's personal data has been erased and it can no longer be changed.");
}

// --- requirement diff ---------------------------------------------------------------------------

const REQUIREMENT_FIELDS = [
  "location",
  "budgetMin",
  "budgetMax",
  "budgetCurrency",
  "configuration",
  "propertyType",
  "purpose",
  "timeline",
] as const;

/**
 * Compares the requirement a caller supplied with the lead's current values.
 * Returns the columns to write and the structured from/to record for the
 * REQUIREMENT_UPDATED event — so nothing about a requirement ever changes
 * without leaving the previous value behind.
 */
function diffRequirement(lead: Lead, requirement: Requirement): { patch: LeadPatch; changes: Record<string, { from: unknown; to: unknown }> } {
  const patch: LeadPatch = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of REQUIREMENT_FIELDS) {
    if (!(field in requirement)) continue;
    const next = requirement[field] ?? null;
    const current = lead[field] ?? null;
    if (next === current) continue;
    (patch as Record<string, unknown>)[field] = next;
    changes[field] = { from: current, to: next };
  }
  return { patch, changes };
}

// --- capture ------------------------------------------------------------------------------------

export interface CaptureAssistanceLeadInput {
  /** The phone/WhatsApp number as typed. */
  phone: string;
  /** Region to read a number typed without "+" in. Defaults to India. */
  phoneCountry?: SupportedPhoneCountry;
  name?: string | null;
  email?: string | null;
  contactPreference: ContactPreference;
  /** The developer being researched, exactly as the buyer saw it. */
  developer: { id: string; slug: string; displayName: string };
  /** The verified official website the buyer asked for, and when that relationship was verified (read-only snapshot). */
  website: { url: string; domain: string; verifiedAt: Date | null };
  /** Which public surface generated the lead (for example "developer_page" or "directory_card"). */
  sourceCta: string;
  sessionId: string;
  userId?: string | null;
  /** How this visit arrived. */
  currentTouch: TouchInput;
  /** The buyer's earliest known arrival, if the browser remembered one. */
  firstTouch?: TouchInput | null;
  requirement?: Requirement;
  /** When the buyer clicked "Visit official website". */
  clickedAt?: Date;
}

export interface CaptureResult {
  lead: Lead;
  /** True when this submission created the lead; false when it matched an existing one. */
  created: boolean;
}

function validateContactPreference(preference: unknown, email: string | null): ContactPreference {
  const value = oneOf("contactPreference", preference, CONTACT_PREFERENCES);
  if (value === "EMAIL" && !email) throw new LeadValidationError("email", "Enter an email address to be contacted by email.");
  return value;
}

/**
 * Records one buyer submission of the assistance gate — the single entry
 * point for creating or updating a lead from the public site.
 *
 * Everything happens in ONE transaction: the lead, its attribution, its
 * consent and all its events are written together or not at all. The phone
 * number (E.164) is the duplicate key, enforced atomically by the database,
 * so two simultaneous submissions of the same number produce exactly one
 * lead and two sets of events.
 *
 * Rules for a number that already has a lead:
 *   - first-touch attribution is NEVER changed; latest-touch moves forward;
 *   - name/email are only filled when empty (a returning buyer cannot
 *     silently overwrite what the founder has corrected);
 *   - a changed contact preference or requirement IS applied, but only
 *     together with an event recording the old and new values;
 *   - the lead's status is never changed by the buyer returning — the
 *     Today queue surfaces the activity instead.
 */
export async function captureAssistanceLead(
  repos: LeadRepositories,
  input: CaptureAssistanceLeadInput,
  now: Date = new Date(),
): Promise<CaptureResult> {
  // ---- validate everything before touching the database ----
  const phone = normalizePhone(input.phone, input.phoneCountry ?? "IN");
  if (!phone.ok) {
    throw new LeadValidationError(
      "phone",
      phone.reason === "EMPTY" ? "Enter your WhatsApp or phone number." : "Enter a valid phone number, including the country code if it is not an Indian number.",
    );
  }
  const name = optionalText("name", input.name, MAX_NAME);
  const email = validateEmail(input.email);
  const contactPreference = validateContactPreference(input.contactPreference, email);
  const requirement = input.requirement ? validateRequirement(input.requirement) : null;
  if (requirement) {
    assertBudgetConsistent(requirement.budgetMin ?? null, requirement.budgetMax ?? null, requirement.budgetCurrency ?? null);
  }
  const currentTouchClean = cleanTouch(input.currentTouch);
  const firstTouchClean = input.firstTouch ? cleanTouch(input.firstTouch) : null;
  const buyer: LeadActor = { actorType: "BUYER" };

  return repos.transaction(async (tx) => {
    const { lead: found, created } = await tx.leads.upsertByPhone({
      phoneE164: phone.e164,
      name,
      email,
      contactPreference,
      developerId: input.developer.id,
      sourceCta: input.sourceCta,
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      now,
    });

    const patch: LeadPatch = { lastActivityAt: now };
    let lead = found;
    const developerPayload = { developerSlug: input.developer.slug, sourceCta: input.sourceCta };

    // ---- attribution: touches are immutable rows; the lead only points at them ----
    const currentTouch = await tx.touches.create(currentTouchClean, now);
    if (created) {
      const firstTouch = firstTouchClean ? await tx.touches.create(firstTouchClean, now) : currentTouch;
      patch.firstTouchId = firstTouch.id;
      patch.lastTouchId = currentTouch.id;
    } else {
      patch.lastTouchId = currentTouch.id;
      // A lead somehow without a first touch gets one; an existing first touch is never replaced.
      if (!lead.firstTouchId) patch.firstTouchId = (firstTouchClean ? await tx.touches.create(firstTouchClean, now) : currentTouch).id;
    }

    // ---- the lead's own creation / re-capture event ----
    if (created) {
      await appendEvent(tx.events, lead.id, "LEAD_CREATED", buyer, now, {
        developerId: input.developer.id,
        payload: { ...developerPayload, touchId: patch.firstTouchId },
      });
    } else {
      const differed: string[] = [];
      if (name && lead.name && name !== lead.name) differed.push("name");
      if (email && lead.email && email !== lead.email) differed.push("email");
      if (!lead.name && name) patch.name = name;
      if (!lead.email && email) patch.email = email;
      await appendEvent(tx.events, lead.id, "LEAD_CAPTURED", buyer, now, {
        developerId: input.developer.id,
        payload: { ...developerPayload, touchId: currentTouch.id, repeat: true, ...(differed.length ? { contactDetailsDiffered: differed } : {}) },
      });
    }

    // ---- consent: every submission is a fresh, recorded, affirmative act ----
    const consent = await tx.consents.create({
      leadId: lead.id,
      purpose: CONSENT_PURPOSE,
      channel: contactPreference,
      textVersion: CONSENT_TEXT_VERSION,
      textShown: consentTextFor(contactPreference),
      givenAt: now,
    });
    await appendEvent(tx.events, lead.id, "CONSENT_GIVEN", buyer, now, {
      payload: { consentId: consent.id, purpose: consent.purpose, channel: consent.channel, textVersion: consent.textVersion },
    });

    // ---- contact preference ----
    if (created) {
      await appendEvent(tx.events, lead.id, "CONTACT_PREFERENCE_SELECTED", buyer, now, { payload: { from: null, to: contactPreference } });
    } else if (lead.contactPreference !== contactPreference) {
      patch.contactPreference = contactPreference;
      await appendEvent(tx.events, lead.id, "CONTACT_PREFERENCE_SELECTED", buyer, now, {
        payload: { from: lead.contactPreference, to: contactPreference },
      });
    }

    // ---- requirement (optional on the gate; usually arrives in a later step) ----
    if (requirement) {
      const { patch: requirementPatch, changes } = diffRequirement(lead, requirement);
      if (Object.keys(changes).length > 0) {
        assertBudgetConsistent(
          (requirementPatch.budgetMin !== undefined ? requirementPatch.budgetMin : lead.budgetMin) ?? null,
          (requirementPatch.budgetMax !== undefined ? requirementPatch.budgetMax : lead.budgetMax) ?? null,
          (requirementPatch.budgetCurrency !== undefined ? requirementPatch.budgetCurrency : lead.budgetCurrency) ?? null,
        );
        Object.assign(patch, requirementPatch);
        await appendEvent(tx.events, lead.id, "REQUIREMENT_UPDATED", buyer, now, { payload: { fields: changes } });
      }
    }

    // ---- the click itself: the exact verified website the buyer asked for ----
    await appendEvent(tx.events, lead.id, "OFFICIAL_WEBSITE_CLICKED", buyer, now, {
      developerId: input.developer.id,
      payload: {
        developerSlug: input.developer.slug,
        developerName: input.developer.displayName,
        websiteDomain: input.website.domain,
        websiteUrl: input.website.url,
        verifiedAt: input.website.verifiedAt ? input.website.verifiedAt.toISOString() : null,
        sourceCta: input.sourceCta,
        clickedAt: (input.clickedAt ?? now).toISOString(),
      },
    });

    lead = await tx.leads.update(lead.id, patch, now);
    return { lead, created };
  });
}

/** Records that the buyer was sent on to the verified official website. Called once the redirect has been issued. */
export async function recordWebsiteRedirect(
  repos: LeadRepositories,
  leadId: string,
  developer: { id: string; slug: string },
  website: { url: string; domain: string },
  now: Date = new Date(),
): Promise<void> {
  await repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    await appendEvent(tx.events, leadId, "DEVELOPER_WEBSITE_REDIRECTED", { actorType: "BUYER" }, now, {
      developerId: developer.id,
      payload: { developerSlug: developer.slug, websiteDomain: website.domain, websiteUrl: website.url },
    });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
  });
}

// --- requirement updates ------------------------------------------------------------------------

/**
 * Updates a lead's requirement — by the buyer (the optional "tell us more"
 * step) or by the founder correcting it. Only the supplied fields are
 * considered; each one that actually changes is applied AND recorded with its
 * previous value in a single REQUIREMENT_UPDATED event. Returns the changed
 * field names (empty when nothing changed — and then no event is written).
 */
export async function updateRequirement(
  repos: LeadRepositories,
  leadId: string,
  requirement: Requirement,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<{ lead: Lead; changed: string[] }> {
  if (actor.actorType === "FOUNDER") assertFounder(actor);
  const validated = validateRequirement(requirement);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    const { patch, changes } = diffRequirement(lead, validated);
    const changed = Object.keys(changes);
    if (changed.length === 0) return { lead, changed };

    assertBudgetConsistent(
      (patch.budgetMin !== undefined ? patch.budgetMin : lead.budgetMin) ?? null,
      (patch.budgetMax !== undefined ? patch.budgetMax : lead.budgetMax) ?? null,
      (patch.budgetCurrency !== undefined ? patch.budgetCurrency : lead.budgetCurrency) ?? null,
    );
    await appendEvent(tx.events, leadId, "REQUIREMENT_UPDATED", actor, now, { payload: { fields: changes } });
    const updated = await tx.leads.update(leadId, { ...patch, lastActivityAt: now }, now);
    return { lead: updated, changed };
  });
}

// --- founder operations -------------------------------------------------------------------------

export interface ChangeStatusOptions {
  /** Required when moving to LOST; recorded as structured data for loss analysis. */
  reasonCode?: LostReasonCode;
  /** Optional free-text context. Stored in the event but erased with the lead's personal data. */
  note?: string;
}

/** Moves a lead to a new status and records the transition. The founder may move a lead to any status (including re-opening a closed one). */
export async function changeLeadStatus(
  repos: LeadRepositories,
  leadId: string,
  toStatus: LeadStatus,
  actor: LeadActor,
  options: ChangeStatusOptions = {},
  now: Date = new Date(),
): Promise<Lead> {
  assertFounder(actor);
  oneOf("status", toStatus, LEAD_STATUSES);
  const reasonCode = options.reasonCode ? oneOf("reasonCode", options.reasonCode, LOST_REASON_CODES) : undefined;
  if (toStatus === "LOST" && !reasonCode) {
    throw new LeadValidationError("reasonCode", "Choose why this lead was lost.");
  }
  const note = optionalText("note", options.note, MAX_NOTE);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    if (lead.status === toStatus) throw new LeadStateError(`This lead is already ${toStatus}.`);

    await appendEvent(tx.events, leadId, "STATUS_CHANGED", actor, now, {
      fromStatus: lead.status,
      toStatus,
      payload: { ...(reasonCode ? { reasonCode } : {}), ...(note ? { note } : {}) },
    });
    return tx.leads.update(leadId, { status: toStatus, lastActivityAt: now }, now);
  });
}

export async function addNote(
  repos: LeadRepositories,
  leadId: string,
  text: string,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadEvent> {
  assertFounder(actor);
  const note = optionalText("note", text, MAX_NOTE);
  if (!note) throw new LeadValidationError("note", "Write a note first.");

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    const event = await appendEvent(tx.events, leadId, "NOTE_ADDED", actor, now, { payload: { note } });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
    return event;
  });
}

/** Sets (or, with null, clears) the next follow-up time. */
export async function setFollowUp(
  repos: LeadRepositories,
  leadId: string,
  when: Date | null,
  actor: LeadActor,
  now: Date = new Date(),
  options: { note?: string } = {},
): Promise<Lead> {
  assertFounder(actor);
  if (when !== null && Number.isNaN(when.getTime())) throw new LeadValidationError("nextFollowUpAt", "Choose a valid follow-up date and time.");
  const note = optionalText("note", options.note, MAX_NOTE);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    await appendEvent(tx.events, leadId, "FOLLOW_UP_SET", actor, now, {
      payload: { cleared: when === null, ...(when ? { dueAt: when.toISOString() } : {}), ...(note ? { note } : {}) },
    });
    return tx.leads.update(leadId, { nextFollowUpAt: when, lastActivityAt: now }, now);
  });
}

/** Marks the current follow-up done: records it (with what was due) and clears the date. A lead with no follow-up set cannot be completed. */
export async function completeFollowUp(
  repos: LeadRepositories,
  leadId: string,
  actor: LeadActor,
  now: Date = new Date(),
  options: { note?: string } = {},
): Promise<Lead> {
  assertFounder(actor);
  const note = optionalText("note", options.note, MAX_NOTE);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    if (lead.nextFollowUpAt === null) throw new LeadStateError("This lead has no follow-up to complete.");
    await appendEvent(tx.events, leadId, "FOLLOW_UP_COMPLETED", actor, now, {
      payload: { dueAt: lead.nextFollowUpAt.toISOString(), ...(note ? { note } : {}) },
    });
    return tx.leads.update(leadId, { nextFollowUpAt: null, lastActivityAt: now }, now);
  });
}

/** Sets (or, with null, clears) how warm the buyer is. Separate from status; every change is recorded with the previous value. */
export async function setTemperature(
  repos: LeadRepositories,
  leadId: string,
  temperature: LeadTemperature | null,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<Lead> {
  assertFounder(actor);
  const next = temperature === null ? null : oneOf("temperature", temperature, LEAD_TEMPERATURES);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    if (lead.temperature === next) throw new LeadStateError("The temperature is already set to that.");
    await appendEvent(tx.events, leadId, "TEMPERATURE_CHANGED", actor, now, { payload: { from: lead.temperature, to: next } });
    return tx.leads.update(leadId, { temperature: next, lastActivityAt: now }, now);
  });
}

/**
 * Records who owns a lead. null = the Founder's own queue. Phase 1 has no staff accounts, so the only
 * owners that exist are the founder and "unassigned" — but the change is recorded now so a future
 * assignment history is complete from day one. Builds no employee permissions.
 */
export async function assignOwner(
  repos: LeadRepositories,
  leadId: string,
  ownerId: string | null,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<Lead> {
  assertFounder(actor);
  const next = optionalText("ownerId", ownerId, MAX_SHORT_TEXT * 2);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    if (lead.ownerId === next) throw new LeadStateError("The lead already has that owner.");
    await appendEvent(tx.events, leadId, "OWNER_CHANGED", actor, now, { payload: { from: lead.ownerId, to: next } });
    return tx.leads.update(leadId, { ownerId: next, lastActivityAt: now }, now);
  });
}

/** Logs a call or WhatsApp the founder made by hand (there is no telephony or WhatsApp integration in Phase 1). */
export async function logContact(
  repos: LeadRepositories,
  leadId: string,
  contact: { channel: ContactChannel; outcome: ContactOutcome; note?: string },
  actor: LeadActor,
  now: Date = new Date(),
): Promise<LeadEvent> {
  assertFounder(actor);
  const channel = oneOf("channel", contact.channel, CONTACT_CHANNELS);
  const outcome = oneOf("outcome", contact.outcome, CONTACT_OUTCOMES);
  const note = optionalText("note", contact.note, MAX_NOTE);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    const event = await appendEvent(tx.events, leadId, "CONTACT_LOGGED", actor, now, {
      payload: { channel, outcome, ...(note ? { note } : {}) },
    });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
    return event;
  });
}

// --- bookings -----------------------------------------------------------------------------------

export interface CreateBookingInput {
  currency: LeadCurrency;
  bookingValue: number;
  commissionExpected?: number;
  projectName?: string | null;
  developerId?: string | null;
  bookedAt?: Date;
}

export async function createBooking(
  repos: LeadRepositories,
  leadId: string,
  input: CreateBookingInput,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<Booking> {
  assertFounder(actor);
  const currency = oneOf("currency", input.currency, LEAD_CURRENCIES);
  const bookingValue = validateAmount("bookingValue", input.bookingValue);
  if (bookingValue === null) throw new LeadValidationError("bookingValue", "Enter the booking value.");
  const commissionExpected = validateAmount("commissionExpected", input.commissionExpected ?? 0) ?? 0;
  const projectName = optionalText("projectName", input.projectName, MAX_LOCATION);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    requireNotErased(lead);
    const booking = await tx.bookings.create({
      leadId,
      developerId: input.developerId ?? lead.developerId,
      projectName,
      currency,
      bookingValue,
      commissionExpected,
      bookedAt: input.bookedAt ?? now,
      createdBy: actor.actorId,
      now,
    });
    await appendEvent(tx.events, leadId, "BOOKING_CREATED", actor, now, {
      developerId: booking.developerId,
      payload: { bookingId: booking.id, currency, bookingValue, commissionExpected },
    });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
    return booking;
  });
}

export interface UpdateBookingInput {
  status?: Booking["status"];
  bookingValue?: number;
  commissionExpected?: number;
  commissionReceived?: number;
  commissionReceivedAt?: Date | null;
  projectName?: string | null;
}

export async function updateBooking(
  repos: LeadRepositories,
  bookingId: string,
  input: UpdateBookingInput,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<Booking> {
  assertFounder(actor);
  return repos.transaction(async (tx) => {
    const booking = await tx.bookings.getById(bookingId);
    if (!booking) throw new LeadNotFoundError("Booking not found.");

    const patch: Parameters<typeof tx.bookings.update>[1] = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const set = <K extends keyof UpdateBookingInput & keyof Booking>(key: K, value: Booking[K]) => {
      if (value === booking[key]) return;
      (patch as Record<string, unknown>)[key] = value;
      changes[key] = { from: booking[key], to: value };
    };
    if (input.status !== undefined) set("status", oneOf("status", input.status, ["BOOKED", "CANCELLED"] as const));
    if (input.bookingValue !== undefined) set("bookingValue", validateAmount("bookingValue", input.bookingValue) ?? booking.bookingValue);
    if (input.commissionExpected !== undefined) set("commissionExpected", validateAmount("commissionExpected", input.commissionExpected) ?? 0);
    if (input.commissionReceived !== undefined) set("commissionReceived", validateAmount("commissionReceived", input.commissionReceived) ?? 0);
    if (input.commissionReceivedAt !== undefined) {
      const same = (input.commissionReceivedAt?.getTime() ?? null) === (booking.commissionReceivedAt?.getTime() ?? null);
      if (!same) {
        (patch as Record<string, unknown>).commissionReceivedAt = input.commissionReceivedAt;
        changes.commissionReceivedAt = { from: booking.commissionReceivedAt, to: input.commissionReceivedAt };
      }
    }
    if (input.projectName !== undefined) set("projectName", optionalText("projectName", input.projectName, MAX_LOCATION));

    if (Object.keys(changes).length === 0) return booking;
    const updated = await tx.bookings.update(bookingId, patch, now);
    await appendEvent(tx.events, booking.leadId, "BOOKING_UPDATED", actor, now, {
      developerId: booking.developerId,
      payload: { bookingId, currency: booking.currency, changes },
    });
    await tx.leads.update(booking.leadId, { lastActivityAt: now }, now);
    return updated;
  });
}

// --- erasure ------------------------------------------------------------------------------------

/**
 * Erases a buyer's personal data while keeping the anonymous skeleton.
 *
 *  - The lead row loses its name, email, phone, free-text location, session
 *    and user ids and follow-up; it keeps its status, structured requirement
 *    (budget band, configuration, timeline...), developer, attribution
 *    pointers and `erasedAt`.
 *  - Every event keeps who/what/when/which developer/status transition; its
 *    PAYLOAD is cut down to the allowlist in redaction.ts (notes and every
 *    other free-text field are removed). This is the only change events ever
 *    undergo, enforced by the database trigger.
 *  - Active consents are marked withdrawn.
 *  - A LEAD_ERASED event is recorded.
 *  - Bookings are kept: they are financial records, and hold no personal data.
 *
 * Because the phone number is cleared, a buyer who later returns with the
 * same number is a NEW lead — we deliberately keep no link back.
 */
export async function eraseLead(
  repos: LeadRepositories,
  leadId: string,
  actor: LeadActor,
  now: Date = new Date(),
): Promise<Lead> {
  assertFounder(actor);

  return repos.transaction(async (tx) => {
    const lead = await requireLead(tx, leadId);
    if (lead.erasedAt) throw new LeadStateError("This lead has already been erased.");

    // 1. Withdraw consent (the trigger allows exactly one withdrawal per consent).
    const withdrawn = await tx.consents.withdrawActive(leadId, now);
    for (const consent of withdrawn) {
      await appendEvent(tx.events, leadId, "CONSENT_WITHDRAWN", actor, now, {
        payload: { purpose: consent.purpose, channel: consent.channel, textVersion: consent.textVersion, via: "ERASURE" },
      });
    }

    // 2. Redact every EXISTING event's payload (the new events below are already clean).
    await tx.events.redactPayloads(leadId, (event) => redactPayload(event.eventType, event.payload));

    // 3. Strip personal data from the lead itself.
    const erased = await tx.leads.update(
      leadId,
      {
        name: null,
        email: null,
        phoneE164: null,
        location: null,
        sessionId: null,
        userId: null,
        nextFollowUpAt: null,
        erasedAt: now,
        lastActivityAt: now,
      },
      now,
    );

    // 4. Record the erasure itself.
    await appendEvent(tx.events, leadId, "LEAD_ERASED", actor, now, { payload: { via: "FOUNDER_ACTION", redacted: true } });
    return erased;
  });
}

// --- reads --------------------------------------------------------------------------------------

export async function getLeadTimeline(repos: LeadRepositories, leadId: string): Promise<LeadEvent[]> {
  return repos.events.listByLead(leadId);
}

/** The Founder's Today queue — see today-queue.ts for the rules. Read-only. */
export async function getTodayQueue(
  repos: LeadRepositories,
  now: Date = new Date(),
  limit: number = DEFAULT_QUEUE_LIMIT,
): Promise<TodayQueueEntry[]> {
  const leads = await repos.leads.listForQueue(1000);
  const summaries = await repos.events.summarise(leads.map((lead) => lead.id));
  const byLead = new Map(summaries.map((summary) => [summary.leadId, summary]));

  const inputs: TodayQueueInput[] = leads.map((lead) => {
    const summary = byLead.get(lead.id) ?? null;
    return { lead, developerName: summary?.firstDeveloperName ?? null, summary };
  });
  return buildTodayQueue(inputs, now, limit);
}
