import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../../developer-connect/db/client.ts";
import * as schema from "../../developer-connect/db/schema.ts";
import { bookings, developers, leadConsents, leadEvents, leads, marketingTouches } from "../../developer-connect/db/schema.ts";
import { LeadNotFoundError } from "../errors.ts";
import { QUEUE_EXCLUDED_STATUSES } from "../queue-config.ts";
import { CLOSED_OUT_STATUSES, type LeadCounts, type LeadListQuery } from "../lead-views.ts";
import type {
  BookingPatch,
  LeadPatch,
  LeadRepositories,
  NewBooking,
  NewConsent,
  NewLeadEvent,
  NewLeadInput,
  NewTouch,
} from "../repository.ts";
import type { Booking, Lead, LeadActivitySummary, LeadConsent, LeadEvent, MarketingTouch } from "../types.ts";

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
const toBooking = (row: typeof bookings.$inferSelect): Booking => ({ ...row });
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
function viewPredicate(query: Pick<LeadListQuery, "view" | "now" | "endOfToday">): SQL | undefined {
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
    case "qualified":
      return and(notErased, eq(leads.status, "QUALIFIED"));
  }
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
        const rows = await db
          .select()
          .from(leads)
          .where(and(isNull(leads.erasedAt), notInArray(leads.status, [...QUEUE_EXCLUDED_STATUSES])))
          .orderBy(desc(leads.lastActivityAt), asc(leads.id))
          .limit(limit);
        return rows.map(toLead);
      },

      async list(query) {
        const where = viewPredicate(query);
        const followUpOrder = query.view === "overdue" || query.view === "due_today";
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
    },

    events: {
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
                and event_type in ('LEAD_CREATED', 'LEAD_CAPTURED', 'OFFICIAL_WEBSITE_CLICKED')
            ) as last_buyer_activity_at
          from lead_events
          where lead_id in (${uuidList(leadIds)})
          group by lead_id`);

        const clicks = await db.execute(sql`
          select lead_id, payload->>'developerName' as developer_name
          from lead_events
          where event_type = 'OFFICIAL_WEBSITE_CLICKED' and lead_id in (${uuidList(leadIds)})
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
      async create(booking: NewBooking) {
        const [row] = await db
          .insert(bookings)
          .values({
            id: randomUUID(),
            leadId: booking.leadId,
            developerId: booking.developerId,
            projectName: booking.projectName,
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
