import { createHash } from "node:crypto";

/**
 * Meta Conversions API, server side. Used for the few conversions the browser cannot be trusted to report (a saved lead, a
 * qualified lead, a site visit, a booking), sharing an event id with the browser pixel so Meta counts each once.
 *
 * Off unless BOTH the pixel id and an access token are configured, so deploying this changes nothing by itself. It is only ever
 * called for a person who accepted advertising measurement; the caller passes that fact in. Personal data is hashed here exactly as
 * Meta specifies (trimmed, lower-cased, phone as digits with country code, then SHA-256) and the raw value is never sent, logged
 * or placed in a URL.
 */

export interface CapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

export function capiConfigFromEnv(env: Record<string, string | undefined> = process.env): CapiConfig | null {
  const pixelId = env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const accessToken = env.META_CAPI_ACCESS_TOKEN?.trim();
  if (!pixelId || !/^\d{10,20}$/.test(pixelId) || !accessToken) return null;
  return { pixelId, accessToken, testEventCode: env.META_CAPI_TEST_EVENT_CODE?.trim() || undefined };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function hashEmail(email: string): string | null {
  const v = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? sha256(v) : null;
}

/** Digits only, country code included (Meta's rule). A number without enough digits is not sent. */
export function hashPhone(e164: string): string | null {
  const digits = e164.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? sha256(digits) : null;
}

export interface CapiEventInput {
  /** Meta standard event name, e.g. "Lead". */
  eventName: string;
  eventId: string;
  eventTime: Date;
  /** The page the event happened on, path only. */
  path: string;
  email?: string | null;
  phoneE164?: string | null;
  /** Meta's browser cookies, when the visitor's browser has them. */
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  /** Revenue events only; never invented. */
  value?: { amount: number; currency: string } | null;
}

export function buildCapiPayload(config: CapiConfig, event: CapiEventInput, siteUrl = "https://developerconnects.com") {
  const userData: Record<string, string | string[]> = {};
  const em = event.email ? hashEmail(event.email) : null;
  const ph = event.phoneE164 ? hashPhone(event.phoneE164) : null;
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (event.fbp) userData.fbp = event.fbp;
  if (event.fbc) userData.fbc = event.fbc;
  if (event.clientIp) userData.client_ip_address = event.clientIp;
  if (event.userAgent) userData.client_user_agent = event.userAgent;
  const data: Record<string, unknown> = {
    event_name: event.eventName,
    event_time: Math.floor(event.eventTime.getTime() / 1000),
    event_id: event.eventId,
    action_source: "website",
    event_source_url: `${siteUrl}${event.path.startsWith("/") ? event.path.split(/[?#]/)[0] : "/"}`,
    user_data: userData,
  };
  if (event.value && Number.isFinite(event.value.amount) && event.value.amount > 0) data.custom_data = { value: event.value.amount, currency: event.value.currency };
  return { data: [data], ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}) };
}

/** Best effort and silent: a failure here must never affect the buyer. Returns whether Meta accepted the event. */
export async function sendMetaEvent(
  event: CapiEventInput,
  options: { config?: CapiConfig | null; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const config = options.config === undefined ? capiConfigFromEnv() : options.config;
  if (!config) return false;
  try {
    const response = await (options.fetchImpl ?? fetch)(`https://graph.facebook.com/v21.0/${config.pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.accessToken}` },
      body: JSON.stringify(buildCapiPayload(config, event)),
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
