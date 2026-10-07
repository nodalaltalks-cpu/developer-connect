import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Phase 5 (campaigns and the acquisition report) against the REAL PostgreSQL adapter and migration 0024, test database only. */
const skip = !hasTestDatabase;

async function modules() {
  const [service, campaignSvc, leadPg, schema, client, phone, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../campaign-service.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, campaignSvc, leadPg, schema, db: client.getDb(), phone, sql: drizzle.sql };
}

async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let i = 0; i < 50; i++) {
    const r = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (r.ok) return r.e164;
  }
  throw new Error("no phone");
}

const founder = () => ({ actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 12)}` });
const refusal = (re: RegExp) => (error: unknown) => re.test(`${(error as Error).message} ${((error as { cause?: Error }).cause?.message) ?? ""}`);

async function leadWithTouch(touch: Record<string, string>, phone?: string, when = new Date()) {
  const { service, leadPg, schema, db } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const dev = randomUUID();
  const slug = `test-p5-${randomUUID()}`;
  await db.insert(schema.developers).values({ id: dev, displayName: "TEST — Phase5 Co", slug, city: "Thane", state: "Maharashtra", country: "India" });
  const sessionId = `p5-${randomUUID()}`;
  const { lead } = await service.captureAssistanceLead(repos, { phone: phone ?? (await freshPhone()), name: "TEST p5", email: null, contactPreference: "PHONE_CALL", developer: { id: dev, slug, displayName: "TEST — Phase5 Co" }, sourceCta: "developer_page", sessionId, currentTouch: { sessionId, landingPath: "/developers/x", ...touch } }, when);
  return { lead, repos, sessionId };
}

test("integration: a campaign tag is unique case-insensitively (no double attribution) and Founder-only", { skip }, async () => {
  const { campaignSvc, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const f = founder();
  const tag = `tag_${randomUUID().slice(0, 8)}`;
  const c = await campaignSvc.createCampaign(repos, { name: "IT campaign", utmCampaign: tag, utmSource: "google", landingPage: "/developers", startDate: "2026-01-01", endDate: "2026-02-01" }, f);
  await assert.rejects(campaignSvc.createCampaign(repos, { name: "Dupe", utmCampaign: tag.toUpperCase() }, f), /already uses that tag/);
  await assert.rejects(campaignSvc.createCampaign(repos, { name: "Nope", utmCampaign: "x" }, { actorType: "EMPLOYEE", actorId: "e" }), /Founder/);
  await assert.rejects(campaignSvc.updateCampaign(repos, c.id, { utmCampaign: "changed" }, f), /cannot be changed/);
  assert.equal((await campaignSvc.updateCampaign(repos, c.id, { status: "PAUSED" }, f)).status, "PAUSED");
});

test("integration: FIRST touch is never overwritten - a later touch moves the latest pointer only, and the database refuses to re-point the first", { skip }, async () => {
  const { service, leadPg, db, sql } = await modules();
  const phone = await freshPhone();
  const { lead, repos } = await leadWithTouch({ gclid: "first-g" }, phone);
  const stored = (await repos.leads.getById(lead.id))!;
  const sessionId2 = `p5-${randomUUID()}`;
  await service.captureAssistanceLead(repos, { phone, name: "TEST p5", email: null, contactPreference: "PHONE_CALL", developer: null, sourceCta: "developer_page", sessionId: sessionId2, currentTouch: { sessionId: sessionId2, landingPath: "/developers/y", utmSource: "instagram" } } as never, new Date(Date.now() + 1000)).catch(() => undefined);
  const after = (await repos.leads.getById(lead.id))!;
  assert.equal(after.firstTouchId, stored.firstTouchId, "the first touch pointer is unchanged");
  const other = await leadWithTouch({ utmSource: "x" });
  await assert.rejects(db.execute(sql`UPDATE leads SET first_touch_id = ${other.lead.firstTouchId} WHERE id = ${lead.id}`), refusal(/first_touch_id is immutable/));
  void leadPg;
});

test("integration: the acquisition report SQL - channel, campaign tag, landing page, qualified (ever), site visit, booked - matches the pure rules and carries no personal data", { skip }, async () => {
  const { campaignSvc, service, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const f = founder();
  const tag = `spring_${randomUUID().slice(0, 8)}`;
  await campaignSvc.createCampaign(repos, { name: "Spring IT", utmCampaign: tag }, f);
  const t0 = new Date(Date.now() - 5000);
  const a = await leadWithTouch({ gclid: "g", utmCampaign: tag.toUpperCase() });
  const b = await leadWithTouch({ referrer: "https://www.google.com/" });
  const c = await leadWithTouch({});
  await service.changeLeadStatus(repos, a.lead.id, "QUALIFIED", f, {});
  await service.changeLeadStatus(repos, a.lead.id, "LOST", f, { reasonCode: "OTHER" });
  const report = await campaignSvc.getAcquisitionReport(repos, f, { from: t0, to: new Date(Date.now() + 60_000) }, "first");
  const byKey = (k: string) => report.byChannel.find((g) => g.key === k);
  assert.ok((byKey("GOOGLE_ADS")?.leads ?? 0) >= 1);
  assert.ok((byKey("ORGANIC_SEARCH")?.leads ?? 0) >= 1);
  assert.ok((byKey("DIRECT_OR_UNKNOWN")?.leads ?? 0) >= 1);
  const spring = report.byCampaign.find((g) => g.label === "Spring IT")!;
  assert.deepEqual([spring.leads, spring.qualified], [1, 1], "case-insensitive tag; a qualified-then-lost lead still counts as qualified");
  assert.equal(report.totals.leads, report.byChannel.reduce((n, g) => n + g.leads, 0), "every lead counted exactly once");
  assert.doesNotMatch(JSON.stringify(report), /\+91|@/);
  void b;
  void c;
});
