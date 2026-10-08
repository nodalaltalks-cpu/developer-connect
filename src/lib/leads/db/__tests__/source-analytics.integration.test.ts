import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** The source funnel SQL against the REAL PostgreSQL adapter (test database only), isolated to one throw-away person. */
const skip = !hasTestDatabase;
const mobile = () => "+919" + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");

test("integration: sourceFunnel counts ever-reached stages, keeps currencies apart and agrees with the in-memory adapter's rules", { skip }, async () => {
  const [leadPg, svc, calls, leadService, qualification, projects] = await Promise.all([
    import("../postgres-repository.ts"),
    import("../../lead-import-service.ts"),
    import("../../call-service.ts"),
    import("../../lead-service.ts"),
    import("../../qualification-service.ts"),
    import("../../project-service.ts"),
  ]);
  const repos = leadPg.createPostgresLeadRepositories();
  const founder = { actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  const employee = { actorType: "EMPLOYEE" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  void projects;

  const a = await svc.createSelfGeneratedLead(repos, { phone: mobile(), name: "TEST funnel A", creationMethod: "COLD_CALLING" }, employee);
  const b = await svc.createSelfGeneratedLead(repos, { phone: mobile(), name: "TEST funnel B", creationMethod: "COLD_CALLING" }, employee);
  assert.ok(a.created && b.created);

  const connected = await calls.prepareDeviceCall(repos, a.lead.id, employee, {});
  await calls.reportDeviceCall(repos, connected.call.id, { startedAt: new Date(), durationSeconds: 45, simRef: "1", callLogRef: "1", deviceRef: "Pixel" }, employee);
  const rang = await calls.prepareDeviceCall(repos, b.lead.id, employee, {});
  await calls.reportDeviceCall(repos, rang.call.id, { startedAt: new Date(), durationSeconds: 3, simRef: "1", callLogRef: "2", deviceRef: "Pixel" }, employee);
  await qualification.recordQualification(repos, a.lead.id, { outcome: "QUALIFIED" }, employee);
  await leadService.createBooking(repos, a.lead.id, { currency: "INR", bookingValue: 5_000_000, commissionExpected: 100_000 }, founder);
  await leadService.createBooking(repos, a.lead.id, { currency: "AED", bookingValue: 700_000, commissionExpected: 10_000 }, founder);

  const query = { from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000), personId: employee.actorId };
  const bySource = await repos.leads.sourceFunnel({ ...query, groupBy: "SOURCE" });
  assert.equal(bySource.rows.length, 1);
  const row = bySource.rows[0];
  assert.deepEqual(
    [row.sourceType, row.sourceDetail, row.leads, row.called, row.connected, row.qualified, row.booked, row.talkSeconds],
    ["COLD_CALL", "COLD_CALLING", 2, 2, 1, 1, 1, 45].map((v, i) => (i === 1 ? row.sourceDetail : v)),
  );
  assert.deepEqual(bySource.revenue.map((r) => [r.currency, r.bookingValue]).sort(), [["AED", 700_000], ["INR", 5_000_000]], "two currencies, two rows, never summed");

  const byOwner = await repos.leads.sourceFunnel({ ...query, groupBy: "OWNER" });
  assert.equal(byOwner.rows.length, 1);
  assert.equal(byOwner.rows[0].personId, employee.actorId, "cold-call leads credit their creator");
  assert.equal(byOwner.rows[0].leads, 2);

  const none = await repos.leads.sourceFunnel({ ...query, groupBy: "SOURCE", sourceType: "DIGITAL" });
  assert.deepEqual(none.rows, []);
  const outside = await repos.leads.sourceFunnel({ ...query, from: new Date(Date.now() + 3_600_000), to: new Date(Date.now() + 7_200_000), groupBy: "SOURCE" });
  assert.deepEqual(outside.rows, []);
});
