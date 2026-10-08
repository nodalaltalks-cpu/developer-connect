import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** The retention SQL against the REAL database: counts the right sessions, as deltas, so existing data does not matter. */
const skip = !hasTestDatabase;

test("integration: returning visitors, repeat researchers and advisor reach are counted from real events", { skip }, async () => {
  const [{ getRetentionReport }, client, schema] = await Promise.all([import("../../report.ts"), import("../../../developer-connect/db/client.ts"), import("../../../developer-connect/db/schema.ts")]);
  const db = client.getDb();
  const from = new Date(Date.now() - 3 * 86_400_000);
  const to = new Date(Date.now() + 3_600_000);
  const before = await getRetentionReport(db, { from, to });

  const day = (n: number) => new Date(Date.now() - n * 86_400_000);
  const event = (sessionId: string, eventName: "page_viewed" | "developer_page_viewed" | "cta_clicked" | "lead_submitted", at: Date, payload: Record<string, unknown> = {}) => ({ id: randomUUID(), eventName, occurredAt: at, sessionId, payload });
  const once = `it-${randomUUID()}`;
  const twice = `it-${randomUUID()}`;
  const advisor = `it-${randomUUID()}`;
  await db.insert(schema.analyticsEvents).values([
    event(once, "page_viewed", day(0)),
    // A returning researcher: two different days, developer pages on both, then pressed WhatsApp.
    event(twice, "page_viewed", day(2)),
    event(twice, "developer_page_viewed", day(2)),
    event(twice, "page_viewed", day(0)),
    event(twice, "developer_page_viewed", day(0)),
    event(twice, "cta_clicked", day(0), { ctaId: "advisor_whatsapp" }),
    // A first-time visitor who only OPENED the choices: not "reached an advisor".
    event(advisor, "page_viewed", day(0)),
    event(advisor, "cta_clicked", day(0), { ctaId: "advisor_open" }),
  ]);

  const after = await getRetentionReport(db, { from, to });
  assert.equal(after.visitors - before.visitors, 3);
  assert.equal(after.returningVisitors - before.returningVisitors, 1);
  assert.equal(after.repeatResearchers - before.repeatResearchers, 1);
  assert.equal(after.reachedAdvisor.returning - before.reachedAdvisor.returning, 1);
  assert.equal(after.reachedAdvisor.firstVisit - before.reachedAdvisor.firstVisit, 0, "opening the choices is not reaching an advisor");
  assert.equal(after.advisorChannels.whatsapp - before.advisorChannels.whatsapp, 1);
  assert.equal(after.advisorChannels.opened - before.advisorChannels.opened, 1);
  assert.ok(after.profiles.total >= 0);
});
