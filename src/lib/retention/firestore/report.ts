import { getFirestoreDb } from "../../firestore/client.ts";
import { readEvents } from "../../firestore/analytics-events.ts";
import { mapLimit } from "../../leads/firestore/base.ts";
import { bandProfiles, type RetentionReport } from "../report.ts";

/**
 * Firestore version of the retention report. Same definitions as the SQL (see report.ts); the grouping the SQL did with
 * GROUP BY is done here over the events of the range, read once.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ADVISOR_CTAS = new Set(["advisor_whatsapp", "advisor_email", "advisor_call"]);

/** The Indian calendar day of an instant, as "YYYY-MM-DD" (India has no daylight saving). */
const istDay = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

export async function getRetentionReportFirestore(range: { from: Date; to: Date }): Promise<RetentionReport> {
  const { from, to } = range;
  const db = getFirestoreDb();
  const events = await readEvents({ from, to });

  type Session = { visitDays: Set<string>; developerDays: Set<string>; submitted: boolean; reachedAdvisor: boolean };
  const sessions = new Map<string, Session>();
  const channels = { whatsapp: 0, email: 0, call: 0, opened: 0 };
  for (const e of events) {
    const s = sessions.get(e.sessionId) ?? { visitDays: new Set<string>(), developerDays: new Set<string>(), submitted: false, reachedAdvisor: false };
    sessions.set(e.sessionId, s);
    if (e.eventName === "page_viewed") s.visitDays.add(istDay(e.occurredAt));
    if (e.eventName === "developer_page_viewed") s.developerDays.add(istDay(e.occurredAt));
    if (e.eventName === "lead_submitted") s.submitted = true;
    if (e.eventName === "cta_clicked") {
      const cta = e.payload.ctaId;
      if (typeof cta === "string" && ADVISOR_CTAS.has(cta)) s.reachedAdvisor = true;
      if (cta === "advisor_whatsapp") channels.whatsapp += 1;
      if (cta === "advisor_email") channels.email += 1;
      if (cta === "advisor_call") channels.call += 1;
      if (cta === "advisor_open") channels.opened += 1;
    }
  }

  // A visitor who showed up on only one day in the period is "returning" if they had visited before the period began.
  const visitors = [...sessions.entries()].filter(([, s]) => s.visitDays.size >= 1);
  const needsLookup = visitors.filter(([, s]) => s.visitDays.size < 2);
  const visitedBefore = new Set<string>();
  await mapLimit(needsLookup, 25, async ([sessionId]) => {
    const snap = await db.collection("analyticsEvents").where("sessionId", "==", sessionId).where("eventName", "==", "page_viewed").where("occurredAt", "<", from).limit(1).get();
    if (!snap.empty) visitedBefore.add(sessionId);
  });

  let returning = 0;
  let repeatResearchers = 0;
  const advisor = { returning: 0, firstVisit: 0 };
  const submitted = { returning: 0, firstVisit: 0 };
  for (const [sessionId, s] of visitors) {
    const isReturning = s.visitDays.size >= 2 || visitedBefore.has(sessionId);
    if (isReturning) returning += 1;
    if (s.developerDays.size >= 2) repeatResearchers += 1;
    if (s.reachedAdvisor) advisor[isReturning ? "returning" : "firstVisit"] += 1;
    if (s.submitted) submitted[isReturning ? "returning" : "firstVisit"] += 1;
  }

  const connects = await db.collection("leadEvents").where("eventType", "==", "DEVELOPER_CONNECT_REQUESTED").where("createdAt", ">=", from).where("createdAt", "<", to).select("leadId").get();
  const perLead = new Map<string, number>();
  for (const d of connects.docs) perLead.set(d.data().leadId, (perLead.get(d.data().leadId) ?? 0) + 1);

  const profileDocs = await db.collection("profiles").orderBy("updatedAt", "desc").limit(10_000).select("data").get();

  return {
    visitors: visitors.length,
    returningVisitors: returning,
    repeatResearchers,
    reachedAdvisor: advisor,
    submittedRequest: submitted,
    advisorChannels: channels,
    repeatEnquiries: [...perLead.values()].filter((n) => n >= 2).length,
    profiles: bandProfiles(profileDocs.docs.map((d) => ({ data: (d.data().data ?? {}) as Record<string, unknown> }))),
  };
}
