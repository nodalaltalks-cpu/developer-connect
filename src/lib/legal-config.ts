/**
 * Single source of truth for the facts the four legal pages (Privacy,
 * Terms, Cookies, Disclaimer) all need — so updating a contact address or
 * a "last updated" date happens in exactly one place, not four.
 *
 * IMPORTANT — what's deliberately NOT here:
 * No legal entity name, registered office/address, company registration
 * number, GST/VAT/TRN number, Data Protection Officer, UAE licence,
 * grievance officer, or governing-law jurisdiction is set below. None of
 * that information exists anywhere else in this codebase either — it was
 * never invented for this task, per explicit instruction. Every page
 * that would normally state one of these facts instead uses
 * LEGAL_ENTITY_PLACEHOLDER / GOVERNING_LAW_PLACEHOLDER, visibly marked as
 * pending Founder/legal-counsel input rather than silently omitted or
 * guessed. See the Part B report for the full list of what's missing.
 */

export const LEGAL_CONFIG = {
  productName: "Developer Connects",
  /**
   * The only real, currently-known contact channel in this codebase (see
   * site-footer.tsx, contact page). Used for both general contact AND
   * privacy/data requests until a dedicated privacy@ address exists —
   * changing that later is a one-line edit here, not a rewrite of four
   * pages.
   */
  contactEmail: "nodalaltalks02@gmail.com",
  privacyEmail: "nodalaltalks02@gmail.com",
  /**
   * Update this single constant whenever any of the four legal pages'
   * substance changes — every page reads it, so there is no risk of one
   * page quietly going stale while the others are updated.
   */
  lastUpdated: "2026-09-15",
} as const;

/** Shown verbatim wherever a legal entity name/registered office/registration number would normally appear — never replaced with an invented value. */
export const LEGAL_ENTITY_PLACEHOLDER =
  "[Legal entity name, registered office, and registration details to be confirmed]";

/** Shown wherever a specific governing-law/jurisdiction clause would normally appear — never guessed from where the founder happens to be, since applicability depends on the actual (not yet finalized) contracting entity. */
export const GOVERNING_LAW_PLACEHOLDER =
  "[Governing law and jurisdiction to be confirmed once the contracting legal entity is finalized]";
