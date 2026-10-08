import type { Lead } from "./types.ts";

/**
 * CONTACT BASIS: what we can FACTUALLY say about why we hold this person's number and whether they agreed to be contacted.
 *
 * This never invents consent. A lead is CONSENTED only when a consent record exists and has not been withdrawn; it is
 * NOT_CONSENTED only when that consent was withdrawn; with no record at all it is UNKNOWN - for a website lead and a cold-call
 * lead alike. A cold-called or imported lead has not asked to be contacted, and this module never says or implies that they
 * did. It also makes no claim about legal compliance: that is a question for the business and its counsel. The
 * `basis` is simply how the number was obtained, read from the immutable creation record.
 *
 * Pure and framework-free.
 */

export type ConsentStatus = "CONSENTED" | "NOT_CONSENTED" | "UNKNOWN" | "NOT_APPLICABLE";

export type ContactBasis = "WEBSITE_ENQUIRY" | "OUTBOUND_COLD_CALL" | "IMPORTED_LIST" | "REFERRAL" | "ADDED_BY_TEAM_MEMBER";

export interface ConsentFacts {
  /** A consent record was given for this lead. */
  given: boolean;
  /** That consent was later withdrawn. */
  withdrawn: boolean;
}

export interface ContactBasisView {
  consent: ConsentStatus;
  basis: ContactBasis;
  /** One plain sentence for the lead page. Factual only. */
  statement: string;
}

export function contactBasisOf(lead: Pick<Lead, "sourceType" | "creationMethod" | "erasedAt">, consent: ConsentFacts | null): ContactBasisView {
  const basis: ContactBasis =
    lead.sourceType === "DIGITAL" ? "WEBSITE_ENQUIRY"
    : lead.creationMethod === "CSV_IMPORT" || lead.creationMethod === "EXCEL_IMPORT" ? "IMPORTED_LIST"
    : lead.creationMethod === "REFERRAL_CREATED" ? "REFERRAL"
    : lead.creationMethod === "DIALER_GENERATED" || lead.creationMethod === "COLD_CALLING" ? "OUTBOUND_COLD_CALL"
    : "ADDED_BY_TEAM_MEMBER";

  if (lead.erasedAt) return { consent: "NOT_APPLICABLE", basis, statement: "This lead's personal data has been erased." };
  if (consent?.given && consent.withdrawn) return { consent: "NOT_CONSENTED", basis, statement: "They withdrew their consent to be contacted." };
  if (consent?.given) return { consent: "CONSENTED", basis, statement: "They agreed to be contacted when they shared their details on the website." };

  const how: Record<ContactBasis, string> = {
    WEBSITE_ENQUIRY: "This lead came from the website, but no consent record is held for it.",
    OUTBOUND_COLD_CALL: "This lead was added through a cold call. No consent record is held, and nothing here says they agreed to be contacted.",
    IMPORTED_LIST: "This lead came from an imported list. No consent record is held, and nothing here says they agreed to be contacted.",
    REFERRAL: "This lead was added from a referral. No consent record is held.",
    ADDED_BY_TEAM_MEMBER: "This lead was added by a team member. No consent record is held.",
  };
  return { consent: "UNKNOWN", basis, statement: how[basis] };
}
