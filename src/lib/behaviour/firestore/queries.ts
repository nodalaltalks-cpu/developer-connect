import { readEvents, type StoredEvent } from "../../firestore/analytics-events.ts";
import type { BehaviourReport, CtaRow, Device, PageHealthRow, SessionFacts } from "../report.ts";

/**
 * Firestore version of the behaviour report: one pass over the range's events, grouped per session, per page+device
 * and per button, exactly the three aggregates the SQL produced. Anonymous data only; nothing here touches leads.
 */

const SESSION_CAP = 50_000;

const toDevice = (value: unknown): Device => (value === "mobile" || value === "desktop" ? value : "unknown");
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Developer pages are grouped as one "page" so the report shows 'developer page', not hundreds of slugs. */
function pathGroup(path: unknown): string | null {
  if (typeof path !== "string") return null;
  if (/^\/developers\/[^/]+$/.test(path)) return "/developers/[developer]";
  if (/^\/buy-direct-from-developer\/[^/]+$/.test(path)) return "/buy-direct-from-developer/[market]";
  return path;
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function loadBehaviourReport(from: Date, to: Date): Promise<BehaviourReport> {
  const events = await readEvents({ from, to });

  // --- sessions: one row each, newest-starting first, capped ---------------------------------------------------
  const bySession = new Map<string, StoredEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.sessionId);
    if (list) list.push(e);
    else bySession.set(e.sessionId, [e]);
  }
  const ordered = [...bySession.entries()]
    .map(([sessionId, list]) => ({ sessionId, list, start: list[0].occurredAt.getTime() }))
    .sort((a, b) => b.start - a.start);
  const truncated = ordered.length > SESSION_CAP;

  const sessions: SessionFacts[] = ordered.slice(0, SESSION_CAP).map(({ sessionId, list }) => {
    const firstView = list.find((e) => e.eventName === "page_viewed")?.payload ?? {};
    const device = list.map((e) => e.payload.deviceType).find((d) => d !== undefined && d !== null);
    return {
      sessionId,
      device: toDevice(device),
      firstPath: str(firstView.path),
      referrerHost: str(firstView.referrerHost),
      utmSource: str(firstView.utmSource),
      utmMedium: str(firstView.utmMedium),
      utmCampaign: str(firstView.utmCampaign),
      hasGclid: firstView.hasGclid === true,
      hasFbclid: firstView.hasFbclid === true,
      viewedDeveloper: list.some((e) => e.eventName === "developer_page_viewed" || (e.eventName === "page_viewed" && typeof e.payload.path === "string" && e.payload.path.startsWith("/developers/"))),
      clickedConnect: list.some((e) => e.eventName === "official_website_clicked"),
      gateShown: list.some((e) => e.eventName === "assistance_gate_shown"),
      formStarted: list.some((e) => e.eventName === "assistance_form_started"),
      leadSubmitted: list.some((e) => e.eventName === "lead_submitted"),
    };
  });

  // --- pages: views joined to engagement, per page group and device --------------------------------------------
  type Agg = { views: number; measured: number; engaged: number[]; scroll: number[]; bounced: number };
  const pageAgg = new Map<string, Agg & { path: string; device: string }>();
  const bucket = (path: string, device: string) => {
    const key = `${path}\u0000${device}`;
    let a = pageAgg.get(key);
    if (!a) {
      a = { path, device, views: 0, measured: 0, engaged: [], scroll: [], bounced: 0 };
      pageAgg.set(key, a);
    }
    return a;
  };
  for (const e of events) {
    const path = pathGroup(e.payload.path);
    if (path === null) continue;
    const device = (e.payload.deviceType as string | undefined) ?? "unknown";
    if (e.eventName === "page_viewed") bucket(path, device).views += 1;
    else if (e.eventName === "page_engagement") {
      const a = bucket(path, device);
      a.measured += 1;
      const engaged = numOrNull(e.payload.engagedSeconds);
      const scroll = numOrNull(e.payload.maxScrollPercent);
      const clicks = numOrNull(e.payload.clicks);
      if (engaged !== null) a.engaged.push(engaged);
      if (scroll !== null) a.scroll.push(scroll);
      if (engaged !== null && scroll !== null && clicks !== null && engaged < 5 && scroll < 25 && clicks === 0) a.bounced += 1;
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const pages: PageHealthRow[] = [...pageAgg.values()]
    // Like the SQL, a page appears only when it has page views (engagement alone does not create a row).
    .filter((a) => a.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 300)
    .map((a) => {
      const avgEngaged = mean(a.engaged);
      const avgScroll = mean(a.scroll);
      return {
        path: a.path,
        device: toDevice(a.device),
        views: a.views,
        measured: a.measured,
        avgEngagedSeconds: avgEngaged === null ? null : round1(avgEngaged),
        avgScrollPercent: avgScroll === null ? null : round1(avgScroll),
        bounced: a.bounced,
      };
    });

  // --- ctas ----------------------------------------------------------------------------------------------------
  const ctaAgg = new Map<string, { ctaId: string; device: string; clicks: number; sessions: Set<string> }>();
  for (const e of events) {
    if (e.eventName !== "cta_clicked") continue;
    const ctaId = str(e.payload.ctaId);
    if (!ctaId) continue;
    const device = (e.payload.deviceType as string | undefined) ?? "unknown";
    const key = `${ctaId}\u0000${device}`;
    const a = ctaAgg.get(key) ?? { ctaId, device, clicks: 0, sessions: new Set<string>() };
    a.clicks += 1;
    a.sessions.add(e.sessionId);
    ctaAgg.set(key, a);
  }
  const ctas: CtaRow[] = [...ctaAgg.values()].map((a) => ({ ctaId: a.ctaId, device: toDevice(a.device), clicks: a.clicks, visitors: a.sessions.size }));

  return { sessions, pages, ctas, truncated };
}
