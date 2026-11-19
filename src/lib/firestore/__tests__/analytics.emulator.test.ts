import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test("firestore analytics: events are stored, filtered and turned into the behaviour report", { skip }, async () => {
  const { recordAnalyticsEvent, readEvents, countEvents } = await import("../analytics-events.ts");
  const { loadBehaviourReport } = await import("../../behaviour/firestore/queries.ts");

  const tag = randomUUID().slice(0, 8);
  const s1 = `s1-${tag}`;
  const s2 = `s2-${tag}`;
  const t0 = Date.now();
  const at = (ms: number) => new Date(t0 + ms);
  const dev = randomUUID();

  const ev = (eventName: string, sessionId: string, ms: number, extra: Record<string, unknown> = {}) =>
    recordAnalyticsEvent({ eventName, occurredAt: at(ms), sessionId, anonymousUserId: undefined, userId: undefined, ...extra } as never);

  await ev("page_viewed", s1, 0, { path: `/developers/${tag}`, deviceType: "mobile", utmSource: "google", hasGclid: true, referrerHost: "google.com" });
  await ev("page_engagement", s1, 10, { path: `/developers/${tag}`, deviceType: "mobile", engagedSeconds: 2, maxScrollPercent: 10, clicks: 0 });
  await ev("developer_page_viewed", s1, 20, { developerId: dev, path: `/developers/${tag}` });
  await ev("cta_clicked", s1, 30, { ctaId: `cta-${tag}`, deviceType: "mobile" });
  await ev("lead_submitted", s1, 40, {});
  await ev("page_viewed", s2, 5, { path: "/", deviceType: "desktop" });
  await ev("page_engagement", s2, 15, { path: "/", deviceType: "desktop", engagedSeconds: 30, maxScrollPercent: 80, clicks: 2 });
  await ev("cta_clicked", s2, 25, { ctaId: `cta-${tag}`, deviceType: "desktop" });

  const range = { from: at(-1000), to: at(60_000) };
  const forSession = await readEvents({ ...range, sessionId: s1 });
  assert.equal(forSession.length, 5);
  assert.deepEqual(forSession.map((e) => e.eventName).slice(0, 2), ["page_viewed", "page_engagement"], "oldest first by default");
  assert.equal((await readEvents({ ...range, names: ["cta_clicked", "lead_submitted"] })).filter((e) => e.sessionId.endsWith(tag)).length, 3);
  assert.equal((await readEvents({ names: ["developer_page_viewed"], developerId: dev }))[0].developerId, dev);
  assert.equal(await countEvents({ ...range, sessionId: s2 }), 3);
  assert.equal((await readEvents({ ...range, sessionId: s1, newestFirst: true, limit: 2 })).length, 2);

  const report = await loadBehaviourReport(range.from, range.to);
  const mine = report.sessions.filter((s) => s.sessionId.endsWith(tag));
  const a = mine.find((s) => s.sessionId === s1)!;
  assert.deepEqual(
    [a.device, a.firstPath, a.utmSource, a.hasGclid, a.viewedDeveloper, a.leadSubmitted, a.clickedConnect],
    ["mobile", `/developers/${tag}`, "google", true, true, true, false],
  );
  const b = mine.find((s) => s.sessionId === s2)!;
  assert.deepEqual([b.device, b.firstPath, b.viewedDeveloper, b.leadSubmitted], ["desktop", "/", false, false]);

  const devPage = report.pages.find((p) => p.path === "/developers/[developer]" && p.device === "mobile")!;
  assert.ok(devPage.views >= 1 && devPage.measured >= 1 && devPage.bounced >= 1, "developer pages are grouped; a 2s/10%/0-click visit is a bounce");
  const home = report.pages.find((p) => p.path === "/" && p.device === "desktop")!;
  assert.ok(home.avgEngagedSeconds !== null && home.bounced >= 0);

  const cta = report.ctas.filter((c) => c.ctaId === `cta-${tag}`);
  assert.deepEqual(cta.map((c) => [c.device, c.clicks, c.visitors]).sort(), [["desktop", 1, 1], ["mobile", 1, 1]]);
});
