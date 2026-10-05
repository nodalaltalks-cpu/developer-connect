import type { ContactPreference } from "./types.ts";

/**
 * The exact consent wording, defined once. The assistance gate (Stage 3)
 * must render THIS text, and the same text is stored verbatim with each
 * consent record — so what the buyer saw and what we can prove they agreed
 * to can never drift apart.
 *
 * Changing the wording means bumping CONSENT_TEXT_VERSION; old consent rows
 * keep the version and text they were given under.
 *
 * Deliberately says who receives the details (Developer Connects, not the
 * developer) and does not imply the developer requires them.
 */
export const CONSENT_TEXT_VERSION = "2026-10-v1";
export const CONSENT_PURPOSE = "PROPERTY_ASSISTANCE";

export function consentTextFor(channel: ContactPreference): string {
  const how =
    channel === "WHATSAPP" ? "on WhatsApp" : channel === "PHONE_CALL" ? "by phone call" : "by email";
  return (
    `I agree that Developer Connects may contact me ${how} about my property enquiry. ` +
    "I understand I am sharing these details with Developer Connects, not with the developer."
  );
}
