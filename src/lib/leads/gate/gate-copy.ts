import { consentTextFor } from "../consent.ts";
import type { GateContactPreference } from "./gate-config.ts";

/**
 * Every word the buyer reads on the assistance gate, in one place — so the
 * wording can be reviewed (and tested) without reading components.
 *
 * What the copy must always make clear:
 *  1. this is a Developer Connects property-assistance enquiry;
 *  2. the DEVELOPER does not need the buyer's number — the gate is ours;
 *  3. the buyer is choosing to share details with Developer Connects;
 *  4. after submitting, Developer Connects contacts them — they are NOT sent to
 *     another website (the developer's website is internal verification data).
 *
 * What it must never do: imply the developer requires the number, use
 * urgency or scarcity, hide the purpose, or offer a misleading button label.
 * Tests enforce both lists.
 */

export interface GateCopy {
  title: string;
  intro: string;
  /** What the buyer can rely on, and who Developer Connects is. */
  /** Two or three lines that say what the buyer gets by sharing a number. No fee or credential claims: those live only in the Disclaimer. */
  motivation: readonly string[];
  phoneLabel: string;
  phoneHelp: string;
  countryLabel: string;
  nameLabel: string;
  /** Shown when a number is entered without a name. */
  nameMissing: string;
  preferenceLegend: string;
  preferenceWhatsApp: string;
  preferenceWhatsAppHint: string;
  preferencePhone: string;
  consent: string;
  reassurance: string;
  privacyLinkLabel: string;
  submit: string;
  submitHint: string;
  submitting: string;
  close: string;
  verifiedNote: string;
  returningTitle: string;
  returningBody: string;
  returningContinue: string;
  useDifferentNumber: string;
  errorTitle: string;
  /** Heading for a mistake the buyer can fix (a bad number), as opposed to a system failure. */
  validationTitle: string;
  retry: string;
  successTitle: string;
  successBody: string;
  successClose: string;
}

/**
 * The commission policy. It appears in ONE public place, the Disclaimer (linked from the footer of every page), and nowhere else:
 * 0% on primary (new-launch) sales; on secondary (resale) and rental transactions commission applies as per market standards.
 */
export const COMMISSION_POLICY =
  "Developer Connects charges 0% commission on primary (new-launch) sales. " +
  "On secondary (resale) and rental transactions, commission is applicable as per market standards.";

/**
 * What the buyer can rely on, and who Developer Connects is. The RERA registration number is shown when
 * NEXT_PUBLIC_RERA_REGISTRATION is set (the number is the Founder's to supply; nothing is invented here).
 */
const RERA_NUMBER = (process.env.NEXT_PUBLIC_RERA_REGISTRATION ?? "").trim();
/** The registration number, or "" until the founder supplies it. Shown (with a verify link) only when set. */
export const RERA_REGISTRATION_NUMBER = RERA_NUMBER;
/**
 * What a buyer gets by sharing a number, in words that give a reason to do it. Specific and checkable: no fees, no rankings, no
 * guarantees. The registration and fee statements are in the Disclaimer only.
 */
export const GATE_MOTIVATION: readonly string[] = [
  "Your brief becomes a short list: projects that fit your budget, area and timeline, with prices, payment plans and possession dates side by side.",
  "A real person, not a bot, walks you through the checks that protect you before you pay anything.",
  "No pressure and no strings. You decide every next step.",
];
export const CREDENTIALS_LINE = `Developer Connects is a certified, affiliated channel partner and RERA registered${RERA_NUMBER ? ` (RERA No. ${RERA_NUMBER})` : ""}.`;

export function gateCopy(developerName: string, preference: GateContactPreference = "WHATSAPP"): GateCopy {
  const channelWords = preference === "WHATSAPP" ? "on WhatsApp" : "by phone call";
  return {
    title: "Connect with Developer Connects",
    intro:
      "You've found the developer you're interested in. Share your details with Developer Connects and we'll help connect you based on your requirement.",
    motivation: GATE_MOTIVATION,
    phoneLabel: "Your WhatsApp or phone number",
    phoneHelp: "We'll use this to reach you about your enquiry — nothing else.",
    countryLabel: "Country code",
    nameLabel: "Your name (required)",
    nameMissing: "Please enter your name, so our advisor knows who to ask for.",
    preferenceLegend: "How should we contact you?",
    preferenceWhatsApp: "WhatsApp",
    preferenceWhatsAppHint: "Recommended",
    preferencePhone: "Phone call",
    consent: consentTextFor(preference),
    reassurance: "Your details are used to help with your property enquiry. You can choose your preferred contact method.",
    privacyLinkLabel: "Privacy Policy",
    submit: "Request a connection",
    submitHint: `Developer Connects will contact you ${channelWords}. You won't be sent to another website.`,
    submitting: "Saving your details…",
    close: "Close",
    verifiedNote: `Your request goes to the Developer Connects advisory team for ${developerName}.`,
    returningTitle: "Welcome back",
    returningBody: `We'll keep helping you ${channelWords}. Send your request to connect with ${developerName} using the details you shared earlier?`,
    returningContinue: "Request a connection",
    useDifferentNumber: "Use a different number",
    errorTitle: "We couldn't save your details",
    validationTitle: "Please check your details",
    retry: "Try again",
    successTitle: "Thank you — we've received your request",
    successBody: `Developer Connects will contact you ${channelWords} to help connect you with ${developerName}.`,
    successClose: "Done",
  };
}

/** Error messages by code, shown to the buyer. None blames the buyer or suggests skipping the gate. */
export const GATE_ERROR_MESSAGES = {
  INVALID_PHONE: "Please enter a valid WhatsApp or phone number and choose its country code from the list.",
  INVALID_INPUT: "Something in the form isn't right. Please check it and try again.",
  NOT_VERIFIED: "We can't confirm this developer right now, so we can't take your request from here.",
  RATE_LIMITED: "You've tried several times in a short while. Please wait a few minutes and try again.",
  GATE_REJECTED: "We couldn't process this request. Please try again.",
  TEMPORARY_FAILURE: "We couldn't save your details just now, so your request hasn't been sent. Please try again in a moment.",
  RETURNING_UNAVAILABLE: "We couldn't find your earlier details. Please enter your number again.",
} as const;

export type GateErrorCode = keyof typeof GATE_ERROR_MESSAGES;
