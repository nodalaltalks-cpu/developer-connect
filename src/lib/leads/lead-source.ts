import type { CleanTouch } from "./attribution.ts";
import type { CreationMethod, DigitalSource, Lead, LeadSourceType } from "./types.ts";

/**
 * WHERE A LEAD CAME FROM — kept separate from how it is contacted. A lead is either DIGITAL (it found us: website, an
 * ad, a referral...) or COLD_CALL (we found it: an imported list, cold calling, created by hand). The
 * internal-dialer calls made to it never change that classification: a self-generated lead called through the dialer
 * is still self-generated, and a digital lead called through the dialer is still digital. Pure, framework-free.
 */

const SEARCH_ENGINES = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|baidu|yandex)\./i;

/** Classifies a website lead from its first attribution touch. Evidence only: with none, it is plain WEBSITE. */
export function classifyDigitalSource(touch: Pick<CleanTouch, "gclid" | "fbclid" | "utmSource" | "utmMedium" | "referrer"> & { utmCampaign?: string | null } | null): DigitalSource {
  if (!touch) return "WEBSITE";
  const source = (touch.utmSource ?? "").toLowerCase();
  const medium = (touch.utmMedium ?? "").toLowerCase();
  const referrer = (touch.referrer ?? "").toLowerCase();
  if (touch.gclid || /google|adwords/.test(source)) return "GOOGLE";
  // Instagram is checked before Meta: an Instagram ad also carries Meta's click id, but the channel is Instagram.
  if (/instagram|^ig$/.test(source) || /(^|\.)instagram\.com/.test(referrer)) return "INSTAGRAM";
  if (touch.fbclid || /facebook|^fb$|meta/.test(source)) return "META";
  if (/youtube|^yt$/.test(source) || /(^|\.)(youtube\.com|youtu\.be)/.test(referrer)) return "YOUTUBE";
  if (/whatsapp|^wa$/.test(source) || medium === "whatsapp" || /(^|\.)(wa\.me|whatsapp\.com)/.test(referrer)) return "WHATSAPP";
  if (medium === "referral" || /referral|partner/.test(source)) return "REFERRAL";
  if (touch.referrer) {
    // A search-engine referrer with no ad click id is organic search; any other referring site is a referral.
    return SEARCH_ENGINES.test(touch.referrer) ? "ORGANIC" : "REFERRAL";
  }
  if (source) return "OTHER_DIGITAL";
  // A campaign tag with no recognisable source is still a campaign visit.
  if (touch.utmCampaign) return "CAMPAIGN";
  return "WEBSITE";
}

const SOURCE_TYPE_LABEL: Record<LeadSourceType, string> = { DIGITAL: "Digital", COLD_CALL: "Cold call" };

const CREATION_LABEL: Record<CreationMethod, string> = {
  WEBSITE_GATE: "Website",
  CSV_IMPORT: "CSV import",
  EXCEL_IMPORT: "Excel import",
  COLD_CALLING: "Cold calling",
  EMPLOYEE_CREATED: "Added by employee",
  FOUNDER_CREATED: "Added by Founder",
  DIALER_GENERATED: "Manual dial",
  REFERRAL_CREATED: "Referral",
};

const DIGITAL_LABEL: Record<DigitalSource, string> = {
  WEBSITE: "Website",
  GOOGLE: "Google",
  META: "Meta",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  WHATSAPP: "WhatsApp",
  REFERRAL: "Referral",
  ORGANIC: "Organic search",
  CAMPAIGN: "Campaign",
  OTHER_DIGITAL: "Other",
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
