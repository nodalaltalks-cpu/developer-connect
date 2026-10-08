import { test } from "node:test";
import assert from "node:assert/strict";
import { captureAssistanceLead, changeLeadStatus, logContact, setFollowUp, getTodayQueue } from "../lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { BUYER, FOUNDER, captureInput, hoursFrom, T0 } from "./test-helpers.ts";

/**
 * Regression for the Today-queue candidate pool. The pool used to be "the N most recently active open leads", so a lead
 * whose follow-up is overdue (old activity by definition) fell out of the queue once there were more than N open leads.
 */

let phoneCounter = 0;
const phone = () => `+9198${String(10_000_000 + ++phoneCounter)}`;

test("queue candidates: an overdue follow-up on a lead with OLD activity is still a candidate when newer leads exceed the pool size", async () => {
  const repos = createInMemoryLeadRepositories();
  const old = await captureAssistanceLead(repos, captureInput({ phone: phone() }), hoursFrom(T0, -120));
  await changeLeadStatus(repos, old.lead.id, "CONTACTED", FOUNDER, {}, hoursFrom(T0, -119));
  await logContact(repos, old.lead.id, { channel: "WHATSAPP", outcome: "CONNECTED" }, FOUNDER, hoursFrom(T0, -118));
  await setFollowUp(repos, old.lead.id, hoursFrom(T0, -3), FOUNDER, hoursFrom(T0, -117));

  // Many newer leads that are all more recently active than the old one.
  for (let i = 0; i < 12; i++) await captureAssistanceLead(repos, captureInput({ phone: phone() }), hoursFrom(T0, -10 + i * 0.1));

  const pool = await repos.leads.listForQueue(5);
  assert.ok(pool.some((lead) => lead.id === old.lead.id), "the overdue lead is in the pool");
  assert.equal(new Set(pool.map((lead) => lead.id)).size, pool.length, "no duplicates when a lead is both recent and has a follow-up");

  const queue = await getTodayQueue(repos, T0, 50);
  assert.equal(queue.find((entry) => entry.leadId === old.lead.id)?.bucket, "OVERDUE_FOLLOW_UP");
});

test("queue candidates: finished leads are never candidates, even with a follow-up date", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ phone: phone() }), hoursFrom(T0, -50));
  await setFollowUp(repos, lead.id, hoursFrom(T0, -3), FOUNDER, hoursFrom(T0, -49));
  await changeLeadStatus(repos, lead.id, "BOOKED", FOUNDER, {}, hoursFrom(T0, -48));
  assert.equal((await repos.leads.listForQueue(5)).some((l) => l.id === lead.id), false);
  void BUYER;
});
