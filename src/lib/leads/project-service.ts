import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "./errors.ts";
import { guardLeadAction } from "./follow-up-service.ts";
import { assertWorkingActor, canViewLead } from "./lead-access.ts";
import { advanceLeadStatus } from "./pipeline.ts";
import { matchRequirementToProject, rankMatches, type ProjectMatch } from "./project-matching.ts";
import type { LeadRepositories } from "./repository.ts";
import { LEAD_CURRENCIES, type Lead, type LeadActor, type LeadCurrency, type LeadRequirement, type Project, type ShortlistEntry } from "./types.ts";

/**
 * Projects (Founder-maintained inventory), explainable matching and the buyer's shortlist. Framework-free;
 * authorization is enforced HERE.
 *
 *  - Creating or editing a PROJECT is Founder-only: team members never invent inventory (rule: no invented capability).
 *  - Reading matches and shortlisting is for the Founder (any lead) or the team member who owns the lead
 *    (SHORTLIST_PROJECT), subject to the missed-follow-up rule like every other team action.
 *  - Matching is explainable (see project-matching.ts) and never a score.
 *  - Shortlist history is kept: removing marks the entry removed; the buyer can be shortlisted again later.
 */

export const MAX_PROJECTS_SHOWN = 200;
const MAX_MONEY = 1_000_000_000_000;

export interface ProjectInput {
  developerId: string;
  name: string;
  city: string;
  locality?: string | null;
  propertyType?: string | null;
  configurations?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: LeadCurrency | null;
}

function assertFounder(actor: LeadActor): asserts actor is LeadActor & { actorType: "FOUNDER"; actorId: string } {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new UnauthorizedLeadActionError("Founder authorization required to manage projects.");
}

function text(field: string, value: unknown, max: number, required = false): string | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    if (required) throw new LeadValidationError(field, `Enter the ${field}.`);
    return null;
  }
  if (typeof value !== "string") throw new LeadValidationError(field, `The ${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new LeadValidationError(field, `The ${field} is too long (max ${max} characters).`);
  return trimmed;
}

function money(field: string, value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_MONEY) throw new LeadValidationError(field, `The ${field} must be a whole number of 0 or more.`);
  return value;
}

function validate(input: ProjectInput): Omit<Parameters<LeadRepositories["projects"]["create"]>[0], "createdBy" | "now"> {
  const configurations = (input.configurations ?? []).map((c) => text("configuration", c, 30)).filter((c): c is string => c !== null);
  if (configurations.length > 12) throw new LeadValidationError("configurations", "List at most 12 configurations.");
  const priceMin = money("minimum price", input.priceMin ?? null);
  const priceMax = money("maximum price", input.priceMax ?? null);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) throw new LeadValidationError("price", "The minimum price cannot be above the maximum.");
  const currency = input.currency ?? null;
  if (currency !== null && !(LEAD_CURRENCIES as readonly string[]).includes(currency)) throw new LeadValidationError("currency", "Choose INR or AED.");
  if ((priceMin !== null || priceMax !== null) && currency === null) throw new LeadValidationError("currency", "Choose the currency the price is in.");
  return {
    developerId: typeof input.developerId === "string" ? input.developerId : "",
    name: text("project name", input.name, 120, true)!,
    city: text("city", input.city, 80, true)!,
    locality: text("locality", input.locality, 80),
    propertyType: text("property type", input.propertyType, 60),
    configurations: [...new Set(configurations)],
    priceMin,
    priceMax,
    currency: priceMin === null && priceMax === null ? null : currency,
  };
}

export async function createProject(repos: LeadRepositories, input: ProjectInput, actor: LeadActor, now: Date = new Date()): Promise<Project> {
  assertFounder(actor);
  const clean = validate(input);
  const known = await repos.leads.developerNames([clean.developerId]);
  if (!known[clean.developerId]) throw new LeadValidationError("developer", "Choose a developer from the list.");
  return repos.projects.create({ ...clean, createdBy: actor.actorId, now });
}

export async function updateProject(repos: LeadRepositories, projectId: string, input: Partial<Omit<ProjectInput, "developerId">> & { status?: "ACTIVE" | "INACTIVE" }, actor: LeadActor, now: Date = new Date()): Promise<Project> {
  assertFounder(actor);
  const existing = await repos.projects.getById(projectId);
  if (!existing) throw new LeadNotFoundError("Project not found.");
  const merged = validate({
    developerId: existing.developerId,
    name: input.name ?? existing.name,
    city: input.city ?? existing.city,
    locality: input.locality === undefined ? existing.locality : input.locality,
    propertyType: input.propertyType === undefined ? existing.propertyType : input.propertyType,
    configurations: input.configurations ?? existing.configurations,
    priceMin: input.priceMin === undefined ? existing.priceMin : input.priceMin,
    priceMax: input.priceMax === undefined ? existing.priceMax : input.priceMax,
    currency: input.currency === undefined ? existing.currency : input.currency,
  });
  if (input.status !== undefined && input.status !== "ACTIVE" && input.status !== "INACTIVE") throw new LeadValidationError("status", "Choose active or inactive.");
  const { developerId: _developerId, ...patch } = merged;
  void _developerId;
  return repos.projects.update(projectId, { ...patch, ...(input.status ? { status: input.status } : {}) }, now);
}

export interface ProjectWithDeveloper {
  project: Project;
  developerName: string;
}

export async function listProjectsForFounder(repos: LeadRepositories, actor: LeadActor): Promise<ProjectWithDeveloper[]> {
  assertFounder(actor);
  const projects = await repos.projects.list({ activeOnly: false, limit: MAX_PROJECTS_SHOWN });
  const names = await repos.leads.developerNames([...new Set(projects.map((p) => p.developerId))]);
  return projects.map((project) => ({ project, developerName: names[project.developerId] ?? "Unknown developer" }));
}

// --- the buyer's view of projects -----------------------------------------------------------------

export interface ProjectMatchRow {
  project: Project;
  developerName: string;
  match: ProjectMatch;
  /** The active shortlist entry, if the buyer is shortlisted for this project. */
  shortlisted: ShortlistEntry | null;
}

export interface LeadProjectsView {
  requirement: LeadRequirement | null;
  matches: ProjectMatchRow[];
  /** The buyer's whole shortlist history (active and removed), oldest first, with the project it refers to. */
  history: Array<{ entry: ShortlistEntry; projectName: string; developerName: string }>;
}

async function viewableLead(repos: LeadRepositories, actor: LeadActor, leadId: string): Promise<Lead> {
  assertWorkingActor(actor);
  const lead = typeof leadId === "string" ? await repos.leads.getById(leadId) : null;
  if (!lead || !canViewLead(actor, lead)) throw new LeadNotFoundError("Lead not found.");
  return lead;
}

/** Matches for the buyer's active requirement against active projects, plus the shortlist history. Read-only. */
export async function getLeadProjects(repos: LeadRepositories, actor: LeadActor, leadId: string): Promise<LeadProjectsView> {
  const lead = await viewableLead(repos, actor, leadId);
  const [requirement, projects, entries] = await Promise.all([repos.requirements.getActiveByLead(lead.id), repos.projects.list({ activeOnly: true, limit: MAX_PROJECTS_SHOWN }), repos.shortlist.listByLead(lead.id)]);
  const allProjectIds = [...new Set([...projects.map((p) => p.id), ...entries.map((e) => e.projectId)])];
  const known = new Map(projects.map((p) => [p.id, p]));
  const missing = allProjectIds.filter((id) => !known.has(id));
  for (const id of missing) {
    const p = await repos.projects.getById(id);
    if (p) known.set(id, p);
  }
  const names = await repos.leads.developerNames([...new Set([...known.values()].map((p) => p.developerId))]);
  const developerName = (p: Project) => names[p.developerId] ?? "Unknown developer";
  const active = new Map(entries.filter((e) => e.removedAt === null).map((e) => [e.projectId, e]));

  const rows: ProjectMatchRow[] = requirement
    ? rankMatches(projects.map((project) => ({ project, developerName: developerName(project), match: matchRequirementToProject(requirement, project), shortlisted: active.get(project.id) ?? null })))
    : [];
  const history = entries.flatMap((entry) => {
    const p = known.get(entry.projectId);
    return p ? [{ entry, projectName: p.name, developerName: developerName(p) }] : [];
  });
  return { requirement, matches: rows, history };
}

export async function shortlistProject(repos: LeadRepositories, leadId: string, projectId: string, actor: LeadActor, now: Date = new Date()): Promise<ShortlistEntry> {
  assertWorkingActor(actor);
  return repos.transaction(async (tx) => {
    const lead = await tx.leads.getById(leadId);
    if (!lead) throw new LeadNotFoundError("Lead not found.");
    await guardLeadAction(tx, actor, lead, "SHORTLIST_PROJECT", now);
    if (lead.erasedAt) throw new LeadStateError("This lead's personal data has been erased.");
    const project = typeof projectId === "string" ? await tx.projects.getById(projectId) : null;
    if (!project) throw new LeadNotFoundError("Project not found.");
    if (project.status !== "ACTIVE") throw new LeadStateError("That project is not active, so it cannot be shortlisted.");
    const requirement = await tx.requirements.getActiveByLead(leadId);
    const entry = await tx.shortlist.add({ leadId, requirementId: requirement?.id ?? null, projectId, shortlistedBy: actor.actorId!, now });
    await tx.events.append({ leadId, eventType: "PROJECT_SHORTLISTED", actorType: actor.actorType, actorId: actor.actorId ?? null, developerId: null, fromStatus: null, toStatus: null, payload: { projectId, requirementId: requirement?.id ?? null }, createdAt: now });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
    await advanceLeadStatus(tx, (await tx.leads.getById(leadId))!, "SHORTLISTED", "PROJECT_SHORTLISTED", now);
    return entry;
  });
}

export async function removeFromShortlist(repos: LeadRepositories, leadId: string, entryId: string, actor: LeadActor, now: Date = new Date()): Promise<ShortlistEntry> {
  assertWorkingActor(actor);
  return repos.transaction(async (tx) => {
    const lead = await tx.leads.getById(leadId);
    if (!lead) throw new LeadNotFoundError("Lead not found.");
    await guardLeadAction(tx, actor, lead, "SHORTLIST_PROJECT", now);
    const entry = typeof entryId === "string" ? await tx.shortlist.getById(entryId) : null;
    // An entry that belongs to another lead is "not found" - the lead id in the URL is not a way to reach it.
    if (!entry || entry.leadId !== leadId) throw new LeadNotFoundError("Shortlist entry not found.");
    const removed = await tx.shortlist.remove(entryId, actor.actorId!, now);
    await tx.events.append({ leadId, eventType: "PROJECT_SHORTLIST_REMOVED", actorType: actor.actorType, actorId: actor.actorId ?? null, developerId: null, fromStatus: null, toStatus: null, payload: { projectId: entry.projectId }, createdAt: now });
    await tx.leads.update(leadId, { lastActivityAt: now }, now);
    return removed;
  });
}
