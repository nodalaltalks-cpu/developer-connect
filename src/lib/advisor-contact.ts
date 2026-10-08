import type { Market } from "./hero-market.ts";

/**
 * THE one place the public advisor contact details and the pre-filled messages live. Every "Talk to an Advisor", WhatsApp, email
 * and call action on the public site is built here, so a number or address can never drift between pages.
 *
 * The numbers and the email address are the founder's explicitly approved public contact details. The pre-filled text uses ONLY
 * what the visitor can already see (the market, the developer, the project, the page title). No analytics id, session id, lead
 * id or anything else private is ever put in a message or a link.
 */

export const ADVISOR_NAME = "Ambish";

export const ADVISOR_CONTACT = {
  india: { market: "mumbai", label: "India", display: "+91 98337 50932", e164: "+919833750932", whatsappDigits: "919833750932" },
  uae: { market: "dubai", label: "UAE", display: "+971 50 890 2817", e164: "+971508902817", whatsappDigits: "971508902817" },
  email: "nodalaltalks@gmail.com",
  emailSubject: "Property Consultation — Developer Connects",
} as const;

export type AdvisorRegion = "india" | "uae";

export function regionForMarket(market: Market | null | undefined): AdvisorRegion {
  return market === "mumbai" ? "india" : "uae";
}

const CITY: Record<AdvisorRegion, string> = { india: "Mumbai", uae: "Dubai" };

/** What the visitor was looking at. Every field is optional and plain text the visitor can see on the page. */
export interface AdvisorContext {
  region: AdvisorRegion;
  developer?: string | null;
  project?: string | null;
  /** A guide or article title. */
  article?: string | null;
  /** Free-text place, e.g. "Thane". Defaults to the region's main city. */
  location?: string | null;
}

const MAX_FIELD = 80;
const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_FIELD);
  return text.length > 0 ? text : null;
};

/** The WhatsApp message, written in the founder's voice for the visitor to send. */
export function whatsappMessage(context: AdvisorContext): string {
  const project = clean(context.project);
  const developer = clean(context.developer);
  const article = clean(context.article);
  const place = clean(context.location) ?? CITY[context.region];
  if (project) return `Hi ${ADVISOR_NAME}, I was researching ${project} on Developer Connects and would like to understand whether it is suitable for me.`;
  if (developer) return `Hi ${ADVISOR_NAME}, I was researching ${developer} on Developer Connects and would like some guidance on a property in ${place}.`;
  if (article) return `Hi ${ADVISOR_NAME}, I was reading "${article}" on Developer Connects and would like some guidance on a property in ${place}.`;
  return `Hi ${ADVISOR_NAME}, I was researching property on Developer Connects and would like some guidance on a property in ${place}.`;
}

export function whatsappHref(context: AdvisorContext): string {
  const region = ADVISOR_CONTACT[context.region];
  return `https://wa.me/${region.whatsappDigits}?text=${encodeURIComponent(whatsappMessage(context))}`;
}

export function emailBody(context: AdvisorContext): string {
  const place = clean(context.location) ?? CITY[context.region];
  const project = clean(context.project) ?? clean(context.developer) ?? "";
  return [
    `Hi ${ADVISOR_NAME},`,
    "",
    "I was researching property on Developer Connects and would like some guidance.",
    "",
    `Location: ${place}`,
    `Project: ${project}`,
    "Budget: ",
    "Requirement: ",
    "",
    "Regards,",
  ].join("\n");
}

export function mailtoHref(context: AdvisorContext): string {
  return `mailto:${ADVISOR_CONTACT.email}?subject=${encodeURIComponent(ADVISOR_CONTACT.emailSubject)}&body=${encodeURIComponent(emailBody(context))}`;
}

export function callHref(region: AdvisorRegion): string {
  return `tel:${ADVISOR_CONTACT[region].e164}`;
}

/** Context from the address alone, for pages that did not set anything richer. Only the visible market is inferred. */
export function contextFromPath(pathname: string, market: Market | null): AdvisorContext {
  const lower = pathname.toLowerCase();
  const region: AdvisorRegion = lower.includes("mumbai") ? "india" : lower.includes("dubai") ? "uae" : regionForMarket(market);
  return { region };
}
