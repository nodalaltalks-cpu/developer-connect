/**
 * Projects the paid campaigns send visitors to. ONE list, written by hand from the developer's own published material
 * and the MahaRERA record, so a landing page can never say more than the founder has checked.
 *
 * A project is added here only once the founder has: (1) the MahaRERA registration number, (2) the developer's written
 * permission to advertise it, (3) the price sheet and possession date as published. Until the list has an entry, every
 * /project/<slug> address is a 404, and nothing can go live by accident.
 */

export interface CampaignProject {
  /** The address: /project/<slug>. Lower-case words and digits joined by hyphens. */
  slug: string;
  name: string;
  developer: string;
  /** e.g. "Kandivali West". Always Mumbai in this version. */
  locality: string;
  /** MahaRERA registration number, "P" followed by 11 digits. Shown on the page and required in every ad. */
  reraNumber: string;
  /** Plain text exactly as published, e.g. "2 and 3 BHK". */
  configurations: string;
  /** Plain text exactly as published, e.g. "From ₹1.45 Cr (price sheet dated 10 Oct)". Omit when not published. */
  priceNote?: string;
  /** Possession date as registered with MahaRERA, e.g. "December 2027". */
  possession: string;
  /** 3 to 5 short, factual, checkable points. No superlatives, no guarantees. */
  highlights: readonly string[];
  /** ISO date the facts above were last checked against the developer's material and MahaRERA. */
  factsCheckedOn: string;
  /** Set false to take the page down without deleting the entry. */
  active: boolean;
}

export const CAMPAIGN_PROJECTS: readonly CampaignProject[] = [];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RERA = /^P\d{11}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Claims this brand never makes about itself or a project (the same spirit as the SEO copy rules). */
const BANNED = [/\bverified\b/i, /\bguarantee/i, /\bbest\b/i, /\bno\.?\s?1\b/i, /#\s?1\b/, /\bzero (?:brokerage|fees?)\b/i, /\b0%/, /\bbrokerage\b/i, /\bbroker\b/i, /\blast (?:few|chance)\b/i, /\bhurry\b/i];

/** Every problem with an entry, in plain words. An empty list means the entry is safe to publish. */
export function validateCampaignProject(p: CampaignProject): string[] {
  const problems: string[] = [];
  if (!SLUG.test(p.slug)) problems.push("slug must be lower-case words joined by hyphens");
  for (const [field, value] of [["name", p.name], ["developer", p.developer], ["locality", p.locality], ["configurations", p.configurations], ["possession", p.possession]] as const) {
    if (!value.trim()) problems.push(`${field} is required`);
  }
  if (!RERA.test(p.reraNumber)) problems.push("reraNumber must look like P51800012345 (P and 11 digits)");
  if (p.highlights.length < 3 || p.highlights.length > 5) problems.push("highlights must have 3 to 5 points");
  if (!ISO_DATE.test(p.factsCheckedOn)) problems.push("factsCheckedOn must be an ISO date (YYYY-MM-DD)");
  const text = [p.name, p.developer, p.locality, p.configurations, p.priceNote ?? "", p.possession, ...p.highlights].join("\n");
  for (const banned of BANNED) if (banned.test(text)) problems.push(`copy must not contain ${banned}`);
  return problems;
}

/** The live project for an address, or undefined (unknown, switched off, or failing validation: all become a 404). */
export function getCampaignProject(slug: string, list: readonly CampaignProject[] = CAMPAIGN_PROJECTS): CampaignProject | undefined {
  const found = list.find((p) => p.slug === slug && p.active);
  return found && validateCampaignProject(found).length === 0 ? found : undefined;
}

/** The utm_campaign tag for one project and one channel, e.g. campaignTag("Park Avenue", "google", "search") = "park-avenue_google_search". */
export function campaignTag(projectName: string, channel: "google" | "meta", kind: string): string {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return [words(projectName), channel, words(kind)].filter(Boolean).join("_");
}
