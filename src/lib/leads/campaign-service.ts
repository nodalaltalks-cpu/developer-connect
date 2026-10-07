import { LeadNotFoundError, LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { buildAcquisitionReport, type AcquisitionReport, type AttributionBasis } from "./acquisition.ts";
import type { LeadRepositories } from "./repository.ts";
import type { Campaign, CampaignStatus, LeadActor } from "./types.ts";

/**
 * Campaigns and the acquisition report. Framework-free; Founder only. A campaign is a named marketing effort tied to
 * ONE utm_campaign tag (unique, case-insensitive - the database enforces it too), which is how a lead is attributed to it
 * without any double counting. Spend is not recorded here (see the finance phase); nothing in this module invents it.
 */

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = ["ACTIVE", "PAUSED", "ENDED"];
export const MAX_REPORT_LEADS = 20_000;

export interface CampaignInput {
  name: string;
  utmCampaign: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  landingPage?: string | null;
  /** YYYY-MM-DD */
  startDate?: string | null;
  endDate?: string | null;
  status?: CampaignStatus;
}

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required to manage campaigns.");
}

function text(field: string, value: unknown, max: number, required = false): string | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    if (required) throw new LeadValidationError(field, `Enter the ${field}.`);
    return null;
  }
  if (typeof value !== "string") throw new LeadValidationError(field, `The ${field} must be text.`);
  const t = value.trim();
  if (t.length > max) throw new LeadValidationError(field, `The ${field} is too long (max ${max} characters).`);
  return t;
}

function date(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) throw new LeadValidationError(field, `Choose a valid ${field}.`);
  return value;
}

function validate(input: CampaignInput) {
  const utmCampaign = text("utm campaign tag", input.utmCampaign, 80, true)!;
  if (!/^[A-Za-z0-9._~-]+$/.test(utmCampaign)) throw new LeadValidationError("utm campaign tag", "Use letters, numbers, dots, dashes and underscores only (the tag as it appears in the link).");
  const landing = text("landing page", input.landingPage, 120);
  if (landing && !landing.startsWith("/")) throw new LeadValidationError("landing page", "Enter the page path, starting with /.");
  if (landing && /^\/\//.test(landing)) throw new LeadValidationError("landing page", "Enter a path on this site, not a web address.");
  const startDate = date("start date", input.startDate);
  const endDate = date("end date", input.endDate);
  if (startDate && endDate && endDate < startDate) throw new LeadValidationError("end date", "The end date cannot be before the start date.");
  const status = input.status ?? "ACTIVE";
  if (!CAMPAIGN_STATUSES.includes(status)) throw new LeadValidationError("status", "Choose active, paused or ended.");
  return { name: text("name", input.name, 120, true)!, utmCampaign, utmSource: text("source", input.utmSource, 60), utmMedium: text("medium", input.utmMedium, 60), landingPage: landing, startDate, endDate, status };
}

export async function createCampaign(repos: LeadRepositories, input: CampaignInput, actor: LeadActor, now: Date = new Date()): Promise<Campaign> {
  assertFounder(actor);
  return repos.campaigns.create({ ...validate(input), createdBy: actor.actorId, now });
}

export async function updateCampaign(repos: LeadRepositories, campaignId: string, input: Partial<CampaignInput>, actor: LeadActor, now: Date = new Date()): Promise<Campaign> {
  assertFounder(actor);
  const existing = typeof campaignId === "string" ? await repos.campaigns.getById(campaignId) : null;
  if (!existing) throw new LeadNotFoundError("Campaign not found.");
  // The UTM tag is the attribution key: changing it would silently re-attribute history, so it is fixed once created.
  if (input.utmCampaign !== undefined && input.utmCampaign.trim().toLowerCase() !== existing.utmCampaign.toLowerCase()) throw new LeadValidationError("utm campaign tag", "The tag cannot be changed once created. Create a new campaign instead.");
  const merged = validate({
    name: input.name ?? existing.name,
    utmCampaign: existing.utmCampaign,
    utmSource: input.utmSource === undefined ? existing.utmSource : input.utmSource,
    utmMedium: input.utmMedium === undefined ? existing.utmMedium : input.utmMedium,
    landingPage: input.landingPage === undefined ? existing.landingPage : input.landingPage,
    startDate: input.startDate === undefined ? existing.startDate : input.startDate,
    endDate: input.endDate === undefined ? existing.endDate : input.endDate,
    status: input.status ?? existing.status,
  });
  const { utmCampaign: _tag, ...patch } = merged;
  void _tag;
  return repos.campaigns.update(campaignId, patch, now);
}

export async function listCampaigns(repos: LeadRepositories, actor: LeadActor): Promise<Campaign[]> {
  assertFounder(actor);
  return repos.campaigns.list(200);
}

/** The Founder's acquisition report for leads CREATED in [from, to). Read-only. */
export async function getAcquisitionReport(repos: LeadRepositories, actor: LeadActor, range: { from: Date; to: Date }, basis: AttributionBasis = "first"): Promise<AcquisitionReport> {
  assertFounder(actor);
  if (basis !== "first" && basis !== "latest") throw new LeadValidationError("basis", "Choose first touch or latest touch.");
  const [rows, campaigns] = await Promise.all([repos.leads.acquisitionRows({ from: range.from, to: range.to, limit: MAX_REPORT_LEADS + 1 }), repos.campaigns.list(500)]);
  const truncated = rows.length > MAX_REPORT_LEADS;
  return buildAcquisitionReport(truncated ? rows.slice(0, MAX_REPORT_LEADS) : rows, campaigns.map((c) => ({ id: c.id, name: c.name, utmCampaign: c.utmCampaign })), basis, truncated);
}
