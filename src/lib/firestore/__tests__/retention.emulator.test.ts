import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test("firestore retention: visitors, returning (two days or visited before), repeat researchers, advisor reach, repeat enquiries", { skip }, async () => {
  const { recordAnalyticsEvent } = await import("../analytics-events.ts");
  const { getRetentionReportFirestore } = await import("../../retention/firestore/report.ts");
  const { getFirestoreDb } = await import("../client.ts");

  const tag = randomUUID().slice(0, 6);
  const DAY = 86_400_000;
  // A quiet window far from any other test's data: the report is computed for exactly this range.
  const from = new Date(Date.UTC(1900 + Math.floor(Math.random() * 90), 0, 10, 0, 0, 0)); // a window nothing else ever writes to
  const to = new Date(from.getTime() + 5 * DAY);
  const at = (days: number, hours = 12) => new Date(from.getTime() + days * DAY + hours * 3_600_000);

  const ev = (eventName: string, sessionId: string, when: Date, extra: Record<string, unknown> = {}) =>
    recordAnalyticsEvent({ eventName, occurredAt: when, sessionId, anonymousUserId: undefined, userId: undefined, ...extra } as never);

  const a = `a-${tag}`; // two different days -> returning; researched developers twice; reached the advisor on WhatsApp
  await ev("page_viewed", a, at(0));
  await ev("page_viewed", a, at(2));
  await ev("developer_page_viewed", a, at(0));
  await ev("developer_page_viewed", a, at(1));
  await ev("cta_clicked", a, at(2), { ctaId: "advisor_whatsapp" });

  const b = `b-${tag}`; // one day only, but visited before the period -> returning; submitted the form
  await ev("page_viewed", b, new Date(from.getTime() - 3 * DAY));
  await ev("page_viewed", b, at(1));
  await ev("lead_submitted", b, at(1));

  const c = `c-${tag}`; // one day, never before -> a first visit; opened the advisor choices only
  await ev("page_viewed", c, at(3));
  await ev("cta_clicked", c, at(3), { ctaId: "advisor_open" });

  const lead = randomUUID();
  const db = getFirestoreDb();
  for (const h of [1, 2]) await db.collection("leadEvents").doc(randomUUID()).create({ leadId: lead, eventType: "DEVELOPER_CONNECT_REQUESTED", createdAt: at(1, h) });
  await db.collection("profiles").doc(`p-${tag}`).set({ data: {}, updatedAt: at(0) });

  const r = await getRetentionReportFirestore({ from, to });
  assert.equal(r.visitors, 3);
  assert.equal(r.returningVisitors, 2);
  assert.equal(r.repeatResearchers, 1);
  assert.deepEqual(r.reachedAdvisor, { returning: 1, firstVisit: 0 });
  assert.deepEqual(r.submittedRequest, { returning: 1, firstVisit: 0 });
  assert.deepEqual(r.advisorChannels, { whatsapp: 1, email: 0, call: 0, opened: 1 });
  assert.equal(r.repeatEnquiries, 1);
  assert.ok(r.profiles.total >= 1 && r.profiles.empty >= 1);
});
