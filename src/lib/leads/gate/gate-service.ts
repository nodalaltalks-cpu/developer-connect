import { toPublicDeveloperProfile } from "../../developer-connect/public-view.ts";
import { safeRecordAnalyticsEvent, type AnalyticsEventSink } from "../../developer-connect/events.ts";
import type { DeveloperConnectRepositories } from "../../developer-connect/repository.ts";
import { LeadValidationError } from "../errors.ts";
import { captureAssistanceLead, recordWebsiteRedirect } from "../lead-service.ts";
import { maskPhone } from "../phone.ts";
import type { LeadRepositories } from "../repository.ts";
import type { ContactPreference, TouchInput } from "../types.ts";
import { GATE_ERROR_MESSAGES, type GateErrorCode } from "./gate-copy.ts";
import {
  GATE_CONTACT_PREFERENCES,
  GATE_PHONE_COUNTRIES,
  GATE_RATE_LIMIT,
  GATE_SOURCE_CTAS,
  type GateContactPreference,
  type GatePhoneCountry,
  type GateSourceCta,
} from "./gate-config.ts";
import type { GateAttribution, GateReturningInput, GateStateResponse, GateSubmitInput, GateSubmitResponse } from "./gate-flow.ts";

/**
 * The server side of the assistance gate — framework-free (no Clerk, Next or
 * cookies), so it is fully testable. The thin server actions in
 * app/_actions/lead-gate-actions.ts add the session, the signed cookie and
 * the production repositories.
 *
 * THE central rule: the destination comes from the VERIFIED developer record
 * in our database, resolved here, and the client never supplies a URL. The
 * input types below have no URL field at all, and anything extra a caller
 * sends is ignored. A developer without a verified official website (or one
 * that is not ACTIVE) cannot produce a destination, so the gate can never be
 * used as an open redirect or to send a buyer to an unverified site.
 *
 * Nothing here logs, and nothing it returns contains a lead id, a full phone
 * number or an email — the only phone form that leaves is the masked one.
 */

export interface GateDeps {
  developers: Pick<DeveloperConnectRepositories, "developers" | "candidates">;
  leads: LeadRepositories;
  analytics: AnalyticsEventSink;
  now: () => Date;
}

export interface GateContext {
  /** The server's own session id (cookie) — the client's claim of one is never used. */
  sessionId: string;
  /** The signed-in Clerk user, if any. */
  userId?: string | null;
  deviceType?: "mobile" | "desktop" | "unknown";
}

/** What an action needs to set the returning-buyer cookie: the lead id stays server-side. */
export interface GateSuccess {
  response: Extract<GateSubmitResponse, { ok: true }>;
  leadId: string;
}

export type GateResult = GateSuccess | { response: Extract<GateSubmitResponse, { ok: false }>; leadId: null };

function fail(code: GateErrorCode, field?: string): GateResult {
  return { response: { ok: false, code, message: GATE_ERROR_MESSAGES[code], ...(field ? { field } : {}) }, leadId: null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

// --- resolving the destination from the verified record ----------------------------------------

export interface ResolvedDestination {
  developer: { id: string; slug: string; displayName: string };
  url: string;
  domain: string;
  verifiedAt: Date | null;
}

/**
 * The ONLY place a destination is produced. Returns null unless the developer
 * exists, is ACTIVE, and has a VERIFIED official website whose URL is plain
 * http(s).
 */
export async function resolveVerifiedDestination(
  deps: Pick<GateDeps, "developers">,
  developerId: unknown,
): Promise<ResolvedDestination | null> {
  if (typeof developerId !== "string" || !UUID.test(developerId)) return null;

  const developer = await deps.developers.developers.getById(developerId);
  if (!developer || developer.status !== "ACTIVE") return null;
  const candidate = await deps.developers.candidates.getVerifiedForDeveloper(developerId);
  if (!candidate) return null;

  // Shapes the record exactly as the public page does (and refuses a non-VERIFIED candidate itself).
  const profile = toPublicDeveloperProfile(developer, candidate);
  if (!profile.officialWebsite) return null;

  let parsed: URL;
  try {
    parsed = new URL(profile.officialWebsite.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  return {
    developer: { id: profile.id, slug: profile.slug, displayName: profile.displayName },
    url: profile.officialWebsite.url,
    domain: profile.officialWebsite.canonicalDomain,
    verifiedAt: profile.officialWebsite.verifiedAt,
  };
}

// --- attribution input ---------------------------------------------------------------------------

const TOUCH_FIELDS = ["landingPath", "referrer", "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "gclid", "fbclid"] as const;

/** Keeps only known, string-valued touch fields from whatever the browser sent, and forces the SERVER's session id. */
function toTouchInput(raw: unknown, sessionId: string, fallbackNow: Date): TouchInput | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const touch: TouchInput = { sessionId };
  for (const field of TOUCH_FIELDS) {
    const value = source[field];
    if (typeof value === "string") touch[field] = value;
  }
  const occurred = typeof source.occurredAt === "string" ? new Date(source.occurredAt) : null;
  // A browser-supplied time is only trusted if it is a real date no later than now and not absurdly old.
  if (occurred && !Number.isNaN(occurred.getTime()) && occurred.getTime() <= fallbackNow.getTime() && fallbackNow.getTime() - occurred.getTime() < 400 * 24 * 3_600_000) {
    touch.occurredAt = occurred;
  }
  return touch;
}

function attributionTouches(attribution: GateAttribution | undefined, sessionId: string, now: Date) {
  const current = toTouchInput(attribution?.currentTouch, sessionId, now) ?? { sessionId };
  const first = toTouchInput(attribution?.firstTouch, sessionId, now);
  return { currentTouch: current, firstTouch: first ?? null };
}

function clickTime(raw: unknown, now: Date): Date {
  if (typeof raw !== "string") return now;
  const date = new Date(raw);
  const age = now.getTime() - date.getTime();
  // A real click happened a moment ago; ignore anything in the future or older than an hour.
  return Number.isNaN(date.getTime()) || age < 0 || age > 3_600_000 ? now : date;
}

// --- the shared capture path --------------------------------------------------------------------

async function captureAndRedirect(
  deps: GateDeps,
  ctx: GateContext,
  destination: ResolvedDestination,
  details: {
    phone: string;
    phoneCountry: GatePhoneCountry;
    contactPreference: GateContactPreference;
    name?: string | null;
    sourceCta: GateSourceCta;
    attribution?: GateAttribution;
    clickedAt?: unknown;
  },
): Promise<GateResult> {
  const now = deps.now();

  // Speed bump against scripted spam: the number of submissions per browser session in a short window.
  const since = new Date(now.getTime() - GATE_RATE_LIMIT.windowMinutes * 60_000);
  try {
    if ((await deps.leads.touches.countBySessionSince(ctx.sessionId, since)) >= GATE_RATE_LIMIT.maxSubmissions) {
      return fail("RATE_LIMITED");
    }
  } catch {
    return fail("TEMPORARY_FAILURE");
  }

  const { currentTouch, firstTouch } = attributionTouches(details.attribution, ctx.sessionId, now);

  let captured;
  try {
    captured = await captureAssistanceLead(
      deps.leads,
      {
        phone: details.phone,
        phoneCountry: details.phoneCountry,
        name: details.name ?? null,
        email: null,
        contactPreference: details.contactPreference as ContactPreference,
        developer: destination.developer,
        website: { url: destination.url, domain: destination.domain, verifiedAt: destination.verifiedAt },
        sourceCta: details.sourceCta,
        sessionId: ctx.sessionId,
        userId: ctx.userId ?? null,
        currentTouch,
        firstTouch,
        clickedAt: clickTime(details.clickedAt, now),
      },
      now,
    );
  } catch (error) {
    if (error instanceof LeadValidationError) {
      return fail(error.field === "phone" ? "INVALID_PHONE" : "INVALID_INPUT", error.field);
    }
    // Any other failure (database down, constraint, timeout): the lead was NOT saved, so the buyer is NOT sent on.
    return fail("TEMPORARY_FAILURE");
  }

  // The destination has been issued by the server. Recording it is best-effort: the lead is already safe.
  try {
    await recordWebsiteRedirect(
      deps.leads,
      captured.lead.id,
      { id: destination.developer.id, slug: destination.developer.slug },
      { url: destination.url, domain: destination.domain },
      now,
    );
  } catch {
    /* never block a saved lead's redirect on the redirect log line */
  }

  const base = { occurredAt: now, sessionId: ctx.sessionId, userId: ctx.userId ?? undefined, deviceType: ctx.deviceType };
  await safeRecordAnalyticsEvent(deps.analytics, {
    ...base,
    eventName: "lead_submitted",
    developerId: destination.developer.id,
    sourceCta: details.sourceCta,
    contactPreference: details.contactPreference,
    newLead: captured.created,
  });
  // Strictly after "lead_submitted": analytics has no insertion-order column, so equal timestamps would sort arbitrarily.
  await safeRecordAnalyticsEvent(deps.analytics, {
    ...base,
    occurredAt: new Date(now.getTime() + 1),
    eventName: "official_website_redirected",
    developerId: destination.developer.id,
    targetDomain: destination.domain,
  });

  return {
    leadId: captured.lead.id,
    response: {
      ok: true,
      destinationUrl: destination.url,
      destinationDomain: destination.domain,
      maskedPhone: maskPhone(captured.lead.phoneE164 ?? ""),
      contactPreference: details.contactPreference,
    },
  };
}

// --- public operations ---------------------------------------------------------------------------

/**
 * A buyer submits the gate. Everything the browser sends is treated as
 * untrusted: unknown fields are ignored, enums are checked, the honeypot is
 * enforced, and the destination is resolved server-side.
 */
export async function submitGate(deps: GateDeps, ctx: GateContext, input: GateSubmitInput): Promise<GateResult> {
  if (!input || typeof input !== "object") return fail("INVALID_INPUT");

  // A human never sees this field; a bot that fills it is refused without a hint why.
  if (typeof input.website === "string" && input.website.trim() !== "") return fail("GATE_REJECTED");

  const sourceCta = oneOf(input.sourceCta, GATE_SOURCE_CTAS);
  const contactPreference = oneOf(input.contactPreference, GATE_CONTACT_PREFERENCES);
  const phoneCountry = oneOf(input.phoneCountry, GATE_PHONE_COUNTRIES);
  if (!sourceCta || !contactPreference || !phoneCountry || typeof input.phone !== "string") return fail("INVALID_INPUT");

  let destination: ResolvedDestination | null;
  try {
    destination = await resolveVerifiedDestination(deps, input.developerId);
  } catch {
    return fail("TEMPORARY_FAILURE");
  }
  if (!destination) return fail("NOT_VERIFIED");

  return captureAndRedirect(deps, ctx, destination, {
    phone: input.phone,
    phoneCountry,
    contactPreference,
    name: typeof input.name === "string" ? input.name : null,
    sourceCta,
    attribution: input.attribution,
    clickedAt: input.clickedAt,
  });
}

/**
 * A returning buyer continues with the details they already shared. The
 * number comes from OUR record of the lead (identified by the signed cookie),
 * never from the browser, and the buyer is shown only its masked form.
 */
export async function continueAsReturning(
  deps: GateDeps,
  ctx: GateContext,
  leadId: string | null,
  input: GateReturningInput,
): Promise<GateResult> {
  const sourceCta = oneOf(input?.sourceCta, GATE_SOURCE_CTAS);
  if (!sourceCta) return fail("INVALID_INPUT");

  let destination: ResolvedDestination | null;
  let lead;
  try {
    destination = await resolveVerifiedDestination(deps, input.developerId);
    lead = leadId ? await deps.leads.leads.getById(leadId) : null;
  } catch {
    return fail("TEMPORARY_FAILURE");
  }
  if (!destination) return fail("NOT_VERIFIED");
  if (!lead || lead.erasedAt || !lead.phoneE164) return fail("RETURNING_UNAVAILABLE");

  const preference = oneOf(lead.contactPreference, GATE_CONTACT_PREFERENCES) ?? "WHATSAPP";
  return captureAndRedirect(deps, ctx, destination, {
    phone: lead.phoneE164,
    phoneCountry: "IN", // irrelevant: a stored E.164 number carries its own country code
    contactPreference: preference,
    name: null,
    sourceCta,
    attribution: input.attribution,
    clickedAt: input.clickedAt,
  });
}

/**
 * What the gate shows when it opens. Reads the lead only to return its masked
 * number; also records the anonymous "gate shown" funnel event.
 */
export async function getGateState(
  deps: GateDeps,
  ctx: GateContext,
  developerId: unknown,
  sourceCtaRaw: unknown,
  leadId: string | null,
  mode: "required" | "off",
): Promise<GateStateResponse> {
  const sourceCta = oneOf(sourceCtaRaw, GATE_SOURCE_CTAS);
  if (!sourceCta) return { mode: "unavailable", code: "INVALID_INPUT", message: GATE_ERROR_MESSAGES.INVALID_INPUT };

  let destination: ResolvedDestination | null;
  try {
    destination = await resolveVerifiedDestination(deps, developerId);
  } catch {
    return { mode: "unavailable", code: "TEMPORARY_FAILURE", message: GATE_ERROR_MESSAGES.TEMPORARY_FAILURE };
  }
  if (!destination) return { mode: "unavailable", code: "NOT_VERIFIED", message: GATE_ERROR_MESSAGES.NOT_VERIFIED };

  const base = { occurredAt: deps.now(), sessionId: ctx.sessionId, userId: ctx.userId ?? undefined, deviceType: ctx.deviceType };

  if (mode === "off") {
    await safeRecordAnalyticsEvent(deps.analytics, {
      ...base,
      eventName: "official_website_redirected",
      developerId: destination.developer.id,
      targetDomain: destination.domain,
    });
    return { mode: "off", destinationUrl: destination.url, destinationDomain: destination.domain };
  }

  let returning: Extract<GateStateResponse, { returning: true }> | null = null;
  try {
    const lead = leadId ? await deps.leads.leads.getById(leadId) : null;
    if (lead && !lead.erasedAt && lead.phoneE164) {
      returning = {
        mode: "required",
        returning: true,
        maskedPhone: maskPhone(lead.phoneE164),
        contactPreference: oneOf(lead.contactPreference, GATE_CONTACT_PREFERENCES) ?? "WHATSAPP",
      };
    }
  } catch {
    returning = null; // can't check: fall back to the normal form rather than failing the gate
  }

  await safeRecordAnalyticsEvent(deps.analytics, {
    ...base,
    eventName: "assistance_gate_shown",
    developerId: destination.developer.id,
    sourceCta,
    returningVisitor: returning !== null,
  });
  return returning ?? { mode: "required", returning: false };
}

/** The buyer started typing — the anonymous "form started" funnel event. Silent for an unknown developer. */
export async function recordFormStarted(deps: GateDeps, ctx: GateContext, developerId: unknown, sourceCtaRaw: unknown): Promise<void> {
  const sourceCta = oneOf(sourceCtaRaw, GATE_SOURCE_CTAS);
  if (!sourceCta) return;
  let destination: ResolvedDestination | null = null;
  try {
    destination = await resolveVerifiedDestination(deps, developerId);
  } catch {
    return;
  }
  if (!destination) return;
  await safeRecordAnalyticsEvent(deps.analytics, {
    occurredAt: deps.now(),
    sessionId: ctx.sessionId,
    userId: ctx.userId ?? undefined,
    deviceType: ctx.deviceType,
    eventName: "assistance_form_started",
    developerId: destination.developer.id,
    sourceCta,
  });
}
