import type { CleanTouch } from "./attribution.ts";
import type { CreationMethod, DigitalSource, Lead, LeadSourceType } from "./types.ts";

/**
 * WHERE A LEAD CAME FROM — kept separate from how it is contacted. A lead is either DIGITAL (it found us: website, an
 * ad, a referral...) or SELF_GENERATED (we found it: an imported list, cold calling, created by hand). The
 * internal-dialer calls made to it never change that classification: a self-generated lead called through the dialer
 * is still self-generated, and a digital lead called through the dialer is still digital. Pure, framework-free.
 */

const SEARCH_ENGINES = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|baidu|yandex)\./i;

/** Classifies a website lead from its first attribution touch. Evidence only: with none, it is plain WEBSITE. */
export function classifyDigitalSource(touch: Pick<CleanTouch, "gclid" | "fbclid" | "utmSource" | "utmMedium" | "referrer"> | null): DigitalSource {
  if (!touch) return "WEBSITE";
  const source = (touch.utmSource ?? "").toLowerCase();
  const medium = (touch.utmMedium ?? "").toLowerCase();
  if (touch.gclid || /google|adwords/.test(source)) return "GOOGLE";
  if (touch.fbclid || /facebook|instagram|^fb$|^ig$|meta/.test(source)) return "META";
  if (medium === "referral" || /referral|partner/.test(source)) return "REFERRAL";
  if (touch.referrer) {
    // A search-engine referrer with no ad click id is organic search; any other referring site is a referral.
    return SEARCH_ENGINES.test(touch.referrer) ? "ORGANIC" : "REFERRAL";
  }
  if (source) return "OTHER_DIGITAL";
  return "WEBSITE";
}

const SOURCE_TYPE_LABEL: Record<LeadSourceType, string> = { DIGITAL: "Digital", SELF_GENERATED: "Self-generated" };

const CREATION_LABEL: Record<CreationMethod, string> = {
  WEBSITE_GATE: "Website",
  CSV_IMPORT: "CSV import",
  EXCEL_IMPORT: "Excel import",
  COLD_CALLING: "Cold calling",
  EMPLOYEE_CREATED: "Added by employee",
  FOUNDER_CREATED: "Added by Founder",
  DIALER_GENERATED: "Dialer-generated",
};

const DIGITAL_LABEL: Record<DigitalSource, string> = {
  WEBSITE: "Website",
  GOOGLE: "Google",
  META: "Meta",
  REFERRAL: "Referral",
  ORGANIC: "Organic search",
  OTHER_DIGITAL: "Other digital",
};

/** "Digital · Google" / "Self-generated · Excel import" — the lead source only, never the calls. */
export function leadSourceLabel(lead: Pick<Lead, "sourceType" | "sourceDetail" | "creationMethod">): string {
  const base = SOURCE_TYPE_LABEL[lead.sourceType];
  if (lead.sourceType === "DIGITAL") {
    const detail = lead.sourceDetail ? (DIGITAL_LABEL[lead.sourceDetail as DigitalSource] ?? null) : null;
    return detail ? `${base} · ${detail}` : base;
  }
  return `${base} · ${CREATION_LABEL[lead.creationMethod as CreationMethod] ?? lead.creationMethod}`;
}
