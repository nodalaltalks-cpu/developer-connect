import { sql } from "drizzle-orm";
import { getDb } from "../../developer-connect/db/client.ts";
import type { BehaviourReport, CtaRow, Device, PageHealthRow, SessionFacts } from "../report.ts";

/**
 * Reads the behaviour report from analytics_events. Aggregation happens in SQL (one row per session, one per page and
 * device, one per button), so the Founder page never loads raw events. Anonymous data only; nothing here touches leads.
 */

const SESSION_CAP = 50_000;

const toDevice = (value: unknown): Device => (value === "mobile" || value === "desktop" ? value : "unknown");
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/** Developer pages are grouped as one "page" so the report shows 'developer page', not hundreds of slugs. */
const PATH_GROUP = sql`case
  when payload->>'path' ~ '^/developers/[^/]+$' then '/developers/[developer]'
  when payload->>'path' ~ '^/buy-direct-from-developer/[^/]+$' then '/buy-direct-from-developer/[market]'
  else payload->>'path' end`;

export async function loadBehaviourReport(from: Date, to: Date): Promise<BehaviourReport> {
  const db = getDb();
  const range = sql`occurred_at >= ${from.toISOString()}::timestamptz and occurred_at < ${to.toISOString()}::timestamptz`;

  const [sessionRows, pageRows, ctaRows] = await Promise.all([
    db.execute(sql`
      select session_id,
        (array_agg(payload order by occurred_at) filter (where event_name = 'page_viewed'))[1] as first_view,
        bool_or(event_name = 'developer_page_viewed' or (event_name = 'page_viewed' and payload->>'path' like '/developers/%')) as viewed_developer,
        bool_or(event_name = 'official_website_clicked') as clicked_connect,
        bool_or(event_name = 'assistance_gate_shown') as gate_shown,
        bool_or(event_name = 'assistance_form_started') as form_started,
        bool_or(event_name = 'lead_submitted') as lead,
        (array_agg(payload->>'deviceType' order by occurred_at) filter (where payload->>'deviceType' is not null))[1] as device
      from analytics_events
      where ${range}
      group by session_id
      order by min(occurred_at) desc
      limit ${SESSION_CAP + 1}`),
    db.execute(sql`
      select p.path, p.device, p.views, e.measured, e.avg_engaged, e.avg_scroll, e.bounced
      from (
        select ${PATH_GROUP} as path, coalesce(payload->>'deviceType', 'unknown') as device, count(*)::int as views
        from analytics_events where event_name = 'page_viewed' and ${range} group by 1, 2
      ) p
      left join (
        select ${PATH_GROUP} as path, coalesce(payload->>'deviceType', 'unknown') as device,
          count(*)::int as measured,
          avg((payload->>'engagedSeconds')::numeric) as avg_engaged,
          avg((payload->>'maxScrollPercent')::numeric) as avg_scroll,
          count(*) filter (where (payload->>'engagedSeconds')::int < 5 and (payload->>'maxScrollPercent')::int < 25 and (payload->>'clicks')::int = 0)::int as bounced
        from analytics_events where event_name = 'page_engagement' and ${range} group by 1, 2
      ) e on e.path = p.path and e.device = p.device
      order by p.views desc
      limit 300`),
    db.execute(sql`
      select payload->>'ctaId' as cta_id, coalesce(payload->>'deviceType', 'unknown') as device, count(*)::int as clicks
      from analytics_events where event_name = 'cta_clicked' and ${range}
      group by 1, 2`),
  ]);

  const truncated = sessionRows.rows.length > SESSION_CAP;
  const sessions: SessionFacts[] = sessionRows.rows.slice(0, SESSION_CAP).map((r) => {
    const view = (r.first_view ?? {}) as Record<string, unknown>;
    return {
      sessionId: String(r.session_id),
      device: toDevice(r.device),
      firstPath: str(view.path),
      referrerHost: str(view.referrerHost),
      utmSource: str(view.utmSource),
      utmMedium: str(view.utmMedium),
      utmCampaign: str(view.utmCampaign),
      hasGclid: view.hasGclid === true,
      hasFbclid: view.hasFbclid === true,
      viewedDeveloper: r.viewed_developer === true,
      clickedConnect: r.clicked_connect === true,
      gateShown: r.gate_shown === true,
      formStarted: r.form_started === true,
      leadSubmitted: r.lead === true,
    };
  });

  const pages: PageHealthRow[] = pageRows.rows.map((r) => ({
    path: String(r.path),
    device: toDevice(r.device),
    views: Number(r.views),
    measured: Number(r.measured ?? 0),
    avgEngagedSeconds: num(r.avg_engaged) === null ? null : Math.round(Number(r.avg_engaged) * 10) / 10,
    avgScrollPercent: num(r.avg_scroll) === null ? null : Math.round(Number(r.avg_scroll) * 10) / 10,
    bounced: Number(r.bounced ?? 0),
  }));

  const ctas: CtaRow[] = ctaRows.rows.filter((r) => r.cta_id).map((r) => ({ ctaId: String(r.cta_id), device: toDevice(r.device), clicks: Number(r.clicks) }));

  return { sessions, pages, ctas, truncated };
}
