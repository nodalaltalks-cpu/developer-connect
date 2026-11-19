import { randomUUID } from "node:crypto";
import { safeId } from "../../firestore/convert.ts";
import type { Where } from "../../firestore/tx.ts";
import { summariseEvents } from "../activity-summary.ts";
import type { TouchEvidence } from "../acquisition.ts";
import { LeadNotFoundError, LeadStateError } from "../errors.ts";
import { CLOSED_OUT_STATUSES, compareForView, matchesView } from "../lead-views.ts";
import { QUEUE_EXCLUDED_STATUSES } from "../queue-config.ts";
import { assertNoImmutableFields } from "../repository.ts";
import type {
  BookingRepository,
  ConsentRepository,
  FollowUpRepository,
  FollowUpScope,
  FollowUpWithLead,
  LeadEventRepository,
  LeadPatch,
  LeadRepository,
  MissedFollowUpQuery,
  NewBooking,
  NewConsent,
  NewFollowUp,
  NewLeadEvent,
  NewLeadInput,
  NewRequirement,
  NewTouch,
  RequirementLocation,
  RequirementRepository,
  SourceFunnelRow,
  SourceRevenueRow,
  TouchRepository,
} from "../repository.ts";
import {
  LEAD_STATUSES,
  type Booking,
  type Lead,
  type LeadCall,
  type LeadConsent,
  type LeadEvent,
  type LeadFollowUp,
  type LeadRequirement,
  type LeadStatus,
  type MarketingTouch,
  type ShortlistEntry,
  type SiteVisit,
} from "../types.ts";
import { chunk, decode, encode, EPOCH, findByIds, getMany, mapLimit, type Fs } from "./base.ts";

/** Statuses that are not finished or invalid: the "open" set the SQL expressed as `not in CLOSED_OUT_STATUSES`. */
export const OPEN_STATUSES: LeadStatus[] = LEAD_STATUSES.filter((s) => !CLOSED_OUT_STATUSES.includes(s));
const QUEUE_ALLOWED: LeadStatus[] = LEAD_STATUSES.filter((s) => !QUEUE_EXCLUDED_STATUSES.includes(s));
const QUALIFIED_OR_LATER: LeadStatus[] = ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"];

const phoneKey = (e164: string) => `leadPhone:${safeId(e164)}`;
/** The sales-team view of a lead: personal data not erased, not in Trash, and not a bare cold-called prospect (PostgreSQL's `liveLead`). */
const isLive = (l: Lead) => l.erasedAt === null && l.trashedAt === null && !l.prospect;
/** `_ord` is the insertion order of the lead: the tie-break the in-memory repository got for free from its Map. */
const leadDoc = (l: Lead, ord: number = nextSeq()) => encode(l, { _live: isLive(l), _ord: ord });
const ords = new WeakMap<object, number>();
const decodeLead = (v: { id: string; data(): FirebaseFirestore.DocumentData | undefined }): Lead => {
  const lead = decode<Lead>(v);
  ords.set(lead, (v.data()?._ord as number | undefined) ?? 0);
  return lead;
};
const byInsertion = (a: Lead, b: Lead) => (ords.get(a) ?? 0) - (ords.get(b) ?? 0);

// ============================================================================================================
// leads
// ============================================================================================================

export function buildLeadRepository(fs: Fs, developerNames: Record<string, string> | null): LeadRepository {
  const { ctx } = fs;
  const leads = () => fs.col("leads");
  const one = async (id: string) => {
    const v = await ctx.get(leads().doc(id));
    return v.exists ? decodeLead(v) : null;
  };
  const find = async (where: Where[], extra: { orderBy?: Array<[string, "asc" | "desc"]>; limit?: number } = {}) =>
    (await ctx.find(leads(), { where, ...extra })).map((v) => decodeLead(v));
  const liveWhere = (extra: Where[] = []): Where[] => [["_live", "==", true], ...extra];

  async function relatedByLead<T>(collection: string, leadIds: string[]): Promise<Map<string, T[]>> {
    const rows = await findByIds(fs, collection, "leadId", leadIds);
    const out = new Map<string, T[]>();
    for (const v of rows) {
      const item = decode<T & { leadId: string }>(v);
      out.set(item.leadId, [...(out.get(item.leadId) ?? []), item]);
    }
    return out;
  }

  return {
    async upsertByPhone(input: NewLeadInput) {
      return ctx.run(async (c) => {
        const lk = fs.lookup(phoneKey(input.phoneE164));
        const existingKey = await c.get(lk);
        if (existingKey.exists) {
          const ref = leads().doc(existingKey.data()!.leadId as string);
          const lead = decodeLead(await c.get(ref));
          // A real capture of a number that was only a prospect promotes it; another prospect call leaves it as it is.
          if (lead.prospect && input.prospect !== true) {
            await c.update(ref, { prospect: false, _live: lead.erasedAt === null });
            return { lead: { ...lead, prospect: false }, created: false };
          }
          return { lead, created: false };
        }
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
          trashedAt: null,
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
          prospect: input.prospect === true,
          createdAt: input.now,
          updatedAt: input.now,
        };
        await c.create(leads().doc(lead.id), leadDoc(lead));
        await c.create(lk, { leadId: lead.id });
        return { lead, created: true };
      });
    },
    getById: one,
    async findByPhone(phoneE164) {
      const key = await ctx.get(fs.lookup(phoneKey(phoneE164)));
      return key.exists ? one(key.data()!.leadId as string) : null;
    },
    async update(id: string, patch: LeadPatch, at: Date) {
      assertNoImmutableFields(patch);
      return ctx.run(async (c) => {
        const ref = leads().doc(id);
        const view = await c.get(ref);
        if (!view.exists) throw new LeadNotFoundError("Lead not found.");
        const cur = decodeLead(view);
        // A phone number may only be cleared (erasure) or moved to a number nobody else holds.
        if (patch.phoneE164 && patch.phoneE164 !== cur.phoneE164) {
          const lk = fs.lookup(phoneKey(patch.phoneE164));
          const taken = await c.get(lk);
          if (taken.exists && taken.data()!.leadId !== id) throw new Error("duplicate phone");
          if (!taken.exists) await c.create(lk, { leadId: id });
          if (cur.phoneE164) await c.delete(fs.lookup(phoneKey(cur.phoneE164)));
        } else if ("phoneE164" in patch && patch.phoneE164 === null && cur.phoneE164) {
          await c.delete(fs.lookup(phoneKey(cur.phoneE164)));
        }
        const next: Lead = { ...cur, ...patch, updatedAt: at };
        await c.set(ref, leadDoc(next, (view.data()?._ord as number | undefined) ?? 0));
        return next;
      });
    },
    async listForQueue(limit) {
      // The follow-up-due leads (soonest first) UNION the most recently active ones, both over open leads only.
      const [due, recent] = await Promise.all([
        find(liveWhere([["status", "in", QUEUE_ALLOWED], ["nextFollowUpAt", ">", EPOCH]]), { orderBy: [["nextFollowUpAt", "asc"]], limit }),
        find(liveWhere([["status", "in", QUEUE_ALLOWED]]), { orderBy: [["lastActivityAt", "desc"]], limit }),
      ]);
      const byId = new Map([...due, ...recent].map((l) => [l.id, l]));
      return [...byId.values()];
    },
    async list(query) {
      const where: Where[] = liveWhere();
      if (query.ownerId !== undefined) where.push(["ownerId", "==", query.ownerId]);
      if (query.sourceType !== undefined) where.push(["sourceType", "==", query.sourceType]);
      const followUpView = query.view === "overdue" || query.view === "due_today" || query.view === "follow_up_due";
      let rows: Lead[];
      if (followUpView) {
        // Only leads with a follow-up before the end of today can match; the rest of the rule is applied below.
        rows = await find([["nextFollowUpAt", "<", query.endOfToday]], { orderBy: [["nextFollowUpAt", "asc"]] });
      } else {
        if (query.view === "new") where.push(["status", "==", "NEW"]);
        if (query.view === "qualified") where.push(["status", "==", "QUALIFIED"]);
        if (query.view === "hot") where.push(["temperature", "==", "HOT"]);
        if (query.view === "warm") where.push(["temperature", "==", "WARM"]);
        if (query.view === "cold") where.push(["temperature", "==", "COLD"]);
        rows = await find(where);
      }
      const matching = rows
        .filter((l) => (query.ownerId === undefined || l.ownerId === query.ownerId) && (query.sourceType === undefined || l.sourceType === query.sourceType) && matchesView(l, query.view, query.now, query.endOfToday))
        .sort(compareForView(query.view));
      return { total: matching.length, leads: matching.slice(query.offset, query.offset + query.limit) };
    },
    async counts(now, endOfToday, sourceType) {
      const base: Where[] = liveWhere(sourceType === undefined ? [] : [["sourceType", "==", sourceType]]);
      const n = (extra: Where[]) => ctx.count(leads(), [...base, ...extra]);
      const [total, nw, hot, warm, cold, qualified, siteVisitScheduled, booked, dueRows] = await Promise.all([
        n([]),
        n([["status", "==", "NEW"]]),
        n([["temperature", "==", "HOT"], ["status", "in", OPEN_STATUSES]]),
        n([["temperature", "==", "WARM"], ["status", "in", OPEN_STATUSES]]),
        n([["temperature", "==", "COLD"], ["status", "in", OPEN_STATUSES]]),
        n([["status", "==", "QUALIFIED"]]),
        n([["status", "==", "SITE_VISIT_SCHEDULED"]]),
        n([["status", "==", "BOOKED"]]),
        find([["nextFollowUpAt", "<", endOfToday]]),
      ]);
      const due = dueRows.filter((l) => isLive(l) && (sourceType === undefined || l.sourceType === sourceType) && !CLOSED_OUT_STATUSES.includes(l.status));
      return {
        total,
        new: nw,
        hot,
        warm,
        cold,
        overdue: due.filter((l) => l.nextFollowUpAt!.getTime() < now.getTime()).length,
        dueToday: due.filter((l) => l.nextFollowUpAt!.getTime() >= now.getTime()).length,
        qualified,
        siteVisitScheduled,
        booked,
      };
    },
    async countOpenWithoutRequirement(ownerId) {
      const stages: LeadStatus[] = ["CONTACTED", "QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION"];
      const owned = await find(liveWhere([["ownerId", "==", ownerId], ["status", "in", stages]]));
      if (owned.length === 0) return 0;
      const withActive = await findByIds(fs, "leadRequirements", "leadId", owned.map((l) => l.id), [["status", "==", "ACTIVE"]]);
      const has = new Set(withActive.map((v) => v.data()!.leadId as string));
      return owned.filter((l) => !has.has(l.id)).length;
    },
    async sourceFunnel(query) {
      const byOwner = query.groupBy === "OWNER";
      const personOf = (l: Lead) => (l.sourceType === "COLD_CALL" ? l.createdBy : l.ownerId) ?? null;
      const cohort = (await find([["createdAt", ">=", query.from], ["createdAt", "<", query.to]])).filter(
        (l) => l.erasedAt === null && !l.prospect && (!query.sourceType || l.sourceType === query.sourceType) && (!query.personId || personOf(l) === query.personId),
      );
      const ids = cohort.map((l) => l.id);
      const [events, calls, visits, shortlist, bookings] = await Promise.all([
        relatedByLead<LeadEvent>("leadEvents", ids),
        relatedByLead<LeadCall>("leadCalls", ids),
        relatedByLead<SiteVisit>("siteVisits", ids),
        relatedByLead<ShortlistEntry>("leadProjectShortlist", ids),
        relatedByLead<Booking>("bookings", ids),
      ]);
      const ever = (l: Lead, statuses: string[]) => statuses.includes(l.status) || (events.get(l.id) ?? []).some((e) => e.toStatus !== null && statuses.includes(e.toStatus));
      const rows = new Map<string, SourceFunnelRow>();
      const revenue = new Map<string, SourceRevenueRow>();
      for (const l of cohort) {
        const lc = calls.get(l.id) ?? [];
        const lv = visits.get(l.id) ?? [];
        const key = byOwner ? `${l.sourceType}|${personOf(l) ?? ""}` : `${l.sourceType}|${l.sourceDetail ?? ""}`;
        const row = rows.get(key) ?? { sourceType: l.sourceType, sourceDetail: byOwner ? null : l.sourceDetail, personId: byOwner ? personOf(l) : null, leads: 0, called: 0, connected: 0, qualified: 0, shortlisted: 0, visitsScheduled: 0, visitsDone: 0, negotiation: 0, booked: 0, talkSeconds: 0 };
        row.leads += 1;
        if (lc.some((c) => c.classification !== null)) row.called += 1;
        if (lc.some((c) => c.classification === "CONNECTED")) row.connected += 1;
        if (ever(l, QUALIFIED_OR_LATER)) row.qualified += 1;
        if ((shortlist.get(l.id) ?? []).length > 0) row.shortlisted += 1;
        if (lv.some((v) => v.status !== "CANCELLED")) row.visitsScheduled += 1;
        if (lv.some((v) => v.status === "COMPLETED")) row.visitsDone += 1;
        if (ever(l, ["NEGOTIATION", "BOOKED", "CLOSED"])) row.negotiation += 1;
        row.talkSeconds += lc.filter((c) => c.classification === "CONNECTED").reduce((s, c) => s + (c.durationSeconds ?? 0), 0);
        const booked = (bookings.get(l.id) ?? []).filter((b) => b.status === "BOOKED");
        if (booked.length > 0) row.booked += 1;
        for (const b of booked) {
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
      const [calls, shortlist] = await Promise.all([relatedByLead<LeadCall>("leadCalls", leadIds), relatedByLead<ShortlistEntry>("leadProjectShortlist", leadIds)]);
      const projectIds = [...shortlist.values()].flat().filter((e) => e.removedAt === null).map((e) => e.projectId);
      const projects = new Map((await getMany(fs, "projects", projectIds)).map((v) => [v.id, v.data()!.name as string]));
      return leadIds.map((id) => {
        const latest = (calls.get(id) ?? []).sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime())[0];
        const names = (shortlist.get(id) ?? [])
          .filter((e) => e.removedAt === null)
          .sort((a, b) => a.shortlistedAt.getTime() - b.shortlistedAt.getTime())
          .map((e) => projects.get(e.projectId))
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
      if (developerNames) return Object.fromEntries(ids.filter((id) => id in developerNames).map((id) => [id, developerNames[id]]));
      const rows = await getMany({ ...fs, ns: "", col: (n) => ctx.db.collection(n) }, "developers", ids);
      return Object.fromEntries(rows.map((v) => [v.id, v.data()!.displayName as string]));
    },
    async ownerSummary() {
      const out: Record<string, { qualified: number; siteVisit: number; booked: number }> = {};
      for (const lead of await find(liveWhere([["ownerId", ">", ""]]))) {
        if (!lead.ownerId) continue;
        const row = (out[lead.ownerId] ??= { qualified: 0, siteVisit: 0, booked: 0 });
        if (lead.status === "QUALIFIED") row.qualified += 1;
        if (lead.status === "SITE_VISIT_SCHEDULED") row.siteVisit += 1;
        if (lead.status === "BOOKED") row.booked += 1;
      }
      return out;
    },
    async listReturned(limit) {
      const rows = await find([["returnedAt", ">", EPOCH]], { orderBy: [["returnedAt", "desc"]] });
      return rows
        .filter((l) => l.returnedAt !== null && l.ownerId === null && l.erasedAt === null && l.trashedAt === null && !l.prospect)
        .sort((a, b) => b.returnedAt!.getTime() - a.returnedAt!.getTime() || a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async listTrashed(limit) {
      const rows = await find([["trashedAt", ">", EPOCH]], { orderBy: [["trashedAt", "desc"]] });
      return rows
        .filter((l) => l.trashedAt !== null && l.erasedAt === null && !l.prospect)
        .sort((a, b) => b.trashedAt!.getTime() - a.trashedAt!.getTime() || a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async countByOwner() {
      const counts: Record<string, number> = {};
      for (const lead of await find(liveWhere([["ownerId", ">", ""]]))) if (lead.ownerId) counts[lead.ownerId] = (counts[lead.ownerId] ?? 0) + 1;
      return counts;
    },
    async stageHistory() {
      const order: LeadStatus[] = ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION"];
      const forward: string[] = ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"];
      const [live, changes, booked] = await Promise.all([
        find([]).then((all) => all.filter((l) => l.erasedAt === null && !l.prospect)),
        ctx.find(fs.col("leadEvents"), { where: [["eventType", "==", "STATUS_CHANGED"]] }),
        ctx.find(fs.col("bookings"), { where: [["status", "==", "BOOKED"]] }),
      ]);
      const best = new Map<string, number>();
      for (const v of changes) {
        const d = v.data()!;
        if (d.toStatus) best.set(d.leadId, Math.max(best.get(d.leadId) ?? -1, forward.indexOf(d.toStatus)));
      }
      const hasBooking = new Set(booked.map((v) => v.data()!.leadId as string));
      return order.map((stage) => {
        let reached = 0;
        let bookedCount = 0;
        for (const l of live) {
          const reachedStage = Math.max(forward.indexOf(l.status), best.get(l.id) ?? -1);
          if (reachedStage >= forward.indexOf(stage)) {
            reached += 1;
            if (hasBooking.has(l.id)) bookedCount += 1;
          }
        }
        return { stage, reached, booked: bookedCount };
      });
    },
    async listStale({ staleBefore, limit }) {
      const rows = await find(liveWhere([["status", "in", OPEN_STATUSES], ["lastActivityAt", "<", staleBefore]]), { orderBy: [["lastActivityAt", "asc"]] });
      return rows.filter((l) => l.ownerId !== null).sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime() || byInsertion(a, b)).slice(0, limit);
    },
    async listReturnVisits({ since, minLeadAgeMs, limit }) {
      const candidates = (await find(liveWhere([["status", "in", OPEN_STATUSES]]))).filter((l) => l.ownerId !== null && l.userId !== null);
      const found = await mapLimit(candidates, 8, async (l) => {
        const views = await ctx.find(fs.col("analyticsEvents"), {
          where: [["userId", "==", l.userId], ["eventName", "==", "page_viewed"], ["occurredAt", ">=", new Date(Math.max(since.getTime(), l.createdAt.getTime() + minLeadAgeMs))]],
          orderBy: [["occurredAt", "desc"]],
          limit: 1,
        });
        const at = views[0]?.data()?.occurredAt;
        return at ? { lead: l, viewedAt: (at as { toDate(): Date }).toDate() } : null;
      });
      return found.filter((r): r is { lead: Lead; viewedAt: Date } => r !== null).sort((a, b) => b.viewedAt.getTime() - a.viewedAt.getTime()).slice(0, limit);
    },
    async listUnassignedOpen(limit) {
      const rows = await find(liveWhere([["ownerId", "==", null], ["status", "in", OPEN_STATUSES]]));
      return rows.filter((l) => l.returnedAt === null).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || byInsertion(a, b)).slice(0, limit);
    },
    async countOpenByOwner() {
      const out: Record<string, number> = {};
      for (const l of await find(liveWhere([["status", "in", OPEN_STATUSES], ["ownerId", ">", ""]]))) if (l.ownerId) out[l.ownerId] = (out[l.ownerId] ?? 0) + 1;
      return out;
    },
    async statusCounts() {
      const out: Partial<Record<LeadStatus, number>> = {};
      const counts = await Promise.all(LEAD_STATUSES.map((s) => ctx.count(leads(), liveWhere([["status", "==", s]]))));
      LEAD_STATUSES.forEach((s, i) => {
        if (counts[i] > 0) out[s] = counts[i];
      });
      return out;
    },
    async exceptionCounts({ unassignedOlderThan, staleBefore }) {
      const unassigned = await find(liveWhere([["ownerId", "==", null], ["status", "in", OPEN_STATUSES]]));
      const staleOpen = await ctx.count(leads(), liveWhere([["status", "in", OPEN_STATUSES], ["lastActivityAt", "<", staleBefore], ["ownerId", ">", ""]]));
      return { unassignedOpen: unassigned.length, unassignedOld: unassigned.filter((l) => l.createdAt < unassignedOlderThan).length, staleOpen };
    },
    async acquisitionRows(query) {
      const rows = await find([["createdAt", ">=", query.from], ["createdAt", "<", query.to]], { orderBy: [["createdAt", "desc"]], limit: query.limit });
      const ids = rows.map((l) => l.id);
      const touchIds = rows.flatMap((l) => [l.firstTouchId, l.lastTouchId]).filter((t): t is string => t !== null);
      const [touchViews, events, visits, bookings, calls] = await Promise.all([
        getMany(fs, "marketingTouches", touchIds),
        relatedByLead<LeadEvent>("leadEvents", ids),
        relatedByLead<SiteVisit>("siteVisits", ids),
        relatedByLead<Booking>("bookings", ids),
        relatedByLead<LeadCall>("leadCalls", ids),
      ]);
      const touches = new Map(touchViews.map((v) => [v.id, decode<MarketingTouch>(v)]));
      const evidence = (id: string | null): TouchEvidence | null => {
        const t = id ? touches.get(id) : null;
        return t ? { utmSource: t.utmSource, utmMedium: t.utmMedium, utmCampaign: t.utmCampaign, gclid: t.gclid, fbclid: t.fbclid, referrer: t.referrer, landingPath: t.landingPath } : null;
      };
      return rows.map((l) => {
        const ev = events.get(l.id) ?? [];
        const lc = calls.get(l.id) ?? [];
        const lb = (bookings.get(l.id) ?? []).filter((b) => b.status === "BOOKED");
        return {
          leadId: l.id,
          createdAt: l.createdAt,
          sourceType: l.sourceType,
          creationMethod: l.creationMethod,
          first: evidence(l.firstTouchId),
          latest: evidence(l.lastTouchId),
          reachedQualified: QUALIFIED_OR_LATER.includes(l.status) || ev.some((e) => e.eventType === "STATUS_CHANGED" && e.toStatus !== null && QUALIFIED_OR_LATER.includes(e.toStatus)),
          hasSiteVisit: (visits.get(l.id) ?? []).some((v) => v.rescheduledFrom === null),
          booked: lb.length > 0,
          firstContactAt: [...lc.map((c) => c.initiatedAt), ...ev.filter((e) => e.eventType === "WHATSAPP_OPENED").map((e) => e.createdAt)].sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
          junk: l.status === "UNQUALIFIED" || lc.some((c) => c.disposition === "INVALID_NUMBER"),
          bookings: lb.map((b) => ({ currency: b.currency, bookingValue: b.bookingValue, commissionExpected: b.commissionExpected, commissionReceived: b.commissionReceived, projectId: b.projectId, projectName: b.projectName })),
        };
      });
    },
  };
}

// ============================================================================================================
// lead events
// ============================================================================================================

/**
 * The event position ("seq"): microseconds since the epoch, forced to be strictly increasing within this process. It
 * gives the same two things the PostgreSQL identity column did - a stable order for events sharing one timestamp, and a
 * cursor that only ever grows - without every event in the system writing one shared counter document (which would
 * make all CRM activity queue behind a single row). Cross-instance clock differences are far below what a cursor needs.
 */
let lastSeq = 0;
function nextSeq(): number {
  lastSeq = Math.max(lastSeq + 1, Date.now() * 1000);
  return lastSeq;
}

export function buildEventRepository(fs: Fs): LeadEventRepository {
  const { ctx } = fs;
  const events = () => fs.col("leadEvents");

  return {
    async append(event: NewLeadEvent) {
      return ctx.run(async (c) => {
        const seq = nextSeq();

        // Who should see this event move their cursor: the actor, the lead's owner at the time, and both sides of a hand-over.
        const lead = await c.get(fs.col("leads").doc(event.leadId));
        const owner = (lead.data()?.ownerId as string | null | undefined) ?? null;
        const visibleTo = [event.actorId, owner, event.payload.to, event.payload.from].filter((x): x is string => typeof x === "string" && x.length > 0);

        const stored: LeadEvent = { id: randomUUID(), ...event, payload: structuredClone(event.payload) };
        await c.create(events().doc(stored.id), encode(stored, { _seq: seq, _visibleTo: [...new Set(visibleTo)] }));
        return stored;
      });
    },
    async listByLead(leadId) {
      const rows = await ctx.find(events(), { where: [["leadId", "==", leadId]], orderBy: [["createdAt", "asc"], ["_seq", "asc"]] });
      return rows.map((v) => decode<LeadEvent>(v));
    },
    async summarise(leadIds) {
      const rows = await findByIds(fs, "leadEvents", "leadId", leadIds);
      const byLead = new Map<string, LeadEvent[]>();
      for (const v of rows) {
        const e = decode<LeadEvent>(v);
        byLead.set(e.leadId, [...(byLead.get(e.leadId) ?? []), e]);
      }
      return leadIds.map((id) => summariseEvents(id, byLead.get(id) ?? []));
    },
    async latestSeq(scope) {
      if (!scope.personId) {
        const newest = await ctx.find(events(), { where: [], orderBy: [["_seq", "desc"]], limit: 1 });
        return (newest[0]?.data()?._seq as number | undefined) ?? 0;
      }
      const rows = await ctx.find(events(), { where: [["_visibleTo", "array-contains", scope.personId]], orderBy: [["_seq", "desc"]], limit: 1 });
      return (rows[0]?.data()?._seq as number | undefined) ?? 0;
    },
    async redactPayloads(leadId, redact) {
      const rows = await ctx.find(events(), { where: [["leadId", "==", leadId]] });
      let changed = 0;
      for (const v of rows) {
        const e = decode<LeadEvent>(v);
        const next = redact({ ...e, payload: structuredClone(e.payload) });
        if (JSON.stringify(next) !== JSON.stringify(e.payload)) {
          await ctx.update(v.ref, { payload: structuredClone(next) });
          changed += 1;
        }
      }
      return changed;
    },
    async countByTypeAndActor(eventType, from, to) {
      const rows = await ctx.find(events(), { where: [["eventType", "==", eventType], ["createdAt", ">=", from], ["createdAt", "<", to]] });
      const counts: Record<string, number> = {};
      for (const v of rows) {
        const actor = v.data()!.actorId as string | null;
        if (actor) counts[actor] = (counts[actor] ?? 0) + 1;
      }
      return counts;
    },
    async listByActor(actorId, { limit, before }) {
      const where: Where[] = [["actorId", "==", actorId]];
      if (before) where.push(["createdAt", "<", before]);
      const rows = await ctx.find(events(), { where, orderBy: [["createdAt", "desc"]], limit });
      return rows.map((v) => decode<LeadEvent>(v));
    },
    async actorLeadCounts(actorId) {
      const [acted, assigned] = await Promise.all([
        ctx.find(events(), { where: [["actorId", "==", actorId]] }),
        ctx.find(events(), { where: [["eventType", "==", "OWNER_CHANGED"], ["payload.to", "==", actorId]] }),
      ]);
      return { leadsActedOn: new Set(acted.map((v) => v.data()!.leadId)).size, leadsAssignedTo: new Set(assigned.map((v) => v.data()!.leadId)).size };
    },
  };
}

// ============================================================================================================
// touches, consents, bookings
// ============================================================================================================

export function buildTouchRepository(fs: Fs): TouchRepository {
  return {
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
      await fs.ctx.create(fs.col("marketingTouches").doc(stored.id), encode(stored));
      return stored;
    },
    async getById(id) {
      const v = await fs.ctx.get(fs.col("marketingTouches").doc(id));
      return v.exists ? decode<MarketingTouch>(v) : null;
    },
    countBySessionSince(sessionId, since) {
      return fs.ctx.count(fs.col("marketingTouches"), [["sessionId", "==", sessionId], ["occurredAt", ">=", since]]);
    },
  };
}

export function buildConsentRepository(fs: Fs): ConsentRepository {
  const { ctx } = fs;
  const col = () => fs.col("leadConsents");
  const list = async (leadId: string) => (await ctx.find(col(), { where: [["leadId", "==", leadId]], orderBy: [["givenAt", "asc"]] }));
  return {
    async create(consent: NewConsent) {
      const stored: LeadConsent = { id: randomUUID(), ...consent, withdrawnAt: null };
      await ctx.create(col().doc(stored.id), encode(stored));
      return stored;
    },
    async listByLead(leadId) {
      return (await list(leadId)).map((v) => decode<LeadConsent>(v));
    },
    async withdrawActive(leadId, at) {
      const withdrawn: LeadConsent[] = [];
      for (const v of await list(leadId)) {
        if (v.data()!.withdrawnAt === null) {
          await ctx.update(v.ref, { withdrawnAt: at });
          withdrawn.push({ ...decode<LeadConsent>(v), withdrawnAt: at });
        }
      }
      return withdrawn;
    },
  };
}

export function buildBookingRepository(fs: Fs): BookingRepository {
  const { ctx } = fs;
  const col = () => fs.col("bookings");
  return {
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
      if (stored.bookingValue < 0 || stored.commissionExpected < 0) throw new Error("booking amounts must not be negative");
      await ctx.create(col().doc(stored.id), encode(stored));
      return stored;
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? decode<Booking>(v) : null;
    },
    async update(id, patch, at) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Booking not found.");
        const next: Booking = { ...decode<Booking>(v), ...patch, updatedAt: at };
        if (next.bookingValue < 0 || next.commissionExpected < 0 || next.commissionReceived < 0) throw new Error("booking amounts must not be negative");
        await c.set(col().doc(id), encode(next));
        return next;
      });
    },
    async listByLead(leadId) {
      const rows = await ctx.find(col(), { where: [["leadId", "==", leadId]], orderBy: [["createdAt", "asc"]] });
      return rows.map((v) => decode<Booking>(v));
    },
    async revenueByOwner() {
      const booked = (await ctx.find(col(), { where: [["status", "==", "BOOKED"]] })).map((v) => decode<Booking>(v));
      const owners = new Map((await getMany(fs, "leads", booked.map((b) => b.leadId))).map((v) => [v.id, v.data()!.ownerId as string | null]));
      const rows = new Map<string, { ownerId: string; currency: string; total: number; count: number }>();
      for (const b of booked) {
        const owner = owners.get(b.leadId);
        if (!owner) continue;
        const key = `${owner}|${b.currency}`;
        const row = rows.get(key) ?? { ownerId: owner, currency: b.currency, total: 0, count: 0 };
        row.total += b.bookingValue;
        row.count += 1;
        rows.set(key, row);
      }
      return [...rows.values()];
    },
    async listOutstanding(limit) {
      const booked = (await ctx.find(col(), { where: [["status", "==", "BOOKED"]] })).map((v) => decode<Booking>(v));
      return booked.filter((b) => b.commissionExpected > b.commissionReceived).sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime()).slice(0, limit);
    },
  };
}

// ============================================================================================================
// requirements
// ============================================================================================================

type StoredRequirement = Omit<LeadRequirement, "locations"> & { locations: RequirementLocation[] };
const toRequirement = (stored: StoredRequirement): LeadRequirement => ({ ...stored, locations: stored.locations.map((l) => l.name) });

export function buildRequirementRepository(fs: Fs): RequirementRepository {
  const { ctx } = fs;
  const col = () => fs.col("leadRequirements");
  const activeKey = (leadId: string) => fs.lookup(`reqActive:${leadId}`);
  const read = (v: { id: string; data(): FirebaseFirestore.DocumentData | undefined }) => toRequirement(decode<StoredRequirement>(v));
  const validate = (r: StoredRequirement) => {
    if (r.budgetMin !== null && r.budgetMax !== null && r.budgetMin > r.budgetMax) throw new Error("requirement invariant violated: budget range");
    if ((r.budgetMin ?? 0) < 0 || (r.budgetMax ?? 0) < 0) throw new Error("requirement invariant violated: budget must not be negative");
    if ((r.budgetMin !== null || r.budgetMax !== null) && r.budgetCurrency === null) throw new Error("requirement invariant violated: budget needs a currency");
  };
  return {
    async create(input: NewRequirement) {
      return ctx.run(async (c) => {
        if ((await c.get(activeKey(input.leadId))).exists) throw new LeadStateError("This lead already has an active requirement.");
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
        validate(stored);
        await c.create(col().doc(stored.id), encode(stored));
        await c.create(activeKey(input.leadId), { requirementId: stored.id });
        return toRequirement(stored);
      });
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? read(v) : null;
    },
    async getActiveByLead(leadId) {
      const rows = await ctx.find(col(), { where: [["leadId", "==", leadId], ["status", "==", "ACTIVE"]], limit: 1 });
      return rows[0] ? read(rows[0]) : null;
    },
    async listByLead(leadId) {
      const rows = await ctx.find(col(), { where: [["leadId", "==", leadId]], orderBy: [["createdAt", "desc"]] });
      return rows.map(read).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    },
    async update(id, patch, at, locations) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Requirement not found.");
        const cur = decode<StoredRequirement>(v);
        const wasActive = cur.status === "ACTIVE";
        const next: StoredRequirement = { ...cur, ...patch, updatedAt: at, locations: locations ? locations.map((l) => ({ ...l })) : cur.locations };
        const willBeActive = next.status === "ACTIVE";
        if (willBeActive && !wasActive) {
          const other = await c.get(activeKey(cur.leadId));
          if (other.exists && other.data()!.requirementId !== id) throw new LeadStateError("This lead already has an active requirement.");
          if (!other.exists) await c.create(activeKey(cur.leadId), { requirementId: id });
        } else if (!willBeActive && wasActive) {
          await c.delete(activeKey(cur.leadId));
        }
        validate(next);
        await c.set(col().doc(id), encode(next));
        return toRequirement(next);
      });
    },
    async eraseForLead(leadId) {
      for (const v of await ctx.find(col(), { where: [["leadId", "==", leadId]] })) await ctx.update(v.ref, { notes: null, locations: [] });
    },
  };
}

// ============================================================================================================
// follow-ups
// ============================================================================================================

const OPEN_FOLLOW_UP = ["SCHEDULED", "MISSED"];
const isOpenFollowUp = (status: string) => OPEN_FOLLOW_UP.includes(status);

export function buildFollowUpRepository(fs: Fs): FollowUpRepository {
  const { ctx } = fs;
  const col = () => fs.col("leadFollowUps");
  const openKey = (leadId: string) => fs.lookup(`fuOpen:${leadId}`);
  const liveLeads = async (ids: string[]) => new Map((await getMany(fs, "leads", ids)).map((v) => [v.id, decode<Lead>(v)]).filter(([, l]) => isLive(l as Lead)) as Array<[string, Lead]>);
  const scopeWhere = (scope: FollowUpScope): Where[] => {
    const w: Where[] = [];
    if (scope.ownerId !== undefined) w.push(["ownerId", "==", scope.ownerId]);
    if (scope.leadId !== undefined) w.push(["leadId", "==", scope.leadId]);
    return w;
  };
  const validate = (f: LeadFollowUp) => {
    if (f.missedCount < 0 || f.rescheduleCount < 0) throw new Error("follow-up invariant violated: counts must not be negative");
  };

  return {
    async create(input: NewFollowUp) {
      return ctx.run(async (c) => {
        if ((await c.get(openKey(input.leadId))).exists) throw new LeadStateError("This lead already has an open follow-up.");
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
        await c.create(col().doc(stored.id), encode(stored));
        await c.create(openKey(input.leadId), { followUpId: stored.id });
        return stored;
      });
    },
    async getById(id) {
      const v = await ctx.get(col().doc(id));
      return v.exists ? decode<LeadFollowUp>(v) : null;
    },
    async getOpenByLead(leadId) {
      const rows = await ctx.find(col(), { where: [["leadId", "==", leadId], ["status", "in", OPEN_FOLLOW_UP]], limit: 1 });
      return rows[0] ? decode<LeadFollowUp>(rows[0]) : null;
    },
    async listByLead(leadId) {
      const rows = await ctx.find(col(), { where: [["leadId", "==", leadId]], orderBy: [["createdAt", "desc"]] });
      return rows.map((v) => decode<LeadFollowUp>(v)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    },
    async update(id, patch, at) {
      return ctx.run(async (c) => {
        const v = await c.get(col().doc(id));
        if (!v.exists) throw new LeadNotFoundError("Follow-up not found.");
        const cur = decode<LeadFollowUp>(v);
        const next: LeadFollowUp = { ...cur, ...patch, updatedAt: at };
        const wasOpen = isOpenFollowUp(cur.status);
        const willBeOpen = isOpenFollowUp(next.status);
        if (willBeOpen && !wasOpen) {
          const other = await c.get(openKey(cur.leadId));
          if (other.exists && other.data()!.followUpId !== id) throw new LeadStateError("This lead already has an open follow-up.");
          if (!other.exists) await c.create(openKey(cur.leadId), { followUpId: id });
        } else if (wasOpen && !willBeOpen) {
          await c.delete(openKey(cur.leadId));
        }
        validate(next);
        await c.set(col().doc(id), encode(next));
        return next;
      });
    },
    async markMissed(scope, now) {
      return ctx.run(async (c) => {
        const due = (await c.find(col(), { where: [["status", "==", "SCHEDULED"], ["scheduledAt", "<", now], ...scopeWhere(scope)] })).map((v) => decode<LeadFollowUp>(v));
        const leads = await liveLeads(due.map((f) => f.leadId));
        const changed: LeadFollowUp[] = [];
        for (const f of due) {
          if (!leads.has(f.leadId)) continue;
          const next: LeadFollowUp = { ...f, status: "MISSED", missedCount: f.missedCount + 1, lastMissedAt: now, updatedAt: now };
          await c.set(col().doc(f.id), encode(next));
          changed.push(next);
        }
        return changed.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      });
    },
    async listUnresolvedMissed(query: MissedFollowUpQuery) {
      const range: Where[] = [];
      if (query.scheduledFrom) range.push(["scheduledAt", ">=", query.scheduledFrom]);
      if (query.scheduledTo) range.push(["scheduledAt", "<", query.scheduledTo]);
      const [missed, overdue] = await Promise.all([
        ctx.find(col(), { where: [["status", "==", "MISSED"], ...scopeWhere(query), ...range] }),
        ctx.find(col(), { where: [["status", "==", "SCHEDULED"], ...scopeWhere(query), ["scheduledAt", "<", query.now]] }),
      ]);
      const candidates = [...missed, ...overdue].map((v) => decode<LeadFollowUp>(v)).filter((f) => {
        if (query.scheduledFrom && f.scheduledAt.getTime() < query.scheduledFrom.getTime()) return false;
        if (query.scheduledTo && f.scheduledAt.getTime() >= query.scheduledTo.getTime()) return false;
        if (query.overdueForAtLeastMs !== undefined && query.now.getTime() - f.scheduledAt.getTime() < query.overdueForAtLeastMs) return false;
        return true;
      });
      const leads = await liveLeads(candidates.map((f) => f.leadId));
      const out: FollowUpWithLead[] = [];
      for (const f of candidates) {
        const lead = leads.get(f.leadId);
        if (!lead) continue;
        if (query.temperature !== undefined && lead.temperature !== query.temperature) continue;
        if (query.status !== undefined && lead.status !== query.status) continue;
        out.push({ followUp: f, lead });
      }
      return out.sort((a, b) => a.followUp.scheduledAt.getTime() - b.followUp.scheduledAt.getTime() || a.followUp.id.localeCompare(b.followUp.id)).slice(0, query.limit);
    },
    async listScheduled(query) {
      const rows = (await ctx.find(col(), { where: [["status", "==", "SCHEDULED"], ["scheduledAt", ">=", query.from], ["scheduledAt", "<", query.to], ...scopeWhere(query)] })).map((v) => decode<LeadFollowUp>(v));
      const leads = await liveLeads(rows.map((f) => f.leadId));
      const out: FollowUpWithLead[] = [];
      for (const f of rows) {
        const lead = leads.get(f.leadId);
        if (lead) out.push({ followUp: f, lead });
      }
      return out.sort((a, b) => a.followUp.scheduledAt.getTime() - b.followUp.scheduledAt.getTime() || a.followUp.id.localeCompare(b.followUp.id)).slice(0, query.limit);
    },
    async claimDueNotifications(scope, upTo, now) {
      return ctx.run(async (c) => {
        const rows = (await c.find(col(), { where: [["status", "==", "SCHEDULED"], ["dueNotifiedAt", "==", null], ["scheduledAt", "<=", upTo], ...scopeWhere(scope)] })).map((v) => decode<LeadFollowUp>(v)).filter((f) => f.ownerId !== null);
        const leads = await liveLeads(rows.map((f) => f.leadId));
        const changed: LeadFollowUp[] = [];
        for (const f of rows) {
          if (!leads.has(f.leadId)) continue;
          const next = { ...f, dueNotifiedAt: now };
          await c.set(col().doc(f.id), encode(next));
          changed.push(next);
        }
        return changed;
      });
    },
    async statsByStaff(from, to, now) {
      const out: Record<string, { created: number; completed: number; missedNow: number }> = {};
      const row = (id: string) => (out[id] ??= { created: 0, completed: 0, missedNow: 0 });
      const [created, completed, missed, overdue] = await Promise.all([
        ctx.find(col(), { where: [["createdAt", ">=", from], ["createdAt", "<", to]] }),
        ctx.find(col(), { where: [["completedAt", ">=", from], ["completedAt", "<", to]] }),
        ctx.find(col(), { where: [["status", "==", "MISSED"]] }),
        ctx.find(col(), { where: [["status", "==", "SCHEDULED"], ["scheduledAt", "<", now]] }),
      ]);
      const all = [...created, ...completed, ...missed, ...overdue].map((v) => decode<LeadFollowUp>(v));
      const leadRows = new Map((await getMany(fs, "leads", all.map((f) => f.leadId))).map((v) => [v.id, decode<Lead>(v)]));
      for (const v of created) {
        const f = decode<LeadFollowUp>(v);
        const lead = leadRows.get(f.leadId);
        if (lead && isLive(lead)) row(f.createdBy).created += 1;
      }
      for (const v of completed) {
        const f = decode<LeadFollowUp>(v);
        const lead = leadRows.get(f.leadId);
        if (lead && isLive(lead) && f.completedBy) row(f.completedBy).completed += 1;
      }
      const seen = new Set<string>();
      for (const v of [...missed, ...overdue]) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        const f = decode<LeadFollowUp>(v);
        const lead = leadRows.get(f.leadId);
        if (f.ownerId && lead && isLive(lead)) row(f.ownerId).missedNow += 1;
      }
      return out;
    },
    async eraseForLead(leadId) {
      for (const v of await ctx.find(col(), { where: [["leadId", "==", leadId]] })) await ctx.update(v.ref, { note: null, cancelNote: null });
    },
  };
}

export { chunk };
