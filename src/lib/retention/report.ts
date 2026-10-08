import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../developer-connect/db/schema.ts";
import { calculateProfileCompletion } from "../profile/completion.ts";

/**
 * RETENTION, counted from records that exist: first-party visit events (a persistent anonymous visitor cookie, one year), lead
 * events and profiles. Nothing here is estimated, and a figure that cannot be measured yet says so instead of showing a zero that
 * looks like data.
 *
 * Definitions (the same ones the page prints):
 *  - Visitor: a browser (anonymous session id) that opened at least one public page in the period.
 *  - Returning visitor: a visitor who opened pages on two or more different days in the period, OR who had already visited before it.
 *  - Repeat researcher: a visitor who looked at developer pages on two or more different days in the period.
 *  - Reached an advisor: pressed WhatsApp, Email or Call (opening the choices alone does not count).
 *  - Repeat enquiry: a lead that asked to be connected with a developer more than once in the period.
 *
 * Unmeasured today (no data is collected for them, so none is shown): saved projects, saved developers, re-engagement messages
 * sent. They appear on the page as "not tracked yet".
 */

type Db = NodePgDatabase<typeof schema>;

export interface RetentionReport {
  visitors: number;
  returningVisitors: number;
  repeatResearchers: number;
  /** Visitors who reached an advisor, split by whether they were returning. */
  reachedAdvisor: { returning: number; firstVisit: number };
  /** Visitors who asked to be connected through the form, split the same way. */
  submittedRequest: { returning: number; firstVisit: number };
  advisorChannels: { whatsapp: number; email: number; call: number; opened: number };
  repeatEnquiries: number;
  profiles: ProfileCompletionBands;
}

export interface ProfileCompletionBands {
  total: number;
  complete: number;
  started: number;
  /** Profiles with no field filled in yet. */
  empty: number;
}

/** Share of `part` in `whole` as a whole percent, or null when there is nobody to measure (never 0% of nothing). */
export function share(part: number, whole: number): number | null {
  return whole <= 0 ? null : Math.round((part / whole) * 100);
}

export function bandProfiles(rows: Array<{ data: Record<string, unknown> }>): ProfileCompletionBands {
  let complete = 0;
  let started = 0;
  let empty = 0;
  for (const row of rows) {
    const pct = calculateProfileCompletion(row.data ?? {}).percentage;
    if (pct === null || pct === 0) empty += 1;
    else if (pct >= 100) complete += 1;
    else started += 1;
  }
  return { total: rows.length, complete, started, empty };
}

const num = (value: unknown) => Number(value ?? 0);

export async function getRetentionReport(db: Db, range: { from: Date; to: Date }): Promise<RetentionReport> {
  const { from, to } = range;
  const sessions = await db.execute(sql`
    with s as (
      select e.session_id,
        count(distinct (e.occurred_at at time zone 'Asia/Kolkata')::date) filter (where e.event_name = 'page_viewed') as visit_days,
        count(distinct (e.occurred_at at time zone 'Asia/Kolkata')::date) filter (where e.event_name = 'developer_page_viewed') as developer_days,
        bool_or(e.event_name = 'lead_submitted') as submitted,
        bool_or(e.event_name = 'cta_clicked' and e.payload->>'ctaId' in ('advisor_whatsapp', 'advisor_email', 'advisor_call')) as reached_advisor,
        exists (select 1 from analytics_events p where p.session_id = e.session_id and p.event_name = 'page_viewed' and p.occurred_at < ${from}) as visited_before
      from analytics_events e
      where e.occurred_at >= ${from} and e.occurred_at < ${to}
      group by e.session_id
    ), v as (
      select *, (visit_days >= 2 or visited_before) as is_returning from s where visit_days >= 1
    )
    select
      count(*)::int as visitors,
      (count(*) filter (where is_returning))::int as returning_visitors,
      (count(*) filter (where developer_days >= 2))::int as repeat_researchers,
      (count(*) filter (where reached_advisor and is_returning))::int as advisor_returning,
      (count(*) filter (where reached_advisor and not is_returning))::int as advisor_first,
      (count(*) filter (where submitted and is_returning))::int as submitted_returning,
      (count(*) filter (where submitted and not is_returning))::int as submitted_first
    from v`);
  const channels = await db.execute(sql`
    select
      (count(*) filter (where payload->>'ctaId' = 'advisor_whatsapp'))::int as whatsapp,
      (count(*) filter (where payload->>'ctaId' = 'advisor_email'))::int as email,
      (count(*) filter (where payload->>'ctaId' = 'advisor_call'))::int as call,
      (count(*) filter (where payload->>'ctaId' = 'advisor_open'))::int as opened
    from analytics_events
    where event_name = 'cta_clicked' and occurred_at >= ${from} and occurred_at < ${to}`);
  const repeats = await db.execute(sql`
    select count(*)::int as n from (
      select lead_id from lead_events
      where event_type = 'DEVELOPER_CONNECT_REQUESTED' and created_at >= ${from} and created_at < ${to}
      group by lead_id having count(*) >= 2
    ) r`);
  const profileRows = await db.execute(sql`select data from profiles order by updated_at desc limit 10000`);

  const s = (sessions.rows[0] ?? {}) as Record<string, unknown>;
  const c = (channels.rows[0] ?? {}) as Record<string, unknown>;
  return {
    visitors: num(s.visitors),
    returningVisitors: num(s.returning_visitors),
    repeatResearchers: num(s.repeat_researchers),
    reachedAdvisor: { returning: num(s.advisor_returning), firstVisit: num(s.advisor_first) },
    submittedRequest: { returning: num(s.submitted_returning), firstVisit: num(s.submitted_first) },
    advisorChannels: { whatsapp: num(c.whatsapp), email: num(c.email), call: num(c.call), opened: num(c.opened) },
    repeatEnquiries: num((repeats.rows[0] as Record<string, unknown> | undefined)?.n),
    profiles: bandProfiles((profileRows.rows as Array<{ data: Record<string, unknown> }>).map((r) => ({ data: r.data }))),
  };
}
