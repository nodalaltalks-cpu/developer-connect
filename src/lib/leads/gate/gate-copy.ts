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
 *  4. after submitting, they continue to the verified official website.
 *
 * What it must never do: imply the developer requires the number, use
 * urgency or scarcity, hide the purpose, or offer a misleading button label.
 * Tests enforce both lists.
 */

export interface GateCopy {
  title: string;
  intro: string;
  /** The transparency statement — who is asking, who is not, and why. */
  transparency: string;
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
  successContinue: string;
  popupHelp: string;
}

export function gateCopy(developerName: string, domain: string, preference: GateContactPreference = "WHATSAPP"): GateCopy {
  const channelWords = preference === "WHATSAPP" ? "on WhatsApp" : "by phone call";
  return {
    title: `Looking for a property from ${developerName}?`,
    intro: "Get personalised property assistance from Developer Connects before you visit the developer's website.",
    transparency:
      `${developerName} does not need your phone number to view its website. ` +
      "You're choosing to share your details with Developer Connects, so our property team can help you explore " +
      "suitable properties, configurations and next steps.",
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
    submit: "Continue to official website",
    submitHint: `Opens ${domain} in a new tab`,
    submitting: "Saving your details…",
    close: "Close",
    verifiedNote: `${domain} is the official website Developer Connects has verified for ${developerName}.`,
    returningTitle: "Welcome back",
    returningBody: `We'll keep helping you ${channelWords}. Continue to ${developerName}'s official website with the details you shared earlier?`,
    returningContinue: "Continue to official website",
    useDifferentNumber: "Use a different number",
    errorTitle: "We couldn't save your details",
    validationTitle: "Please check your details",
    retry: "Try again",
    successTitle: "Thank you — your details are saved",
    successBody: `Your property enquiry has been received. Continue to ${developerName}'s official website below.`,
    successContinue: "Continue to official website",
    popupHelp: "Your browser blocked the new tab. Use the button below to open the website.",
  };
}

/** Error messages by code, shown to the buyer. None blames the buyer or suggests skipping the gate. */
export const GATE_ERROR_MESSAGES = {
  INVALID_PHONE: "Please enter a valid WhatsApp or phone number, including the country code if it isn't an Indian or UAE number.",
  INVALID_INPUT: "Something in the form isn't right. Please check it and try again.",
  NOT_VERIFIED: "We can't confirm an official website for this developer right now, so we can't open it from here.",
  RATE_LIMITED: "You've tried several times in a short while. Please wait a few minutes and try again.",
  GATE_REJECTED: "We couldn't process this request. Please try again.",
  TEMPORARY_FAILURE: "We couldn't save your details just now, so we haven't opened the website. Please try again in a moment.",
  RETURNING_UNAVAILABLE: "We couldn't find your earlier details. Please enter your number again.",
} as const;

export type GateErrorCode = keyof typeof GATE_ERROR_MESSAGES;
