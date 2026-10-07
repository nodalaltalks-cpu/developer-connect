import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CallButton } from "../leads/call-button.tsx";
import { CallHistoryCard } from "../leads/call-history.tsx";
import { CallMetricTiles, EmployeeTable, HourlyChart, PeriodTable } from "../leads/call-metrics.tsx";
import { LeadCard } from "../admin/leads/lead-card.tsx";
import { LeadImportForm } from "../admin/leads/lead-import-form.tsx";
import { toMetrics, type EmployeeInsightRow } from "../../lib/leads/call-analytics.ts";
import type { CallView } from "../../lib/leads/call-view.ts";
import type { LeadListItem } from "../../lib/leads/lead-reads.ts";
import type { Lead } from "../../lib/leads/types.ts";

/**
 * The dialer's screens (pure rendering of their initial state). They show only what the server computed from real call
 * records; with no provider they say so plainly and never pretend a call is being tracked.
 */

const noopPlace = async () => ({ ok: true as const, callId: "c1" });
const noopStatus = async () => null;
const noopDisposition = async () => ({ ok: true as const });
const TEL = "tel:+919876543210";

test("call button, dialer NOT connected: a plain Call link and an honest 'not tracked' note — it never pretends to be a dialer", () => {
  const html = renderToStaticMarkup(<CallButton configured={false} telHref={TEL} onPlace={noopPlace} onStatus={noopStatus} onDisposition={noopDisposition} />);
  assert.match(html, /href="tel:\+919876543210"[^>]*>Call</);
  assert.match(html, /Not tracked/);
  assert.match(html, /won&#x27;t be counted|won't be counted/);
  assert.doesNotMatch(html, /<button/, "nothing here places a tracked call");
  assert.match(html, /min-h-11/);
});

test("call button, compact (list cards): the same link without the caption, but the explanation stays available on hover/assistive tech", () => {
  const html = renderToStaticMarkup(<CallButton compact configured={false} telHref={TEL} onPlace={noopPlace} onStatus={noopStatus} onDisposition={noopDisposition} />);
  assert.doesNotMatch(html, /<p /);
  assert.match(html, /title="Not tracked/);
});

test("call button, no phone number: nothing is rendered", () => {
  assert.equal(renderToStaticMarkup(<CallButton configured={false} telHref={null} onPlace={noopPlace} onStatus={noopStatus} onDisposition={noopDisposition} />), "");
});

test("call button, dialer connected: a real button that places the call through the server, with no outcome or status shown until a call exists", () => {
  const html = renderToStaticMarkup(<CallButton configured telHref={TEL} onPlace={noopPlace} onStatus={noopStatus} onDisposition={noopDisposition} />);
  assert.match(html, /<button[^>]*>Call<\/button>/);
  assert.doesNotMatch(html, /Not tracked/);
  assert.doesNotMatch(html, /What did the call lead to/);
  assert.doesNotMatch(html, /Connected|Ringing|Call ended/, "no invented state");
});

const calls: CallView[] = [
  { id: "c1", status: "NO_ANSWER", initiatedAt: "2026-10-10T04:32:00.000Z", answeredAt: null, endedAt: "2026-10-10T04:32:30.000Z", durationSeconds: null, classification: "DIALED", method: "PROVIDER", disposition: "SWITCHED_OFF", staffUserId: "u1" },
  { id: "c2", status: "COMPLETED", initiatedAt: "2026-10-10T04:48:00.000Z", answeredAt: "2026-10-10T04:48:05.000Z", endedAt: "2026-10-10T04:51:00.000Z", durationSeconds: 222, classification: "CONNECTED", method: "PROVIDER", disposition: "FOLLOW_UP_REQUIRED", staffUserId: "u1" },
  { id: "c3", status: "BUSY", initiatedAt: "2026-10-10T10:15:00.000Z", answeredAt: null, endedAt: null, durationSeconds: null, classification: "DIALED", method: "PROVIDER", disposition: null, staffUserId: "u2" },
];

test("call history: attempts, connected count, talk time, the last call and its outcome — and every call in order with who, when, status, duration", () => {
  const html = renderToStaticMarkup(<CallHistoryCard calls={[calls[2], calls[0], calls[1]]} names={{ u1: "Rahul", u2: "Amit" }} />);
  assert.match(html, /3 attempts · 1 connected · 03:42 talk time/);
  assert.match(html, /Last call 10 Oct 2026, 03:45 PM — Busy/);
  const list = html.indexOf("<ol");
  const order = ["10 Oct 2026, 10:02 AM", "10 Oct 2026, 10:18 AM", "10 Oct 2026, 03:45 PM"].map((t) => html.indexOf(t, list));
  assert.ok(order.every((i) => i > -1));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "chronological, oldest first");
  assert.match(html, /Connected · 03:42 · Follow up required/);
  assert.match(html, /No answer · Switched off/);
  assert.match(html, /Rahul/);
  assert.match(html, /Amit/);
});

test("call history: with none, it says only dialer calls appear here", () => {
  const html = renderToStaticMarkup(<CallHistoryCard calls={[]} />);
  assert.match(html, /No tracked calls yet/);
  assert.match(html, /internal dialer/);
});

test("metric tiles: today's numbers as the Founder asked — attempted, connected with the rate, no answer, busy, failed, talk time, average, follow-ups", () => {
  const html = renderToStaticMarkup(
    <CallMetricTiles metrics={toMetrics({ key: "k", dialed: 47, connected: 21, noAnswer: 19, busy: 4, failed: 3, rejected: 0, talkSeconds: 4200, leadsCalled: 40 })} followUps={{ created: 6, completed: 4, missed: 1 }} />,
  );
  for (const expected of ["Calls attempted", "47", "21 of 47 · 45%", "No answer", "19", "Busy", "Failed", "Talk time", "1h 10m", "Avg connected call", "03:20", "Follow-ups created", "Follow-ups completed", "Missed follow-ups"]) {
    assert.ok(html.includes(expected), expected);
  }
});

test("metric tiles: with nothing dialed there is no invented percentage", () => {
  const html = renderToStaticMarkup(<CallMetricTiles metrics={toMetrics(undefined)} />);
  assert.match(html, /Nothing dialed yet/);
  assert.doesNotMatch(html, /0%|NaN|Infinity/);
});

test("hourly chart: dialed AND connected on the same bar per hour with the exact numbers beside them; empty ranges say there is nothing to chart", () => {
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, dialed: hour === 11 ? 38 : hour === 10 ? 24 : 0, connected: hour === 11 ? 15 : hour === 10 ? 9 : 0, talkSeconds: 0 }));
  const html = renderToStaticMarkup(<HourlyChart hourly={hourly} />);
  assert.match(html, /11 AM/);
  assert.match(html, /38 \/ 15/);
  assert.match(html, /24 \/ 9/);
  assert.match(html, /11 AM: 38 dialed, 15 connected/, "an accessible description for every bar");
  assert.match(html, /Dialed/);
  assert.match(html, /Connected/);
  assert.doesNotMatch(html, /gradient|blur/);
  assert.match(renderToStaticMarkup(<HourlyChart hourly={hourly.map((h) => ({ ...h, dialed: 0, connected: 0 }))} />), /nothing to chart/);
});

const ROW = (name: string, dialed: number, connected: number): EmployeeInsightRow => ({
  userId: name,
  name,
  active: true,
  calls: toMetrics({ key: name, dialed, connected, noAnswer: dialed - connected, busy: 0, failed: 0, rejected: 0, talkSeconds: connected * 120, leadsCalled: dialed }),
  followUps: { created: 3, completed: 2, missedNow: 1 },
  leadsReturned: 1,
  currentLeads: { qualified: 2, siteVisit: 1, booked: 1 },
  contribution: { ownedLeads: 10, requirementsCreated: 2, projectsShortlisted: 3, siteVisitsScheduled: 2, siteVisitsCompleted: 1, siteVisitsNoShow: 1, leadsReachedShare: 0.5, visitsPerConnectedCall: 0.25, visitCompletionRate: 0.5 },
  revenue: [{ currency: "INR", total: 9_000_000, count: 1 }],
});

test("employee table: every metric side by side — activity AND outcomes — in the given order, with no score, rank or medal", () => {
  const html = renderToStaticMarkup(<EmployeeTable rows={[ROW("Amit", 60, 25), ROW("Rahul", 100, 20)]} />);
  for (const header of ["Dialed", "Connected", "Rate", "Talk time", "Leads called", "Missed FU", "Returned", "Qualified", "Site visits", "Booked", "Revenue"]) assert.ok(html.includes(header), header);
  assert.ok(html.indexOf("Amit") < html.indexOf("Rahul"), "the order is the caller's (alphabetical), never by volume");
  assert.match(html, /42%/, "25 of 60 connected");
  assert.match(html, /20%/, "20 of 100 connected: more calls, lower connection — both visible");
  assert.match(html, /snapshot, not credit/);
  assert.doesNotMatch(html, /score|rank|#1|🏆|best|worst/i);
});

test("period table: one row per period with the same measures", () => {
  const html = renderToStaticMarkup(<PeriodTable label="Monthly" periods={[{ key: "2026-10", ...toMetrics({ key: "k", dialed: 10, connected: 4, noAnswer: 6, busy: 0, failed: 0, rejected: 0, talkSeconds: 480, leadsCalled: 9 }) }]} />);
  assert.match(html, /2026-10/);
  assert.match(html, /40%/);
  assert.match(html, /8m 00s/);
});

const lead = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Asha Verma",
  phoneE164: "+919876543210",
  email: null,
  contactPreference: "PHONE_CALL",
  status: "NEW",
  temperature: null,
  ownerId: null,
  sourceType: "SELF_GENERATED",
  sourceDetail: "Thane cold list",
  creationMethod: "EXCEL_IMPORT",
  importBatchId: "b1",
  createdBy: "user_founder_1",
  returnedAt: null,
  returnedFrom: null,
  returnReason: null,
  developerId: null,
  sourceCta: null,
  location: null,
  budgetMin: null,
  budgetMax: null,
  budgetCurrency: null,
  configuration: null,
  propertyType: null,
  purpose: null,
  timeline: null,
  nextFollowUpAt: null,
  lastActivityAt: new Date("2026-10-06T08:00:00.000Z"),
  createdAt: new Date("2026-10-05T08:00:00.000Z"),
  updatedAt: new Date("2026-10-06T08:00:00.000Z"),
  erasedAt: null,
} as unknown as Lead;

test("lead card: shows the LEAD source (Self-generated · Excel import) and uses the call control it is given in place of a plain link", () => {
  const item = { lead, developerName: null, followUp: null, attention: null, summary: null } as unknown as LeadListItem;
  const html = renderToStaticMarkup(
    <LeadCard item={item} now={new Date("2026-10-06T10:00:00.000Z")} callSlot={<button type="button">TRACKED CALL</button>} />,
  );
  assert.match(html, /Self-generated · Excel import/);
  assert.match(html, /TRACKED CALL/);
  assert.doesNotMatch(html, /href="tel:/, "the plain link is replaced, not duplicated");
  const plain = renderToStaticMarkup(<LeadCard item={item} now={new Date("2026-10-06T10:00:00.000Z")} />);
  assert.match(plain, /href="tel:\+919876543210"/, "without a slot it behaves exactly as before");
});

test("import form: asks for a CSV, a batch name and an optional campaign; nothing is created until Import is pressed", () => {
  const html = renderToStaticMarkup(<LeadImportForm />);
  assert.match(html, /type="file"/);
  assert.match(html, /accept="\.csv,text\/csv"/);
  assert.match(html, /Batch name/);
  assert.match(html, /Campaign \(optional\)/);
  assert.match(html, /<button[^>]*disabled[^>]*>Import leads<\/button>/, "disabled until a file is chosen");
  assert.match(html, /text-base/);
});
