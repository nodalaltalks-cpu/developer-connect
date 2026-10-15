import { cleanTouch } from "../leads/attribution.ts";
import { CONSENT_PURPOSE, CONSENT_TEXT_VERSION, consentTextFor } from "../leads/consent.ts";
import { classifyDigitalSource } from "../leads/lead-source.ts";
import { screenContact } from "../leads/lead-screen.ts";
import { normalizePhone, type SupportedPhoneCountry } from "../leads/phone.ts";
import type { LeadRepositories } from "../leads/repository.ts";
import type { ContactPreference, DigitalSource, LeadActor, LeadCurrency, LeadPurpose, LeadTimeline, TouchInput } from "../leads/types.ts";
import {
  BUDGETS,
  CONFIGURATIONS,
  CONTACT_METHODS,
  CONTACT_TIMES,
  HOW_FOUND,
  INTENTS,
  LOANS,
  LOCATIONS,
  MARKETS,
  MAX_CONFIGURATIONS,
  MAX_LOCATIONS,
  POSSESSIONS,
  PROPERTY_TYPES,
  PURPOSES,
  TIMELINES,
  type MarketKey,
  type Option,
} from "./enquiry-options.ts";

/**
 * The tap-to-select enquiry form, server side and framework-free. A visitor taps answers; this validates every one against the
 * fixed lists (nothing free-typed is accepted except the optional name and the phone number), creates or finds the lead by phone
 * number (never a duplicate), records the attribution touch and the consent, writes the requirement the sales team works from,
 * and keeps the full set of answers for the Founder. Nothing here logs, and it returns no lead id to the browser.
 */

export const ENQUIRY_RATE_LIMIT = { maxSubmissions: 5, windowMinutes: 10 } as const;

export interface EnquiryAnswers {
  intent: string;
  market: string;
  locations?: string[];
  propertyType?: string;
  configurations?: string[];
  budget?: string;
  purpose?: string;
  timeline?: string;
  possession?: string;
  loan?: string;
  contactMethod?: string;
  contactTime?: string;
  howFound?: string;
}

export interface EnquiryInput {
  answers: unknown;
  name?: unknown;
  phone: unknown;
  phoneCountry?: unknown;
  touch: TouchInput;
}

export interface EnquiryStore {
  insert(row: { leadId: string; answers: Record<string, unknown>; howFound: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; landingPath: string | null; createdAt: Date }): Promise<void>;
}

export type EnquiryErrorCode = "INVALID_PHONE" | "INVALID_ANSWER" | "MISSING_ANSWER" | "RATE_LIMITED" | "FAILED";
export type EnquiryResult = { ok: true; created: boolean; leadId: string } | { ok: false; code: EnquiryErrorCode; message: string; field?: string };

const MESSAGES: Record<EnquiryErrorCode, string> = {
  INVALID_PHONE: "Enter a valid WhatsApp or phone number.",
  INVALID_ANSWER: "One of the choices was not valid. Please tap your choices again.",
  MISSING_ANSWER: "Please choose what you are looking for and the city.",
  RATE_LIMITED: "That was a lot of enquiries in a short time. Please wait a few minutes and try again.",
  FAILED: "We could not save your enquiry. Please try again.",
};
const fail = (code: EnquiryErrorCode, field?: string): EnquiryResult => ({ ok: false, code, message: MESSAGES[code], ...(field ? { field } : {}) });

const keysOf = (list: readonly Option[]) => list.map((o) => o.key);
const isOne = (list: readonly Option[], value: unknown): value is string => typeof value === "string" && keysOf(list).includes(value);
const labelOf = (list: readonly Option[], key: string) => list.find((o) => o.key === key)?.label ?? key;

/** Validates the tapped answers. Returns the clean set, or the field that was wrong. Pure. */
export function validateAnswers(raw: unknown): { ok: true; answers: EnquiryAnswers } | { ok: false; code: "INVALID_ANSWER" | "MISSING_ANSWER"; field: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "MISSING_ANSWER", field: "answers" };
  const a = raw as Record<string, unknown>;
  const bad = (field: string) => ({ ok: false as const, code: "INVALID_ANSWER" as const, field });

  if (a.intent === undefined || a.market === undefined) return { ok: false, code: "MISSING_ANSWER", field: a.intent === undefined ? "intent" : "market" };
  if (!isOne(INTENTS, a.intent)) return bad("intent");
  if (!isOne(MARKETS, a.market)) return bad("market");
  const market = a.market as MarketKey;
  const out: EnquiryAnswers = { intent: a.intent, market };

  if (a.locations !== undefined) {
    if (!Array.isArray(a.locations) || a.locations.length > MAX_LOCATIONS) return bad("locations");
    const allowed = keysOf(LOCATIONS[market]);
    if (!a.locations.every((v) => typeof v === "string" && allowed.includes(v))) return bad("locations");
    out.locations = [...new Set(a.locations as string[])];
  }
  if (a.configurations !== undefined) {
    if (!Array.isArray(a.configurations) || a.configurations.length > MAX_CONFIGURATIONS) return bad("configurations");
    if (!a.configurations.every((v) => isOne(CONFIGURATIONS, v))) return bad("configurations");
    out.configurations = [...new Set(a.configurations as string[])];
  }
  const single: Array<[keyof EnquiryAnswers, readonly Option[]]> = [
    ["propertyType", PROPERTY_TYPES],
    ["purpose", PURPOSES],
    ["timeline", TIMELINES],
    ["possession", POSSESSIONS],
    ["loan", LOANS],
    ["contactMethod", CONTACT_METHODS],
    ["contactTime", CONTACT_TIMES],
    ["howFound", HOW_FOUND],
  ];
  for (const [field, list] of single) {
    const value = a[field];
    if (value === undefined || value === null || value === "") continue;
    if (!isOne(list, value)) return bad(field);
    (out as unknown as Record<string, unknown>)[field] = value;
  }
  if (a.budget !== undefined && a.budget !== null && a.budget !== "") {
    // A budget band belongs to one currency; Dubai is dirhams, everything else rupees, and the two are never mixed.
    const bands = market === "DUBAI" ? BUDGETS.AED : BUDGETS.INR;
    if (typeof a.budget !== "string" || !bands.some((b) => b.key === a.budget)) return bad("budget");
    out.budget = a.budget;
  }
  return { ok: true, answers: out };
}

const HOW_FOUND_SOURCE: Record<string, DigitalSource> = { INSTAGRAM: "INSTAGRAM", YOUTUBE: "YOUTUBE", FACEBOOK: "META", GOOGLE: "GOOGLE", LINKEDIN: "OTHER_DIGITAL", FRIEND: "REFERRAL", OTHER: "OTHER_DIGITAL" };

/** Where the lead came from: the evidence in the visit (campaign tags, referrer) first; the visitor's own answer when the visit says nothing. */
export function enquirySource(touch: Parameters<typeof classifyDigitalSource>[0], howFound: string | undefined): DigitalSource {
  const fromVisit = classifyDigitalSource(touch);
  if (fromVisit !== "WEBSITE" && fromVisit !== "ORGANIC") return fromVisit;
  return howFound && HOW_FOUND_SOURCE[howFound] ? HOW_FOUND_SOURCE[howFound] : fromVisit;
}

export interface EnquiryDeps {
  leads: LeadRepositories;
  store: EnquiryStore;
  now?: () => Date;
}

export async function submitEnquiry(deps: EnquiryDeps, ctx: { sessionId: string; userId?: string | null }, input: EnquiryInput): Promise<EnquiryResult> {
  const now = (deps.now ?? (() => new Date()))();
  const checked = validateAnswers(input.answers);
  if (!checked.ok) return fail(checked.code, checked.field);
  const answers = checked.answers;

  const country: SupportedPhoneCountry = input.phoneCountry === "AE" ? "AE" : "IN";
  const phone = normalizePhone(typeof input.phone === "string" ? input.phone : "", country);
  if (!phone.ok) return fail("INVALID_PHONE", "phone");
  // A made-up number (9999999999, 9876543210) is refused here: nothing saved, nobody alerted, no call wasted.
  if (screenContact({ name: typeof input.name === "string" ? input.name : null, e164: phone.e164 }).fakeNumber) return fail("INVALID_PHONE", "phone");
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) || null : null;

  const since = new Date(now.getTime() - ENQUIRY_RATE_LIMIT.windowMinutes * 60_000);
  if ((await deps.leads.touches.countBySessionSince(ctx.sessionId, since)) >= ENQUIRY_RATE_LIMIT.maxSubmissions) return fail("RATE_LIMITED");

  const touch = cleanTouch({ ...input.touch, sessionId: ctx.sessionId });
  const preference: ContactPreference = answers.contactMethod === "PHONE_CALL" ? "PHONE_CALL" : "WHATSAPP";
  const sourceDetail = enquirySource(touch, answers.howFound);
  const buyer: LeadActor = { actorType: "BUYER" };

  // The requirement the sales team works from, mapped from the taps.
  const band = answers.budget ? [...BUDGETS.INR, ...BUDGETS.AED].find((b) => b.key === answers.budget) : undefined;
  const currency: LeadCurrency | null = band ? (answers.budget!.startsWith("AED") ? "AED" : "INR") : null;
  const purpose: LeadPurpose | null = answers.purpose === "INVESTMENT" || answers.purpose === "SELF_USE" ? answers.purpose : answers.intent === "INVEST" ? "INVESTMENT" : null;
  const requirementPatch = {
    ...(answers.locations?.length ? { location: answers.locations.map((k) => labelOf(LOCATIONS[answers.market as MarketKey], k)).join(", ") } : {}),
    ...(band ? { budgetMin: band.min, budgetMax: band.max, budgetCurrency: currency } : {}),
    ...(answers.configurations?.length ? { configuration: answers.configurations.map((k) => labelOf(CONFIGURATIONS, k)).join(", ") } : {}),
    ...(answers.propertyType ? { propertyType: labelOf(PROPERTY_TYPES, answers.propertyType) } : {}),
    ...(purpose ? { purpose } : {}),
    ...(answers.timeline ? { timeline: answers.timeline as LeadTimeline } : {}),
  };

  try {
    const result = await deps.leads.transaction(async (tx) => {
      const { lead: found, created } = await tx.leads.upsertByPhone({
        phoneE164: phone.e164,
        name,
        email: null,
        contactPreference: preference,
        developerId: null,
        sourceCta: "enquiry_form",
        sessionId: ctx.sessionId,
        userId: ctx.userId ?? null,
        source: { sourceType: "DIGITAL", sourceDetail, creationMethod: "WEBSITE_GATE", importBatchId: null, createdBy: null },
        now,
      });
      const currentTouch = await tx.touches.create(touch, now);
      const patch: Record<string, unknown> = { lastActivityAt: now, lastTouchId: currentTouch.id, ...requirementPatch };
      if (created || !found.firstTouchId) patch.firstTouchId = currentTouch.id;
      if (!found.name && name) patch.name = name;
      if (!created && found.contactPreference !== preference) patch.contactPreference = preference;

      await tx.events.append({
        leadId: found.id,
        eventType: created ? "LEAD_CREATED" : "LEAD_CAPTURED",
        actorType: buyer.actorType,
        actorId: null,
        developerId: null,
        fromStatus: null,
        toStatus: null,
        payload: { sourceCta: "enquiry_form", touchId: currentTouch.id, intent: answers.intent, ...(created ? {} : { repeat: true }) },
        createdAt: now,
      });
      const consent = await tx.consents.create({ leadId: found.id, purpose: CONSENT_PURPOSE, channel: preference, textVersion: CONSENT_TEXT_VERSION, textShown: consentTextFor(preference), givenAt: now });
      await tx.events.append({ leadId: found.id, eventType: "CONSENT_GIVEN", actorType: buyer.actorType, actorId: null, developerId: null, fromStatus: null, toStatus: null, payload: { consentId: consent.id, purpose: consent.purpose, channel: consent.channel, textVersion: consent.textVersion }, createdAt: now });
      if (Object.keys(requirementPatch).length > 0) {
        await tx.events.append({ leadId: found.id, eventType: "REQUIREMENT_UPDATED", actorType: buyer.actorType, actorId: null, developerId: null, fromStatus: null, toStatus: null, payload: { fields: Object.fromEntries(Object.entries(requirementPatch).map(([k, v]) => [k, { from: null, to: v }])), via: "enquiry_form" }, createdAt: now });
      }
      await tx.leads.update(found.id, patch, now);
      return { leadId: found.id, created };
    });

    await deps.store.insert({
      leadId: result.leadId,
      answers: answers as unknown as Record<string, unknown>,
      howFound: answers.howFound ?? null,
      utmSource: touch.utmSource,
      utmMedium: touch.utmMedium,
      utmCampaign: touch.utmCampaign,
      landingPath: touch.landingPath,
      createdAt: now,
    });
    return { ok: true, created: result.created, leadId: result.leadId };
  } catch {
    return fail("FAILED");
  }
}
