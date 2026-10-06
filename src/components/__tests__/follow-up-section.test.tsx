import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { FollowUpSection } from "../leads/follow-up-section.tsx";
import { ReturnLeadCard } from "../team/return-lead-card.tsx";
import { MissedCard, ReturnedCard } from "../leads/missed-card.tsx";
import type { FollowUpView } from "../../lib/leads/follow-up-view.ts";
import type { MissedFollowUpItem, ReturnedLeadItem } from "../../lib/leads/follow-up-reads.ts";
import type { Lead, LeadFollowUp } from "../../lib/leads/types.ts";

/** The follow-up and return screens (pure rendering of their initial state) and the missed/returned cards. */

const NOW = "2026-10-11T08:48:00.000Z"; // 14:18 in India
const noop = async () => ({ ok: true as const });

const OPEN: FollowUpView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  type: "CALL_BACK",
  status: "SCHEDULED",
  scheduledAt: "2026-10-11T12:00:00.000Z", // 17:30 India, still in the future
  missedCount: 0,
  rescheduleCount: 0,
  cancelReason: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: "2026-10-10T05:00:00.000Z",
};
const MISSED: FollowUpView = { ...OPEN, status: "MISSED", scheduledAt: "2026-10-11T06:30:00.000Z", missedCount: 1 }; // due 12:00 India: missed by 2h 18m
const DONE: FollowUpView = { ...OPEN, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "COMPLETED", completedAt: "2026-10-10T09:00:00.000Z" };

function render(followUps: FollowUpView[]) {
  return renderToStaticMarkup(<FollowUpSection followUps={followUps} nowIso={NOW} onSchedule={noop} onReschedule={noop} onComplete={noop} onCancel={noop} />);
}

test("follow-up section: with none scheduled it asks for a TYPE and an exact date and time (India time) — there is no date-only option", () => {
  const html = render([]);
  assert.match(html, /No follow-up scheduled/);
  assert.match(html, /Call back/);
  assert.match(html, /Site visit follow up/);
  assert.match(html, /type="datetime-local"/);
  assert.match(html, /Date and exact time \(India time\)/);
  assert.doesNotMatch(html, /type="date"/);
  assert.match(html, /Schedule follow-up/);
  assert.match(html, /text-base/);
  assert.match(html, /min-h-11/);
});

test("follow-up section: an open follow-up shows its type, exact date and time, and Mark done / Reschedule / Cancel", () => {
  const html = render([OPEN, DONE]);
  assert.match(html, /Call back/);
  assert.match(html, /11 Oct 2026, 05:30 PM/);
  assert.match(html, /Scheduled/);
  assert.match(html, /Mark done/);
  assert.match(html, /Reschedule/);
  assert.match(html, /Cancel…/);
  assert.match(html, /Earlier follow-ups \(1\)/);
});

test("follow-up section: an overdue follow-up says how long ago it was missed and offers the resolutions — there is no dismiss", () => {
  const html = render([MISSED]);
  assert.match(html, /Missed/);
  assert.match(html, /Missed by 2h 18m/);
  assert.match(html, /complete, reschedule or cancel with a reason/);
  assert.match(html, /Complete now/);
  assert.doesNotMatch(html, /Dismiss|Ignore|Acknowledge|Hide/i);
});

test("return lead: starts closed behind one button; the reason list is structured and a note only appears for Other", () => {
  const html = renderToStaticMarkup(<ReturnLeadCard onReturn={noop} />);
  assert.match(html, /Return lead…/);
  assert.match(html, /Your history on it is kept/);
  assert.doesNotMatch(html, /Client not responding/, "the reasons only appear once the control is opened");
  assert.doesNotMatch(html, /type="datetime-local"/);
});

const lead = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Rahul Sharma",
  phoneE164: "+919876543210",
  email: null,
  contactPreference: "PHONE_CALL",
  status: "CONTACTED",
  temperature: "HOT",
  ownerId: "user_priya_0001",
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
  sessionId: null,
  userId: null,
  firstTouchId: null,
  lastTouchId: null,
  nextFollowUpAt: null,
  lastContactedAt: null,
  lastActivityAt: new Date("2026-10-11T05:00:00.000Z"),
  createdAt: new Date("2026-10-10T05:00:00.000Z"),
  updatedAt: new Date("2026-10-11T05:00:00.000Z"),
  erasedAt: null,
} as unknown as Lead;

const followUp = {
  id: OPEN.id,
  leadId: lead.id,
  type: "CALL_BACK",
  status: "MISSED",
  scheduledAt: new Date(MISSED.scheduledAt),
  originalScheduledAt: new Date(MISSED.scheduledAt),
  ownerId: "user_priya_0001",
} as unknown as LeadFollowUp;

test("missed card: lead, follow-up type, scheduled date and time, how overdue, last contact, status, temperature, requirement, a Call button and Resolve", () => {
  const item: MissedFollowUpItem = {
    followUp,
    lead,
    developerName: "Acme Realty",
    summary: { leadId: lead.id, lastContactAt: new Date("2026-10-11T04:30:00.000Z"), contactAttempts: 3, lastBuyerActivityAt: null, lastBuyerActivityDeveloperName: null, firstDeveloperName: null },
    requirement: "2 BHK · Thane · Self use",
    overdueMs: (2 * 60 + 18) * 60_000,
  };
  const html = renderToStaticMarkup(<MissedCard item={item} href={`/team/leads/${lead.id}`} />);
  for (const expected of ["Missed follow-up", "Rahul Sharma", "Call back", "11 Oct 2026, 12:00 PM", "Missed by 2h 18m", "Last contact 11 Oct 2026, 10:00 AM", "3 attempts", "Hot", "2 BHK · Thane · Self use", "Resolve"]) {
    assert.match(html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), expected);
  }
  assert.match(html, /href="tel:\+919876543210"[^>]*>Call</);
  assert.match(html, /href="\/team\/leads\/11111111-1111-4111-8111-111111111111"/);
  assert.doesNotMatch(html, /user_priya_0001/, "sign-in ids are never shown");
  const founder = renderToStaticMarkup(<MissedCard item={item} href={`/admin/leads/${lead.id}`} ownerName="Priya Nair" />);
  assert.match(founder, /Employee: Priya Nair/);
  assert.match(founder, /href="\/admin\/leads\//);
});

test("returned card: who returned it, when, the structured reason, any note, last contact and follow-up, status, temperature, requirement — enough to know why it came back", () => {
  const item: ReturnedLeadItem = {
    lead,
    returnedBy: "user_priya_0001",
    reason: "CLIENT_NOT_RESPONDING",
    returnedAt: new Date("2026-10-11T07:00:00.000Z"),
    note: "phone switched off all week",
    lastContactAt: new Date("2026-10-11T04:30:00.000Z"),
    contactAttempts: 4,
    lastFollowUp: { ...followUp, status: "CANCELLED" } as LeadFollowUp,
    requirement: "3 BHK · Pune",
    developerName: null,
  };
  const html = renderToStaticMarkup(<ReturnedCard item={item} href={`/admin/leads/${lead.id}`} returnedByName="Priya Nair" />);
  for (const expected of ["Returned lead", "Returned by Priya Nair", "11 Oct 2026, 12:30 PM", "Reason: Client not responding", "phone switched off all week", "4 attempts", "Call back", "Cancelled", "3 BHK · Pune", "Open &amp; reassign"]) {
    assert.ok(html.includes(expected), expected);
  }
  assert.doesNotMatch(html, /user_priya_0001/);
});

test("cards: hostile text is escaped, never injected as markup", () => {
  const html = renderToStaticMarkup(
    <ReturnedCard
      item={{ lead: { ...lead, name: "<img src=x onerror=alert(1)>" } as Lead, returnedBy: null, reason: "OTHER", returnedAt: new Date(NOW), note: "<script>alert(1)</script>", lastContactAt: null, contactAttempts: 0, lastFollowUp: null, requirement: null, developerName: null }}
      href="/admin/leads/x"
    />,
  );
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});
