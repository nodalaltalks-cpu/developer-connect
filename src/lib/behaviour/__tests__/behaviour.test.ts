import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AnalyticsEvent, AnalyticsEventSink } from "../../developer-connect/events.ts";
import { cleanPath, cleanReferrerHost, cleanToken, isBotUserAgent, toAnalyticsEvent, viewportClass, type VisitorContext } from "../events.ts";
import { ingestBehaviour } from "../ingest.ts";
import { IDLE_SECONDS, PageEngagement } from "../tracker-core.ts";
import { buildChannels, buildDevices, buildFindings, buildFunnel, MIN_SAMPLE, sessionChannel, summarisePages, type BehaviourReport, type PageHealthRow, type SessionFacts } from "../report.ts";

const NOW = new Date("2026-10-08T10:00:00Z");
const ctx = (over: Partial<VisitorContext> = {}): VisitorContext => ({
  sessionId: "sess-1",
  deviceType: "mobile",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  globalPrivacyControl: false,
  now: NOW,
  ...over,
});
const memorySink = () => {
  const events: AnalyticsEvent[] = [];
  const sink: AnalyticsEventSink = { record: (e) => void events.push(e) };
  return { sink, events };
};
const body = (...events: object[]) => JSON.stringify({ events });

// --- privacy and validation -------------------------------------------------------------------------

test("path: a plain public path only - query, fragment and private areas never get through", () => {
  assert.equal(cleanPath("/developers/acme-realty?utm_source=x#top"), "/developers/acme-realty");
  assert.equal(cleanPath("/"), "/");
  assert.equal(cleanPath("/developers/"), "/developers");
  for (const bad of ["/admin", "/admin/leads/123", "/profile", "/team/leads/9", "/post-sign-in", "/api/events", "//evil.com", "https://x.com/a", "developers", "/a b", "/<script>", "", null, 5, "/" + "a".repeat(250)]) {
    assert.equal(cleanPath(bad as never), null, String(bad));
  }
  assert.equal(cleanPath("/administrative"), "/administrative", "a prefix only matches at a path boundary");
});

test("referrer is reduced to a host; UTM values must be short plain tokens (an email-like value is dropped)", () => {
  assert.equal(cleanReferrerHost("https://www.google.com/search?q=secret+name"), "www.google.com");
  assert.equal(cleanReferrerHost("not a url"), undefined);
  assert.equal(cleanReferrerHost(""), undefined);
  assert.equal(cleanToken("Google"), "google");
  assert.equal(cleanToken("john@example.com"), undefined);
  assert.equal(cleanToken("two words"), undefined);
  assert.equal(cleanToken("x".repeat(61)), undefined);
  assert.equal(viewportClass(320), "xs");
  assert.equal(viewportClass(390), "sm");
  assert.equal(viewportClass(600), "md");
  assert.equal(viewportClass(1280), "lg");
  assert.equal(viewportClass("390"), undefined);
});

test("bots are recognised; a missing user agent counts as a bot", () => {
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 HeadlessChrome/120"), true);
  assert.equal(isBotUserAgent("Lighthouse"), true);
  assert.equal(isBotUserAgent(null), true);
  assert.equal(isBotUserAgent(ctx().userAgent), false);
});

test("events: each type is converted; numbers are clamped; unknown names, unknown CTAs and bad paths are refused", () => {
  const view = toAnalyticsEvent({ name: "page_viewed", path: "/developers/x?y=1", referrer: "https://l.instagram.com/?u=abc", utmSource: "IG", utmMedium: "john@x.com", hasGclid: true, viewportWidth: 390 }, ctx());
  assert.deepEqual(view && { ...view }, { occurredAt: NOW, sessionId: "sess-1", userId: undefined, deviceType: "mobile", eventName: "page_viewed", path: "/developers/x", referrerHost: "l.instagram.com", utmSource: "ig", utmMedium: undefined, utmCampaign: undefined, hasGclid: true, hasFbclid: undefined, viewport: "sm" });

  const eng = toAnalyticsEvent({ name: "page_engagement", path: "/", engagedSeconds: 99_999, maxScrollPercent: 250, clicks: -4 }, ctx());
  assert.ok(eng && eng.eventName === "page_engagement");
  assert.deepEqual([eng.engagedSeconds, eng.maxScrollPercent, eng.clicks], [1800, 100, 0]);
  assert.equal(toAnalyticsEvent({ name: "page_engagement", path: "/", engagedSeconds: "9", maxScrollPercent: 1, clicks: 1 }, ctx()), null, "strings are not numbers");

  assert.equal(toAnalyticsEvent({ name: "cta_clicked", path: "/", ctaId: "connect_sticky" }, ctx())?.eventName, "cta_clicked");
  assert.equal(toAnalyticsEvent({ name: "cta_clicked", path: "/", ctaId: "<img onerror>" }, ctx()), null);
  assert.equal(toAnalyticsEvent({ name: "lead_submitted", path: "/" }, ctx()), null, "a browser cannot forge server-side funnel events");
  assert.equal(toAnalyticsEvent({ name: "page_viewed", path: "/admin" }, ctx()), null);
  assert.equal(toAnalyticsEvent(null as never, ctx()), null);
});

test("no personal field exists on the stored behaviour events (phone, email, name, text, full url)", () => {
  const view = toAnalyticsEvent({ name: "page_viewed", path: "/", phone: "+919999999999", email: "a@b.co", name2: "x", fullUrl: "https://x.com/?phone=1" } as never, ctx());
  const keys = Object.keys(view ?? {});
  for (const forbidden of ["phone", "email", "name2", "fullUrl", "url", "query", "text"]) assert.ok(!keys.includes(forbidden), forbidden);
});

test("collector: bots and Global Privacy Control visitors are ignored entirely; bad bodies never throw", async () => {
  const ok = body({ name: "page_viewed", path: "/" });
  for (const [label, context, expected] of [
    ["bot", ctx({ userAgent: "Googlebot" }), "bot"],
    ["gpc", ctx({ globalPrivacyControl: true }), "privacy_signal"],
  ] as const) {
    const { sink, events } = memorySink();
    const result = await ingestBehaviour(sink, ok, context);
    assert.equal(result.dropped, expected, label);
    assert.equal(events.length, 0, label);
  }
  const { sink } = memorySink();
  assert.equal((await ingestBehaviour(sink, "not json", ctx())).dropped, "malformed");
  assert.equal((await ingestBehaviour(sink, JSON.stringify({ events: [] }), ctx())).dropped, "empty");
  assert.equal((await ingestBehaviour(sink, JSON.stringify({ nope: 1 }), ctx())).dropped, "malformed");
  assert.equal((await ingestBehaviour(sink, "x".repeat(9000), ctx())).dropped, "too_large");
});

test("collector: valid events are stored, invalid ones counted, a batch is capped at 20, a failing sink never throws", async () => {
  const { sink, events } = memorySink();
  const result = await ingestBehaviour(sink, body({ name: "page_viewed", path: "/" }, { name: "cta_clicked", path: "/", ctaId: "nope" }, { name: "page_engagement", path: "/", engagedSeconds: 5, maxScrollPercent: 50, clicks: 0 }), ctx());
  assert.deepEqual([result.accepted, result.rejected], [2, 1]);
  assert.deepEqual(events.map((e) => e.eventName), ["page_viewed", "page_engagement"]);

  const many = await ingestBehaviour(sink, body(...Array.from({ length: 50 }, () => ({ name: "page_viewed", path: "/" }))), ctx());
  assert.equal(many.accepted, 20);

  const broken: AnalyticsEventSink = { record: () => { throw new Error("database down"); } };
  const survived = await ingestBehaviour(broken, body({ name: "page_viewed", path: "/" }), ctx());
  assert.equal(survived.accepted, 1, "analytics failure is swallowed, not surfaced");
});

// --- tracker arithmetic ---------------------------------------------------------------------------

test("engagement: only visible, recently-active seconds count; idle and background time earn nothing", () => {
  const start = 1_000_000;
  const e = new PageEngagement(start);
  for (let s = 1; s <= 10; s++) e.tick(start + s * 1000, true);
  assert.equal(e.summary().engagedSeconds, 10);
  for (let s = 11; s <= 20; s++) e.tick(start + s * 1000, false); // background tab
  assert.equal(e.summary().engagedSeconds, 10, "hidden time is not engagement");
  const idleStart = start + 20_000;
  let counted = 0;
  for (let s = 1; s <= 60; s++) {
    e.tick(idleStart + s * 1000, true);
    counted = e.summary().engagedSeconds - 10;
  }
  assert.ok(counted <= IDLE_SECONDS, "a visitor who stopped moving stops earning time");
  e.activity(idleStart + 70_000);
  const before = e.summary().engagedSeconds;
  e.tick(idleStart + 71_000, true);
  assert.equal(e.summary().engagedSeconds, before + 1, "activity resumes the clock");
});

test("engagement: scroll depth is the deepest point reached; a one-screen page counts as fully seen; clicks count", () => {
  const e = new PageEngagement(0);
  e.scroll(0, 800, 3200, 1);
  assert.equal(e.summary().maxScrollPercent, 25);
  e.scroll(1600, 800, 3200, 2);
  assert.equal(e.summary().maxScrollPercent, 75);
  e.scroll(0, 800, 3200, 3);
  assert.equal(e.summary().maxScrollPercent, 75, "scrolling back up does not lower it");
  const short = new PageEngagement(0);
  short.scroll(0, 900, 700, 1);
  assert.equal(short.summary().maxScrollPercent, 100);
  e.click(4);
  e.click(5);
  assert.equal(e.summary().clicks, 2);
  e.scroll(0, 0, 0, 6);
  assert.equal(e.summary().maxScrollPercent, 75, "garbage sizes change nothing");
});

// --- the report -------------------------------------------------------------------------------------

let n = 0;
const session = (over: Partial<SessionFacts> = {}): SessionFacts => ({
  sessionId: `s${++n}`,
  device: "mobile",
  firstPath: "/",
  referrerHost: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  hasGclid: false,
  hasFbclid: false,
  viewedDeveloper: false,
  clickedConnect: false,
  gateShown: false,
  formStarted: false,
  leadSubmitted: false,
  ...over,
});
const many = (count: number, over: Partial<SessionFacts> = {}) => Array.from({ length: count }, () => session(over));

test("channels use the same rules as the lead report: click ids and tags name a channel, nothing is guessed", () => {
  assert.equal(sessionChannel(session({ hasGclid: true })), "GOOGLE_ADS");
  assert.equal(sessionChannel(session({ hasFbclid: true })), "META");
  assert.equal(sessionChannel(session({ referrerHost: "l.instagram.com" })), "INSTAGRAM");
  assert.equal(sessionChannel(session({ referrerHost: "www.google.com" })), "ORGANIC_SEARCH");
  assert.equal(sessionChannel(session()), "DIRECT_OR_UNKNOWN");
});

test("funnel: counts per step with the share of the previous step; an empty previous step gives no percentage", () => {
  const sessions = [...many(10), ...many(6, { viewedDeveloper: true }), ...many(3, { viewedDeveloper: true, clickedConnect: true, gateShown: true }), session({ viewedDeveloper: true, clickedConnect: true, gateShown: true, formStarted: true, leadSubmitted: true })];
  const f = buildFunnel(sessions);
  assert.deepEqual(f.map((s) => s.count), [20, 10, 4, 4, 1, 1]);
  assert.equal(f[1].continuedPercent, 50);
  assert.equal(f[2].continuedPercent, 40);
  assert.equal(f[5].ofVisitorsPercent, 5);
  assert.equal(buildFunnel([])[1].continuedPercent, null);
});

test("funnel: every step counts everyone who reached it or went further, so it can never widen and no step exceeds 100%", () => {
  // Enquiries from directory cards have no recorded developer-page Connect press, and some visitors only ever hit the form step.
  const sessions = [...many(10), ...many(5, { leadSubmitted: true }), ...many(3, { gateShown: true }), session({ formStarted: true })];
  const f = buildFunnel(sessions);
  assert.deepEqual(f.map((s) => s.count), [19, 9, 9, 9, 6, 5]);
  for (const step of f) assert.ok(step.continuedPercent === null || step.continuedPercent <= 100, step.label);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].count <= f[i - 1].count);
});

test("findings: Direct / unknown is never offered as the source to invest in", () => {
  const sessions = [...many(60, { leadSubmitted: true, viewedDeveloper: true, clickedConnect: true, gateShown: true, formStarted: true }), ...many(40, { hasGclid: true, viewedDeveloper: true }), ...many(5, { hasGclid: true, leadSubmitted: true })];
  const keys = buildFindings(report(sessions)).map((f) => f.key);
  assert.ok(!keys.some((k) => k.startsWith("channel-best:DIRECT_OR_UNKNOWN")));
  assert.ok(keys.some((k) => k.startsWith("channel-best:GOOGLE_ADS")));
});

test("rates need a real sample: below the minimum a channel or device shows no percentage", () => {
  const small = [...many(MIN_SAMPLE - 1, { hasGclid: true, clickedConnect: true })];
  assert.equal(buildChannels(small)[0].connectPercent, null);
  assert.equal(buildDevices(small)[0].connectPercent, null);
  const enough = [...many(MIN_SAMPLE, { hasGclid: true }), ...many(MIN_SAMPLE, { hasGclid: true, clickedConnect: true })];
  assert.equal(buildChannels(enough)[0].connectPercent, 50);
});

const report = (sessions: SessionFacts[], pages: PageHealthRow[] = [], ctas: BehaviourReport["ctas"] = []): BehaviourReport => ({ sessions, pages, ctas, truncated: false });

test("findings: with too little data the only finding says so - no conclusion from a handful of visits", () => {
  const found = buildFindings(report(many(5)));
  assert.equal(found.length, 1);
  assert.equal(found[0].key, "collecting");
  assert.match(found[0].detail, /5 visitor sessions/);
});

test("findings: names the biggest leak, the phone gap, a big source with no enquiries, and the best source - each with real numbers", () => {
  const sessions = [
    ...many(60, { device: "desktop", viewedDeveloper: true, clickedConnect: true, gateShown: true, formStarted: true, leadSubmitted: true, referrerHost: "www.google.com" }),
    ...many(140, { device: "mobile", hasGclid: true }),
    ...many(10, { device: "mobile", hasGclid: true, viewedDeveloper: true }),
  ];
  const found = buildFindings(report(sessions));
  const keys = found.map((f) => f.key);
  assert.ok(keys.includes("biggest-leak"));
  assert.ok(keys.includes("mobile-gap"));
  assert.ok(keys.some((k) => k.startsWith("channel-dud:GOOGLE_ADS")), "Google sends most visitors and none enquired");
  assert.ok(keys.some((k) => k.startsWith("channel-best:ORGANIC_SEARCH")));
  const dud = found.find((f) => f.key.startsWith("channel-dud"));
  assert.match(dud?.detail ?? "", /150 visitors came from Google and none sent an enquiry/);
  assert.equal(found[0].severity, "fix", "problems come before good news");
});

test("findings: a quiet healthy site says nothing is broken instead of inventing a problem", () => {
  const healthy = many(80, { device: "mobile", viewedDeveloper: true, clickedConnect: true, gateShown: true, formStarted: true, leadSubmitted: true });
  assert.deepEqual(buildFindings(report(healthy)).filter((f) => f.severity === "fix"), []);
});

test("pages: developer pages are grouped, averages are weighted by measured visits, bounce needs a real sample", () => {
  const rows: PageHealthRow[] = [
    { path: "/developers/[developer]", device: "mobile", views: 100, measured: 90, avgEngagedSeconds: 10, avgScrollPercent: 20, bounced: 60 },
    { path: "/developers/[developer]", device: "desktop", views: 20, measured: 10, avgEngagedSeconds: 40, avgScrollPercent: 80, bounced: 1 },
    { path: "/privacy", device: "mobile", views: 5, measured: 5, avgEngagedSeconds: 3, avgScrollPercent: 5, bounced: 5 },
  ];
  const pages = summarisePages(rows);
  assert.equal(pages[0].path, "/developers/[developer]");
  assert.equal(pages[0].views, 120);
  assert.equal(pages[0].avgEngagedSeconds, 13);
  assert.equal(pages[0].bouncePercent, 61);
  assert.equal(pages[1].bouncePercent, null, "5 measured visits is not enough to call a bounce rate");
  const found = buildFindings(report(many(40), rows));
  assert.ok(found.some((f) => f.key === "bounce:/developers/[developer]"));
  assert.ok(found.some((f) => f.key === "dev-scroll"));
});

// --- static guarantees ------------------------------------------------------------------------------

const read = (rel: string) => readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8");

test("static: the collector always answers 204, accepts no personal fields, and the tracker honours consent and privacy signals", () => {
  const route = read("src/app/api/events/route.ts");
  assert.match(route, /status: 204/);
  assert.doesNotMatch(route, /phone|email/i);
  const tracker = read("src/components/behaviour-tracker.tsx");
  assert.match(tracker, /parseAnalyticsConsent/);
  assert.match(tracker, /=== "essential"/);
  assert.match(tracker, /globalPrivacyControl/);
  assert.match(tracker, /doNotTrack/);
  assert.match(tracker, /isAnalyticsExcludedPath/);
  // The only fields a browser may send are the ones declared on RawClientEvent - none can hold a person's details.
  const events = read("src/lib/behaviour/events.ts");
  const accepted = events.match(/export interface RawClientEvent \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
  const fields = [...accepted.matchAll(/^\s*(\w+)\?:/gm)].map((m) => m[1]);
  assert.ok(fields.length >= 10);
  for (const forbidden of ["phone", "email", "name2", "text", "message", "url", "query", "note"]) assert.ok(!fields.includes(forbidden), forbidden);
});

test("static: the behaviour page and loader are Founder-only", () => {
  assert.match(read("src/app/admin/behaviour/page.tsx"), /await requireFounder\(\)/);
  assert.match(read("src/app/admin/layout.tsx"), /await requireFounder\(\)/);
});
