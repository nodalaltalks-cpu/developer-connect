/**
 * The assistance gate's operating mode.
 *
 *  - "required": every "Visit official website" action passes through the gate.
 *    The buyer is sent on only after their details have been saved. This is
 *    the ONLY mode on Vercel production, whatever the environment says.
 *  - "off": an explicit operator switch (LEAD_GATE_MODE=off) for NON-production
 *    environments only — for example a preview deployment whose database does
 *    not have the lead tables yet. It is ignored on Vercel production
 *    (VERCEL_ENV=production), so no configuration mistake can switch the gate
 *    off for real buyers. It is never reached by a failure: a database error is
 *    always an error state, not a bypass.
 *
 * Anything other than the literal "off" (unset, empty, a typo) means
 * "required", so a misconfiguration can only make the gate stricter.
 */
export type GateMode = "required" | "off";

export function parseGateMode(raw: string | null | undefined): GateMode {
  return (raw ?? "").trim().toLowerCase() === "off" ? "off" : "required";
}

export function getGateMode(env: Record<string, string | undefined> = process.env): GateMode {
  // Production is always "required": the switch is not even read there.
  if (env.VERCEL_ENV === "production") return "required";
  return parseGateMode(env.LEAD_GATE_MODE);
}

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
