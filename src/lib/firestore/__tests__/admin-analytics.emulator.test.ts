import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test("firestore admin analytics: the dashboard queries run and compute the documented numbers", { skip }, async () => {
  process.env.DATA_BACKEND = "firestore";
  const { recordAnalyticsEvent } = await import("../analytics-events.ts");
  const q = await import("../../admin-analytics/queries.ts");
  const { getFirestoreDb } = await import("../client.ts");
  const db = getFirestoreDb();

  const tag = randomUUID().slice(0, 6);
  const DAY = 86_400_000;
  const start = new Date(Date.UTC(2100 + Math.floor(Math.random() * 800), 0, 5)); // a window nothing else ever writes to
  const end = new Date(start.getTime() + 7 * DAY);
  const range = { key: "week", start, end, timezone: "Asia/Kolkata", label: "test week" } as never;
  const at = (days: number, h = 10) => new Date(start.getTime() + days * DAY + h * 3_600_000);
  const ev = (eventName: string, sessionId: string, when: Date, extra: Record<string, unknown> = {}) =>
    recordAnalyticsEvent({ eventName, occurredAt: when, sessionId, anonymousUserId: undefined, userId: undefined, ...extra } as never);

  // A published developer, a candidate, a verification trail.
  const devId = randomUUID();
  const candId = randomUUID();
  await db.collection("developers").doc(devId).set({ displayName: `Dev ${tag}`, legalName: null, slug: `dev-${tag}`, city: "Mumbai", state: "MH", country: "India", status: "ACTIVE", pendingChanges: null, isPublished: false, verified: null, createdAt: at(0), updatedAt: at(0) }); // not published: this test must not leak a public-directory row into the shared emulator
  await db.collection("websiteCandidates").doc(candId).set({ developerId: devId, url: `https://dev-${tag}.com`, canonicalDomain: `dev-${tag}.com`, verificationStatus: "VERIFIED", lastCheckedAt: null, createdAt: at(0), updatedAt: at(0) });
  await db.collection("verificationEvents").doc(randomUUID()).set({ websiteCandidateId: candId, previousStatus: null, newStatus: "DISCOVERED", reason: "x", actorType: "SYSTEM", actorId: "s", createdAt: at(1, 8) });
  await db.collection("verificationEvents").doc(randomUUID()).set({ websiteCandidateId: candId, previousStatus: "DISCOVERED", newStatus: "VERIFIED", reason: "ok", actorType: "FOUNDER", actorId: "f", createdAt: at(1, 10) });

  // Events: s1 searches twice (same query) then clicks; s2 only zero-result; user_x signed in.
  await ev("search_performed", `s1-${tag}`, at(1), { query: `Lodha ${tag}`, deviceType: "mobile", country: "India", city: "Mumbai" });
  await ev("search_performed", `s1-${tag}`, at(1, 11), { query: `lodha ${tag}`, deviceType: "mobile" });
  await ev("search_result_clicked", `s1-${tag}`, at(1, 12), { developerId: devId });
  await ev("developer_page_viewed", `s1-${tag}`, at(1, 13), { developerId: devId });
  await ev("official_website_clicked", `s1-${tag}`, at(1, 14), { developerId: devId });
  await ev("zero_result_search", `s2-${tag}`, at(2), { query: `Nowhere ${tag}`, deviceType: "desktop" });
  await ev("search_performed", `s3-${tag}`, at(2), { query: `Other ${tag}`, userId: `user_x_${tag}` });
  await ev("page_viewed", `s3-${tag}`, at(4), { userId: `user_x_${tag}` });

  const overview = await q.getExecutiveOverview(range);
  assert.equal(overview.successfulSearches, 3);
  assert.equal(overview.zeroResultSearches, 1);
  assert.equal(overview.totalSearches, 4);
  assert.equal(overview.developerPageViews, 1);
  assert.equal(overview.officialWebsiteClicks, 1);
  assert.equal(overview.activeUsers, 1);
  assert.ok(overview.developersTracked >= 1 && overview.verifiedDevelopers >= 1);
  assert.equal(overview.funnel[0].count, 4);

  const search = await q.getSearchIntelligence(range);
  assert.equal(search.totalSearches, 4);
  assert.equal(search.uniqueQueries, 3, "Lodha and lodha are one query");
  assert.deepEqual(search.topQueries[0], { query: `lodha ${tag}`, count: 2 });
  assert.deepEqual(search.highDemandUnverified, [{ query: `nowhere ${tag}`, count: 1 }]);
  assert.deepEqual(search.searchBehavior, { searchingSessions: 3, repeatedSearchSessions: 1, refinedSearchSessions: 0 });
  assert.deepEqual(search.authenticationSplit, { anonymousSearches: 3, authenticatedSearches: 1 });
  assert.deepEqual(search.geographyDemand.byCountry, [{ value: "India", count: 1 }]);
  assert.equal(search.topEngagedDevelopers[0].displayName, `Dev ${tag}`);
  assert.equal(search.topEngagedDevelopers[0].officialWebsiteClicks, 1);

  const dev = await q.getDeveloperIntelligence({ search: `dev-${tag}`, status: "VERIFIED" }, range);
  assert.equal(dev.totalCount, 1);
  assert.deepEqual([dev.developers[0].verificationStatus, dev.developers[0].pageViews, dev.developers[0].officialWebsiteClicks], ["VERIFIED", 1, 1]);
  assert.equal((await q.getDeveloperIntelligence({ search: `dev-${tag}`, status: "REJECTED" }, range)).totalCount, 0);

  const ops = await q.getVerificationOperations(range);
  assert.equal(ops.averageTurnaroundHours, 2);
  const activity = await q.getVerificationActivity(range);
  assert.deepEqual([activity.DISCOVERED, activity.VERIFIED], [1, 1]);
  const log = await q.getAuditLog(10, range);
  assert.equal(log.length, 2);
  assert.equal(log[0].developerName, `Dev ${tag}`);
  assert.equal(log[0].newStatus, "VERIFIED", "newest first");

  const behaviour = await q.getUserBehaviorIntelligence(range);
  assert.equal(behaviour.distinctSessions, 3);
  const segment = (name: string) => behaviour.segments.find((s) => s.segment === name)!.count;
  assert.equal(segment("HIGH_INTENT"), 1);
  assert.equal(segment("RETURNING"), 1, "s3 was active on two different days");
  assert.equal(segment("ZERO_RESULT_ONLY"), 1);

  const users = await q.getUserAndProfileIntelligence(range);
  assert.equal(users.distinctSessions, 3);
  assert.equal(users.distinctAuthenticatedUsers, 1);

  const timeline = await q.getUserActivityTimeline(`user_x_${tag}`, 10);
  assert.equal(timeline.length, 2);
  const last = await q.getLastActivityByUserIds([`user_x_${tag}`, "nobody"]);
  assert.ok(last.get(`user_x_${tag}`) && !last.has("nobody"));
  const op = await q.getHighPriorityVerificationOpportunities();
  assert.ok(Array.isArray(op));

  // The snapshot-style readers just have to run and be consistent.
  assert.ok((await q.getDataQuality()).developersWithoutVerifiedWebsite >= 0);
  assert.ok((await q.getAiReadiness()).totalSearchEvents >= 4);
  const breakdown = await q.getDeveloperVerificationBreakdown();
  assert.ok(breakdown.verified >= 1);
  assert.ok((await q.getInfrastructureEntityCounts()).analyticsEvents >= 8);
  assert.deepEqual(await q.getDatabaseTableSizes(), []);
  const retention = await q.getRetentionMetrics();
  assert.equal(retention.windows.length, 3);
  delete process.env.DATA_BACKEND;
});
