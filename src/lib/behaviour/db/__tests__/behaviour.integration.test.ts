import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * The visitor-behaviour pipeline end to end on the REAL PostgreSQL adapter (test database only, migration 0028): the
 * collector stores validated events, the report reads them back as sessions, funnel, channels, pages and buttons.
 * Uses an isolated historic time window so no other data can leak into the counts, and removes its own rows afterwards.
 */
const skip = !hasTestDatabase;

async function modules() {
  const [ingest, sink, queries, report, client, drizzle] = await Promise.all([
    import("../../ingest.ts"),
    import("../../../developer-connect/db/postgres-analytics-sink.ts"),
    import("../queries.ts"),
    import("../../report.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
  ]);
  return { ingest, sink: sink.postgresAnalyticsSink, queries, report, db: client.getDb(), sql: drizzle.sql };
}

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

test("integration: collector -> analytics_events -> report (sessions, funnel, channel, device, pages, buttons)", { skip }, async () => {
  const { ingest, sink, queries, report, db, sql } = await modules();
  const base = new Date(Date.UTC(2001, 2, 4, 5, 0, 0) + Math.floor(Math.random() * 20) * 3_600_000);
  const from = new Date(base.getTime() - 60_000);
  const to = new Date(base.getTime() + 60 * 60_000);
  const tag = randomUUID().slice(0, 8);
  const ctx = (sessionId: string, mobile: boolean, offsetSeconds = 0) => ({
    sessionId,
    deviceType: (mobile ? "mobile" : "desktop") as "mobile" | "desktop",
    userAgent: mobile ? MOBILE_UA : DESKTOP_UA,
    globalPrivacyControl: false,
    now: new Date(base.getTime() + offsetSeconds * 1000),
  });
  const batch = (...events: object[]) => JSON.stringify({ events });

  try {
    // Session A: a phone visitor from a Google ad who opens a developer page, presses Connect and sends an enquiry.
    const a = `it-a-${tag}`;
    await ingest.ingestBehaviour(sink, batch({ name: "page_viewed", path: "/developers/acme?utm_source=google", utmSource: "google", hasGclid: true, viewportWidth: 390 }), ctx(a, true, 1));
    await ingest.ingestBehaviour(sink, batch({ name: "cta_clicked", path: "/developers/acme", ctaId: "connect_sticky" }, { name: "page_engagement", path: "/developers/acme", engagedSeconds: 42, maxScrollPercent: 80, clicks: 1 }), ctx(a, true, 20));
    for (const eventName of ["official_website_clicked", "assistance_gate_shown", "assistance_form_started", "lead_submitted"] as const) {
      await sink.record({ eventName, occurredAt: new Date(base.getTime() + 30_000), sessionId: a, deviceType: "mobile", developerId: randomUUID(), sourceCta: "developer_page", returningVisitor: false, contactPreference: "WHATSAPP", newLead: true } as never);
    }
    // Session B: a desktop visitor from Instagram who bounces off the home page.
    const b = `it-b-${tag}`;
    await ingest.ingestBehaviour(sink, batch({ name: "page_viewed", path: "/", referrer: "https://l.instagram.com/?u=zzz", viewportWidth: 1280 }), ctx(b, false, 2));
    await ingest.ingestBehaviour(sink, batch({ name: "page_engagement", path: "/", engagedSeconds: 2, maxScrollPercent: 10, clicks: 0 }), ctx(b, false, 4));
    // Ignored traffic: a bot, a privacy-signal visitor and a private path must leave no trace.
    await ingest.ingestBehaviour(sink, batch({ name: "page_viewed", path: "/" }), { ...ctx(`it-bot-${tag}`, false), userAgent: "Googlebot/2.1" });
    await ingest.ingestBehaviour(sink, batch({ name: "page_viewed", path: "/" }), { ...ctx(`it-gpc-${tag}`, true), globalPrivacyControl: true });
    await ingest.ingestBehaviour(sink, batch({ name: "page_viewed", path: "/admin/leads" }), ctx(`it-priv-${tag}`, false));

    const data = await queries.loadBehaviourReport(from, to);
    assert.equal(data.sessions.length, 2, "exactly the two real visitors; the bot, the privacy-signal visitor and the private page left nothing");
    const sa = data.sessions.find((s) => s.sessionId === a)!;
    const sb = data.sessions.find((s) => s.sessionId === b)!;
    assert.deepEqual([sa.device, sa.hasGclid, sa.viewedDeveloper, sa.clickedConnect, sa.gateShown, sa.formStarted, sa.leadSubmitted], ["mobile", true, true, true, true, true, true]);
    assert.deepEqual([sb.device, sb.referrerHost, sb.viewedDeveloper, sb.leadSubmitted], ["desktop", "l.instagram.com", false, false]);
    assert.equal(report.sessionChannel(sa), "GOOGLE_ADS");
    assert.equal(report.sessionChannel(sb), "INSTAGRAM");

    assert.deepEqual(report.buildFunnel(data.sessions).map((s) => s.count), [2, 1, 1, 1, 1, 1]);

    const dev = data.pages.find((p) => p.path === "/developers/[developer]" && p.device === "mobile");
    assert.ok(dev, "developer pages are grouped, not listed per slug");
    assert.deepEqual([dev.views, dev.measured, dev.avgEngagedSeconds, dev.avgScrollPercent, dev.bounced], [1, 1, 42, 80, 0]);
    const home = data.pages.find((p) => p.path === "/" && p.device === "desktop");
    assert.deepEqual([home?.views, home?.measured, home?.bounced], [1, 1, 1], "2s, 10% scroll, no clicks counts as leaving quickly");

    assert.deepEqual(data.ctas, [{ ctaId: "connect_sticky", device: "mobile", clicks: 1 }]);
    assert.equal(report.buildFindings(data).length, 1, "two sessions is too few to conclude anything");
  } finally {
    await db.execute(sql`delete from analytics_events where session_id like ${`it-%-${tag}`}`);
  }
});
