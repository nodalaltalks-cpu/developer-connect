import { AsyncLocalStorage } from "node:async_hooks";
import { CLOSED_OUT_STATUSES } from "./lead-views.ts";
import type { TouchEvidence } from "./acquisition.ts";
import { randomUUID } from "node:crypto";
import { summariseEvents } from "./activity-summary.ts";
import { bucketKey } from "./call-buckets.ts";
import { LeadNotFoundError, LeadStateError } from "./errors.ts";
import { QUEUE_EXCLUDED_STATUSES } from "./queue-config.ts";
import { compareForView, countLeads, matchesView } from "./lead-views.ts";
import type {
  BookingPatch,
  LeadPatch,
  LeadRepositories,
  NewBooking,
  FollowUpPatch,
  CallAggregateQuery,
  BatchLeadProgress,
  CallAggregateRow,
  SourceFunnel,
  SourceFunnelRow,
  SourceRevenueRow,
  CallFilter,
  CallPatch,
  CallWithLead,
  CallingBatch,
  FollowUpScope,
  FollowUpWithLead,
  MissedFollowUpQuery,
  NewCall,
  NewCallEvent,
  NewCallingBatch,
  NewProject,
  SiteVisitStats,
  NewConsent,
  NewFollowUp,
  NewImportBatch,
  NewLeadEvent,
  NewLeadInput,
  NewRequirement,
  NewTouch,
  RequirementLocation,
  StoredCallEvent,
} from "./repository.ts";
import { assertNoImmutableFields } from "./repository.ts";
import { OPEN_SITE_VISIT_STATUSES, TERMINAL_CALL_STATUSES, type Booking, type Lead, type LeadCall, type LeadConsent, type LeadEvent, type LeadFollowUp, type LeadImportBatch, type LeadRequirement, type AutomationAction, type Campaign, type LeadStatus, type MarketingSpend, type MarketingTouch, type Project, type ShortlistEntry, type SiteVisit, type SiteVisitEvent } from "./types.ts";

/**
 * In-memory implementation of the lead repositories, for unit tests. It
 * honours the same guarantees the PostgreSQL adapter and database triggers
 * provide — unique phone, immutable events/touches/consents, atomic
 * transactions — so the service layer can be tested without a database.
 */
/** The filters shared by listRecent and aggregate, applied the same way the SQL adapter applies them. */
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

type StoredRequirement = Omit<LeadRequirement, "locations"> & { locations: RequirementLocation[] };

const toRequirement = (stored: StoredRequirement): LeadRequirement => ({ ...stored, locations: stored.locations.map((l) => l.name) });

export function createInMemoryLeadRepositories(
  developerNames: Record<string, string> = {},
): LeadRepositories & { snapshot(): { leads: Lead[]; events: LeadEvent[] }; recordPageView(userId: string, at: Date): void } {
  const state = {
    leads: new Map<string, Lead>(),
    events: [] as LeadEvent[],
    pageViews: [] as Array<{ userId: string; at: Date }>,
    touches: new Map<string, MarketingTouch>(),
    consents: [] as LeadConsent[],
    bookings: new Map<string, Booking>(),
    requirements: new Map<string, StoredRequirement>(),
    followUps: new Map<string, LeadFollowUp>(),
    calls: new Map<string, LeadCall>(),
    callEvents: [] as StoredCallEvent[],
    batches: new Map<string, LeadImportBatch>(),
    callingBatches: new Map<string, Omit<CallingBatch, "itemCount">>(),
    callingItems: [] as Array<{ batchId: string; leadId: string; position: number; skippedAt: Date | null; skippedBy: string | null }>,
    projects: new Map<string, Project>(),
    shortlist: new Map<string, ShortlistEntry>(),
    siteVisits: new Map<string, SiteVisit>(),
    siteVisitEvents: [] as SiteVisitEvent[],
    campaigns: new Map<string, Campaign>(),
    spend: new Map<string, MarketingSpend>(),
    automation: new Map<string, AutomationAction>(),
    automationSettings: new Map<string, boolean>(),
  };

  const cloneState = () => ({
    leads: new Map([...state.leads].map(([id, lead]) => [id, { ...lead }])),
    events: state.events.map((event) => ({ ...event, payload: structuredClone(event.payload) })),
    touches: new Map(state.touches),
    consents: state.consents.map((consent) => ({ ...consent })),
    bookings: new Map([...state.bookings].map(([id, booking]) => [id, { ...booking }])),
    requirements: new Map([...state.requirements].map(([id, r]) => [id, { ...r, locations: r.locations.map((l) => ({ ...l })) }])),
    followUps: new Map([...state.followUps].map(([id, f]) => [id, { ...f }])),
    calls: new Map([...state.calls].map(([id, c]) => [id, { ...c }])),
    callEvents: state.callEvents.map((e) => ({ ...e, payload: structuredClone(e.payload) })),
    batches: new Map([...state.batches].map(([id, b]) => [id, { ...b }])),
    callingBatches: new Map([...state.callingBatches].map(([id, b]) => [id, { ...b }])),
    callingItems: state.callingItems.map((i) => ({ ...i })),
    projects: new Map([...state.projects].map(([id, p]) => [id, { ...p, configurations: [...p.configurations] }])),
    shortlist: new Map([...state.shortlist].map(([id, e]) => [id, { ...e }])),
    siteVisits: new Map([...state.siteVisits].map(([id, v]) => [id, { ...v }])),
    siteVisitEvents: state.siteVisitEvents.map((e) => ({ ...e, payload: { ...e.payload } })),
    campaigns: new Map([...state.campaigns].map(([id, c]) => [id, { ...c }])),
    spend: new Map([...state.spend].map(([id, s]) => [id, { ...s }])),
    automation: new Map([...state.automation].map(([id, a]) => [id, { ...a, detail: { ...a.detail } }])),
    automationSettings: new Map(state.automationSettings),
  });

  // A promise-chain mutex so concurrent transactions run one at a time, like row locks would serialise them.
  let queue: Promise<unknown> = Promise.resolve();
  // Inside a transaction, a nested transaction joins it (Postgres nests via SAVEPOINT); the outer rollback covers everything.
  const insideTransaction = new AsyncLocalStorage<boolean>();

  const repos: LeadRepositories = {
    leads: {
      async findByPhone(phoneE164) {
        const found = [...state.leads.values()].find((lead) => lead.phoneE164 === phoneE164);
        return found ? { ...found } : null;
      },
      async upsertByPhone(input: NewLeadInput) {
        const existing = [...state.leads.values()].find((lead) => lead.phoneE164 === input.phoneE164);
        if (existing) return { lead: { ...existing }, created: false };
        const lead: Lead = {
          id: randomUUID(),
          name: input.name,
          phoneE164: input.phoneE164,
          email: input.email,
          contactPreference: input.contactPreference,
          status: "NEW",
          temperature: null,
          ownerId: null,
          sourceType: input.source?.sourceType ?? "DIGITAL",
          sourceDetail: input.source?.sourceDetail ?? null,
          creationMethod: input.source?.creationMethod ?? "WEBSITE_GATE",
          importBatchId: input.source?.importBatchId ?? null,
          createdBy: input.source?.createdBy ?? null,
          returnedAt: null,
          returnedFrom: null,
          returnReason: null,
          developerId: input.developerId,
          sourceCta: input.sourceCta,
          location: null,
          budgetMin: null,
          budgetMax: null,
          budgetCurrency: null,
          configuration: null,
          propertyType: null,
          purpose: null,
          timeline: null,
          sessionId: input.sessionId,
          userId: input.userId,
          firstTouchId: null,
          lastTouchId: null,
          nextFollowUpAt: null,
          lastActivityAt: input.now,
          erasedAt: null,
          createdAt: input.now,
          updatedAt: input.now,
        };
        state.leads.set(lead.id, lead);
        return { lead: { ...lead }, created: true };
      },
      async getById(id) {
        const lead = state.leads.get(id);
        return lead ? { ...lead } : null;
      },
      async update(id: string, patch: LeadPatch, at: Date) {
        assertNoImmutableFields(patch);
        const lead = state.leads.get(id);
        if (!lead) throw new LeadNotFoundError("Lead not found.");
        // A phone number may only be cleared (erasure) or left alone — never re-pointed at another lead's number.
        if (patch.phoneE164 && [...state.leads.values()].some((other) => other.id !== id && other.phoneE164 === patch.phoneE164)) {
          throw new Error("duplicate phone");
        }
        Object.assign(lead, patch, { updatedAt: at });
        return { ...lead };
      },
      async listForQueue(limit) {
        const open = [...state.leads.values()].filter((lead) => !lead.erasedAt && !QUEUE_EXCLUDED_STATUSES.includes(lead.status));
        const withFollowUp = open
          .filter((lead) => lead.nextFollowUpAt)
          .sort((a, b) => a.nextFollowUpAt!.getTime() - b.nextFollowUpAt!.getTime())
          .slice(0, limit);
        const recent = [...open].sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()).slice(0, limit);
        const byId = new Map([...withFollowUp, ...recent].map((lead) => [lead.id, lead]));
        return [...byId.values()].map((lead) => ({ ...lead }));
      },
      async list(query) {
        const matching = [...state.leads.values()]
          .filter((lead) => query.ownerId === undefined || lead.ownerId === query.ownerId)
          .filter((lead) => query.sourceType === undefined || lead.sourceType === query.sourceType)
          .filter((lead) => matchesView(lead, query.view, query.now, query.endOfToday))
          .sort(compareForView(query.view));
        return { total: matching.length, leads: matching.slice(query.offset, query.offset + query.limit).map((lead) => ({ ...lead })) };
      },
      async counts(now, endOfToday, sourceType) {
        return countLeads([...state.leads.values()].filter((lead) => sourceType === undefined || lead.sourceType === sourceType), now, endOfToday);
      },
      async countOpenWithoutRequirement(ownerId) {
        const stages = ["CONTACTED", "QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION"];
        return [...state.leads.values()].filter((l) => l.ownerId === ownerId && l.erasedAt === null && stages.includes(l.status) && ![...state.requirements.values()].some((r) => r.leadId === l.id && r.status === "ACTIVE")).length;
      },
      async sourceFunnel(query) {
        const byOwner = query.groupBy === "OWNER";
        const personOf = (l: Lead) => (l.sourceType === "COLD_CALL" ? l.createdBy : l.ownerId) ?? null;
        const ever = (l: Lead, statuses: string[]) => statuses.includes(l.status) || state.events.some((e) => e.leadId === l.id && e.toStatus !== null && statuses.includes(e.toStatus));
        const cohort = [...state.leads.values()].filter(
          (l) => l.erasedAt === null && l.createdAt >= query.from && l.createdAt < query.to && (!query.sourceType || l.sourceType === query.sourceType) && (!query.personId || personOf(l) === query.personId),
        );
        const rows = new Map<string, SourceFunnelRow>();
        const revenue = new Map<string, SourceRevenueRow>();
        for (const l of cohort) {
          const calls = [...state.calls.values()].filter((c) => c.leadId === l.id);
          const visits = [...state.siteVisits.values()].filter((v) => v.leadId === l.id);
          const key = byOwner ? `${l.sourceType}|${personOf(l) ?? ""}` : `${l.sourceType}|${l.sourceDetail ?? ""}`;
          const row = rows.get(key) ?? { sourceType: l.sourceType, sourceDetail: byOwner ? null : l.sourceDetail, personId: byOwner ? personOf(l) : null, leads: 0, called: 0, connected: 0, qualified: 0, shortlisted: 0, visitsScheduled: 0, visitsDone: 0, negotiation: 0, booked: 0, talkSeconds: 0 };
          row.leads += 1;
          if (calls.some((c) => c.classification !== null)) row.called += 1;
          if (calls.some((c) => c.classification === "CONNECTED")) row.connected += 1;
          if (ever(l, ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"])) row.qualified += 1;
          if ([...state.shortlist.values()].some((e) => e.leadId === l.id)) row.shortlisted += 1;
          if (visits.some((v) => v.status !== "CANCELLED")) row.visitsScheduled += 1;
          if (visits.some((v) => v.status === "COMPLETED")) row.visitsDone += 1;
          if (ever(l, ["NEGOTIATION", "BOOKED", "CLOSED"])) row.negotiation += 1;
          row.talkSeconds += calls.filter((c) => c.classification === "CONNECTED").reduce((n, c) => n + (c.durationSeconds ?? 0), 0);
          const bookings = [...state.bookings.values()].filter((b) => b.leadId === l.id && b.status === "BOOKED");
          if (bookings.length > 0) row.booked += 1;
          for (const b of bookings) {
            const rk = `${l.sourceType}|${byOwner ? (personOf(l) ?? "") : ""}|${b.currency}`;
            const r = revenue.get(rk) ?? { sourceType: l.sourceType, personId: byOwner ? personOf(l) : null, currency: b.currency, bookingValue: 0, commissionExpected: 0, commissionReceived: 0 };
            r.bookingValue += b.bookingValue;
            r.commissionExpected += b.commissionExpected;
            r.commissionReceived += b.commissionReceived;
            revenue.set(rk, r);
          }
          rows.set(key, row);
        }
        return { rows: [...rows.values()].sort((a, b) => b.leads - a.leads), revenue: [...revenue.values()] };
      },
      async bucketInsights(leadIds) {
        return leadIds.map((id) => {
          const latest = [...state.calls.values()].filter((c) => c.leadId === id).sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime())[0];
          const names = [...state.shortlist.values()]
            .filter((e) => e.leadId === id && e.removedAt === null)
            .sort((a, b) => a.shortlistedAt.getTime() - b.shortlistedAt.getTime())
            .map((e) => state.projects.get(e.projectId)?.name)
            .filter((n): n is string => Boolean(n));
          return {
            leadId: id,
            lastCallAt: latest ? latest.initiatedAt : null,
            lastCallClassification: latest?.classification ?? null,
            lastCallDurationSeconds: latest?.durationSeconds ?? null,
            interestedProjects: names.slice(0, 3),
            interestedProjectCount: names.length,
          };
        });
      },
      async developerNames(ids) {
        return Object.fromEntries(ids.filter((id) => id in developerNames).map((id) => [id, developerNames[id]]));
      },
      async ownerSummary() {
        const out: Record<string, { qualified: number; siteVisit: number; booked: number }> = {};
        for (const lead of state.leads.values()) {
          if (!lead.ownerId || lead.erasedAt) continue;
          const row = (out[lead.ownerId] ??= { qualified: 0, siteVisit: 0, booked: 0 });
          if (lead.status === "QUALIFIED") row.qualified += 1;
          if (lead.status === "SITE_VISIT_SCHEDULED") row.siteVisit += 1;
          if (lead.status === "BOOKED") row.booked += 1;
        }
        return out;
      },
      async listReturned(limit) {
        return [...state.leads.values()]
          .filter((lead) => lead.returnedAt !== null && lead.ownerId === null && lead.erasedAt === null)
          .sort((a, b) => b.returnedAt!.getTime() - a.returnedAt!.getTime() || a.id.localeCompare(b.id))
          .slice(0, limit)
          .map((lead) => ({ ...lead }));
      },
      async countByOwner() {
        const counts: Record<string, number> = {};
        for (const lead of state.leads.values()) {
          if (lead.ownerId && lead.erasedAt === null) counts[lead.ownerId] = (counts[lead.ownerId] ?? 0) + 1;
        }
        return counts;
      },
      async stageHistory() {
        const order: LeadStatus[] = ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION"];
        const forward = ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"];
        const reachedStage = (leadId: string, current: string): number => {
          let best = forward.indexOf(current);
          for (const e of state.events) if (e.leadId === leadId && e.eventType === "STATUS_CHANGED" && e.toStatus) best = Math.max(best, forward.indexOf(e.toStatus));
          return best;
        };
        return order.map((stage) => {
          let reached = 0;
          let booked = 0;
          for (const l of state.leads.values()) {
            if (l.erasedAt !== null) continue;
            if (reachedStage(l.id, l.status) >= forward.indexOf(stage)) {
              reached += 1;
              if ([...state.bookings.values()].some((b) => b.leadId === l.id && b.status === "BOOKED")) booked += 1;
            }
          }
          return { stage, reached, booked };
        });
      },
      async listStale({ staleBefore, limit }) {
        return [...state.leads.values()]
          .filter((l) => l.erasedAt === null && !CLOSED_OUT_STATUSES.includes(l.status) && l.ownerId !== null && l.lastActivityAt < staleBefore)
          .sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime())
          .slice(0, limit)
          .map((l) => ({ ...l }));
      },
      async listReturnVisits({ since, minLeadAgeMs, limit }) {
        const out: Array<{ lead: Lead; viewedAt: Date }> = [];
        for (const l of state.leads.values()) {
          if (l.erasedAt !== null || CLOSED_OUT_STATUSES.includes(l.status) || l.ownerId === null || l.userId === null) continue;
          const views = state.pageViews.filter((v) => v.userId === l.userId && v.at >= since && v.at.getTime() >= l.createdAt.getTime() + minLeadAgeMs);
          if (views.length > 0) out.push({ lead: { ...l }, viewedAt: new Date(Math.max(...views.map((v) => v.at.getTime()))) });
        }
        return out.sort((a, b) => b.viewedAt.getTime() - a.viewedAt.getTime()).slice(0, limit);
      },
      async listUnassignedOpen(limit) {
        return [...state.leads.values()]
          .filter((l) => l.erasedAt === null && !CLOSED_OUT_STATUSES.includes(l.status) && l.ownerId === null && l.returnedAt === null)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, limit)
          .map((l) => ({ ...l }));
      },
      async countOpenByOwner() {
        const out: Record<string, number> = {};
        for (const l of state.leads.values()) if (l.erasedAt === null && l.ownerId !== null && !CLOSED_OUT_STATUSES.includes(l.status)) out[l.ownerId] = (out[l.ownerId] ?? 0) + 1;
        return out;
      },
      async statusCounts() {
        const out: Partial<Record<LeadStatus, number>> = {};
        for (const l of state.leads.values()) if (l.erasedAt === null) out[l.status] = (out[l.status] ?? 0) + 1;
        return out;
      },
      async exceptionCounts({ unassignedOlderThan, staleBefore }) {
        const open = (l: Lead) => l.erasedAt === null && !CLOSED_OUT_STATUSES.includes(l.status);
        let unassignedOpen = 0;
        let unassignedOld = 0;
        let staleOpen = 0;
        for (const l of state.leads.values()) {
          if (!open(l)) continue;
          if (l.ownerId === null) {
            unassignedOpen += 1;
            if (l.createdAt < unassignedOlderThan) unassignedOld += 1;
          } else if (l.lastActivityAt < staleBefore) staleOpen += 1;
        }
        return { unassignedOpen, unassignedOld, staleOpen };
      },
      async acquisitionRows(query) {
        const QUALIFIED_OR_LATER: readonly string[] = ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"];
        const evidence = (id: string | null): TouchEvidence | null => {
          const t = id ? state.touches.get(id) : null;
          return t ? { utmSource: t.utmSource, utmMedium: t.utmMedium, utmCampaign: t.utmCampaign, gclid: t.gclid, fbclid: t.fbclid, referrer: t.referrer, landingPath: t.landingPath } : null;
        };
        return [...state.leads.values()]
          .filter((l) => l.createdAt >= query.from && l.createdAt < query.to)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, query.limit)
          .map((l) => ({
            leadId: l.id,
            createdAt: l.createdAt,
            sourceType: l.sourceType,
            creationMethod: l.creationMethod,
            first: evidence(l.firstTouchId),
            latest: evidence(l.lastTouchId),
            reachedQualified: QUALIFIED_OR_LATER.includes(l.status) || state.events.some((e) => e.leadId === l.id && e.eventType === "STATUS_CHANGED" && e.toStatus !== null && QUALIFIED_OR_LATER.includes(e.toStatus)),
            hasSiteVisit: [...state.siteVisits.values()].some((v) => v.leadId === l.id && v.rescheduledFrom === null),
            booked: [...state.bookings.values()].some((b) => b.leadId === l.id && b.status === "BOOKED"),
            bookings: [...state.bookings.values()]
              .filter((b) => b.leadId === l.id && b.status === "BOOKED")
              .map((b) => ({ currency: b.currency, bookingValue: b.bookingValue, commissionExpected: b.commissionExpected, commissionReceived: b.commissionReceived, projectId: b.projectId, projectName: b.projectName })),
          }));
      },
    },

    automationActions: {
      async claim(input, options) {
        const existing = [...state.automation.values()].find((a) => a.dedupeKey === input.dedupeKey);
        if (!existing) {
          const action: AutomationAction = { id: randomUUID(), rule: input.rule, subjectType: input.subjectType, subjectId: input.subjectId, dedupeKey: input.dedupeKey, status: "PENDING", attempts: 1, detail: {}, claimedAt: input.now, completedAt: null, createdAt: input.now };
          state.automation.set(action.id, action);
          return { ...action };
        }
        const abandoned = existing.status === "PENDING" && input.now.getTime() - existing.claimedAt.getTime() > options.staleAfterMs;
        if ((existing.status === "FAILED" || abandoned) && existing.attempts < options.maxAttempts) {
          Object.assign(existing, { status: "PENDING", attempts: existing.attempts + 1, claimedAt: input.now, completedAt: null });
          return { ...existing };
        }
        return null;
      },
      async complete(id, status, detail, at) {
        const a = state.automation.get(id);
        if (!a) throw new LeadNotFoundError("Automation action not found.");
        Object.assign(a, { status, detail, completedAt: at });
      },
      async fail(id, errorCode, at) {
        const a = state.automation.get(id);
        if (!a) throw new LeadNotFoundError("Automation action not found.");
        Object.assign(a, { status: "FAILED", detail: { errorCode }, completedAt: at });
      },
      async listRecent(limit) {
        return [...state.automation.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit).map((a) => ({ ...a, detail: { ...a.detail } }));
      },
    },

    automationSettings: {
      async getAll() {
        return Object.fromEntries(state.automationSettings);
      },
      async set(key, enabled) {
        state.automationSettings.set(key, enabled);
      },
    },

    spend: {
      async create(input) {
        const entry: MarketingSpend = { id: randomUUID(), channel: input.channel, campaignId: input.campaignId, spentOn: input.spentOn, currency: input.currency, amount: input.amount, note: input.note, createdBy: input.createdBy, createdAt: input.now, voidedAt: null, voidedBy: null, voidReason: null };
        state.spend.set(entry.id, entry);
        return { ...entry };
      },
      async getById(id) {
        const e = state.spend.get(id);
        return e ? { ...e } : null;
      },
      async void(id, by, reason, at) {
        const e = state.spend.get(id);
        if (!e) throw new LeadNotFoundError("Spend entry not found.");
        if (e.voidedAt !== null) throw new LeadStateError("That spend entry was already voided.");
        Object.assign(e, { voidedAt: at, voidedBy: by, voidReason: reason });
        return { ...e };
      },
      async list(query) {
        return [...state.spend.values()]
          .filter((e) => e.spentOn >= query.fromDate && e.spentOn <= query.toDate)
          .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, query.limit)
          .map((e) => ({ ...e }));
      },
    },

    campaigns: {
      async create(input) {
        const key = input.utmCampaign.trim().toLowerCase();
        if ([...state.campaigns.values()].some((c) => c.utmCampaign.toLowerCase() === key)) throw new LeadStateError("Another campaign already uses that tag.");
        const campaign: Campaign = { id: randomUUID(), name: input.name, utmCampaign: input.utmCampaign, utmSource: input.utmSource, utmMedium: input.utmMedium, landingPage: input.landingPage, startDate: input.startDate, endDate: input.endDate, status: input.status, createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now };
        state.campaigns.set(campaign.id, campaign);
        return { ...campaign };
      },
      async getById(id) {
        const c = state.campaigns.get(id);
        return c ? { ...c } : null;
      },
      async update(id, patch, at) {
        const c = state.campaigns.get(id);
        if (!c) throw new LeadNotFoundError("Campaign not found.");
        Object.assign(c, patch, { updatedAt: at });
        return { ...c };
      },
      async list(limit) {
        return [...state.campaigns.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit).map((c) => ({ ...c }));
      },
    },

    events: {
      async listByActor(actorId, { limit, before }) {
        return state.events
          .filter((e) => e.actorId === actorId && (!before || e.createdAt < before))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit)
          .map((e) => ({ ...e, payload: { ...e.payload } }));
      },
      async actorLeadCounts(actorId) {
        const acted = new Set<string>();
        const assigned = new Set<string>();
        for (const e of state.events) {
          if (e.actorId === actorId) acted.add(e.leadId);
          if (e.eventType === "OWNER_CHANGED" && e.payload.to === actorId) assigned.add(e.leadId);
        }
        return { leadsActedOn: acted.size, leadsAssignedTo: assigned.size };
      },
      async countByTypeAndActor(eventType, from, to) {
        const counts: Record<string, number> = {};
        for (const event of state.events) {
          if (event.eventType !== eventType || !event.actorId) continue;
          if (event.createdAt.getTime() < from.getTime() || event.createdAt.getTime() >= to.getTime()) continue;
          counts[event.actorId] = (counts[event.actorId] ?? 0) + 1;
        }
        return counts;
      },
      async append(event: NewLeadEvent) {
        const stored: LeadEvent = { id: randomUUID(), ...event, payload: structuredClone(event.payload) };
        state.events.push(stored);
        return { ...stored, payload: structuredClone(stored.payload) };
      },
      async listByLead(leadId) {
        return state.events
          .filter((event) => event.leadId === leadId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((event) => ({ ...event, payload: structuredClone(event.payload) }));
      },
      async latestSeq(scope) {
        // The memory log has no identity column: the count of visible events is a cursor that only ever grows.
        if (!scope.personId) return state.events.length;
        return state.events.filter((e) => e.actorId === scope.personId || state.leads.get(e.leadId)?.ownerId === scope.personId).length;
      },
      async summarise(leadIds) {
        return leadIds.map((id) => summariseEvents(id, state.events.filter((event) => event.leadId === id)));
      },
      async redactPayloads(leadId, redact) {
        let changed = 0;
        for (const event of state.events) {
          if (event.leadId !== leadId) continue;
          const next = redact({ ...event, payload: structuredClone(event.payload) });
          if (JSON.stringify(next) !== JSON.stringify(event.payload)) {
            event.payload = structuredClone(next);
            changed += 1;
          }
        }
        return changed;
      },
    },

    touches: {
      async create(touch: NewTouch, fallbackOccurredAt: Date) {
        const stored: MarketingTouch = {
          id: touch.id ?? randomUUID(),
          sessionId: touch.sessionId,
          occurredAt: touch.occurredAt ?? fallbackOccurredAt,
          landingPath: touch.landingPath,
          referrer: touch.referrer,
          utmSource: touch.utmSource,
          utmMedium: touch.utmMedium,
          utmCampaign: touch.utmCampaign,
          utmContent: touch.utmContent,
          utmTerm: touch.utmTerm,
          gclid: touch.gclid,
          fbclid: touch.fbclid,
        };
        state.touches.set(stored.id, stored);
        return { ...stored };
      },
      async getById(id) {
        const touch = state.touches.get(id);
        return touch ? { ...touch } : null;
      },
      async countBySessionSince(sessionId, since) {
        return [...state.touches.values()].filter((touch) => touch.sessionId === sessionId && touch.occurredAt.getTime() >= since.getTime()).length;
      },
    },

    consents: {
      async create(consent: NewConsent) {
        const stored: LeadConsent = { id: randomUUID(), ...consent, withdrawnAt: null };
        state.consents.push(stored);
        return { ...stored };
      },
      async listByLead(leadId) {
        return state.consents.filter((consent) => consent.leadId === leadId).map((consent) => ({ ...consent }));
      },
      async withdrawActive(leadId, at) {
        const withdrawn: LeadConsent[] = [];
        for (const consent of state.consents) {
          if (consent.leadId === leadId && consent.withdrawnAt === null) {
            consent.withdrawnAt = at;
            withdrawn.push({ ...consent });
          }
        }
        return withdrawn;
      },
    },

    bookings: {
      async revenueByOwner() {
        const rows = new Map<string, { ownerId: string; currency: string; total: number; count: number }>();
        for (const booking of state.bookings.values()) {
          if (booking.status !== "BOOKED") continue;
          const owner = state.leads.get(booking.leadId)?.ownerId;
          if (!owner) continue;
          const key = `${owner}|${booking.currency}`;
          const row = rows.get(key) ?? { ownerId: owner, currency: booking.currency, total: 0, count: 0 };
          row.total += booking.bookingValue;
          row.count += 1;
          rows.set(key, row);
        }
        return [...rows.values()];
      },
      async listOutstanding(limit) {
        return [...state.bookings.values()]
          .filter((b) => b.status === "BOOKED" && b.commissionExpected > b.commissionReceived)
          .sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime())
          .slice(0, limit)
          .map((b) => ({ ...b }));
      },
      async create(booking: NewBooking) {
        const stored: Booking = {
          id: randomUUID(),
          leadId: booking.leadId,
          developerId: booking.developerId,
          projectName: booking.projectName,
          projectId: booking.projectId ?? null,
          status: "BOOKED",
          bookedAt: booking.bookedAt,
          currency: booking.currency,
          bookingValue: booking.bookingValue,
          commissionExpected: booking.commissionExpected,
          commissionReceived: 0,
          commissionReceivedAt: null,
          createdBy: booking.createdBy,
          createdAt: booking.now,
          updatedAt: booking.now,
        };
        state.bookings.set(stored.id, stored);
        return { ...stored };
      },
      async getById(id) {
        const booking = state.bookings.get(id);
        return booking ? { ...booking } : null;
      },
      async update(id: string, patch: BookingPatch, at: Date) {
        const booking = state.bookings.get(id);
        if (!booking) throw new LeadNotFoundError("Booking not found.");
        Object.assign(booking, patch, { updatedAt: at });
        return { ...booking };
      },
      async listByLead(leadId) {
        return [...state.bookings.values()].filter((booking) => booking.leadId === leadId).map((booking) => ({ ...booking }));
      },
    },

    requirements: {
      async create(input: NewRequirement) {
        const active = [...state.requirements.values()].find((r) => r.leadId === input.leadId && r.status === "ACTIVE");
        if (active) throw new LeadStateError("This lead already has an active requirement.");
        const stored: StoredRequirement = {
          id: randomUUID(),
          leadId: input.leadId,
          status: "ACTIVE",
          locations: input.locations.map((l) => ({ ...l })),
          propertyType: input.propertyType,
          configuration: input.configuration,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          budgetCurrency: input.budgetCurrency,
          purpose: input.purpose,
          timeline: input.timeline,
          notes: input.notes,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          createdAt: input.now,
          updatedAt: input.now,
        };
        state.requirements.set(stored.id, stored);
        return toRequirement(stored);
      },
      async getById(id) {
        const found = state.requirements.get(id);
        return found ? toRequirement(found) : null;
      },
      async getActiveByLead(leadId) {
        const found = [...state.requirements.values()].find((r) => r.leadId === leadId && r.status === "ACTIVE");
        return found ? toRequirement(found) : null;
      },
      async listByLead(leadId) {
        return [...state.requirements.values()]
          .filter((r) => r.leadId === leadId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
          .map(toRequirement);
      },
      async update(id, patch, at, locations) {
        const found = state.requirements.get(id);
        if (!found) throw new LeadNotFoundError("Requirement not found.");
        if (patch.status === "ACTIVE" && found.status !== "ACTIVE") {
          const other = [...state.requirements.values()].find((r) => r.leadId === found.leadId && r.status === "ACTIVE" && r.id !== id);
          if (other) throw new LeadStateError("This lead already has an active requirement.");
        }
        Object.assign(found, patch, { updatedAt: at });
        if (locations) found.locations = locations.map((l) => ({ ...l }));
        return toRequirement(found);
      },
      async eraseForLead(leadId) {
        for (const r of state.requirements.values()) {
          if (r.leadId === leadId) {
            r.notes = null;
            r.locations = [];
          }
        }
      },
    },

    followUps: {
      async create(input: NewFollowUp) {
        const open = [...state.followUps.values()].find((f) => f.leadId === input.leadId && (f.status === "SCHEDULED" || f.status === "MISSED"));
        if (open) throw new LeadStateError("This lead already has an open follow-up.");
        const stored: LeadFollowUp = {
          id: randomUUID(),
          leadId: input.leadId,
          type: input.type,
          status: "SCHEDULED",
          scheduledAt: input.scheduledAt,
          originalScheduledAt: input.scheduledAt,
          ownerId: input.ownerId,
          note: input.note,
          createdBy: input.createdBy,
          createdAt: input.now,
          updatedAt: input.now,
          completedAt: null,
          completedBy: null,
          cancelledAt: null,
          cancelledBy: null,
          cancelReason: null,
          cancelNote: null,
          missedCount: 0,
          lastMissedAt: null,
          rescheduleCount: 0,
          dueNotifiedAt: null,
        };
        state.followUps.set(stored.id, stored);
        return { ...stored };
      },
      async getById(id) {
        const found = state.followUps.get(id);
        return found ? { ...found } : null;
      },
      async getOpenByLead(leadId) {
        const found = [...state.followUps.values()].find((f) => f.leadId === leadId && (f.status === "SCHEDULED" || f.status === "MISSED"));
        return found ? { ...found } : null;
      },
      async listByLead(leadId) {
        return [...state.followUps.values()]
          .filter((f) => f.leadId === leadId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
          .map((f) => ({ ...f }));
      },
      async update(id, patch: FollowUpPatch, at) {
        const found = state.followUps.get(id);
        if (!found) throw new LeadNotFoundError("Follow-up not found.");
        const becomesOpen = (patch.status === "SCHEDULED" || patch.status === "MISSED") && found.status !== "SCHEDULED" && found.status !== "MISSED";
        if (becomesOpen && [...state.followUps.values()].some((f) => f.id !== id && f.leadId === found.leadId && (f.status === "SCHEDULED" || f.status === "MISSED"))) {
          throw new LeadStateError("This lead already has an open follow-up.");
        }
        Object.assign(found, patch, { updatedAt: at });
        return { ...found };
      },
      async markMissed(scope: FollowUpScope, now) {
        const changed: LeadFollowUp[] = [];
        for (const f of state.followUps.values()) {
          if (f.status !== "SCHEDULED" || f.scheduledAt.getTime() >= now.getTime()) continue;
          if (scope.ownerId !== undefined && f.ownerId !== scope.ownerId) continue;
          if (scope.leadId !== undefined && f.leadId !== scope.leadId) continue;
          const lead = state.leads.get(f.leadId);
          if (!lead || lead.erasedAt) continue;
          f.status = "MISSED";
          f.missedCount += 1;
          f.lastMissedAt = now;
          f.updatedAt = now;
          changed.push({ ...f });
        }
        return changed.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      },
      async listUnresolvedMissed(query: MissedFollowUpQuery) {
        const out: FollowUpWithLead[] = [];
        for (const f of state.followUps.values()) {
          const unresolved = f.status === "MISSED" || (f.status === "SCHEDULED" && f.scheduledAt.getTime() < query.now.getTime());
          if (!unresolved) continue;
          if (query.ownerId !== undefined && f.ownerId !== query.ownerId) continue;
          if (query.leadId !== undefined && f.leadId !== query.leadId) continue;
          if (query.scheduledFrom && f.scheduledAt.getTime() < query.scheduledFrom.getTime()) continue;
          if (query.scheduledTo && f.scheduledAt.getTime() >= query.scheduledTo.getTime()) continue;
          if (query.overdueForAtLeastMs !== undefined && query.now.getTime() - f.scheduledAt.getTime() < query.overdueForAtLeastMs) continue;
          const lead = state.leads.get(f.leadId);
          if (!lead || lead.erasedAt) continue;
          if (query.temperature !== undefined && lead.temperature !== query.temperature) continue;
          if (query.status !== undefined && lead.status !== query.status) continue;
          out.push({ followUp: { ...f }, lead: { ...lead } });
        }
        return out.sort((a, b) => a.followUp.scheduledAt.getTime() - b.followUp.scheduledAt.getTime() || a.followUp.id.localeCompare(b.followUp.id)).slice(0, query.limit);
      },
      async listScheduled(query) {
        const out: FollowUpWithLead[] = [];
        for (const f of state.followUps.values()) {
          if (f.status !== "SCHEDULED") continue;
          if (f.scheduledAt.getTime() < query.from.getTime() || f.scheduledAt.getTime() >= query.to.getTime()) continue;
          if (query.ownerId !== undefined && f.ownerId !== query.ownerId) continue;
          if (query.leadId !== undefined && f.leadId !== query.leadId) continue;
          const lead = state.leads.get(f.leadId);
          if (!lead || lead.erasedAt) continue;
          out.push({ followUp: { ...f }, lead: { ...lead } });
        }
        return out.sort((a, b) => a.followUp.scheduledAt.getTime() - b.followUp.scheduledAt.getTime() || a.followUp.id.localeCompare(b.followUp.id)).slice(0, query.limit);
      },
      async claimDueNotifications(scope: FollowUpScope, upTo, now) {
        const changed: LeadFollowUp[] = [];
        for (const f of state.followUps.values()) {
          if (f.status !== "SCHEDULED" || f.dueNotifiedAt !== null || f.ownerId === null) continue;
          if (f.scheduledAt.getTime() > upTo.getTime()) continue;
          if (scope.ownerId !== undefined && f.ownerId !== scope.ownerId) continue;
          if (scope.leadId !== undefined && f.leadId !== scope.leadId) continue;
          const lead = state.leads.get(f.leadId);
          if (!lead || lead.erasedAt) continue;
          f.dueNotifiedAt = now;
          changed.push({ ...f });
        }
        return changed;
      },
      async statsByStaff(from, to, now) {
        const out: Record<string, { created: number; completed: number; missedNow: number }> = {};
        const row = (id: string) => (out[id] ??= { created: 0, completed: 0, missedNow: 0 });
        for (const f of state.followUps.values()) {
          const inRange = (d: Date | null) => d !== null && d.getTime() >= from.getTime() && d.getTime() < to.getTime();
          if (inRange(f.createdAt)) row(f.createdBy).created += 1;
          if (f.completedBy && inRange(f.completedAt)) row(f.completedBy).completed += 1;
          const open = f.status === "MISSED" || (f.status === "SCHEDULED" && f.scheduledAt.getTime() < now.getTime());
          if (open && f.ownerId && !state.leads.get(f.leadId)?.erasedAt) row(f.ownerId).missedNow += 1;
        }
        return out;
      },
      async eraseForLead(leadId) {
        for (const f of state.followUps.values()) {
          if (f.leadId === leadId) {
            f.note = null;
            f.cancelNote = null;
          }
        }
      },
    },

    calls: {
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
        state.calls.set(stored.id, stored);
        return { ...stored };
      },
      async getById(id) {
        const found = state.calls.get(id);
        return found ? { ...found } : null;
      },
      async getByProviderCallId(provider, providerCallId) {
        const found = [...state.calls.values()].find((c) => c.provider === provider && c.providerCallId === providerCallId);
        return found ? { ...found } : null;
      },
      async update(id, patch: CallPatch, at) {
        const found = state.calls.get(id);
        if (!found) throw new LeadNotFoundError("Call not found.");
        // The same rules migration 0021's trigger enforces, so a test cannot pass where the database would refuse.
        if (found.providerCallId !== null && patch.providerCallId !== undefined && patch.providerCallId !== found.providerCallId) throw new LeadStateError("A call's provider id cannot change.");
        if (TERMINAL_CALL_STATUSES.includes(found.status)) {
          const changes = (patch.status !== undefined && patch.status !== found.status) || (patch.answeredAt !== undefined && patch.answeredAt?.getTime() !== found.answeredAt?.getTime()) || (patch.endedAt !== undefined && patch.endedAt?.getTime() !== found.endedAt?.getTime()) || (patch.durationSeconds !== undefined && patch.durationSeconds !== found.durationSeconds);
          if (changes) throw new LeadStateError("A finished call cannot be changed.");
        }
        if (found.classification !== null && patch.classification !== undefined && patch.classification !== found.classification) throw new LeadStateError("A call's classification cannot be changed once set.");
        if (found.reportedAt !== null) {
          const changesReport = (patch.startedAt !== undefined && patch.startedAt?.getTime() !== found.startedAt?.getTime()) || (patch.deviceRef !== undefined && patch.deviceRef !== found.deviceRef) || (patch.simRef !== undefined && patch.simRef !== found.simRef) || (patch.callLogRef !== undefined && patch.callLogRef !== found.callLogRef) || (patch.reportedAt !== undefined && patch.reportedAt?.getTime() !== found.reportedAt.getTime());
          if (changesReport) throw new LeadStateError("A device report cannot be changed once received.");
        }
        if (found.disposition !== null && patch.disposition !== undefined && patch.disposition !== found.disposition) throw new LeadStateError("A call outcome cannot be changed once set.");
        if (patch.providerCallId !== undefined && patch.providerCallId !== null) {
          const clash = [...state.calls.values()].find((c) => c.id !== id && c.provider === found.provider && c.providerCallId === patch.providerCallId);
          if (clash) throw new LeadStateError("That provider call id is already recorded.");
        }
        Object.assign(found, patch, { updatedAt: at });
        return { ...found };
      },
      async appendEvent(event: NewCallEvent) {
        const existing = state.callEvents.find((e) => e.provider === event.provider && e.providerEventId === event.providerEventId);
        if (existing) return { event: { ...existing, payload: structuredClone(existing.payload) }, duplicate: true };
        const stored: StoredCallEvent = { id: randomUUID(), ...event, payload: structuredClone(event.payload) };
        state.callEvents.push(stored);
        return { event: { ...stored, payload: structuredClone(stored.payload) }, duplicate: false };
      },
      async listEvents(callId) {
        return state.callEvents.filter((e) => e.callId === callId).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).map((e) => ({ ...e, payload: structuredClone(e.payload) }));
      },
      async listByLead(leadId) {
        return [...state.calls.values()].filter((c) => c.leadId === leadId).sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime() || b.id.localeCompare(a.id)).map((c) => ({ ...c }));
      },
      async listRecent(filter: CallFilter) {
        const out: CallWithLead[] = [];
        for (const call of state.calls.values()) {
          const lead = state.leads.get(call.leadId);
          if (!lead || !callMatches(call, lead, filter)) continue;
          out.push({ call: { ...call }, lead: { id: lead.id, name: lead.name, sourceType: lead.sourceType, creationMethod: lead.creationMethod, erasedAt: lead.erasedAt } });
        }
        return out.sort((a, b) => b.call.initiatedAt.getTime() - a.call.initiatedAt.getTime() || b.call.id.localeCompare(a.call.id)).slice(0, filter.limit);
      },
      async aggregate(query: CallAggregateQuery) {
        const rows = new Map<string, CallAggregateRow & { leads: Set<string> }>();
        for (const call of state.calls.values()) {
          const lead = state.leads.get(call.leadId);
          if (!lead || !callMatches(call, lead, query)) continue;
          // Unfinished attempts (no classification yet) and anything that is not a failure are not activity.
          if (call.classification === null && call.status !== "FAILED") continue;
          const key = query.groupBy === "EMPLOYEE" ? call.staffUserId : bucketKey(call.initiatedAt, query.groupBy, query.timeZone);
          const row = rows.get(key) ?? { key, dialed: 0, connected: 0, noAnswer: 0, busy: 0, failed: 0, rejected: 0, talkSeconds: 0, leadsCalled: 0, leads: new Set<string>() };
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
          rows.set(key, row);
        }
        return [...rows.values()]
          .map(({ leads, ...row }) => ({ ...row, leadsCalled: leads.size }))
          .sort((a, b) => a.key.localeCompare(b.key));
      },
    },

    projects: {
      async create(input: NewProject) {
        const key = input.name.trim().toLowerCase();
        if ([...state.projects.values()].some((p) => p.developerId === input.developerId && p.name.toLowerCase() === key)) throw new LeadStateError("This developer already has a project with that name.");
        const project: Project = { id: randomUUID(), developerId: input.developerId, name: input.name, city: input.city, locality: input.locality, propertyType: input.propertyType, configurations: [...input.configurations], priceMin: input.priceMin, priceMax: input.priceMax, currency: input.currency, status: "ACTIVE", createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now };
        state.projects.set(project.id, project);
        return { ...project, configurations: [...project.configurations] };
      },
      async getById(id) {
        const p = state.projects.get(id);
        return p ? { ...p, configurations: [...p.configurations] } : null;
      },
      async update(id, patch, at) {
        const p = state.projects.get(id);
        if (!p) throw new LeadNotFoundError("Project not found.");
        if (patch.name !== undefined && [...state.projects.values()].some((o) => o.id !== id && o.developerId === p.developerId && o.name.toLowerCase() === patch.name!.trim().toLowerCase())) throw new LeadStateError("This developer already has a project with that name.");
        Object.assign(p, patch, { updatedAt: at });
        return { ...p, configurations: [...p.configurations] };
      },
      async list(query) {
        return [...state.projects.values()]
          .filter((p) => !query.activeOnly || p.status === "ACTIVE")
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, query.limit)
          .map((p) => ({ ...p, configurations: [...p.configurations] }));
      },
    },

    shortlist: {
      async add(input) {
        if ([...state.shortlist.values()].some((e) => e.leadId === input.leadId && e.projectId === input.projectId && e.removedAt === null)) throw new LeadStateError("That project is already on this buyer's shortlist.");
        const entry: ShortlistEntry = { id: randomUUID(), leadId: input.leadId, requirementId: input.requirementId, projectId: input.projectId, shortlistedBy: input.shortlistedBy, shortlistedAt: input.now, removedBy: null, removedAt: null };
        state.shortlist.set(entry.id, entry);
        return { ...entry };
      },
      async getById(id) {
        const e = state.shortlist.get(id);
        return e ? { ...e } : null;
      },
      async listByLead(leadId) {
        return [...state.shortlist.values()].filter((e) => e.leadId === leadId).sort((a, b) => a.shortlistedAt.getTime() - b.shortlistedAt.getTime()).map((e) => ({ ...e }));
      },
      async countActiveByProject() {
        const out: Record<string, number> = {};
        for (const e of state.shortlist.values()) if (e.removedAt === null) out[e.projectId] = (out[e.projectId] ?? 0) + 1;
        return out;
      },
      async remove(id, removedBy, at) {
        const e = state.shortlist.get(id);
        if (!e) throw new LeadNotFoundError("Shortlist entry not found.");
        if (e.removedAt !== null) throw new LeadStateError("That project was already removed from the shortlist.");
        e.removedBy = removedBy;
        e.removedAt = at;
        return { ...e };
      },
    },

    siteVisits: {
      async create(input) {
        if ([...state.siteVisits.values()].some((v) => v.leadId === input.leadId && v.projectId === input.projectId && OPEN_SITE_VISIT_STATUSES.includes(v.status))) throw new LeadStateError("This buyer already has an open site visit for that project. Reschedule it instead.");
        const visit: SiteVisit = { id: randomUUID(), leadId: input.leadId, requirementId: input.requirementId, projectId: input.projectId, staffUserId: input.staffUserId, scheduledAt: input.scheduledAt, status: "SCHEDULED", confirmedAt: null, completedAt: null, outcome: null, nextAction: null, notes: input.notes, rescheduledFrom: input.rescheduledFrom, createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now };
        state.siteVisits.set(visit.id, visit);
        return { ...visit };
      },
      async getById(id) {
        const v = state.siteVisits.get(id);
        return v ? { ...v } : null;
      },
      async update(id, patch, at) {
        const v = state.siteVisits.get(id);
        if (!v) throw new LeadNotFoundError("Site visit not found.");
        if (!OPEN_SITE_VISIT_STATUSES.includes(v.status)) throw new LeadStateError("A finished site visit cannot be changed.");
        Object.assign(v, patch, { updatedAt: at });
        return { ...v };
      },
      async listByLead(leadId) {
        return [...state.siteVisits.values()].filter((v) => v.leadId === leadId).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).map((v) => ({ ...v }));
      },
      async list(query) {
        return [...state.siteVisits.values()]
          .filter((v) => (query.staffUserId === undefined || v.staffUserId === query.staffUserId) && (!query.statuses || query.statuses.includes(v.status)) && (!query.from || v.scheduledAt >= query.from) && (!query.to || v.scheduledAt < query.to))
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
          .slice(0, query.limit)
          .map((v) => ({ ...v }));
      },
      async appendEvent(input) {
        const event: SiteVisitEvent = { ...input, id: randomUUID(), payload: { ...input.payload } };
        state.siteVisitEvents.push(event);
        return { ...event };
      },
      async listEvents(visitId) {
        return state.siteVisitEvents.filter((e) => e.visitId === visitId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((e) => ({ ...e }));
      },
      async eraseForLead(leadId) {
        for (const v of state.siteVisits.values()) if (v.leadId === leadId) Object.assign(v, { notes: null, nextAction: null });
      },
      async countByProject(from, to) {
        const out: Record<string, number> = {};
        for (const v of state.siteVisits.values()) if (v.projectId && v.rescheduledFrom === null && v.createdAt >= from && v.createdAt < to) out[v.projectId] = (out[v.projectId] ?? 0) + 1;
        return out;
      },
      async statsByStaff(from, to) {
        const out: Record<string, SiteVisitStats> = {};
        const row = (id: string) => (out[id] ??= { scheduled: 0, completed: 0, noShow: 0 });
        for (const v of state.siteVisits.values()) {
          if (v.rescheduledFrom === null && v.createdAt >= from && v.createdAt < to) row(v.staffUserId).scheduled += 1;
          if (v.status === "COMPLETED" && v.completedAt && v.completedAt >= from && v.completedAt < to) row(v.staffUserId).completed += 1;
          if (v.status === "NO_SHOW" && v.completedAt && v.completedAt >= from && v.completedAt < to) row(v.staffUserId).noShow += 1;
        }
        return out;
      },
    },

    callingBatches: {
      async create(input: NewCallingBatch) {
        const id = randomUUID();
        state.callingBatches.set(id, { id, name: input.name, createdBy: input.createdBy, assignedTo: input.assignedTo, importBatchId: input.importBatchId, status: "ACTIVE", createdAt: input.now });
        input.leadIds.forEach((leadId, position) => state.callingItems.push({ batchId: id, leadId, position, skippedAt: null, skippedBy: null }));
        return { ...state.callingBatches.get(id)!, itemCount: input.leadIds.length };
      },
      async getById(id) {
        const b = state.callingBatches.get(id);
        return b ? { ...b, itemCount: state.callingItems.filter((i) => i.batchId === id).length } : null;
      },
      async listForAssignee(staffUserId) {
        return [...state.callingBatches.values()]
          .filter((b) => b.assignedTo === staffUserId)
          .sort((a, b) => (a.status === b.status ? 0 : a.status === "ACTIVE" ? -1 : 1) || b.createdAt.getTime() - a.createdAt.getTime())
          .map((b) => ({ ...b, itemCount: state.callingItems.filter((i) => i.batchId === b.id).length }));
      },
      async listAll(limit) {
        return [...state.callingBatches.values()]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit)
          .map((b) => ({ ...b, itemCount: state.callingItems.filter((i) => i.batchId === b.id).length }));
      },
      async progress(batchId) {
        const out: BatchLeadProgress[] = [];
        for (const item of state.callingItems.filter((i) => i.batchId === batchId).sort((a, b) => a.position - b.position)) {
          const lead = state.leads.get(item.leadId);
          if (!lead) continue;
          const calls = [...state.calls.values()].filter((c) => c.batchId === batchId && c.leadId === item.leadId);
          const classified = calls.filter((c) => c.classification !== null).sort((a, b) => (b.startedAt ?? b.initiatedAt).getTime() - (a.startedAt ?? a.initiatedAt).getTime());
          out.push({
            lead: { ...lead },
            position: item.position,
            calls: classified.length,
            connectedCalls: classified.filter((c) => c.classification === "CONNECTED").length,
            failedCalls: calls.filter((c) => c.status === "FAILED").length,
            unmeasuredCalls: calls.filter((c) => c.endReason === "DURATION_UNAVAILABLE").length,
            skippedAt: item.skippedAt,
            lastCallAt: classified[0] ? (classified[0].startedAt ?? classified[0].initiatedAt) : null,
            lastClassification: classified[0]?.classification ?? null,
          });
        }
        return out;
      },
      async skip(batchId, leadId, skippedBy, at) {
        const item = state.callingItems.find((i) => i.batchId === batchId && i.leadId === leadId);
        if (!item) return false;
        if (item.skippedAt === null) {
          item.skippedAt = at;
          item.skippedBy = skippedBy;
        }
        return true;
      },
      async close(id) {
        const b = state.callingBatches.get(id);
        if (!b) throw new LeadNotFoundError("Calling batch not found.");
        b.status = "CLOSED";
        return { ...b, itemCount: state.callingItems.filter((i) => i.batchId === id).length };
      },
    },

    importBatches: {
      async create(input: NewImportBatch) {
        const stored: LeadImportBatch = { id: randomUUID(), ...input, rowCount: 0, createdCount: 0, duplicateCount: 0, rejectedCount: 0 };
        state.batches.set(stored.id, stored);
        return { ...stored };
      },
      async finish(id, counts) {
        const found = state.batches.get(id);
        if (!found) throw new LeadNotFoundError("Import batch not found.");
        Object.assign(found, counts);
        return { ...found };
      },
      async list(limit) {
        return [...state.batches.values()].sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime()).slice(0, limit).map((b) => ({ ...b }));
      },
      async getById(id) {
        const found = state.batches.get(id);
        return found ? { ...found } : null;
      },
    },

    async transaction<T>(work: (inner: LeadRepositories) => Promise<T>): Promise<T> {
      if (insideTransaction.getStore()) return work(repos);
      const run = async () => {
        const before = cloneState();
        try {
          return await insideTransaction.run(true, () => work(repos));
        } catch (error) {
          state.leads = before.leads;
          state.events = before.events;
          state.touches = before.touches;
          state.consents = before.consents;
          state.bookings = before.bookings;
          state.requirements = before.requirements;
          state.followUps = before.followUps;
          state.calls = before.calls;
          state.callEvents = before.callEvents;
          state.batches = before.batches;
          state.callingBatches = before.callingBatches;
          state.callingItems = before.callingItems;
          state.projects = before.projects;
          state.shortlist = before.shortlist;
          state.siteVisits = before.siteVisits;
          state.siteVisitEvents = before.siteVisitEvents;
          state.campaigns = before.campaigns;
          state.spend = before.spend;
          state.automation = before.automation;
          state.automationSettings = before.automationSettings;
          throw error;
        }
      };
      const result = queue.then(run, run);
      queue = result.catch(() => undefined);
      return result;
    },
  };

  return Object.assign(repos, {
    recordPageView: (userId: string, at: Date) => {
      state.pageViews.push({ userId, at });
    },
    snapshot: () => ({
      leads: [...state.leads.values()].map((lead) => ({ ...lead })),
      events: state.events.map((event) => ({ ...event, payload: structuredClone(event.payload) })),
    }),
  });
}
