import { classifyDigitalSource } from "./lead-source.ts";
import type { LeadSourceType } from "./types.ts";

/**
 * THE ACQUISITION ENGINE'S RULES - pure, framework-free, no database. Answers "where did this lead come from, and what
 * did it become?" from evidence only.
 *
 *  - FIRST TOUCH IS NEVER OVERWRITTEN (touches are immutable rows; the lead's first-touch pointer is set once - and a
 *    database trigger refuses to change it). LATEST TOUCH may change. Reports can be read on either basis.
 *  - A channel is named only when the evidence supports it: a click id, a UTM tag, or a referring site. With none of
 *    those the lead is "Direct / unknown" - we do not claim it was typed in, only that we cannot tell.
 *  - Self-generated leads (CSV import, cold calling, created by hand) are their own channels, never "digital".
 *  - A lead belongs to AT MOST ONE campaign: the campaign whose UTM tag (utm_campaign, compared case-insensitively)
 *    matches the chosen touch. A tag with no campaign defined is shown as "Untracked tag", never silently dropped or
 *    merged into another campaign.
 */

export const ACQUISITION_CHANNELS = ["GOOGLE_ADS", "META", "INSTAGRAM", "WHATSAPP", "REFERRAL", "ORGANIC_SEARCH", "OTHER_DIGITAL", "DIRECT_OR_UNKNOWN", "CSV_IMPORT", "COLD_CALLING", "SELF_GENERATED_OTHER"] as const;
export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

export const CHANNEL_LABEL: Record<AcquisitionChannel, string> = {
  GOOGLE_ADS: "Google",
  META: "Meta (Facebook)",
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  REFERRAL: "Referral",
  ORGANIC_SEARCH: "Organic search",
  OTHER_DIGITAL: "Other digital",
  DIRECT_OR_UNKNOWN: "Direct / unknown",
  CSV_IMPORT: "CSV import",
  COLD_CALLING: "Cold calling",
  SELF_GENERATED_OTHER: "Self-generated (other)",
};

export interface TouchEvidence {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer: string | null;
  landingPath: string | null;
}

/** One lead as the acquisition report sees it. Contains no phone, email or name. */
export interface AcquisitionRow {
  leadId: string;
  createdAt: Date;
  sourceType: LeadSourceType;
  creationMethod: string;
  first: TouchEvidence | null;
  latest: TouchEvidence | null;
  /** The lead has EVER reached QUALIFIED or later (from its history, so a later loss does not erase it). */
  reachedQualified: boolean;
  hasSiteVisit: boolean;
  booked: boolean;
  /** Its BOOKED bookings, each in its own currency (never summed across currencies). No buyer data. */
  bookings: AcquisitionBooking[];
}

export interface AcquisitionBooking {
  currency: "INR" | "AED";
  bookingValue: number;
  commissionExpected: number;
  commissionReceived: number;
  projectId: string | null;
  projectName: string | null;
}

export type AttributionBasis = "first" | "latest";

export function channelOf(row: Pick<AcquisitionRow, "sourceType" | "creationMethod" | "first" | "latest">, basis: AttributionBasis = "first"): AcquisitionChannel {
  if (row.sourceType === "SELF_GENERATED") {
    if (row.creationMethod === "CSV_IMPORT" || row.creationMethod === "EXCEL_IMPORT") return "CSV_IMPORT";
    if (row.creationMethod === "COLD_CALLING") return "COLD_CALLING";
    return "SELF_GENERATED_OTHER";
  }
  const touch = basis === "latest" ? (row.latest ?? row.first) : row.first;
  if (!touch) return "DIRECT_OR_UNKNOWN";
  const source = (touch.utmSource ?? "").toLowerCase();
  const referrer = (touch.referrer ?? "").toLowerCase();
  if (/(^|[^a-z])(instagram|ig)([^a-z]|$)/.test(source) || /instagram\.com/.test(referrer)) return "INSTAGRAM";
  if (/whatsapp|wa\.me|(^|[^a-z])wa([^a-z]|$)/.test(source) || /wa\.me|whatsapp\.com|l\.wl\.co/.test(referrer)) return "WHATSAPP";
  switch (classifyDigitalSource(touch)) {
    case "GOOGLE":
      return "GOOGLE_ADS";
    case "META":
      return "META";
    case "REFERRAL":
      return "REFERRAL";
    case "ORGANIC":
      return "ORGANIC_SEARCH";
    case "OTHER_DIGITAL":
      return "OTHER_DIGITAL";
    default:
      return "DIRECT_OR_UNKNOWN";
  }
}

export interface CampaignDef {
  id: string;
  name: string;
  /** The utm_campaign value that identifies it (compared case-insensitively). */
  utmCampaign: string;
}

export const NO_CAMPAIGN = "NO_TAG";

/** The campaign key for a lead on the chosen basis: a defined campaign id, `tag:<value>` for an undefined tag, or NO_TAG. */
export function campaignKeyOf(row: Pick<AcquisitionRow, "first" | "latest">, byTag: Map<string, CampaignDef>, basis: AttributionBasis = "first"): string {
  const touch = basis === "latest" ? (row.latest ?? row.first) : row.first;
  const tag = touch?.utmCampaign?.trim().toLowerCase();
  if (!tag) return NO_CAMPAIGN;
  const def = byTag.get(tag);
  return def ? def.id : `tag:${tag}`;
}

/** Path only (no query string, no host), lower-cased, so the same page groups together. null when unknown. */
export function landingPageOf(row: Pick<AcquisitionRow, "first" | "latest">, basis: AttributionBasis = "first"): string | null {
  const touch = basis === "latest" ? (row.latest ?? row.first) : row.first;
  const raw = touch?.landingPath;
  if (!raw) return null;
  const path = raw.split(/[?#]/)[0].trim().toLowerCase();
  return path ? path.slice(0, 120) : null;
}

export interface AcquisitionMetrics {
  leads: number;
  qualified: number;
  siteVisits: number;
  booked: number;
  /** qualified / leads; null when there are no leads (never a made-up 0%). */
  qualifiedRate: number | null;
  bookedRate: number | null;
}

export interface AcquisitionGroup extends AcquisitionMetrics {
  key: string;
  label: string;
}

function metricsOf(rows: readonly AcquisitionRow[]): AcquisitionMetrics {
  const leads = rows.length;
  const qualified = rows.filter((r) => r.reachedQualified).length;
  const booked = rows.filter((r) => r.booked).length;
  return {
    leads,
    qualified,
    siteVisits: rows.filter((r) => r.hasSiteVisit).length,
    booked,
    qualifiedRate: leads > 0 ? qualified / leads : null,
    bookedRate: leads > 0 ? booked / leads : null,
  };
}

function group(rows: readonly AcquisitionRow[], keyOf: (r: AcquisitionRow) => string, labelOf: (key: string) => string): AcquisitionGroup[] {
  const by = new Map<string, AcquisitionRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = by.get(k);
    if (list) list.push(r);
    else by.set(k, [r]);
  }
  return [...by.entries()].map(([key, list]) => ({ key, label: labelOf(key), ...metricsOf(list) })).sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label));
}

export interface AcquisitionReport {
  basis: AttributionBasis;
  totals: AcquisitionMetrics;
  byChannel: AcquisitionGroup[];
  byCampaign: AcquisitionGroup[];
  byLandingPage: AcquisitionGroup[];
  /** True when the row cap was hit: the report covers the most recent leads only, and says so. */
  truncated: boolean;
}

/** Pure aggregation. Every lead is counted exactly once in each grouping (one channel, one campaign key, one landing page). */
export function buildAcquisitionReport(rows: readonly AcquisitionRow[], campaigns: readonly CampaignDef[], basis: AttributionBasis, truncated = false): AcquisitionReport {
  const byTag = new Map(campaigns.map((c) => [c.utmCampaign.trim().toLowerCase(), c]));
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  return {
    basis,
    totals: metricsOf(rows),
    byChannel: group(rows, (r) => channelOf(r, basis), (k) => CHANNEL_LABEL[k as AcquisitionChannel]),
    byCampaign: group(rows, (r) => campaignKeyOf(r, byTag, basis), (k) => (k === NO_CAMPAIGN ? "No campaign tag" : k.startsWith("tag:") ? `Untracked tag: ${k.slice(4)}` : (names.get(k) ?? "Campaign")))
      .slice(0, 50),
    byLandingPage: group(rows, (r) => landingPageOf(r, basis) ?? "unknown", (k) => (k === "unknown" ? "Unknown landing page" : k)).slice(0, 50),
    truncated,
  };
}
