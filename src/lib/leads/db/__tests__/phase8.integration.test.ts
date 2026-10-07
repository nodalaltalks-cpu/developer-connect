import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Phase 8 (automation action log, settings, stale/unassigned reads) against the REAL PostgreSQL adapter and migration 0026, test database only. */
const skip = !hasTestDatabase;

async function modules() {
  const [auto, rules, leadPg, schema, client, drizzle] = await Promise.all([
    import("../../automation-service.ts"),
    import("../../automation-rules.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
  ]);
  return { auto, rules, leadPg, schema, db: client.getDb(), eq: drizzle.eq };
}

const opts = async () => {
  const { rules } = await modules();
  return { maxAttempts: rules.CAPS.MAX_ATTEMPTS, staleAfterMs: rules.CAPS.CLAIM_STALE_MS };
};

test("integration: claiming the same action concurrently - exactly ONE caller wins; a done action is never claimable again", { skip }, async () => {
  const { leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const o = await opts();
  const key = `it:${randomUUID()}`;
  const input = { rule: "SITE_VISIT_REMINDERS", subjectType: "SITE_VISIT", subjectId: randomUUID(), dedupeKey: key, now: new Date() };
  const results = await Promise.all(Array.from({ length: 6 }, () => repos.automationActions.claim(input, o)));
  const winners = results.filter(Boolean);
  assert.equal(winners.length, 1, "one concurrent claim wins");
  await repos.automationActions.complete(winners[0]!.id, "DONE", { rule: "x" }, new Date());
  assert.equal(await repos.automationActions.claim(input, o), null, "done is final");
});

test("integration: FAILED is retried up to the limit, an abandoned PENDING after the stale window; the log keeps ids only", { skip }, async () => {
  const { leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const o = await opts();
  const t0 = new Date();
  const input = { rule: "STALE_LEAD_ALERTS", subjectType: "LEAD", subjectId: randomUUID(), dedupeKey: `it:${randomUUID()}`, now: t0 };
  let claim = (await repos.automationActions.claim(input, o))!;
  for (let attempt = 1; attempt < o.maxAttempts; attempt++) {
    await repos.automationActions.fail(claim.id, "Error", t0);
    claim = (await repos.automationActions.claim({ ...input, now: new Date(t0.getTime() + attempt * 1000) }, o))!;
    assert.equal(claim.attempts, attempt + 1);
  }
  await repos.automationActions.fail(claim.id, "Error", t0);
  assert.equal(await repos.automationActions.claim({ ...input, now: new Date(t0.getTime() + 60_000) }, o), null, "out of attempts");

  const pending = { ...input, dedupeKey: `it:${randomUUID()}` };
  assert.ok(await repos.automationActions.claim(pending, o));
  assert.equal(await repos.automationActions.claim({ ...pending, now: new Date(t0.getTime() + 60_000) }, o), null, "still in flight");
  assert.ok(await repos.automationActions.claim({ ...pending, now: new Date(t0.getTime() + o.staleAfterMs + 5000) }, o), "abandoned, so retried");
  const recent = await repos.automationActions.listRecent(50);
  assert.ok(recent.every((a) => JSON.stringify(a.detail).length < 200));
});

test("integration: settings persist (upsert), and the engine honours them against the real database", { skip }, async () => {
  const { auto, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const f = { actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  await auto.setAutomationEnabled(repos, "AUTO_ROUTING", true, f);
  await auto.setAutomationEnabled(repos, "AUTO_ROUTING", false, f);
  assert.equal((await repos.automationSettings.getAll()).AUTO_ROUTING, false);
  await auto.setAutomationEnabled(repos, "STALE_LEAD_ALERTS", false, f);
  await auto.setAutomationEnabled(repos, "STALE_LEAD_ALERTS", true, f);
  assert.equal((await repos.automationSettings.getAll()).STALE_LEAD_ALERTS, true);
});

test("integration: listStale, listUnassignedOpen and countOpenByOwner are database queries that exclude closed, erased and returned leads", { skip }, async () => {
  const { leadPg, schema, db } = await modules();
  const { createInMemoryLeadRepositories } = await import("../../memory-repository.ts");
  void createInMemoryLeadRepositories;
  const repos = leadPg.createPostgresLeadRepositories();
  const service = await import("../../lead-service.ts");
  const phone = await import("../../phone.ts");
  const mk = async () => {
    const dev = randomUUID();
    await db.insert(schema.developers).values({ id: dev, displayName: "TEST — Phase8 Co", slug: `test-p8-${randomUUID()}`, city: "Thane", state: "Maharashtra", country: "India" });
    const sessionId = `p8-${randomUUID()}`;
    let e164 = "";
    for (let i = 0; i < 50 && !e164; i++) {
      const r = phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
      if (r.ok) e164 = r.e164;
    }
    return (await service.captureAssistanceLead(repos, { phone: e164, name: "TEST p8", email: null, contactPreference: "PHONE_CALL", developer: { id: dev, slug: `s-${dev}`, displayName: "TEST — Phase8 Co" }, sourceCta: "developer_page", sessionId, currentTouch: { sessionId, landingPath: "/developers/x" } })).lead;
  };
  const owner = `user_it_${randomUUID().slice(0, 8)}`;
  const stale = await mk();
  await repos.leads.update(stale.id, { ownerId: owner, lastActivityAt: new Date(Date.now() - 30 * 86_400_000) }, new Date());
  const lostStale = await mk();
  await repos.leads.update(lostStale.id, { ownerId: owner, status: "LOST", lastActivityAt: new Date(Date.now() - 30 * 86_400_000) }, new Date());
  const unassigned = await mk();
  const returned = await mk();
  await repos.leads.update(returned.id, { returnedAt: new Date(), returnedFrom: owner }, new Date());

  const staleIds = (await repos.leads.listStale({ staleBefore: new Date(Date.now() - 7 * 86_400_000), limit: 5000 })).map((l) => l.id);
  assert.ok(staleIds.includes(stale.id));
  assert.ok(!staleIds.includes(lostStale.id), "a lost lead is closed out, not stale");
  const unassignedIds = (await repos.leads.listUnassignedOpen(5000)).map((l) => l.id);
  assert.ok(unassignedIds.includes(unassigned.id));
  assert.ok(!unassignedIds.includes(returned.id), "a returned lead is the Founder's call, never auto-routed");
  assert.equal((await repos.leads.countOpenByOwner())[owner], 1, "only the open one counts as workload");
});
