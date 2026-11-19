import { randomUUID } from "node:crypto";
import { monotonic, safeId } from "../../firestore/convert.ts";
import type { Where } from "../../firestore/tx.ts";
import { bucketKey } from "../call-buckets.ts";
import { LeadNotFoundError, LeadStateError } from "../errors.ts";
import type {
  AutomationActionRepository,
  AutomationSettingsRepository,
  BatchLeadProgress,
  CallAggregateRow,
  CallFilter,
  CallingBatch,
  CallingBatchRepository,
  CallRepository,
  CampaignRepository,
  ImportBatchRepository,
  NewCall,
  NewCallEvent,
  NewCallingBatch,
  NewImportBatch,
  NewProject,
  ProjectRepository,
  ShortlistRepository,
  SiteVisitRepository,
  SiteVisitStats,
  SpendRepository,
  StoredCallEvent,
} from "../repository.ts";
import {
  OPEN_SITE_VISIT_STATUSES,
  TERMINAL_CALL_STATUSES,
  type AutomationAction,
  type Campaign,
  type Lead,
  type LeadCall,
  type LeadImportBatch,
  type MarketingSpend,
  type Project,
  type ShortlistEntry,
  type SiteVisit,
  type SiteVisitEvent,
} from "../types.ts";
import { decode, encode, getMany, type Fs } from "./base.ts";

// ============================================================================================================
// calls
// ============================================================================================================

/** The filters shared by listRecent and aggregate (the same rules the in-memory repository and the SQL apply). */
function callMatches(call: LeadCall, lead: Lead, f: Pick<CallFilter, "staffUserId" | "leadId" | "from" | "to" | "connected" | "statuses" | "disposition" | "sourceType" | "batchId">): boolean {
  if (f.batchId !== undefined && call.batchId !== f.batchId) return false;
  if (f.staffUserId !== undefined && call.staffUserId !== f.staffUserId) return false;
  if (f.leadId !== undefined && call.leadId !== f.leadId) return false;
  if (f.from && call.initiatedAt.getTime() < f.from.getTime()) return false;
  if (f.to && call.initiatedAt.getTime() >= f.to.getTime()) return false;
  if (f.connected === true && call.classification !== "CONNECTED") return false;
  if (f.connected === false && call.classification !== "DIALED") return false;
  if (f.statuses && !f.statuses.includes(call.status)) return false;
  if (f.disposition !== undefined && call.disposition !== f.disposition) return false;
  if (f.sourceType !== undefined && lead.sourceType !== f.sourceType) return false;
  return true;
}

export function buildCallRepository(fs: Fs): CallRepository {
  const { ctx } = fs;
  const calls = () => fs.col("leadCalls");
  const same = (a: Date | null | undefined, b: Date | null | undefined) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

  /** One primary index pick (lead, else batch, else employee) plus the date range; every other filter is applied in memory. */
  async function loadCalls(f: { leadId?: string; batchId?: string; staffUserId?: string; from?: Date; to?: Date }, cap: number): Promise<LeadCall[]> {
    const where: Where[] = [];
    if (f.leadId !== undefined) where.push(["leadId", "==", f.leadId]);
    else if (f.batchId !== undefined) where.push(["batchId", "==", f.batchId]);
    else if (f.staffUserId !== undefined) where.push(["staffUserId", "==", f.staffUserId]);
    if (f.from) where.push(["initiatedAt", ">=", f.from]);
    if (f.to) where.push(["initiatedAt", "<", f.to]);
    const rows = await ctx.find(calls(), { where, orderBy: [["initiatedAt", "desc"]], limit: cap });
    return rows.map((v) => decode<LeadCall>(v));
  }
  const leadsFor = async (rows: LeadCall[]) => new Map((await getMany(fs, "leads", rows.map((c) => c.leadId))).map((v) => [v.id, decode<Lead>(v)]));

  return {
    async create(input: NewCall) {
      const stored: LeadCall = {
        id: randomUUID(),
        leadId: input.leadId,
        staffUserId: input.staffUserId,
        direction: "OUTBOUND",
        status: "INITIATED",
        source: "INTERNAL_DIALER",
        provider: input.provider,
        providerCallId: null,
        phoneLast4: input.phoneLast4,
        initiatedAt: input.now,
        ringingAt: null,
        answeredAt: null,
        endedAt: null,
        durationSeconds: null,
        endReason: null,
        classification: null,
        method: input.method ?? "PROVIDER",
        batchId: input.batchId ?? null,
        startedAt: null,
        deviceRef: input.deviceRef ?? null,
        simRef: null,
        callLogRef: null,
        reportedAt: null,
        disposition: null,
        dispositionBy: null,
        dispositionAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      };
      await ctx.create(calls().doc(stored.id), encode(stored));
      return stored;
    },
    async getById(id) {
      const v = await ctx.get(calls().doc(id));
      return v.exists ? decode<LeadCall>(v) : null;
    },
    async getByProviderCallId(provider, providerCallId) {
      const rows = await ctx.find(calls(), { where: [["provider", "==", provider], ["providerCallId", "==", providerCallId]], limit: 1 });
      return rows[0] ? decode<LeadCall>(rows[0]) : null;
    },
    async update(id, patch, at) {
      return ctx.run(async (c) => {
        const v = await c.get(calls().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Call not found.");
        const found = decode<LeadCall>(v);
        // The same rules migration 0021's trigger enforced in PostgreSQL.
        if (found.providerCallId !== null && patch.providerCallId !== undefined && patch.providerCallId !== found.providerCallId) throw new LeadStateError("A call's provider id cannot change.");
        if (TERMINAL_CALL_STATUSES.includes(found.status)) {
          const changes = (patch.status !== undefined && patch.status !== found.status) || (patch.answeredAt !== undefined && !same(patch.answeredAt, found.answeredAt)) || (patch.endedAt !== undefined && !same(patch.endedAt, found.endedAt)) || (patch.durationSeconds !== undefined && patch.durationSeconds !== found.durationSeconds);
          if (changes) throw new LeadStateError("A finished call cannot be changed.");
        }
        if (found.classification !== null && patch.classification !== undefined && patch.classification !== found.classification) throw new LeadStateError("A call's classification cannot be changed once set.");
        if (found.reportedAt !== null) {
          const changesReport = (patch.startedAt !== undefined && !same(patch.startedAt, found.startedAt)) || (patch.deviceRef !== undefined && patch.deviceRef !== found.deviceRef) || (patch.simRef !== undefined && patch.simRef !== found.simRef) || (patch.callLogRef !== undefined && patch.callLogRef !== found.callLogRef) || (patch.reportedAt !== undefined && !same(patch.reportedAt, found.reportedAt));
          if (changesReport) throw new LeadStateError("A device report cannot be changed once received.");
        }
        if (found.disposition !== null && patch.disposition !== undefined && patch.disposition !== found.disposition) throw new LeadStateError("A call outcome cannot be changed once set.");
        if (patch.providerCallId !== undefined && patch.providerCallId !== null) {
          const clash = await c.find(calls(), { where: [["provider", "==", found.provider], ["providerCallId", "==", patch.providerCallId]], limit: 2 });
          if (clash.some((x) => x.id !== id)) throw new LeadStateError("That provider call id is already recorded.");
        }
        if (patch.durationSeconds !== undefined && patch.durationSeconds !== null && patch.durationSeconds < 0) throw new Error("call invariant violated: duration must not be negative");
        const next: LeadCall = { ...found, ...patch, updatedAt: at };
        await c.set(calls().doc(id), encode(next));
        return next;
      });
    },
    async appendEvent(event: NewCallEvent) {
      return ctx.run(async (c) => {
        // provider + provider event id is the idempotency key: it IS the document id, so a repeat finds the first.
        const ref = fs.col("leadCallEvents").doc(safeId(`${event.provider}:${event.providerEventId}`));
        const existing = await c.get(ref);
        if (existing.exists) return { event: decode<StoredCallEvent>(existing), duplicate: true };
        const stored: StoredCallEvent = { id: ref.id, ...event, payload: structuredClone(event.payload) };
        await c.create(ref, encode(stored));
        return { event: stored, duplicate: false };
      });
    },
    async listEvents(callId) {
      const rows = await ctx.find(fs.col("leadCallEvents"), { where: [["callId", "==", callId]], orderBy: [["occurredAt", "asc"]] });
      return rows.map((v) => decode<StoredCallEvent>(v));
    },
    async listByLead(leadId) {
      return (await loadCalls({ leadId }, 5000)).sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime() || b.id.localeCompare(a.id));
    },
    async listRecent(filter: CallFilter) {
      const rows = await loadCalls(filter, Math.min(Math.max(filter.limit * 10, 500), 5000));
      const leads = await leadsFor(rows);
      const out = [];
      for (const call of rows) {
        const lead = leads.get(call.leadId);
        if (!lead || !callMatches(call, lead, filter)) continue;
        out.push({ call, lead: { id: lead.id, name: lead.name, sourceType: lead.sourceType, creationMethod: lead.creationMethod, erasedAt: lead.erasedAt, prospect: lead.prospect, phoneE164: lead.phoneE164 } });
      }
      return out.sort((a, b) => b.call.initiatedAt.getTime() - a.call.initiatedAt.getTime() || b.call.id.localeCompare(a.call.id)).slice(0, filter.limit);
    },
    async aggregate(query) {
      const rows = await loadCalls(query, 50_000);
      const leads = await leadsFor(rows);
      const out = new Map<string, CallAggregateRow & { leads: Set<string> }>();
      for (const call of rows) {
        const lead = leads.get(call.leadId);
        if (!lead || !callMatches(call, lead, query)) continue;
        // Unfinished attempts (no classification yet) and anything that is not a failure are not activity.
        if (call.classification === null && call.status !== "FAILED") continue;
        const key = query.groupBy === "EMPLOYEE" ? call.staffUserId : bucketKey(call.initiatedAt, query.groupBy, query.timeZone);
        const row = out.get(key) ?? { key, dialed: 0, connected: 0, noAnswer: 0, busy: 0, failed: 0, rejected: 0, talkSeconds: 0, leadsCalled: 0, leads: new Set<string>() };
        // Only calls that reached the other end are DIALED/CONNECTED; a call that could not be placed is a failure, not a dial.
        if (call.classification !== null) {
          row.dialed += 1;
          row.leads.add(call.leadId);
        }
        if (call.classification === "CONNECTED") {
          row.connected += 1;
          row.talkSeconds += call.durationSeconds ?? 0;
        }
        if (call.status === "NO_ANSWER" || call.disposition === "NO_ANSWER") row.noAnswer += 1;
        if (call.status === "BUSY" || call.disposition === "BUSY") row.busy += 1;
        if (call.status === "FAILED") row.failed += 1;
        if (call.status === "REJECTED") row.rejected += 1;
        out.set(key, row);
      }
      return [...out.values()].map(({ leads, ...row }) => ({ ...row, leadsCalled: leads.size })).sort((a, b) => a.key.localeCompare(b.key));
    },
  };
}

// ============================================================================================================
// calling batches and import batches
// ============================================================================================================

type BatchItem = { leadId: string; position: number; skippedAt: Date | null; skippedBy: string | null };

/** A calling batch is one document: its leads (a few hundred) live in the private `_items` array, in the order they are offered. */
export function buildCallingBatchRepository(fs: Fs): CallingBatchRepository {
  const { ctx } = fs;
  const col = () => fs.col("callingBatches");
  const toBatch = (v: { id: string; data(): FirebaseFirestore.DocumentData | undefined }): CallingBatch => ({ ...decode<Omit<CallingBatch, "itemCount">>(v), itemCount: ((v.data()?._items as unknown[]) ?? []).length });
  const itemsOf = (v: { data(): FirebaseFirestore.DocumentData | undefined }): BatchItem[] =>
    ((v.data()?._items ?? []) as Array<{ leadId: string; position: number; skippedAt: { toDate(): Date } | null; skippedBy: string | null }>).map((i) => ({ leadId: i.leadId, position: i.position, skippedAt: i.skippedAt ? i.skippedAt.toDate() : null, skippedBy: i.skippedBy }));

  return {
    async create(input: NewCallingBatch) {
      const id = randomUUID();
      const items: BatchItem[] = input.leadIds.map((leadId, position) => ({ leadId, position, skippedAt: null, skippedBy: null }));
      const batch = { name: input.name, createdBy: input.createdBy, assignedTo: input.assignedTo, importBatchId: input.importBatchId, status: "ACTIVE" as const, createdAt: input.now };
      await ctx.create(col().doc(id), { ...batch, _items: items });
      return { id, ...batch, itemCount: items.length };
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? toBatch(v) : null;
    },
    async listForAssignee(staffUserId) {
      const rows = (await ctx.find(col(), { where: [["assignedTo", "==", staffUserId]] })).map(toBatch);
      return rows.sort((a, b) => (a.status === b.status ? 0 : a.status === "ACTIVE" ? -1 : 1) || b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listAll(limit) {
      return (await ctx.find(col(), { where: [], orderBy: [["createdAt", "desc"]], limit })).map(toBatch);
    },
    async progress(batchId) {
      const v = await ctx.get(col().doc(batchId));
      if (!v.exists) return [];
      const items = itemsOf(v).sort((a, b) => a.position - b.position);
      const leads = new Map((await getMany(fs, "leads", items.map((i) => i.leadId))).map((l) => [l.id, decode<Lead>(l)]));
      const calls = (await ctx.find(fs.col("leadCalls"), { where: [["batchId", "==", batchId]] })).map((c) => decode<LeadCall>(c));
      const out: BatchLeadProgress[] = [];
      for (const item of items) {
        const lead = leads.get(item.leadId);
        if (!lead) continue;
        const mine = calls.filter((c) => c.leadId === item.leadId);
        const classified = mine.filter((c) => c.classification !== null).sort((a, b) => (b.startedAt ?? b.initiatedAt).getTime() - (a.startedAt ?? a.initiatedAt).getTime());
        out.push({
          lead,
          position: item.position,
          calls: classified.length,
          connectedCalls: classified.filter((c) => c.classification === "CONNECTED").length,
          failedCalls: mine.filter((c) => c.status === "FAILED").length,
          unmeasuredCalls: mine.filter((c) => c.endReason === "DURATION_UNAVAILABLE").length,
          skippedAt: item.skippedAt,
          lastCallAt: classified[0] ? (classified[0].startedAt ?? classified[0].initiatedAt) : null,
          lastClassification: classified[0]?.classification ?? null,
        });
      }
      return out;
    },
    async skip(batchId, leadId, skippedBy, at) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(batchId));
        if (!v.exists) return false;
        const items = itemsOf(v);
        const item = items.find((i) => i.leadId === leadId);
        if (!item) return false;
        if (item.skippedAt === null) {
          item.skippedAt = at;
          item.skippedBy = skippedBy;
          await c.update(col().doc(batchId), { _items: items });
        }
        return true;
      });
    },
    async close(id) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Calling batch not found.");
        await c.update(col().doc(id), { status: "CLOSED" });
        return toBatch({ id, data: () => ({ ...v.data(), status: "CLOSED" }) });
      });
    },
  };
}

export function buildImportBatchRepository(fs: Fs): ImportBatchRepository {
  const { ctx } = fs;
  const col = () => fs.col("leadImportBatches");
  return {
    async create(input: NewImportBatch) {
      const stored: LeadImportBatch = { id: randomUUID(), ...input, rowCount: 0, createdCount: 0, duplicateCount: 0, rejectedCount: 0 };
      await ctx.create(col().doc(stored.id), encode(stored));
      return stored;
    },
    async finish(id, counts) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Import batch not found.");
        const next = { ...decode<LeadImportBatch>(v), ...counts };
        await c.set(col().doc(id), encode(next));
        return next;
      });
    },
    async list(limit) {
      return (await ctx.find(col(), { where: [], orderBy: [["importedAt", "desc"]], limit })).map((v) => decode<LeadImportBatch>(v));
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? decode<LeadImportBatch>(v) : null;
    },
  };
}

// ============================================================================================================
// projects, shortlist, site visits
// ============================================================================================================

export function buildProjectRepository(fs: Fs): ProjectRepository {
  const { ctx } = fs;
  const col = () => fs.col("projects");
  // One name per developer (any capitalisation); team-added projects (no developer) share one namespace of their own.
  const nameKey = (developerId: string | null, name: string) => fs.lookup(`projName:${developerId ?? "team"}:${safeId(name.trim().toLowerCase())}`);
  const validate = (p: Project) => {
    if (p.status !== "ACTIVE" && p.status !== "INACTIVE") throw new Error("project invariant violated: status");
    if ((p.priceMin ?? 0) < 0 || (p.priceMax ?? 0) < 0 || (p.priceMin !== null && p.priceMax !== null && p.priceMin > p.priceMax)) throw new Error("project invariant violated: price range");
    if ((p.priceMin !== null || p.priceMax !== null) && p.currency === null) throw new Error("project invariant violated: price needs a currency");
  };
  const duplicate = "This developer already has a project with that name.";
  return {
    async create(input: NewProject) {
      return ctx.run(async (c) => {
        const project: Project = { id: randomUUID(), developerId: input.developerId, name: input.name, city: input.city, locality: input.locality, propertyType: input.propertyType, configurations: [...input.configurations], priceMin: input.priceMin, priceMax: input.priceMax, currency: input.currency, status: "ACTIVE", createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now };
        validate(project);
        const key = nameKey(project.developerId, project.name);
        if ((await c.get(key)).exists) throw new LeadStateError(duplicate);
        await c.create(key, { projectId: project.id });
        await c.create(col().doc(project.id), encode(project));
        return project;
      });
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? decode<Project>(v) : null;
    },
    async update(id, patch, at) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Project not found.");
        const cur = decode<Project>(v);
        const next: Project = { ...cur, ...patch, updatedAt: at };
        if (patch.name !== undefined && patch.name.trim().toLowerCase() !== cur.name.trim().toLowerCase()) {
          const key = nameKey(cur.developerId, patch.name);
          const taken = await c.get(key);
          if (taken.exists && taken.data()!.projectId !== id) throw new LeadStateError(duplicate);
          await c.delete(nameKey(cur.developerId, cur.name));
          if (!taken.exists) await c.create(key, { projectId: id });
        }
        validate(next);
        await c.set(col().doc(id), encode(next));
        return next;
      });
    },
    async list(query) {
      const where: Where[] = query.activeOnly ? [["status", "==", "ACTIVE"]] : [];
      return (await ctx.find(col(), { where, orderBy: [["createdAt", "desc"]], limit: query.limit })).map((v) => decode<Project>(v));
    },
  };
}

export function buildShortlistRepository(fs: Fs): ShortlistRepository {
  const { ctx } = fs;
  const col = () => fs.col("leadProjectShortlist");
  const activeKey = (leadId: string, projectId: string) => fs.lookup(`shortlistActive:${leadId}:${projectId}`);
  const liveLeads = async (ids: string[]) => new Set((await getMany(fs, "leads", ids)).filter((v) => v.data()!._live === true).map((v) => v.id));
  return {
    async add(input) {
      return ctx.run(async (c) => {
        if ((await c.get(activeKey(input.leadId, input.projectId))).exists) throw new LeadStateError("That project is already on this buyer's shortlist.");
        const entry: ShortlistEntry = { id: randomUUID(), leadId: input.leadId, requirementId: input.requirementId, projectId: input.projectId, shortlistedBy: input.shortlistedBy, shortlistedAt: input.now, removedBy: null, removedAt: null };
        await c.create(col().doc(entry.id), encode(entry));
        await c.create(activeKey(input.leadId, input.projectId), { entryId: entry.id });
        return entry;
      });
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? decode<ShortlistEntry>(v) : null;
    },
    async listByLead(leadId) {
      return (await ctx.find(col(), { where: [["leadId", "==", leadId]], orderBy: [["shortlistedAt", "asc"]] })).map((v) => decode<ShortlistEntry>(v));
    },
    async countActiveByProject() {
      const active = (await ctx.find(col(), { where: [["removedAt", "==", null]] })).map((v) => decode<ShortlistEntry>(v));
      const live = await liveLeads(active.map((e) => e.leadId));
      const out: Record<string, number> = {};
      for (const e of active) if (live.has(e.leadId)) out[e.projectId] = (out[e.projectId] ?? 0) + 1;
      return out;
    },
    async listActiveByProject(projectId) {
      const rows = (await ctx.find(col(), { where: [["projectId", "==", projectId], ["removedAt", "==", null]] })).map((v) => decode<ShortlistEntry>(v));
      const live = await liveLeads(rows.map((e) => e.leadId));
      return rows.filter((e) => live.has(e.leadId)).sort((a, b) => b.shortlistedAt.getTime() - a.shortlistedAt.getTime());
    },
    async remove(id, removedBy, at) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Shortlist entry not found.");
        const cur = decode<ShortlistEntry>(v);
        if (cur.removedAt !== null) throw new LeadStateError("That project was already removed from the shortlist.");
        const next = { ...cur, removedBy, removedAt: at };
        await c.set(col().doc(id), encode(next));
        await c.delete(activeKey(cur.leadId, cur.projectId));
        return next;
      });
    },
  };
}

const OUTCOMES = ["INTERESTED", "NEEDS_ANOTHER_VISIT", "NEGOTIATING", "NOT_INTERESTED", "OTHER"];

export function buildSiteVisitRepository(fs: Fs): SiteVisitRepository {
  const { ctx } = fs;
  const col = () => fs.col("siteVisits");
  const openKey = (leadId: string, projectId: string | null) => fs.lookup(`visitOpen:${leadId}:${projectId ?? "none"}`);
  /** Only a lead the sales team can see (not erased, not in Trash, not a bare prospect) counts in anyone's figures. */
  const liveLeadIds = async (ids: string[]) => new Set((await getMany(fs, "leads", ids)).filter((l) => l.data()!._live === true).map((l) => l.id));
  const isOpen = (v: SiteVisit) => OPEN_SITE_VISIT_STATUSES.includes(v.status);
  return {
    async create(input) {
      return ctx.run(async (c) => {
        if ((await c.get(openKey(input.leadId, input.projectId))).exists) throw new LeadStateError("This buyer already has an open site visit for that project. Reschedule it instead.");
        const visit: SiteVisit = { id: randomUUID(), leadId: input.leadId, requirementId: input.requirementId, projectId: input.projectId, staffUserId: input.staffUserId, scheduledAt: input.scheduledAt, status: "SCHEDULED", confirmedAt: null, completedAt: null, outcome: null, nextAction: null, notes: input.notes, rescheduledFrom: input.rescheduledFrom, createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now };
        await c.create(openKey(input.leadId, input.projectId), { visitId: visit.id });
        await c.create(col().doc(visit.id), encode(visit));
        return visit;
      });
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? decode<SiteVisit>(v) : null;
    },
    async update(id, patch, at) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Site visit not found.");
        const cur = decode<SiteVisit>(v);
        if (!isOpen(cur)) throw new LeadStateError("A finished site visit cannot be changed.");
        const next: SiteVisit = { ...cur, ...patch, updatedAt: at };
        if (next.outcome !== null && !OUTCOMES.includes(next.outcome)) throw new Error("site visit invariant violated: outcome");
        if (!isOpen(next)) await c.delete(openKey(cur.leadId, cur.projectId));
        await c.set(col().doc(id), encode(next));
        return next;
      });
    },
    async listByLead(leadId) {
      return (await ctx.find(col(), { where: [["leadId", "==", leadId]], orderBy: [["scheduledAt", "asc"]] })).map((v) => decode<SiteVisit>(v));
    },
    async list(query) {
      const where: Where[] = [];
      if (query.staffUserId !== undefined) where.push(["staffUserId", "==", query.staffUserId]);
      if (query.from) where.push(["scheduledAt", ">=", query.from]);
      if (query.to) where.push(["scheduledAt", "<", query.to]);
      const rows = (await ctx.find(col(), { where, orderBy: [["scheduledAt", "asc"]] })).map((v) => decode<SiteVisit>(v));
      return rows.filter((v) => !query.statuses || query.statuses.includes(v.status)).slice(0, query.limit);
    },
    async appendEvent(input: Omit<SiteVisitEvent, "id">) {
      const event: SiteVisitEvent = { ...input, id: randomUUID(), payload: { ...input.payload } };
      await ctx.create(fs.col("siteVisitEvents").doc(event.id), encode(event, { _ord: monotonic() }));
      return event;
    },
    async listEvents(visitId) {
      return (await ctx.find(fs.col("siteVisitEvents"), { where: [["visitId", "==", visitId]], orderBy: [["createdAt", "asc"], ["_ord", "asc"]] })).map((v) => decode<SiteVisitEvent>(v));
    },
    async eraseForLead(leadId) {
      for (const v of await ctx.find(col(), { where: [["leadId", "==", leadId]] })) await ctx.update(v.ref, { notes: null, nextAction: null });
    },
    async countByProject(from, to) {
      const out: Record<string, number> = {};
      const visits = (await ctx.find(col(), { where: [["createdAt", ">=", from], ["createdAt", "<", to]] })).map((v) => decode<SiteVisit>(v));
      const live = await liveLeadIds(visits.map((v) => v.leadId));
      for (const visit of visits) {
        if (visit.projectId && visit.rescheduledFrom === null && live.has(visit.leadId)) out[visit.projectId] = (out[visit.projectId] ?? 0) + 1;
      }
      return out;
    },
    async statsByStaff(from, to) {
      const out: Record<string, SiteVisitStats> = {};
      const row = (id: string) => (out[id] ??= { scheduled: 0, completed: 0, noShow: 0 });
      const [created, finished] = await Promise.all([
        ctx.find(col(), { where: [["createdAt", ">=", from], ["createdAt", "<", to]] }),
        ctx.find(col(), { where: [["completedAt", ">=", from], ["completedAt", "<", to]] }),
      ]);
      const live = await liveLeadIds([...created, ...finished].map((v) => v.data()!.leadId as string));
      for (const v of created) {
        const visit = decode<SiteVisit>(v);
        if (visit.rescheduledFrom === null && live.has(visit.leadId)) row(visit.staffUserId).scheduled += 1;
      }
      for (const v of finished) {
        const visit = decode<SiteVisit>(v);
        if (!live.has(visit.leadId)) continue;
        if (visit.status === "COMPLETED") row(visit.staffUserId).completed += 1;
        if (visit.status === "NO_SHOW") row(visit.staffUserId).noShow += 1;
      }
      return out;
    },
  };
}

// ============================================================================================================
// campaigns, spend, automation
// ============================================================================================================

const SPEND_CHANNELS = ["GOOGLE_ADS", "META", "INSTAGRAM", "WHATSAPP", "REFERRAL", "ORGANIC_SEARCH", "OTHER_DIGITAL", "DIRECT_OR_UNKNOWN", "CSV_IMPORT", "COLD_CALLING", "SELF_GENERATED_OTHER"];

export function buildCampaignRepository(fs: Fs): CampaignRepository {
  const { ctx } = fs;
  const col = () => fs.col("campaigns");
  const validate = (c: Campaign) => {
    if (!["ACTIVE", "PAUSED", "ENDED"].includes(c.status)) throw new Error("campaign invariant violated: status");
    if (c.startDate !== null && c.endDate !== null && c.endDate < c.startDate) throw new Error("campaign invariant violated: end date before start date");
  };
  return {
    async create(input) {
      return ctx.run(async (c) => {
        const campaign: Campaign = { id: randomUUID(), name: input.name, utmCampaign: input.utmCampaign, utmSource: input.utmSource, utmMedium: input.utmMedium, landingPage: input.landingPage, startDate: input.startDate, endDate: input.endDate, status: input.status, createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now };
        validate(campaign);
        const key = fs.lookup(`campaign:${safeId(input.utmCampaign.trim().toLowerCase())}`);
        if ((await c.get(key)).exists) throw new LeadStateError("Another campaign already uses that tag.");
        await c.create(key, { campaignId: campaign.id });
        await c.create(col().doc(campaign.id), encode(campaign));
        return campaign;
      });
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? decode<Campaign>(v) : null;
    },
    async update(id, patch, at) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Campaign not found.");
        const next: Campaign = { ...decode<Campaign>(v), ...patch, updatedAt: at };
        validate(next);
        await c.set(col().doc(id), encode(next));
        return next;
      });
    },
    async list(limit) {
      return (await ctx.find(col(), { where: [], orderBy: [["createdAt", "desc"]], limit })).map((v) => decode<Campaign>(v));
    },
  };
}

export function buildSpendRepository(fs: Fs): SpendRepository {
  const { ctx } = fs;
  const col = () => fs.col("marketingSpend");
  return {
    async create(input) {
      if (!(input.amount > 0)) throw new Error("spend invariant violated: amount must be positive");
      if (!SPEND_CHANNELS.includes(input.channel)) throw new Error("spend invariant violated: channel");
      const entry: MarketingSpend = { id: randomUUID(), channel: input.channel, campaignId: input.campaignId, spentOn: input.spentOn, currency: input.currency, amount: input.amount, note: input.note, createdBy: input.createdBy, createdAt: input.now, voidedAt: null, voidedBy: null, voidReason: null };
      await ctx.create(col().doc(entry.id), encode(entry));
      return entry;
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? decode<MarketingSpend>(v) : null;
    },
    async void(id, by, reason, at) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Spend entry not found.");
        const cur = decode<MarketingSpend>(v);
        if (cur.voidedAt !== null) throw new LeadStateError("That spend entry was already voided.");
        const next = { ...cur, voidedAt: at, voidedBy: by, voidReason: reason };
        await c.set(col().doc(id), encode(next));
        return next;
      });
    },
    async list(query) {
      const rows = (await ctx.find(col(), { where: [["spentOn", ">=", query.fromDate], ["spentOn", "<=", query.toDate]] })).map((v) => decode<MarketingSpend>(v));
      return rows.sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, query.limit);
    },
  };
}

export function buildAutomationActionRepository(fs: Fs): AutomationActionRepository {
  const { ctx } = fs;
  const col = () => fs.col("automationActions");
  return {
    async claim(input, options) {
      return ctx.run(async (c) => {
        // The dedupe key IS the document id, so two runs can never create the same action twice.
        const ref = col().doc(safeId(input.dedupeKey));
        const v = await c.get(ref);
        if (!v.exists) {
          const action: AutomationAction = { id: ref.id, rule: input.rule, subjectType: input.subjectType, subjectId: input.subjectId, dedupeKey: input.dedupeKey, status: "PENDING", attempts: 1, detail: {}, claimedAt: input.now, completedAt: null, createdAt: input.now };
          await c.create(ref, encode(action));
          return action;
        }
        const existing = decode<AutomationAction>(v);
        const abandoned = existing.status === "PENDING" && input.now.getTime() - existing.claimedAt.getTime() > options.staleAfterMs;
        if ((existing.status === "FAILED" || abandoned) && existing.attempts < options.maxAttempts) {
          const next: AutomationAction = { ...existing, status: "PENDING", attempts: existing.attempts + 1, claimedAt: input.now, completedAt: null };
          await c.set(ref, encode(next));
          return next;
        }
        return null;
      });
    },
    async complete(id, status, detail, at) {
      await ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Automation action not found.");
        await c.update(col().doc(id), { status, detail, completedAt: at });
      });
    },
    async fail(id, errorCode, at) {
      await ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Automation action not found.");
        await c.update(col().doc(id), { status: "FAILED", detail: { errorCode }, completedAt: at });
      });
    },
    async listRecent(limit) {
      return (await ctx.find(col(), { where: [], orderBy: [["createdAt", "desc"]], limit })).map((v) => decode<AutomationAction>(v));
    },
  };
}

export function buildAutomationSettingsRepository(fs: Fs): AutomationSettingsRepository {
  const { ctx } = fs;
  const col = () => fs.col("automationSettings");
  return {
    async getAll() {
      const rows = await ctx.find(col(), { where: [] });
      return Object.fromEntries(rows.map((v) => [(v.data()!.key as string | undefined) ?? v.id, v.data()!.enabled === true]));
    },
    async set(key, enabled, by, at) {
      await ctx.set(col().doc(safeId(key)), { enabled, updatedBy: by, updatedAt: at, key });
    },
  };
}
