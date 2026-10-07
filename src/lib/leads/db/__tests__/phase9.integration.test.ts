import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Phase 9 reads (stage history, intelligence report) against the REAL PostgreSQL adapter, test database only. */
const skip = !hasTestDatabase;

async function modules() {
  const [service, intel, leadPg, schema, client, phone] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../intelligence-service.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
  ]);
  return { service, intel, leadPg, schema, db: client.getDb(), phone };
}

async function lead() {
  const { service, leadPg, schema, db, phone } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const dev = randomUUID();
  await db.insert(schema.developers).values({ id: dev, displayName: "TEST — Phase9 Co", slug: `test-p9-${randomUUID()}`, city: "Thane", state: "Maharashtra", country: "India" });
  const sessionId = `p9-${randomUUID()}`;
  let e164 = "";
  for (let i = 0; i < 50 && !e164; i++) {
    const r = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (r.ok) e164 = r.e164;
  }
  const { lead: l } = await service.captureAssistanceLead(repos, { phone: e164, name: "TEST p9", email: null, contactPreference: "PHONE_CALL", developer: { id: dev, slug: `s-${dev}`, displayName: "TEST — Phase9 Co" }, sourceCta: "developer_page", sessionId, currentTouch: { sessionId, landingPath: "/developers/x" } });
  return { lead: l, repos, service };
}

test("integration: stageHistory counts leads that EVER reached a stage (from events), so a later loss does not erase it, and counts those that booked", { skip }, async () => {
  const f = { actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  const { repos } = await lead();
  const before = Object.fromEntries((await repos.leads.stageHistory()).map((s) => [s.stage, s]));
  const { lead: l, service } = await lead();
  await service.changeLeadStatus(repos, l.id, "QUALIFIED", f, {});
  await service.changeLeadStatus(repos, l.id, "LOST", f, { reasonCode: "OTHER" });
  const { lead: b } = await lead();
  await service.changeLeadStatus(repos, b.id, "QUALIFIED", f, {});
  await service.createBooking(repos, b.id, { currency: "INR", bookingValue: 5_000_000, commissionExpected: 100_000 }, f);
  const after = Object.fromEntries((await repos.leads.stageHistory()).map((s) => [s.stage, s]));
  assert.equal(after.QUALIFIED.reached - before.QUALIFIED.reached, 2, "the lost lead still reached QUALIFIED");
  assert.equal(after.QUALIFIED.booked - before.QUALIFIED.booked, 1);
  // "Reached" means at or beyond the stage: the booked lead counts as past site-visit-done, the lost one (which stopped at qualified) does not.
  assert.equal(after.SITE_VISIT_DONE.reached - before.SITE_VISIT_DONE.reached, 1);
});

test("integration: the intelligence report assembles for the Founder only and carries no buyer data", { skip }, async () => {
  const { intel, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  await lead();
  const f = { actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  const report = await intel.getIntelligence(repos, f);
  assert.ok(report.channels.length >= 1);
  assert.equal(typeof report.modelStatus, "string");
  await assert.rejects(intel.getIntelligence(repos, { actorType: "EMPLOYEE", actorId: "e" }), /Founder/);
  assert.doesNotMatch(JSON.stringify({ channels: report.channels, forecast: report.forecast, readiness: report.readiness }), /\+91|@|TEST p9/);
});
