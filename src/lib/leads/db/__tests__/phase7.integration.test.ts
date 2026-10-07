import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Phase 7 (Command Centre reads) against the REAL PostgreSQL adapter, test database only. */
const skip = !hasTestDatabase;

async function modules() {
  const [service, cc, calls, leadPg, schema, client, phone, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../command-centre-service.ts"),
    import("../../call-analytics.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, cc, calls, leadPg, schema, db: client.getDb(), phone, eq: drizzle.eq };
}

async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let i = 0; i < 50; i++) {
    const r = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (r.ok) return r.e164;
  }
  throw new Error("no phone");
}

async function lead() {
  const { service, leadPg, schema, db } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const dev = randomUUID();
  await db.insert(schema.developers).values({ id: dev, displayName: "TEST — Phase7 Co", slug: `test-p7-${randomUUID()}`, city: "Thane", state: "Maharashtra", country: "India" });
  const sessionId = `p7-${randomUUID()}`;
  const { lead: l } = await service.captureAssistanceLead(repos, { phone: await freshPhone(), name: "TEST p7", email: null, contactPreference: "PHONE_CALL", developer: { id: dev, slug: `s-${dev}`, displayName: "TEST — Phase7 Co" }, sourceCta: "developer_page", sessionId, currentTouch: { sessionId, landingPath: "/developers/x" } });
  return { lead: l, repos };
}

test("integration: statusCounts and exceptionCounts are counted in the database - unassigned (and how many are old), stale owned leads, closed-out leads excluded", { skip }, async () => {
  const { leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const before = await repos.leads.exceptionCounts({ unassignedOlderThan: new Date(Date.now() - 86_400_000), staleBefore: new Date(Date.now() - 7 * 86_400_000) });
  const statusBefore = await repos.leads.statusCounts();

  const fresh = (await lead()).lead; // unassigned, new
  const owned = (await lead()).lead;
  await repos.leads.update(owned.id, { ownerId: `user_it_${randomUUID().slice(0, 8)}`, lastActivityAt: new Date(Date.now() - 10 * 86_400_000) }, new Date());
  const booked = (await lead()).lead;
  await repos.leads.update(booked.id, { status: "BOOKED" }, new Date());

  const after = await repos.leads.exceptionCounts({ unassignedOlderThan: new Date(Date.now() - 86_400_000), staleBefore: new Date(Date.now() - 7 * 86_400_000) });
  assert.equal(after.unassignedOpen - before.unassignedOpen, 1, "only the fresh unassigned lead counts; the booked one is closed out");
  assert.equal(after.unassignedOld - before.unassignedOld, 0, "it is brand new, so not yet overdue for assignment");
  assert.equal(after.staleOpen - before.staleOpen, 1, "the owned lead quiet for 10 days");
  const statusAfter = await repos.leads.statusCounts();
  assert.equal((statusAfter.BOOKED ?? 0) - (statusBefore.BOOKED ?? 0), 1);
  assert.equal((statusAfter.NEW ?? 0) - (statusBefore.NEW ?? 0), 2);
  void fresh;
});

test("integration: the Command Centre assembles from real data for the Founder only, and carries no buyer data", { skip }, async () => {
  const { cc, calls, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const { createPostgresStaffRepository } = await import("../../../staff/db/postgres-repository.ts");
  const staff = createPostgresStaffRepository();
  const f = { actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 12)}` };
  await lead();
  const now = new Date();
  const filters = calls.parseInsightFilters({ range: "last7" }, now);
  const view = await cc.getCommandCentre(repos, staff, f, filters, now);
  assert.ok(view.overview.leads >= 1);
  assert.equal(view.sales.pipeline.length, 9);
  assert.ok(view.sales.pipeline.reduce((n, s) => n + s.count, 0) >= 1);
  await assert.rejects(cc.getCommandCentre(repos, staff, { actorType: "EMPLOYEE", actorId: "e" }, filters, now), /Founder/);
  assert.doesNotMatch(JSON.stringify(view), /\+91\d{8,}|@[a-z]+\.[a-z]+|TEST p7/);
});
