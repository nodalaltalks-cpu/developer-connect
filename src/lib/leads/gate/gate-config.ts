/**
 * The assistance gate has no operating modes and no environment switch: every
 * "Connect with developer" press goes through it, in every environment. (An
 * earlier "off" mode handed a verified developer URL to the browser without a
 * lead; it was removed with the outbound website flow, so there is no
 * configuration that can switch the gate off or reveal a developer URL.)
 */

/** Surfaces the gate may be opened from. A value outside this list is rejected, never stored. */
export const GATE_SOURCE_CTAS = ["developer_page", "directory_card", "other"] as const;
export type GateSourceCta = (typeof GATE_SOURCE_CTAS)[number];

/** Contact methods the gate offers. WhatsApp is primary; EMAIL is not offered at the gate. */
export const GATE_CONTACT_PREFERENCES = ["WHATSAPP", "PHONE_CALL"] as const;
export type GateContactPreference = (typeof GATE_CONTACT_PREFERENCES)[number];

/** Default regions for a number typed without "+": the two markets Developer Connects operates in. */
export const GATE_PHONE_COUNTRIES = ["IN", "AE"] as const;
export type GatePhoneCountry = (typeof GATE_PHONE_COUNTRIES)[number];

/** Speed bump against scripted spam: at most this many submissions per browser session in the window. */
export const GATE_RATE_LIMIT = { maxSubmissions: 5, windowMinutes: 10 } as const;

/** How long the "returning buyer" cookie stays valid. */
export const RETURNING_LEAD_TTL_DAYS = 30;
