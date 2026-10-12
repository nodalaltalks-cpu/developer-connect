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
  buyerPromise: string;
  phoneLabel: string;
  phoneHelp: string;
  countryLabel: string;
  nameLabel: string;
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
 * The commission policy, stated once and used word for word on the Privacy Policy, Disclaimer, FAQ and the buy-direct guides:
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
export const BUYER_PROMISE = "0% commission on primary (new-launch) sales and 0% bias. On secondary (resale) and rental deals, commission is applicable as per market standards. Our guidance is tailored to your needs: your budget, location, configuration and timeline.";
export const CREDENTIALS_LINE = `Developer Connects is a certified, affiliated channel partner and RERA registered${RERA_NUMBER ? ` (RERA No. ${RERA_NUMBER})` : ""}.`;

export function gateCopy(developerName: string, preference: GateContactPreference = "WHATSAPP"): GateCopy {
  const channelWords = preference === "WHATSAPP" ? "on WhatsApp" : "by phone call";
  return {
    title: `Connect with ${developerName}`,
    intro:
      "You've found the developer you're interested in. Share your details with Developer Connects and we'll help connect you based on your requirement.",
    buyerPromise: `${BUYER_PROMISE} ${CREDENTIALS_LINE}`,
    phoneLabel: "Your WhatsApp or phone number",
    phoneHelp: "We'll use this to reach you about your enquiry — nothing else.",
    countryLabel: "Country code",
    nameLabel: "Your name (optional)",
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
  INVALID_PHONE: "Please enter a valid WhatsApp or phone number, including the country code if it isn't an Indian or UAE number.",
  INVALID_INPUT: "Something in the form isn't right. Please check it and try again.",
  NOT_VERIFIED: "We can't confirm this developer right now, so we can't take your request from here.",
  RATE_LIMITED: "You've tried several times in a short while. Please wait a few minutes and try again.",
  GATE_REJECTED: "We couldn't process this request. Please try again.",
  TEMPORARY_FAILURE: "We couldn't save your details just now, so your request hasn't been sent. Please try again in a moment.",
  RETURNING_UNAVAILABLE: "We couldn't find your earlier details. Please enter your number again.",
} as const;

export type GateErrorCode = keyof typeof GATE_ERROR_MESSAGES;
