import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Lead } from "../../types.ts";

/** The calling queue's skip / attempted / callback states against the REAL PostgreSQL adapter (test database only, migration 0032). */
const skip = !hasTestDatabase;

const mobile = () => "+919" + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");

test("integration: skip is stored, 'attempted' counts as called, measured calls classify, and the database refuses a half-recorded skip", { skip }, async () => {
  const [leadPg, svc, batches, calls, followUps, client, drizzle] = await Promise.all([
    import("../postgres-repository.ts"),
    import("../../lead-import-service.ts"),
    import("../../calling-batch-service.ts"),
    import("../../call-service.ts"),
    import("../../follow-up-service.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
  ]);
  const db = client.getDb();
  const repos = leadPg.createPostgresLeadRepositories();
  const employee = { actorType: "EMPLOYEE" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  const other = { actorType: "EMPLOYEE" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };

  const leads: Lead[] = [];
  for (let i = 0; i < 4; i++) {
    const made = await svc.createSelfGeneratedLead(repos, { phone: mobile(), name: `TEST queue ${i}`, creationMethod: "COLD_CALLING" }, employee);
    assert.ok(made.created);
    leads.push(made.lead);
  }
  const batch = await repos.callingBatches.create({ name: `TEST batch ${randomUUID().slice(0, 6)}`, createdBy: "founder_it", assignedTo: employee.actorId, importBatchId: null, leadIds: leads.map((l) => l.id), now: new Date() });

  await batches.skipQueueLead(repos, employee, batch.id, leads[0].id);
  await assert.rejects(batches.skipQueueLead(repos, other, batch.id, leads[0].id), (e: Error) => e.name !== "AssertionError", "another employee cannot skip in this batch");

  const report = async (leadId: string, unavailable: boolean) => {
    const prepared = await calls.prepareDeviceCall(repos, leadId, employee, { batchId: batch.id });
    const started = new Date();
    await calls.reportDeviceCall(repos, prepared.call.id, unavailable ? { startedAt: started, durationUnavailable: true } : { startedAt: started, durationSeconds: 0, simRef: "1", callLogRef: "1", deviceRef: "Pixel" }, employee, new Date(started.getTime() + 40_000));
  };
  await report(leads[1].id, true); // attempted, length unavailable
  // A measured connected call needs a start in the past: dial it 60s ago and report 31s.
  const prepared = await calls.prepareDeviceCall(repos, leads[2].id, employee, { batchId: batch.id });
  await calls.reportDeviceCall(repos, prepared.call.id, { startedAt: new Date(Date.now() - 1000), durationSeconds: 0, simRef: "1", callLogRef: "2", deviceRef: "Pixel" }, employee, new Date(Date.now() + 100));
  await followUps.scheduleFollowUp(repos, leads[2].id, { scheduledAt: new Date(Date.now() + 86_400_000), type: "CALL_BACK" }, employee);

  const queue = (await batches.getCallingQueue(repos, employee, batch.id))!;
  const state = (i: number) => queue.rows.find((r) => r.progress.lead.id === leads[i].id)!.state;
  assert.equal(state(0), "SKIPPED");
  assert.equal(state(1), "ATTEMPTED");
  assert.equal(state(2), "DIALED", "a measured 0-second call is classified Dialed");
  assert.equal(state(3), "PENDING");
  assert.deepEqual([queue.counts.assigned, queue.counts.completed, queue.counts.attempted, queue.counts.notConnected, queue.counts.skipped, queue.counts.callback, queue.counts.pending], [4, 2, 1, 1, 1, 1, 1]);
  assert.equal(queue.next!.progress.lead.id, leads[3].id, "the untouched lead is next, before the skipped one");

  // The database refuses a half-recorded skip (skipped_at without skipped_by).
  await assert.rejects(
    db.execute(drizzle.sql`update calling_batch_items set skipped_at = now(), skipped_by = null where batch_id = ${batch.id} and lead_id = ${leads[3].id}`),
    (error: unknown) => /skip_pair_ck|check constraint/i.test(String((error as Error).message) + String((error as { cause?: Error }).cause?.message ?? "")),
  );
});
