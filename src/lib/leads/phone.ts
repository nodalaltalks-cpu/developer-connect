import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

/**
 * The ONE place a phone number becomes canonical. Every lead is keyed by its
 * E.164 form (+919876543210), so "098765 43210", "+91 98765-43210" and
 * "91 9876543210" are the same buyer.
 *
 * Pure and framework-free. Uses libphonenumber-js's full metadata, so a
 * number is accepted only if it is genuinely valid for its country (right
 * length AND a real prefix), not merely digit-shaped.
 */

/** Countries Developer Connects operates in — the default region for a number typed without a "+". */
export const SUPPORTED_PHONE_COUNTRIES = ["IN", "AE"] as const;
export type SupportedPhoneCountry = (typeof SUPPORTED_PHONE_COUNTRIES)[number];

export type PhoneRejection = "EMPTY" | "UNPARSEABLE" | "INVALID" | "NOT_A_MOBILE_OR_LINE";

export type PhoneResult =
  | { ok: true; e164: string; country: string; national: string }
  | { ok: false; reason: PhoneRejection };

/** Longest raw input we will even attempt to parse — a guard against pathological pastes. */
const MAX_INPUT_LENGTH = 40;

/**
 * Normalises `input` to E.164. A number with a leading "+" or "00" is read as
 * international and keeps its own country; anything else is read in
 * `defaultCountry` (India unless the caller says otherwise).
 */
export function normalizePhone(input: string | null | undefined, defaultCountry: SupportedPhoneCountry = "IN"): PhoneResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "EMPTY" };
  if (raw.length > MAX_INPUT_LENGTH) return { ok: false, reason: "UNPARSEABLE" };

  // "00" is the international dialling prefix in most countries; libphonenumber wants "+".
  const candidate = raw.startsWith("00") ? `+${raw.slice(2)}` : raw;

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(candidate, defaultCountry as CountryCode);
  } catch {
    return { ok: false, reason: "UNPARSEABLE" };
  }
  if (!parsed) return { ok: false, reason: "UNPARSEABLE" };
  if (!parsed.isValid()) return { ok: false, reason: "INVALID" };

  // A buyer reaching us by WhatsApp or phone call needs a line that can carry
  // one. Anything libphonenumber positively identifies as a non-subscriber
  // number (premium rate, shared cost, pager, voicemail...) is refused.
  const type = parsed.getType();
  const REFUSED = new Set(["PREMIUM_RATE", "TOLL_FREE", "SHARED_COST", "PAGER", "VOICEMAIL", "UAN"]);
  if (type && REFUSED.has(type)) return { ok: false, reason: "NOT_A_MOBILE_OR_LINE" };

  return {
    ok: true,
    e164: parsed.number,
    country: parsed.country ?? "",
    national: parsed.formatNational(),
  };
}

/**
 * A display-safe form of a number — country code and the last three digits,
 * never the whole number — for a "continuing as ..." prompt shown to the buyer
 * themselves. Public pages must never receive the real number.
 */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 8) return "••••";
  const parsed = parsePhoneNumberFromString(e164);
  const callingCode = parsed?.countryCallingCode ?? digits.slice(0, 2);
  const last = digits.slice(-3);
  return `+${callingCode} ••••••${last}`;
}
