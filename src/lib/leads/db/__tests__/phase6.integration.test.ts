import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** Phase 6 (marketing spend, bookings/commission, finance report) against the REAL PostgreSQL adapter and migration 0025, test database only. */
const skip = !hasTestDatabase;

async function modules() {
  const [service, finance, projects, leadPg, schema, client, phone, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../../finance-service.ts"),
    import("../../project-service.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("../../phone.ts"),
    import("drizzle-orm"),
  ]);
  return { service, finance, projects, leadPg, schema, db: client.getDb(), phone, sql: drizzle.sql };
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

async function developer() {
  const { schema, db } = await modules();
  const id = randomUUID();
  await db.insert(schema.developers).values({ id, displayName: "TEST — Phase6 Co", slug: `test-p6-${randomUUID()}`, city: "Thane", state: "Maharashtra", country: "India" });
  return id;
}

async function lead(touch: Record<string, string> = {}) {
  const { service, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const dev = await developer();
  const sessionId = `p6-${randomUUID()}`;
  const { lead: l } = await service.captureAssistanceLead(repos, { phone: await freshPhone(), name: "TEST p6", email: null, contactPreference: "PHONE_CALL", developer: { id: dev, slug: `s-${dev}`, displayName: "TEST — Phase6 Co" }, sourceCta: "developer_page", sessionId, currentTouch: { sessionId, landingPath: "/developers/x", ...touch } });
  return { lead: l, dev, repos };
}

test("integration: spend is never edited or deleted - the database refuses it - and a void is recorded once with who and why", { skip }, async () => {
  const { finance, db, sql, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const f = founder();
  const entry = await finance.recordSpend(repos, { channel: "META", spentOn: "2026-01-15", currency: "AED", amount: 1234, note: "it" }, f);
  await assert.rejects(db.execute(sql`UPDATE marketing_spend SET amount = 1 WHERE id = ${entry.id}`), refusal(/cannot be edited/));
  await assert.rejects(db.execute(sql`UPDATE marketing_spend SET currency = 'INR' WHERE id = ${entry.id}`), refusal(/cannot be edited/));
  await assert.rejects(db.execute(sql`DELETE FROM marketing_spend WHERE id = ${entry.id}`), refusal(/DELETE is not permitted/));
  await assert.rejects(db.execute(sql`INSERT INTO marketing_spend (id, channel, spent_on, currency, amount, created_by) VALUES (${randomUUID()}, 'META', '2026-01-01', 'INR', 0, 'x')`), refusal(/amount_ck|check/i));
  await assert.rejects(db.execute(sql`INSERT INTO marketing_spend (id, channel, spent_on, currency, amount, created_by) VALUES (${randomUUID()}, 'TIKTOK', '2026-01-01', 'INR', 5, 'x')`), refusal(/channel_ck|check/i));
  const voided = await finance.voidSpend(repos, entry.id, "entered twice", f);
  assert.deepEqual([voided.voidedBy, voided.voidReason, voided.amount], [f.actorId, "entered twice", 1234]);
  await assert.rejects(finance.voidSpend(repos, entry.id, "again", f), /already voided/);
  await assert.rejects(db.execute(sql`UPDATE marketing_spend SET void_reason = 'changed' WHERE id = ${entry.id}`), refusal(/voided entry cannot be changed|cannot be edited/));
});

test("integration: a booking links to a recorded project, moves the lead to BOOKED, and the commission flow drives outstanding", { skip }, async () => {
  const { service, projects, leadPg } = await modules();
  const f = founder();
  const { lead: l, dev, repos } = await lead();
  const project = await projects.createProject(repos, { developerId: dev, name: `P6 ${randomUUID().slice(0, 6)}`, city: "Thane" }, f);
  const booking = await service.createBooking(repos, l.id, { currency: "INR", bookingValue: 8_000_000, commissionExpected: 160_000, projectId: project.id }, f);
  assert.equal(booking.projectId, project.id);
  assert.equal((await repos.leads.getById(l.id))?.status, "BOOKED");
  assert.ok((await repos.bookings.listOutstanding(5000)).some((b) => b.id === booking.id));
  await service.updateBooking(repos, booking.id, { commissionReceived: 160_000, commissionReceivedAt: new Date() }, f);
  assert.ok(!(await repos.bookings.listOutstanding(5000)).some((b) => b.id === booking.id));
  void leadPg;
});

test("integration: the finance report SQL combines leads, spend and bookings per currency, ignores voided spend, and carries no personal data", { skip }, async () => {
  const { service, finance, leadPg } = await modules();
  const repos = leadPg.createPostgresLeadRepositories();
  const f = founder();
  const { lead: l } = await lead({ gclid: `g-${randomUUID().slice(0, 6)}` });
  await service.changeLeadStatus(repos, l.id, "QUALIFIED", f, {});
  const b = await service.createBooking(repos, l.id, { currency: "INR", bookingValue: 5_000_000, commissionExpected: 100_000 }, f);
  await service.updateBooking(repos, b.id, { commissionReceived: 60_000, commissionReceivedAt: new Date() }, f);
  const today = finance.businessDate(new Date());
  const kept = await finance.recordSpend(repos, { channel: "GOOGLE_ADS", spentOn: today, currency: "INR", amount: 40_000 }, f);
  const wrong = await finance.recordSpend(repos, { channel: "GOOGLE_ADS", spentOn: today, currency: "INR", amount: 777_777 }, f);
  await finance.voidSpend(repos, wrong.id, "typo", f);
  const view = await finance.getFinanceView(repos, f, { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000) });
  const google = view.report.byChannel.find((g) => g.key === "GOOGLE_ADS")!.money.INR!;
  assert.ok(google.spend >= kept.amount, "includes the kept entry");
  assert.ok(google.spend < 777_777, "the voided entry is ignored");
  assert.ok(google.commissionReceived >= 60_000 && google.bookings >= 1);
  assert.ok((view.outstandingTotals.INR ?? 0) >= 40_000, "100,000 expected minus 60,000 received is outstanding");
  assert.doesNotMatch(JSON.stringify(view.report), /\+91|@/);
});
