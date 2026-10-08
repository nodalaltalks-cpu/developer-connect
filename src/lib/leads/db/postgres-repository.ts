import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, max, isNotNull, isNull, lt, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../../developer-connect/db/client.ts";
import * as schema from "../../developer-connect/db/schema.ts";
import {
  analyticsEvents,
  bookings,
  developers,
  automationActions,
  automationSettings,
  callingBatchItems,
  callingBatches,
  campaigns,
  leadCallEvents,
  leadCalls,
  leadConsents,
  leadEvents,
  leadFollowUps,
  leadImportBatches,
  leadProjectShortlist,
  leadRequirementLocations,
  leadRequirements,
  leads,
  marketingSpend,
  marketingTouches,
  projects,
  siteVisitEvents,
  siteVisits,
} from "../../developer-connect/db/schema.ts";
import type { AcquisitionBooking, TouchEvidence } from "../acquisition.ts";
import type { AutomationAction, Campaign, LeadSourceType, LeadStatus, MarketingSpend, Project, ShortlistEntry, SiteVisit, SiteVisitEvent } from "../types.ts";
import { assertSafeTimeZone } from "../call-buckets.ts";
import { LeadNotFoundError, LeadStateError } from "../errors.ts";
import { QUEUE_EXCLUDED_STATUSES } from "../queue-config.ts";
import { CLOSED_OUT_STATUSES, type LeadCounts, type LeadListQuery } from "../lead-views.ts";
import type {
  BookingPatch,
  CallAggregateQuery,
  BatchLeadProgress,
  CallAggregateRow,
  CallFilter,
  CallPatch,
  CallWithLead,
  CallingBatch,
  FollowUpPatch,
  FollowUpScope,
  FollowUpWithLead,
  LeadPatch,
  LeadRepositories,
  MissedFollowUpQuery,
  NewBooking,
  NewCall,
  NewCallEvent,
  NewCallingBatch,
  SiteVisitStats,
  NewConsent,
  NewFollowUp,
  NewImportBatch,
  NewLeadEvent,
  NewLeadInput,
  NewRequirement,
  NewTouch,
  RequirementLocation,
  RequirementPatch,
  StoredCallEvent,
} from "../repository.ts";
import type { Booking, Lead, LeadActivitySummary, LeadCall, LeadConsent, LeadEvent, LeadFollowUp, LeadImportBatch, LeadRequirement, MarketingTouch } from "../types.ts";

/**
 * PostgreSQL adapter for the lead repositories. Lives in the same database
 * as the rest of the product (same schema.ts, same getDb()), like the
 * engagement and notification adapters.
 *
 * Immutability is enforced by the database triggers in migration 0014, and
 * this adapter mirrors it: there is no `update` or `delete` against
 * lead_events, marketing_touches or lead_consents here. The ONLY ways history
 * changes are `append`/`create`, `redactPayloads` (erasure) and
 * `withdrawActive` (consent withdrawal).
 */

type DbOrTx = NodePgDatabase<typeof schema>;

const toLead = (row: typeof leads.$inferSelect): Lead => ({ ...row });
const toAutomation = (row: typeof automationActions.$inferSelect): AutomationAction => ({ ...row, status: row.status as AutomationAction["status"], detail: (row.detail ?? {}) as Record<string, unknown> });
const toSpend = (row: typeof marketingSpend.$inferSelect): MarketingSpend => ({ ...row });
const toCampaign = (row: typeof campaigns.$inferSelect): Campaign => ({ ...row, status: row.status === "PAUSED" ? "PAUSED" : row.status === "ENDED" ? "ENDED" : "ACTIVE" });
const toProject = (row: typeof projects.$inferSelect): Project => ({ ...row, status: row.status === "INACTIVE" ? "INACTIVE" : "ACTIVE" });
const toShortlist = (row: typeof leadProjectShortlist.$inferSelect): ShortlistEntry => ({ ...row });
const toVisit = (row: typeof siteVisits.$inferSelect): SiteVisit => ({ ...row, outcome: (row.outcome as SiteVisit["outcome"]) ?? null });
const toVisitEvent = (row: typeof siteVisitEvents.$inferSelect): SiteVisitEvent => ({ ...row, payload: (row.payload ?? {}) as Record<string, unknown> });
const toBooking = (row: typeof bookings.$inferSelect): Booking => ({ ...row });

/** Unique-violation detection that survives Drizzle wrapping the driver error. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

const toFollowUp = (row: typeof leadFollowUps.$inferSelect): LeadFollowUp => ({ ...row });
const toCall = (row: typeof leadCalls.$inferSelect): LeadCall => ({ ...row, direction: "OUTBOUND", source: "INTERNAL_DIALER", method: row.method === "ANDROID_SIM" ? "ANDROID_SIM" : "PROVIDER" });
const toCallEvent = (row: typeof leadCallEvents.$inferSelect): StoredCallEvent => ({ ...row, payload: row.payload as Record<string, unknown> });
const toBatch = (row: typeof leadImportBatches.$inferSelect): LeadImportBatch => ({ ...row });

/** The filters shared by listRecent and aggregate. */
function callWhere(f: Pick<CallFilter, "staffUserId" | "leadId" | "from" | "to" | "connected" | "statuses" | "disposition" | "sourceType" | "batchId">): SQL | undefined {
  return and(
    f.staffUserId !== undefined ? eq(leadCalls.staffUserId, f.staffUserId) : undefined,
    f.leadId !== undefined ? eq(leadCalls.leadId, f.leadId) : undefined,
    f.from ? gte(leadCalls.initiatedAt, f.from) : undefined,
    f.to ? lt(leadCalls.initiatedAt, f.to) : undefined,
    f.batchId !== undefined ? eq(leadCalls.batchId, f.batchId) : undefined,
    f.connected === true ? eq(leadCalls.classification, "CONNECTED") : f.connected === false ? eq(leadCalls.classification, "DIALED") : undefined,
    f.statuses && f.statuses.length > 0 ? inArray(leadCalls.status, f.statuses) : undefined,
    f.disposition !== undefined ? eq(leadCalls.disposition, f.disposition) : undefined,
    f.sourceType !== undefined ? eq(leads.sourceType, f.sourceType) : undefined,
  );
}

const toRequirement = (row: typeof leadRequirements.$inferSelect, locations: string[]): LeadRequirement => ({ ...row, locations });
const toTouch = (row: typeof marketingTouches.$inferSelect): MarketingTouch => ({ ...row });
const toConsent = (row: typeof leadConsents.$inferSelect): LeadConsent => ({ ...row });
const toEvent = (row: typeof leadEvents.$inferSelect): LeadEvent => ({
  id: row.id,
  leadId: row.leadId,
  eventType: row.eventType,
  actorType: row.actorType,
  actorId: row.actorId,
  developerId: row.developerId,
  fromStatus: row.fromStatus,
  toStatus: row.toStatus,
  payload: (row.payload ?? {}) as Record<string, unknown>,
  createdAt: row.createdAt,
});

function uuidList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

/** SQL twin of matchesView() in lead-views.ts — an integration test asserts they agree. */
function viewPredicate(query: Pick<LeadListQuery, "view" | "now" | "endOfToday" | "ownerId">): SQL | undefined {
  const rules = viewRules(query);
  // An owner scope is ANDed onto whatever the view says: a scoped query can never return another owner's lead.
  return query.ownerId === undefined ? rules : and(eq(leads.ownerId, query.ownerId), rules);
}

function viewRules(query: Pick<LeadListQuery, "view" | "now" | "endOfToday">): SQL | undefined {
  const notErased = isNull(leads.erasedAt);
  const open = notInArray(leads.status, [...CLOSED_OUT_STATUSES]);
  switch (query.view) {
    case "all":
      return notErased;
    case "new":
      return and(notErased, eq(leads.status, "NEW"));
    case "hot":
      return and(notErased, open, eq(leads.temperature, "HOT"));
    case "warm":
      return and(notErased, open, eq(leads.temperature, "WARM"));
    case "cold":
      return and(notErased, open, eq(leads.temperature, "COLD"));
    case "overdue":
      return and(notErased, open, isNotNull(leads.nextFollowUpAt), lt(leads.nextFollowUpAt, query.now));
    case "due_today":
      return and(notErased, open, gte(leads.nextFollowUpAt, query.now), lt(leads.nextFollowUpAt, query.endOfToday));
    case "follow_up_due":
      return and(notErased, open, isNotNull(leads.nextFollowUpAt), lt(leads.nextFollowUpAt, query.endOfToday));
    case "qualified":
      return and(notErased, eq(leads.status, "QUALIFIED"));
  }
}

async function insertLocations(db: DbOrTx, requirementId: string, locations: RequirementLocation[]): Promise<void> {
  if (locations.length === 0) return;
  await db
    .insert(leadRequirementLocations)
    .values(locations.map((l, position) => ({ id: randomUUID(), requirementId, name: l.name, nameKey: l.key, position })));
}

/** Location names per requirement, in the order they were listed — one query for the whole batch. */
async function locationsFor(db: DbOrTx, requirementIds: string[]): Promise<Map<string, string[]>> {
  const byRequirement = new Map<string, string[]>();
  if (requirementIds.length === 0) return byRequirement;
  const rows = await db
    .select()
    .from(leadRequirementLocations)
    .where(inArray(leadRequirementLocations.requirementId, requirementIds))
    .orderBy(asc(leadRequirementLocations.position), asc(leadRequirementLocations.id));
  for (const row of rows) byRequirement.set(row.requirementId, [...(byRequirement.get(row.requirementId) ?? []), row.name]);
  return byRequirement;
}

function build(db: DbOrTx): LeadRepositories {
  return {
    leads: {
      async upsertByPhone(input: NewLeadInput) {
        // One atomic statement. The partial unique index on phone_e164 makes
        // a concurrent insert of the same number wait for the first to
        // commit and then take the DO UPDATE branch — so there is never a
        // second lead. The no-op update also leaves the row locked for the
        // rest of this transaction, so the caller's follow-up writes are safe.
        const [outcome] = await db
          .insert(leads)
          .values({
            id: randomUUID(),
            name: input.name,
            phoneE164: input.phoneE164,
            email: input.email,
            contactPreference: input.contactPreference,
            developerId: input.developerId,
            sourceCta: input.sourceCta,
            sessionId: input.sessionId,
            userId: input.userId,
            ...(input.source
              ? {
                  sourceType: input.source.sourceType,
                  sourceDetail: input.source.sourceDetail,
                  creationMethod: input.source.creationMethod,
                  importBatchId: input.source.importBatchId,
                  createdBy: input.source.createdBy,
                }
              : {}),
            lastActivityAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .onConflictDoUpdate({
            target: leads.phoneE164,
            targetWhere: sql`${leads.phoneE164} is not null`,
            set: { updatedAt: sql`${leads.updatedAt}` },
          })
          // xmax is 0 only for a row this very statement inserted.
          .returning({ id: leads.id, inserted: sql<boolean>`(xmax = 0)` });

        const [row] = await db.select().from(leads).where(eq(leads.id, outcome.id));
        return { lead: toLead(row), created: outcome.inserted };
      },

      async getById(id) {
        const [row] = await db.select().from(leads).where(eq(leads.id, id));
        return row ? toLead(row) : null;
      },

      async update(id: string, patch: LeadPatch, at: Date) {
        const [row] = await db
          .update(leads)
          .set({ ...patch, updatedAt: at })
          .where(eq(leads.id, id))
          .returning();
        if (!row) throw new LeadNotFoundError("Lead not found.");
        return toLead(row);
      },

      async listForQueue(limit) {
        const open = and(isNull(leads.erasedAt), notInArray(leads.status, [...QUEUE_EXCLUDED_STATUSES]));
        const [withFollowUp, recent] = await Promise.all([
          db.select().from(leads).where(and(open, isNotNull(leads.nextFollowUpAt))).orderBy(asc(leads.nextFollowUpAt), asc(leads.id)).limit(limit),
          db.select().from(leads).where(open).orderBy(desc(leads.lastActivityAt), asc(leads.id)).limit(limit),
        ]);
        const byId = new Map<string, (typeof recent)[number]>();
        for (const row of [...withFollowUp, ...recent]) byId.set(row.id, row);
        return [...byId.values()].map(toLead);
      },

      async list(query) {
        const where = viewPredicate(query);
        const followUpOrder = query.view === "overdue" || query.view === "due_today" || query.view === "follow_up_due";
        const rows = await db
          .select()
          .from(leads)
          .where(where)
          .orderBy(...(followUpOrder ? [asc(leads.nextFollowUpAt), asc(leads.id)] : [desc(leads.lastActivityAt), asc(leads.id)]))
          .limit(query.limit)
          .offset(query.offset);
        const [{ total }] = await db.select({ total: count() }).from(leads).where(where);
        return { leads: rows.map(toLead), total };
      },

      async counts(now, endOfToday): Promise<LeadCounts> {
        const closed = sql.join(CLOSED_OUT_STATUSES.map((status) => sql`${status}`), sql`, `);
        const open = sql`${leads.status}::text not in (${closed})`;
        const [row] = await db
          .select({
            total: sql<number>`count(*) filter (where ${leads.erasedAt} is null)`,
            new: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${leads.status} = 'NEW')`,
            hot: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${open} and ${leads.temperature} = 'HOT')`,
            warm: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${open} and ${leads.temperature} = 'WARM')`,
            cold: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${open} and ${leads.temperature} = 'COLD')`,
            overdue: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${open} and ${leads.nextFollowUpAt} < ${now})`,
            dueToday: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${open} and ${leads.nextFollowUpAt} >= ${now} and ${leads.nextFollowUpAt} < ${endOfToday})`,
            qualified: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${leads.status} = 'QUALIFIED')`,
            siteVisitScheduled: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${leads.status} = 'SITE_VISIT_SCHEDULED')`,
            booked: sql<number>`count(*) filter (where ${leads.erasedAt} is null and ${leads.status} = 'BOOKED')`,
          })
          .from(leads);
        // count() arrives as a string from the driver for some column types; normalise.
        return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as unknown as LeadCounts;
      },

      async developerNames(ids) {
        if (ids.length === 0) return {};
        const rows = await db.select({ id: developers.id, name: developers.displayName }).from(developers).where(inArray(developers.id, ids));
        return Object.fromEntries(rows.map((row) => [row.id, row.name]));
      },

      async ownerSummary() {
        const rows = await db
          .select({
            ownerId: leads.ownerId,
            qualified: sql<number>`(count(*) filter (where ${leads.status} = 'QUALIFIED'))::int`,
            siteVisit: sql<number>`(count(*) filter (where ${leads.status} = 'SITE_VISIT_SCHEDULED'))::int`,
            booked: sql<number>`(count(*) filter (where ${leads.status} = 'BOOKED'))::int`,
          })
          .from(leads)
          .where(and(isNotNull(leads.ownerId), isNull(leads.erasedAt)))
          .groupBy(leads.ownerId);
        return Object.fromEntries(rows.flatMap((row) => (row.ownerId ? [[row.ownerId, { qualified: row.qualified, siteVisit: row.siteVisit, booked: row.booked }]] : [])));
      },

      async listReturned(limit) {
        const rows = await db
          .select()
          .from(leads)
          .where(and(isNotNull(leads.returnedAt), isNull(leads.ownerId), isNull(leads.erasedAt)))
          .orderBy(desc(leads.returnedAt), asc(leads.id))
          .limit(limit);
        return rows.map(toLead);
      },

      async countByOwner() {
        const rows = await db
          .select({ ownerId: leads.ownerId, total: count() })
          .from(leads)
          .where(and(isNotNull(leads.ownerId), isNull(leads.erasedAt)))
          .groupBy(leads.ownerId);
        return Object.fromEntries(rows.flatMap((row) => (row.ownerId ? [[row.ownerId, Number(row.total)]] : [])));
      },
      async stageHistory() {
        const forward = ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION", "BOOKED", "CLOSED"];
        const out: Array<{ stage: LeadStatus; reached: number; booked: number }> = [];
        for (const stage of ["QUALIFIED", "SHORTLISTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "NEGOTIATION"] as LeadStatus[]) {
          const atOrAfter = sql.raw(`array[${forward.slice(forward.indexOf(stage)).map((s) => `'${s}'`).join(",")}]`);
          const result = await db.execute(sql`
            select count(*)::int as reached,
                   (count(*) filter (where exists (select 1 from bookings b where b.lead_id = l.id and b.status = 'BOOKED')))::int as booked
            from leads l
            where l.erased_at is null
              and (l.status::text = any(${atOrAfter})
                   or exists (select 1 from lead_events e where e.lead_id = l.id and e.event_type = 'STATUS_CHANGED' and e.to_status::text = any(${atOrAfter})))`);
          const row = (result.rows as Array<{ reached: number; booked: number }>)[0];
          out.push({ stage, reached: Number(row?.reached ?? 0), booked: Number(row?.booked ?? 0) });
        }
        return out;
      },
      async listStale({ staleBefore, limit }) {
        const rows = await db
          .select()
          .from(leads)
          .where(and(isNull(leads.erasedAt), notInArray(leads.status, [...CLOSED_OUT_STATUSES]), isNotNull(leads.ownerId), lt(leads.lastActivityAt, staleBefore)))
          .orderBy(asc(leads.lastActivityAt))
          .limit(limit);
        return rows.map(toLead);
      },
      async listReturnVisits({ since, minLeadAgeMs, limit }) {
        const viewedAt = max(analyticsEvents.occurredAt);
        const rows = await db
          .select({ lead: leads, viewedAt })
          .from(leads)
          .innerJoin(analyticsEvents, eq(analyticsEvents.userId, leads.userId))
          .where(
            and(
              isNull(leads.erasedAt),
              notInArray(leads.status, [...CLOSED_OUT_STATUSES]),
              isNotNull(leads.ownerId),
              eq(analyticsEvents.eventName, "page_viewed"),
              gte(analyticsEvents.occurredAt, since),
              sql`${analyticsEvents.occurredAt} >= ${leads.createdAt} + (${minLeadAgeMs} * interval '1 millisecond')`,
            ),
          )
          .groupBy(leads.id)
          .orderBy(desc(viewedAt))
          .limit(limit);
        return rows.flatMap((r) => (r.viewedAt ? [{ lead: toLead(r.lead), viewedAt: new Date(r.viewedAt) }] : []));
      },
      async listUnassignedOpen(limit) {
        const rows = await db
          .select()
          .from(leads)
          .where(and(isNull(leads.erasedAt), notInArray(leads.status, [...CLOSED_OUT_STATUSES]), isNull(leads.ownerId), isNull(leads.returnedAt)))
          .orderBy(asc(leads.createdAt))
          .limit(limit);
        return rows.map(toLead);
      },
      async countOpenByOwner() {
        const rows = await db
          .select({ ownerId: leads.ownerId, n: count() })
          .from(leads)
          .where(and(isNull(leads.erasedAt), isNotNull(leads.ownerId), notInArray(leads.status, [...CLOSED_OUT_STATUSES])))
          .groupBy(leads.ownerId);
        return Object.fromEntries(rows.flatMap((r) => (r.ownerId ? [[r.ownerId, Number(r.n)]] : [])));
      },
      async statusCounts() {
        const rows = await db.select({ status: leads.status, n: count() }).from(leads).where(isNull(leads.erasedAt)).groupBy(leads.status);
        return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<LeadStatus, number>>;
      },
      async exceptionCounts({ unassignedOlderThan, staleBefore }) {
        const open = and(isNull(leads.erasedAt), notInArray(leads.status, [...CLOSED_OUT_STATUSES]));
        const [row] = await db
          .select({
            unassignedOpen: sql<number>`(count(*) filter (where ${leads.ownerId} is null))::int`,
            unassignedOld: sql<number>`(count(*) filter (where ${leads.ownerId} is null and ${leads.createdAt} < ${unassignedOlderThan}))::int`,
            staleOpen: sql<number>`(count(*) filter (where ${leads.ownerId} is not null and ${leads.lastActivityAt} < ${staleBefore}))::int`,
          })
          .from(leads)
          .where(open);
        return { unassignedOpen: row?.unassignedOpen ?? 0, unassignedOld: row?.unassignedOld ?? 0, staleOpen: row?.staleOpen ?? 0 };
      },
      async acquisitionRows(query) {
        const result = await db.execute(sql`
          select l.id as lead_id, l.created_at, l.source_type, l.creation_method,
                 f.utm_source as f_source, f.utm_medium as f_medium, f.utm_campaign as f_campaign, f.gclid as f_gclid, f.fbclid as f_fbclid, f.referrer as f_referrer, f.landing_path as f_landing, f.id is not null as has_first,
                 t.utm_source as t_source, t.utm_medium as t_medium, t.utm_campaign as t_campaign, t.gclid as t_gclid, t.fbclid as t_fbclid, t.referrer as t_referrer, t.landing_path as t_landing, t.id is not null as has_latest,
                 (l.status::text in ('QUALIFIED','SHORTLISTED','SITE_VISIT_SCHEDULED','SITE_VISIT_DONE','NEGOTIATION','BOOKED','CLOSED')
                   or exists (select 1 from lead_events e where e.lead_id = l.id and e.event_type = 'STATUS_CHANGED' and e.to_status::text in ('QUALIFIED','SHORTLISTED','SITE_VISIT_SCHEDULED','SITE_VISIT_DONE','NEGOTIATION','BOOKED','CLOSED'))) as reached_qualified,
                 exists (select 1 from site_visits v where v.lead_id = l.id and v.rescheduled_from is null) as has_site_visit,
                 exists (select 1 from bookings b where b.lead_id = l.id and b.status = 'BOOKED') as booked,
                 coalesce((select json_agg(json_build_object('currency', b.currency, 'bookingValue', b.booking_value, 'commissionExpected', b.commission_expected, 'commissionReceived', b.commission_received, 'projectId', b.project_id, 'projectName', b.project_name)) from bookings b where b.lead_id = l.id and b.status = 'BOOKED'), '[]'::json) as booking_rows
          from leads l
          left join marketing_touches f on f.id = l.first_touch_id
          left join marketing_touches t on t.id = l.last_touch_id
          where l.created_at >= ${query.from} and l.created_at < ${query.to}
          order by l.created_at desc
          limit ${query.limit}`);
        type R = Record<string, unknown>;
        const ev = (r: R, p: "f" | "t"): TouchEvidence | null =>
          r[p === "f" ? "has_first" : "has_latest"]
            ? { utmSource: r[`${p}_source`] as string | null, utmMedium: r[`${p}_medium`] as string | null, utmCampaign: r[`${p}_campaign`] as string | null, gclid: r[`${p}_gclid`] as string | null, fbclid: r[`${p}_fbclid`] as string | null, referrer: r[`${p}_referrer`] as string | null, landingPath: r[`${p}_landing`] as string | null }
            : null;
        return (result.rows as R[]).map((r) => ({
          leadId: r.lead_id as string,
          createdAt: new Date(r.created_at as string),
          sourceType: r.source_type as LeadSourceType,
          creationMethod: r.creation_method as string,
          first: ev(r, "f"),
          latest: ev(r, "t"),
          reachedQualified: r.reached_qualified === true,
          hasSiteVisit: r.has_site_visit === true,
          booked: r.booked === true,
          bookings: ((r.booking_rows as AcquisitionBooking[] | null) ?? []).map((b) => ({ currency: b.currency, bookingValue: Number(b.bookingValue), commissionExpected: Number(b.commissionExpected), commissionReceived: Number(b.commissionReceived), projectId: b.projectId ?? null, projectName: b.projectName ?? null })),
        }));
      },
    },

    automationActions: {
      async claim(input, options) {
        // A brand-new key wins the insert; a conflict means someone else has it - unless it FAILED (or was abandoned) and has attempts left.
        const [inserted] = await db.insert(automationActions).values({ id: randomUUID(), rule: input.rule, subjectType: input.subjectType, subjectId: input.subjectId, dedupeKey: input.dedupeKey, claimedAt: input.now, createdAt: input.now }).onConflictDoNothing({ target: automationActions.dedupeKey }).returning();
        if (inserted) return toAutomation(inserted);
        const staleBefore = new Date(input.now.getTime() - options.staleAfterMs);
        const [reclaimed] = await db
          .update(automationActions)
          .set({ status: "PENDING", attempts: sql`${automationActions.attempts} + 1`, claimedAt: input.now, completedAt: null })
          .where(and(eq(automationActions.dedupeKey, input.dedupeKey), lt(automationActions.attempts, options.maxAttempts), or(eq(automationActions.status, "FAILED"), and(eq(automationActions.status, "PENDING"), lt(automationActions.claimedAt, staleBefore)))))
          .returning();
        return reclaimed ? toAutomation(reclaimed) : null;
      },
      async complete(id, status, detail, at) {
        await db.update(automationActions).set({ status, detail, completedAt: at }).where(eq(automationActions.id, id));
      },
      async fail(id, errorCode, at) {
        await db.update(automationActions).set({ status: "FAILED", detail: { errorCode }, completedAt: at }).where(eq(automationActions.id, id));
      },
      async listRecent(limit) {
        const rows = await db.select().from(automationActions).orderBy(desc(automationActions.createdAt)).limit(limit);
        return rows.map(toAutomation);
      },
    },

    automationSettings: {
      async getAll() {
        const rows = await db.select().from(automationSettings);
        return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
      },
      async set(key, enabled, by, at) {
        await db.insert(automationSettings).values({ key, enabled, updatedBy: by, updatedAt: at }).onConflictDoUpdate({ target: automationSettings.key, set: { enabled, updatedBy: by, updatedAt: at } });
      },
    },

    spend: {
      async create(input) {
        const [row] = await db.insert(marketingSpend).values({ id: randomUUID(), channel: input.channel, campaignId: input.campaignId, spentOn: input.spentOn, currency: input.currency, amount: input.amount, note: input.note, createdBy: input.createdBy, createdAt: input.now }).returning();
        return toSpend(row);
      },
      async getById(id) {
        const [row] = await db.select().from(marketingSpend).where(eq(marketingSpend.id, id));
        return row ? toSpend(row) : null;
      },
      async void(id, by, reason, at) {
        const [row] = await db.update(marketingSpend).set({ voidedAt: at, voidedBy: by, voidReason: reason }).where(and(eq(marketingSpend.id, id), isNull(marketingSpend.voidedAt))).returning();
        if (!row) {
          const [existing] = await db.select().from(marketingSpend).where(eq(marketingSpend.id, id));
          if (!existing) throw new LeadNotFoundError("Spend entry not found.");
          throw new LeadStateError("That spend entry was already voided.");
        }
        return toSpend(row);
      },
      async list(query) {
        const rows = await db.select().from(marketingSpend).where(and(gte(marketingSpend.spentOn, query.fromDate), lte(marketingSpend.spentOn, query.toDate))).orderBy(desc(marketingSpend.spentOn), desc(marketingSpend.createdAt)).limit(query.limit);
        return rows.map(toSpend);
      },
    },

    campaigns: {
      async create(input) {
        try {
          const [row] = await db.insert(campaigns).values({ id: randomUUID(), name: input.name, utmCampaign: input.utmCampaign, utmSource: input.utmSource, utmMedium: input.utmMedium, landingPage: input.landingPage, startDate: input.startDate, endDate: input.endDate, status: input.status, createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now }).returning();
          return toCampaign(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("Another campaign already uses that tag.");
          throw error;
        }
      },
      async getById(id) {
        const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
        return row ? toCampaign(row) : null;
      },
      async update(id, patch, at) {
        const [row] = await db.update(campaigns).set({ ...patch, updatedAt: at }).where(eq(campaigns.id, id)).returning();
        if (!row) throw new LeadNotFoundError("Campaign not found.");
        return toCampaign(row);
      },
      async list(limit) {
        const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(limit);
        return rows.map(toCampaign);
      },
    },

    events: {
      async listByActor(actorId, { limit, before }) {
        const rows = await db
          .select()
          .from(leadEvents)
          .where(and(eq(leadEvents.actorId, actorId), before ? lt(leadEvents.createdAt, before) : undefined))
          .orderBy(desc(leadEvents.createdAt))
          .limit(limit);
        return rows.map(toEvent);
      },
      async actorLeadCounts(actorId) {
        const [acted] = await db.select({ n: sql<number>`count(distinct ${leadEvents.leadId})::int` }).from(leadEvents).where(eq(leadEvents.actorId, actorId));
        const [assigned] = await db
          .select({ n: sql<number>`count(distinct ${leadEvents.leadId})::int` })
          .from(leadEvents)
          .where(and(eq(leadEvents.eventType, "OWNER_CHANGED"), sql`${leadEvents.payload}->>'to' = ${actorId}`));
        return { leadsActedOn: acted?.n ?? 0, leadsAssignedTo: assigned?.n ?? 0 };
      },
      async countByTypeAndActor(eventType, from, to) {
        const rows = await db
          .select({ actorId: leadEvents.actorId, total: sql<number>`count(*)::int` })
          .from(leadEvents)
          .where(and(eq(leadEvents.eventType, eventType), isNotNull(leadEvents.actorId), gte(leadEvents.createdAt, from), lt(leadEvents.createdAt, to)))
          .groupBy(leadEvents.actorId);
        return Object.fromEntries(rows.flatMap((row) => (row.actorId ? [[row.actorId, row.total]] : [])));
      },
      async append(event: NewLeadEvent) {
        const [row] = await db
          .insert(leadEvents)
          .values({ id: randomUUID(), ...event })
          .returning();
        return toEvent(row);
      },

      async listByLead(leadId) {
        const rows = await db
          .select()
          .from(leadEvents)
          .where(eq(leadEvents.leadId, leadId))
          .orderBy(asc(leadEvents.createdAt), asc(leadEvents.seq));
        return rows.map(toEvent);
      },

      async summarise(leadIds): Promise<LeadActivitySummary[]> {
        if (leadIds.length === 0) return [];

        const aggregates = await db.execute(sql`
          select
            lead_id,
            max(created_at) filter (where event_type = 'CONTACT_LOGGED') as last_contact_at,
            (count(*) filter (where event_type = 'CONTACT_LOGGED'))::int as contact_attempts,
            max(created_at) filter (
              where actor_type = 'BUYER'
                and event_type in ('LEAD_CREATED', 'LEAD_CAPTURED', 'DEVELOPER_CONNECT_REQUESTED', 'OFFICIAL_WEBSITE_CLICKED')
            ) as last_buyer_activity_at
          from lead_events
          where lead_id in (${uuidList(leadIds)})
          group by lead_id`);

        const clicks = await db.execute(sql`
          select lead_id, payload->>'developerName' as developer_name
          from lead_events
          where event_type in ('DEVELOPER_CONNECT_REQUESTED', 'OFFICIAL_WEBSITE_CLICKED') and lead_id in (${uuidList(leadIds)})
          order by created_at asc, seq asc`);

        const byLead = new Map<string, LeadActivitySummary>();
        for (const id of leadIds) {
          byLead.set(id, {
            leadId: id,
            lastContactAt: null,
            contactAttempts: 0,
            lastBuyerActivityAt: null,
            lastBuyerActivityDeveloperName: null,
            firstDeveloperName: null,
          });
        }
        for (const raw of aggregates.rows) {
          const row = raw as { lead_id: string; last_contact_at: Date | null; contact_attempts: number; last_buyer_activity_at: Date | null };
          const summary = byLead.get(row.lead_id);
          if (!summary) continue;
          summary.lastContactAt = row.last_contact_at ? new Date(row.last_contact_at) : null;
          summary.contactAttempts = row.contact_attempts;
          summary.lastBuyerActivityAt = row.last_buyer_activity_at ? new Date(row.last_buyer_activity_at) : null;
        }
        // Same definition as summariseEvents(): the latest click's name (null if redacted), the earliest non-null name.
        for (const raw of clicks.rows) {
          const row = raw as { lead_id: string; developer_name: string | null };
          const summary = byLead.get(row.lead_id);
          if (!summary) continue;
          summary.lastBuyerActivityDeveloperName = row.developer_name;
          if (summary.firstDeveloperName === null && row.developer_name !== null) summary.firstDeveloperName = row.developer_name;
        }
        return leadIds.map((id) => byLead.get(id)!);
      },

      async redactPayloads(leadId, redact) {
        const rows = await db.select().from(leadEvents).where(eq(leadEvents.leadId, leadId)).orderBy(asc(leadEvents.createdAt), asc(leadEvents.seq));
        // Transaction-local: the trigger only lets payload change while this is on, and it switches itself off at COMMIT.
        await db.execute(sql`select set_config('dc.allow_lead_erasure', 'on', true)`);
        let changed = 0;
        for (const row of rows) {
          const event = toEvent(row);
          const next = redact(event);
          if (JSON.stringify(next) === JSON.stringify(event.payload)) continue;
          await db.update(leadEvents).set({ payload: next }).where(eq(leadEvents.id, row.id));
          changed += 1;
        }
        return changed;
      },
    },

    touches: {
      async create(touch: NewTouch, fallbackOccurredAt: Date) {
        const [row] = await db
          .insert(marketingTouches)
          .values({
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
          })
          .returning();
        return toTouch(row);
      },
      async getById(id) {
        const [row] = await db.select().from(marketingTouches).where(eq(marketingTouches.id, id));
        return row ? toTouch(row) : null;
      },
      async countBySessionSince(sessionId, since) {
        const [row] = await db
          .select({ total: count() })
          .from(marketingTouches)
          .where(and(eq(marketingTouches.sessionId, sessionId), gte(marketingTouches.occurredAt, since)));
        return Number(row?.total ?? 0);
      },
    },

    consents: {
      async create(consent: NewConsent) {
        const [row] = await db
          .insert(leadConsents)
          .values({ id: randomUUID(), ...consent })
          .returning();
        return toConsent(row);
      },
      async listByLead(leadId) {
        const rows = await db.select().from(leadConsents).where(eq(leadConsents.leadId, leadId)).orderBy(asc(leadConsents.givenAt));
        return rows.map(toConsent);
      },
      async withdrawActive(leadId, at) {
        const rows = await db
          .update(leadConsents)
          .set({ withdrawnAt: at })
          .where(and(eq(leadConsents.leadId, leadId), isNull(leadConsents.withdrawnAt)))
          .returning();
        return rows.map(toConsent);
      },
    },

    bookings: {
      async revenueByOwner() {
        const rows = await db
          .select({ ownerId: leads.ownerId, currency: bookings.currency, total: sql<string>`sum(${bookings.bookingValue})::text`, count: sql<number>`count(*)::int` })
          .from(bookings)
          .innerJoin(leads, eq(leads.id, bookings.leadId))
          .where(and(eq(bookings.status, "BOOKED"), isNotNull(leads.ownerId)))
          .groupBy(leads.ownerId, bookings.currency);
        return rows.flatMap((row) => (row.ownerId ? [{ ownerId: row.ownerId, currency: row.currency, total: Number(row.total), count: row.count }] : []));
      },
      async listOutstanding(limit) {
        const rows = await db
          .select()
          .from(bookings)
          .where(and(eq(bookings.status, "BOOKED"), sql`${bookings.commissionExpected} > ${bookings.commissionReceived}`))
          .orderBy(asc(bookings.bookedAt))
          .limit(limit);
        return rows.map(toBooking);
      },
      async create(booking: NewBooking) {
        const [row] = await db
          .insert(bookings)
          .values({
            id: randomUUID(),
            leadId: booking.leadId,
            developerId: booking.developerId,
            projectName: booking.projectName,
            projectId: booking.projectId ?? null,
            currency: booking.currency,
            bookingValue: booking.bookingValue,
            commissionExpected: booking.commissionExpected,
            bookedAt: booking.bookedAt,
            createdBy: booking.createdBy,
            createdAt: booking.now,
            updatedAt: booking.now,
          })
          .returning();
        return toBooking(row);
      },
      async getById(id) {
        const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
        return row ? toBooking(row) : null;
      },
      async update(id: string, patch: BookingPatch, at: Date) {
        const [row] = await db
          .update(bookings)
          .set({ ...patch, updatedAt: at })
          .where(eq(bookings.id, id))
          .returning();
        if (!row) throw new LeadNotFoundError("Booking not found.");
        return toBooking(row);
      },
      async listByLead(leadId) {
        const rows = await db.select().from(bookings).where(eq(bookings.leadId, leadId)).orderBy(desc(bookings.bookedAt));
        return rows.map(toBooking);
      },
    },

    requirements: {
      async create(input: NewRequirement) {
        let row: typeof leadRequirements.$inferSelect;
        try {
          [row] = await db
            .insert(leadRequirements)
            .values({
              id: randomUUID(),
              leadId: input.leadId,
              status: "ACTIVE",
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
            })
            .returning();
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("This lead already has an active requirement.");
          throw error;
        }
        await insertLocations(db, row.id, input.locations);
        return toRequirement(row, input.locations.map((l) => l.name));
      },
      async getById(id) {
        const [row] = await db.select().from(leadRequirements).where(eq(leadRequirements.id, id));
        if (!row) return null;
        return toRequirement(row, (await locationsFor(db, [id])).get(id) ?? []);
      },
      async getActiveByLead(leadId) {
        const [row] = await db
          .select()
          .from(leadRequirements)
          .where(and(eq(leadRequirements.leadId, leadId), eq(leadRequirements.status, "ACTIVE")));
        if (!row) return null;
        return toRequirement(row, (await locationsFor(db, [row.id])).get(row.id) ?? []);
      },
      async listByLead(leadId) {
        const rows = await db
          .select()
          .from(leadRequirements)
          .where(eq(leadRequirements.leadId, leadId))
          .orderBy(desc(leadRequirements.createdAt), desc(leadRequirements.id));
        const byRequirement = await locationsFor(db, rows.map((row) => row.id));
        return rows.map((row) => toRequirement(row, byRequirement.get(row.id) ?? []));
      },
      async update(id: string, patch: RequirementPatch, at: Date, locations?: RequirementLocation[]) {
        let row: typeof leadRequirements.$inferSelect | undefined;
        try {
          [row] = await db.update(leadRequirements).set({ ...patch, updatedAt: at }).where(eq(leadRequirements.id, id)).returning();
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("This lead already has an active requirement.");
          throw error;
        }
        if (!row) throw new LeadNotFoundError("Requirement not found.");
        if (locations) {
          await db.delete(leadRequirementLocations).where(eq(leadRequirementLocations.requirementId, id));
          await insertLocations(db, id, locations);
        }
        return toRequirement(row, (await locationsFor(db, [id])).get(id) ?? []);
      },
      async eraseForLead(leadId) {
        await db.update(leadRequirements).set({ notes: null }).where(eq(leadRequirements.leadId, leadId));
        await db
          .delete(leadRequirementLocations)
          .where(inArray(leadRequirementLocations.requirementId, db.select({ id: leadRequirements.id }).from(leadRequirements).where(eq(leadRequirements.leadId, leadId))));
      },
    },

    followUps: {
      async create(input: NewFollowUp) {
        try {
          const [row] = await db
            .insert(leadFollowUps)
            .values({
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
            })
            .returning();
          return toFollowUp(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("This lead already has an open follow-up.");
          throw error;
        }
      },
      async getById(id) {
        const [row] = await db.select().from(leadFollowUps).where(eq(leadFollowUps.id, id));
        return row ? toFollowUp(row) : null;
      },
      async getOpenByLead(leadId) {
        const [row] = await db
          .select()
          .from(leadFollowUps)
          .where(and(eq(leadFollowUps.leadId, leadId), inArray(leadFollowUps.status, ["SCHEDULED", "MISSED"])));
        return row ? toFollowUp(row) : null;
      },
      async listByLead(leadId) {
        const rows = await db
          .select()
          .from(leadFollowUps)
          .where(eq(leadFollowUps.leadId, leadId))
          .orderBy(desc(leadFollowUps.createdAt), desc(leadFollowUps.id));
        return rows.map(toFollowUp);
      },
      async update(id: string, patch: FollowUpPatch, at: Date) {
        try {
          const [row] = await db.update(leadFollowUps).set({ ...patch, updatedAt: at }).where(eq(leadFollowUps.id, id)).returning();
          if (!row) throw new LeadNotFoundError("Follow-up not found.");
          return toFollowUp(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("This lead already has an open follow-up.");
          throw error;
        }
      },
      async markMissed(scope: FollowUpScope, now: Date) {
        // One atomic statement: only the caller whose UPDATE flips a row gets it back, so a missed event is written once.
        const rows = await db
          .update(leadFollowUps)
          .set({ status: "MISSED", missedCount: sql`${leadFollowUps.missedCount} + 1`, lastMissedAt: now, updatedAt: now })
          .where(
            and(
              eq(leadFollowUps.status, "SCHEDULED"),
              lt(leadFollowUps.scheduledAt, now),
              inArray(leadFollowUps.leadId, db.select({ id: leads.id }).from(leads).where(isNull(leads.erasedAt))),
              scope.ownerId !== undefined ? eq(leadFollowUps.ownerId, scope.ownerId) : undefined,
              scope.leadId !== undefined ? eq(leadFollowUps.leadId, scope.leadId) : undefined,
            ),
          )
          .returning();
        return rows.map(toFollowUp).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      },
      async listUnresolvedMissed(query: MissedFollowUpQuery): Promise<FollowUpWithLead[]> {
        const rows = await db
          .select({ followUp: leadFollowUps, lead: leads })
          .from(leadFollowUps)
          .innerJoin(leads, eq(leads.id, leadFollowUps.leadId))
          .where(
            and(
              isNull(leads.erasedAt),
              or(eq(leadFollowUps.status, "MISSED"), and(eq(leadFollowUps.status, "SCHEDULED"), lt(leadFollowUps.scheduledAt, query.now))),
              query.ownerId !== undefined ? eq(leadFollowUps.ownerId, query.ownerId) : undefined,
              query.leadId !== undefined ? eq(leadFollowUps.leadId, query.leadId) : undefined,
              query.temperature !== undefined ? eq(leads.temperature, query.temperature) : undefined,
              query.status !== undefined ? eq(leads.status, query.status) : undefined,
              query.scheduledFrom ? gte(leadFollowUps.scheduledAt, query.scheduledFrom) : undefined,
              query.scheduledTo ? lt(leadFollowUps.scheduledAt, query.scheduledTo) : undefined,
              query.overdueForAtLeastMs !== undefined ? lte(leadFollowUps.scheduledAt, new Date(query.now.getTime() - query.overdueForAtLeastMs)) : undefined,
            ),
          )
          .orderBy(asc(leadFollowUps.scheduledAt), asc(leadFollowUps.id))
          .limit(query.limit);
        return rows.map((row) => ({ followUp: toFollowUp(row.followUp), lead: toLead(row.lead) }));
      },
      async listScheduled(query): Promise<FollowUpWithLead[]> {
        const rows = await db
          .select({ followUp: leadFollowUps, lead: leads })
          .from(leadFollowUps)
          .innerJoin(leads, eq(leads.id, leadFollowUps.leadId))
          .where(
            and(
              isNull(leads.erasedAt),
              eq(leadFollowUps.status, "SCHEDULED"),
              gte(leadFollowUps.scheduledAt, query.from),
              lt(leadFollowUps.scheduledAt, query.to),
              query.ownerId !== undefined ? eq(leadFollowUps.ownerId, query.ownerId) : undefined,
              query.leadId !== undefined ? eq(leadFollowUps.leadId, query.leadId) : undefined,
            ),
          )
          .orderBy(asc(leadFollowUps.scheduledAt), asc(leadFollowUps.id))
          .limit(query.limit);
        return rows.map((row) => ({ followUp: toFollowUp(row.followUp), lead: toLead(row.lead) }));
      },
      async claimDueNotifications(scope: FollowUpScope, upTo: Date, now: Date) {
        const rows = await db
          .update(leadFollowUps)
          .set({ dueNotifiedAt: now })
          .where(
            and(
              eq(leadFollowUps.status, "SCHEDULED"),
              isNull(leadFollowUps.dueNotifiedAt),
              isNotNull(leadFollowUps.ownerId),
              lte(leadFollowUps.scheduledAt, upTo),
              inArray(leadFollowUps.leadId, db.select({ id: leads.id }).from(leads).where(isNull(leads.erasedAt))),
              scope.ownerId !== undefined ? eq(leadFollowUps.ownerId, scope.ownerId) : undefined,
              scope.leadId !== undefined ? eq(leadFollowUps.leadId, scope.leadId) : undefined,
            ),
          )
          .returning();
        return rows.map(toFollowUp);
      },
      async statsByStaff(from, to, now) {
        const out: Record<string, { created: number; completed: number; missedNow: number }> = {};
        const row = (id: string) => (out[id] ??= { created: 0, completed: 0, missedNow: 0 });
        const created = await db
          .select({ id: leadFollowUps.createdBy, total: sql<number>`count(*)::int` })
          .from(leadFollowUps)
          .where(and(gte(leadFollowUps.createdAt, from), lt(leadFollowUps.createdAt, to)))
          .groupBy(leadFollowUps.createdBy);
        for (const r of created) row(r.id).created = r.total;
        const completed = await db
          .select({ id: leadFollowUps.completedBy, total: sql<number>`count(*)::int` })
          .from(leadFollowUps)
          .where(and(isNotNull(leadFollowUps.completedBy), gte(leadFollowUps.completedAt, from), lt(leadFollowUps.completedAt, to)))
          .groupBy(leadFollowUps.completedBy);
        for (const r of completed) if (r.id) row(r.id).completed = r.total;
        const missed = await db
          .select({ id: leadFollowUps.ownerId, total: sql<number>`count(*)::int` })
          .from(leadFollowUps)
          .innerJoin(leads, eq(leads.id, leadFollowUps.leadId))
          .where(
            and(
              isNotNull(leadFollowUps.ownerId),
              isNull(leads.erasedAt),
              or(eq(leadFollowUps.status, "MISSED"), and(eq(leadFollowUps.status, "SCHEDULED"), lt(leadFollowUps.scheduledAt, now))),
            ),
          )
          .groupBy(leadFollowUps.ownerId);
        for (const r of missed) if (r.id) row(r.id).missedNow = r.total;
        return out;
      },
      async eraseForLead(leadId) {
        await db.update(leadFollowUps).set({ note: null, cancelNote: null }).where(eq(leadFollowUps.leadId, leadId));
      },
    },

    calls: {
      async create(input: NewCall) {
        const [row] = await db
          .insert(leadCalls)
          .values({ id: randomUUID(), leadId: input.leadId, staffUserId: input.staffUserId, provider: input.provider, phoneLast4: input.phoneLast4, method: input.method ?? "PROVIDER", batchId: input.batchId ?? null, deviceRef: input.deviceRef ?? null, initiatedAt: input.now, createdAt: input.now, updatedAt: input.now })
          .returning();
        return toCall(row);
      },
      async getById(id) {
        const [row] = await db.select().from(leadCalls).where(eq(leadCalls.id, id));
        return row ? toCall(row) : null;
      },
      async getByProviderCallId(provider, providerCallId) {
        const [row] = await db.select().from(leadCalls).where(and(eq(leadCalls.provider, provider), eq(leadCalls.providerCallId, providerCallId)));
        return row ? toCall(row) : null;
      },
      async update(id: string, patch: CallPatch, at: Date) {
        try {
          const [row] = await db.update(leadCalls).set({ ...patch, updatedAt: at }).where(eq(leadCalls.id, id)).returning();
          if (!row) throw new LeadNotFoundError("Call not found.");
          return toCall(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("That provider call id is already recorded.");
          throw error;
        }
      },
      async appendEvent(event: NewCallEvent) {
        const [inserted] = await db
          .insert(leadCallEvents)
          .values({ id: randomUUID(), ...event })
          .onConflictDoNothing({ target: [leadCallEvents.provider, leadCallEvents.providerEventId] })
          .returning();
        if (inserted) return { event: toCallEvent(inserted), duplicate: false };
        const [existing] = await db
          .select()
          .from(leadCallEvents)
          .where(and(eq(leadCallEvents.provider, event.provider), eq(leadCallEvents.providerEventId, event.providerEventId)));
        return { event: toCallEvent(existing), duplicate: true };
      },
      async listEvents(callId) {
        const rows = await db.select().from(leadCallEvents).where(eq(leadCallEvents.callId, callId)).orderBy(asc(leadCallEvents.occurredAt), asc(leadCallEvents.id));
        return rows.map(toCallEvent);
      },
      async listByLead(leadId) {
        const rows = await db.select().from(leadCalls).where(eq(leadCalls.leadId, leadId)).orderBy(desc(leadCalls.initiatedAt), desc(leadCalls.id));
        return rows.map(toCall);
      },
      async listRecent(filter: CallFilter): Promise<CallWithLead[]> {
        const rows = await db
          .select({ call: leadCalls, leadId: leads.id, name: leads.name, sourceType: leads.sourceType, creationMethod: leads.creationMethod, erasedAt: leads.erasedAt })
          .from(leadCalls)
          .innerJoin(leads, eq(leads.id, leadCalls.leadId))
          .where(callWhere(filter))
          .orderBy(desc(leadCalls.initiatedAt), desc(leadCalls.id))
          .limit(filter.limit);
        return rows.map((row) => ({ call: toCall(row.call), lead: { id: row.leadId, name: row.name, sourceType: row.sourceType, creationMethod: row.creationMethod, erasedAt: row.erasedAt } }));
      },
      async aggregate(query: CallAggregateQuery): Promise<CallAggregateRow[]> {
        // The zone is validated and written as a literal so every use of the bucket expression is the SAME expression
        // (a bound parameter would make SELECT and GROUP BY look different to PostgreSQL).
        const tz = assertSafeTimeZone(query.timeZone);
        const local = sql.raw(`(lead_calls.initiated_at AT TIME ZONE '${tz}')`);
        const key =
          query.groupBy === "EMPLOYEE"
            ? sql`${leadCalls.staffUserId}`
            : query.groupBy === "HOUR_OF_DAY"
              ? sql`to_char(${local}, 'HH24')`
              : query.groupBy === "HOUR"
                ? sql`to_char(${local}, 'YYYY-MM-DD"T"HH24')`
                : query.groupBy === "DAY"
                  ? sql`to_char(${local}, 'YYYY-MM-DD')`
                  : query.groupBy === "WEEK"
                    ? sql`to_char(date_trunc('week', ${local}), 'YYYY-MM-DD')`
                    : query.groupBy === "MONTH"
                      ? sql`to_char(${local}, 'YYYY-MM')`
                      : query.groupBy === "QUARTER"
                        ? sql`(to_char(${local}, 'YYYY') || '-Q' || to_char(${local}, 'Q'))`
                        : sql`to_char(${local}, 'YYYY')`;
        const rows = await db
          .select({
            key: sql<string>`${key}`,
            dialed: sql<number>`(count(*) filter (where ${leadCalls.classification} is not null))::int`,
            connected: sql<number>`(count(*) filter (where ${leadCalls.classification} = 'CONNECTED'))::int`,
            noAnswer: sql<number>`(count(*) filter (where ${leadCalls.status} = 'NO_ANSWER' or ${leadCalls.disposition} = 'NO_ANSWER'))::int`,
            busy: sql<number>`(count(*) filter (where ${leadCalls.status} = 'BUSY' or ${leadCalls.disposition} = 'BUSY'))::int`,
            failed: sql<number>`(count(*) filter (where ${leadCalls.status} = 'FAILED'))::int`,
            rejected: sql<number>`(count(*) filter (where ${leadCalls.status} = 'REJECTED'))::int`,
            talkSeconds: sql<number>`coalesce(sum(${leadCalls.durationSeconds}) filter (where ${leadCalls.classification} = 'CONNECTED'), 0)::int`,
            leadsCalled: sql<number>`(count(distinct ${leadCalls.leadId}) filter (where ${leadCalls.classification} is not null))::int`,
          })
          .from(leadCalls)
          .innerJoin(leads, eq(leads.id, leadCalls.leadId))
          // Unfinished attempts (no classification yet) are not activity; failed placements are counted as failures only.
          .where(and(callWhere(query), or(isNotNull(leadCalls.classification), eq(leadCalls.status, "FAILED"))))
          .groupBy(key)
          .orderBy(key);
        return rows;
      },
    },

    projects: {
      async create(input) {
        try {
          const [row] = await db.insert(projects).values({ id: randomUUID(), developerId: input.developerId, name: input.name, city: input.city, locality: input.locality, propertyType: input.propertyType, configurations: input.configurations, priceMin: input.priceMin, priceMax: input.priceMax, currency: input.currency, createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now }).returning();
          return toProject(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("This developer already has a project with that name.");
          throw error;
        }
      },
      async getById(id) {
        const [row] = await db.select().from(projects).where(eq(projects.id, id));
        return row ? toProject(row) : null;
      },
      async update(id, patch, at) {
        try {
          const [row] = await db.update(projects).set({ ...patch, updatedAt: at }).where(eq(projects.id, id)).returning();
          if (!row) throw new LeadNotFoundError("Project not found.");
          return toProject(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("This developer already has a project with that name.");
          throw error;
        }
      },
      async list(query) {
        const rows = await db.select().from(projects).where(query.activeOnly ? eq(projects.status, "ACTIVE") : undefined).orderBy(desc(projects.createdAt)).limit(query.limit);
        return rows.map(toProject);
      },
    },

    shortlist: {
      async add(input) {
        try {
          const [row] = await db.insert(leadProjectShortlist).values({ id: randomUUID(), leadId: input.leadId, requirementId: input.requirementId, projectId: input.projectId, shortlistedBy: input.shortlistedBy, shortlistedAt: input.now }).returning();
          return toShortlist(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("That project is already on this buyer's shortlist.");
          throw error;
        }
      },
      async getById(id) {
        const [row] = await db.select().from(leadProjectShortlist).where(eq(leadProjectShortlist.id, id));
        return row ? toShortlist(row) : null;
      },
      async listByLead(leadId) {
        const rows = await db.select().from(leadProjectShortlist).where(eq(leadProjectShortlist.leadId, leadId)).orderBy(asc(leadProjectShortlist.shortlistedAt));
        return rows.map(toShortlist);
      },
      async countActiveByProject() {
        const rows = await db.select({ projectId: leadProjectShortlist.projectId, n: count() }).from(leadProjectShortlist).where(isNull(leadProjectShortlist.removedAt)).groupBy(leadProjectShortlist.projectId);
        return Object.fromEntries(rows.map((r) => [r.projectId, Number(r.n)]));
      },
      async remove(id, removedBy, at) {
        const [row] = await db.update(leadProjectShortlist).set({ removedBy, removedAt: at }).where(and(eq(leadProjectShortlist.id, id), isNull(leadProjectShortlist.removedAt))).returning();
        if (!row) {
          const [existing] = await db.select().from(leadProjectShortlist).where(eq(leadProjectShortlist.id, id));
          if (!existing) throw new LeadNotFoundError("Shortlist entry not found.");
          throw new LeadStateError("That project was already removed from the shortlist.");
        }
        return toShortlist(row);
      },
    },

    siteVisits: {
      async create(input) {
        try {
          const [row] = await db.insert(siteVisits).values({ id: randomUUID(), leadId: input.leadId, requirementId: input.requirementId, projectId: input.projectId, staffUserId: input.staffUserId, scheduledAt: input.scheduledAt, notes: input.notes, rescheduledFrom: input.rescheduledFrom, createdBy: input.createdBy, createdAt: input.now, updatedAt: input.now }).returning();
          return toVisit(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new LeadStateError("This buyer already has an open site visit for that project. Reschedule it instead.");
          throw error;
        }
      },
      async getById(id) {
        const [row] = await db.select().from(siteVisits).where(eq(siteVisits.id, id));
        return row ? toVisit(row) : null;
      },
      async update(id, patch, at) {
        const [row] = await db.update(siteVisits).set({ ...patch, updatedAt: at }).where(and(eq(siteVisits.id, id), inArray(siteVisits.status, ["SCHEDULED", "CONFIRMED"]))).returning();
        if (!row) {
          const [existing] = await db.select().from(siteVisits).where(eq(siteVisits.id, id));
          if (!existing) throw new LeadNotFoundError("Site visit not found.");
          throw new LeadStateError("A finished site visit cannot be changed.");
        }
        return toVisit(row);
      },
      async listByLead(leadId) {
        const rows = await db.select().from(siteVisits).where(eq(siteVisits.leadId, leadId)).orderBy(asc(siteVisits.scheduledAt));
        return rows.map(toVisit);
      },
      async list(query) {
        const rows = await db
          .select()
          .from(siteVisits)
          .where(and(query.staffUserId !== undefined ? eq(siteVisits.staffUserId, query.staffUserId) : undefined, query.statuses ? inArray(siteVisits.status, query.statuses) : undefined, query.from ? gte(siteVisits.scheduledAt, query.from) : undefined, query.to ? lt(siteVisits.scheduledAt, query.to) : undefined))
          .orderBy(asc(siteVisits.scheduledAt))
          .limit(query.limit);
        return rows.map(toVisit);
      },
      async appendEvent(input) {
        const [row] = await db.insert(siteVisitEvents).values({ id: randomUUID(), visitId: input.visitId, eventType: input.eventType, actorType: input.actorType, actorId: input.actorId, fromStatus: input.fromStatus, toStatus: input.toStatus, payload: input.payload, createdAt: input.createdAt }).returning();
        return toVisitEvent(row);
      },
      async listEvents(visitId) {
        const rows = await db.select().from(siteVisitEvents).where(eq(siteVisitEvents.visitId, visitId)).orderBy(asc(siteVisitEvents.createdAt));
        return rows.map(toVisitEvent);
      },
      async eraseForLead(leadId) {
        await db.update(siteVisits).set({ notes: null, nextAction: null }).where(eq(siteVisits.leadId, leadId));
      },
      async countByProject(from, to) {
        const rows = await db.select({ projectId: siteVisits.projectId, n: count() }).from(siteVisits).where(and(isNotNull(siteVisits.projectId), isNull(siteVisits.rescheduledFrom), gte(siteVisits.createdAt, from), lt(siteVisits.createdAt, to))).groupBy(siteVisits.projectId);
        return Object.fromEntries(rows.flatMap((r) => (r.projectId ? [[r.projectId, Number(r.n)]] : [])));
      },
      async statsByStaff(from, to) {
        const out: Record<string, SiteVisitStats> = {};
        const row = (id: string) => (out[id] ??= { scheduled: 0, completed: 0, noShow: 0 });
        const created = await db.select({ id: siteVisits.staffUserId, n: count() }).from(siteVisits).where(and(isNull(siteVisits.rescheduledFrom), gte(siteVisits.createdAt, from), lt(siteVisits.createdAt, to))).groupBy(siteVisits.staffUserId);
        for (const r of created) row(r.id).scheduled = Number(r.n);
        const done = await db.select({ id: siteVisits.staffUserId, status: siteVisits.status, n: count() }).from(siteVisits).where(and(inArray(siteVisits.status, ["COMPLETED", "NO_SHOW"]), gte(siteVisits.completedAt, from), lt(siteVisits.completedAt, to))).groupBy(siteVisits.staffUserId, siteVisits.status);
        for (const r of done) {
          if (r.status === "COMPLETED") row(r.id).completed = Number(r.n);
          else row(r.id).noShow = Number(r.n);
        }
        return out;
      },
    },

    callingBatches: {
      async create(input: NewCallingBatch) {
        const id = randomUUID();
        await db.insert(callingBatches).values({ id, name: input.name, createdBy: input.createdBy, assignedTo: input.assignedTo, importBatchId: input.importBatchId, createdAt: input.now });
        if (input.leadIds.length > 0) {
          await db.insert(callingBatchItems).values(input.leadIds.map((leadId, position) => ({ id: randomUUID(), batchId: id, leadId, position })));
        }
        return (await this.getById(id))!;
      },
      async getById(id) {
        const [row] = await db.select().from(callingBatches).where(eq(callingBatches.id, id));
        if (!row) return null;
        const [{ n }] = await db.select({ n: count() }).from(callingBatchItems).where(eq(callingBatchItems.batchId, id));
        return { ...row, status: row.status === "CLOSED" ? "CLOSED" : "ACTIVE", itemCount: Number(n) } as CallingBatch;
      },
      async listForAssignee(staffUserId) {
        const rows = await db
          .select({ batch: callingBatches, n: sql<number>`(select count(*)::int from calling_batch_items i where i.batch_id = ${callingBatches.id})` })
          .from(callingBatches)
          .where(eq(callingBatches.assignedTo, staffUserId))
          .orderBy(asc(callingBatches.status), desc(callingBatches.createdAt));
        return rows.map((r) => ({ ...r.batch, status: r.batch.status === "CLOSED" ? "CLOSED" : "ACTIVE", itemCount: r.n }) as CallingBatch);
      },
      async listAll(limit) {
        const rows = await db
          .select({ batch: callingBatches, n: sql<number>`(select count(*)::int from calling_batch_items i where i.batch_id = ${callingBatches.id})` })
          .from(callingBatches)
          .orderBy(desc(callingBatches.createdAt))
          .limit(limit);
        return rows.map((r) => ({ ...r.batch, status: r.batch.status === "CLOSED" ? "CLOSED" : "ACTIVE", itemCount: r.n }) as CallingBatch);
      },
      async progress(batchId) {
        const items = await db
          .select({ position: callingBatchItems.position, lead: leads })
          .from(callingBatchItems)
          .innerJoin(leads, eq(leads.id, callingBatchItems.leadId))
          .where(eq(callingBatchItems.batchId, batchId))
          .orderBy(asc(callingBatchItems.position));
        const sums = await db
          .select({
            leadId: leadCalls.leadId,
            calls: sql<number>`(count(*) filter (where ${leadCalls.classification} is not null))::int`,
            connected: sql<number>`(count(*) filter (where ${leadCalls.classification} = 'CONNECTED'))::int`,
            failed: sql<number>`(count(*) filter (where ${leadCalls.status} = 'FAILED'))::int`,
            lastAt: sql<Date | null>`max(coalesce(${leadCalls.startedAt}, ${leadCalls.initiatedAt})) filter (where ${leadCalls.classification} is not null)`,
          })
          .from(leadCalls)
          .where(eq(leadCalls.batchId, batchId))
          .groupBy(leadCalls.leadId);
        const lasts = await db
          .selectDistinctOn([leadCalls.leadId], { leadId: leadCalls.leadId, classification: leadCalls.classification })
          .from(leadCalls)
          .where(and(eq(leadCalls.batchId, batchId), isNotNull(leadCalls.classification)))
          .orderBy(leadCalls.leadId, desc(sql`coalesce(${leadCalls.startedAt}, ${leadCalls.initiatedAt})`));
        const byLead = new Map(sums.map((s) => [s.leadId, s]));
        const lastBy = new Map(lasts.map((l) => [l.leadId, l.classification]));
        return items.map((item): BatchLeadProgress => {
          const s = byLead.get(item.lead.id);
          return {
            lead: toLead(item.lead),
            position: item.position,
            calls: s?.calls ?? 0,
            connectedCalls: s?.connected ?? 0,
            failedCalls: s?.failed ?? 0,
            lastCallAt: s?.lastAt ? new Date(s.lastAt) : null,
            lastClassification: lastBy.get(item.lead.id) ?? null,
          };
        });
      },
      async close(id) {
        const [row] = await db.update(callingBatches).set({ status: "CLOSED" }).where(eq(callingBatches.id, id)).returning();
        if (!row) throw new LeadNotFoundError("Calling batch not found.");
        return (await this.getById(id))!;
      },
    },

    importBatches: {
      async create(input: NewImportBatch) {
        const [row] = await db.insert(leadImportBatches).values({ id: randomUUID(), ...input }).returning();
        return toBatch(row);
      },
      async finish(id, counts) {
        const [row] = await db.update(leadImportBatches).set(counts).where(eq(leadImportBatches.id, id)).returning();
        if (!row) throw new LeadNotFoundError("Import batch not found.");
        return toBatch(row);
      },
      async list(limit) {
        const rows = await db.select().from(leadImportBatches).orderBy(desc(leadImportBatches.importedAt)).limit(limit);
        return rows.map(toBatch);
      },
      async getById(id) {
        const [row] = await db.select().from(leadImportBatches).where(eq(leadImportBatches.id, id));
        return row ? toBatch(row) : null;
      },
    },

    async transaction<T>(work: (repos: LeadRepositories) => Promise<T>): Promise<T> {
      // Nests via SAVEPOINT when already inside a transaction, like the developer repositories.
      return db.transaction((tx) => work(build(tx as unknown as DbOrTx)));
    },
  };
}

export function createPostgresLeadRepositories(): LeadRepositories {
  return build(getDb());
}

// Re-exported so tests can aim the adapter at a specific handle.
export { build as buildLeadRepositories };
