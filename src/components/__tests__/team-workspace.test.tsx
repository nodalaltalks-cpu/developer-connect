import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadCard } from "../admin/leads/lead-card.tsx";
import { MyLeadsTabs } from "../team/my-leads-tabs.tsx";
import { TeamLeadActions } from "../team/team-lead-actions.tsx";
import type { LeadListItem } from "../../lib/leads/lead-reads.ts";
import type { Lead } from "../../lib/leads/types.ts";

/** The team member's screens (pure rendering): what they see and — as important — what they are never offered. */

const NOW = new Date("2026-10-06T10:00:00.000Z");

const lead = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Asha Verma",
  phoneE164: "+919876543210",
  email: null,
  contactPreference: "WHATSAPP",
  status: "NEW",
  temperature: "HOT",
  ownerId: "user_priya_0001",
  returnedAt: null,
  returnedFrom: null,
  returnReason: null,
  sourceType: "DIGITAL",
  sourceDetail: null,
  creationMethod: "WEBSITE_GATE",
  importBatchId: null,
  createdBy: null,
  developerId: null,
  sourceCta: "developer_page",
  location: "Thane",
  budgetMin: null,
  budgetMax: 20_000_000,
  budgetCurrency: "INR",
  configuration: null,
  propertyType: null,
  purpose: null,
  timeline: null,
  sessionId: null,
  userId: null,
  firstTouchId: null,
  lastTouchId: null,
  nextFollowUpAt: new Date("2026-10-06T14:00:00.000Z"),
  lastContactedAt: null,
  lastActivityAt: new Date("2026-10-06T08:00:00.000Z"),
  createdAt: new Date("2026-10-05T08:00:00.000Z"),
  updatedAt: new Date("2026-10-06T08:00:00.000Z"),
  erasedAt: null,
} as Lead;
const item = { lead, developerName: "Acme Realty", followUp: "TODAY", attention: null, summary: null } as unknown as LeadListItem;

test("my leads card: shows name, developer, temperature, status, follow-up and time since last activity; links into /team, not /admin", () => {
  const html = renderToStaticMarkup(<LeadCard item={item} now={NOW} basePath="/team/leads" showOwner={false} />);
  for (const expected of ["Asha Verma", "Acme Realty", "Hot", "New", "Follow-up today", "Last activity 2 hours ago"]) assert.match(html, new RegExp(expected));
  assert.match(html, /href="\/team\/leads\/11111111-1111-4111-8111-111111111111"/);
  assert.doesNotMatch(html, /\/admin/);
  assert.doesNotMatch(html, /Owner:/, "the owner line is the employee themselves — not repeated");
  assert.doesNotMatch(html, /user_priya_0001/);
});

test("my leads card: the founder's card is unchanged by default (links to /admin/leads, shows the owner)", () => {
  const html = renderToStaticMarkup(<LeadCard item={item} now={NOW} ownerName="Priya Nair" />);
  assert.match(html, /href="\/admin\/leads\/11111111/);
  assert.match(html, /Owner: Priya Nair/);
});

test("my leads filters: exactly All, New, Follow-up due and Hot, each a 44px tap target, none pointing at founder pages", () => {
  const html = renderToStaticMarkup(<MyLeadsTabs active="follow_up_due" />);
  for (const label of ["All", "New", "Follow-up due", "Hot"]) assert.match(html, new RegExp(`>${label}<`));
  assert.equal((html.match(/<li /g) ?? []).length, 4);
  assert.match(html, /aria-current="page"[^>]*>[^<]*Follow-up due|Follow-up due/);
  assert.match(html, /href="\/team\?view=hot"/);
  assert.doesNotMatch(html, /\/admin/);
  assert.match(html, /min-h-11/);
});

test("team lead actions: offers Call/WhatsApp and a note — and NO founder controls (the follow-up and return controls have their own sections)", () => {
  const html = renderToStaticMarkup(
    <TeamLeadActions leadId={lead.id} telHref="tel:+919876543210" whatsappHref="https://wa.me/919876543210" prefersWhatsApp />,
  );
  for (const expected of ["WhatsApp", "Call", "Add note"]) assert.match(html, new RegExp(expected));
  for (const forbidden of ["Temperature", "Status", "Update status", "Requirement", "Owner", "Assign", "Erase", "Booking", "Commission"]) {
    assert.doesNotMatch(html, new RegExp(forbidden), `an employee must not be offered "${forbidden}"`);
  }
  assert.match(html, /text-base/, "16px inputs — no iOS zoom");
  assert.match(html, /min-h-11/, "44px tap targets");
});

test("team lead actions: with no phone there is no Call or WhatsApp button", () => {
  const html = renderToStaticMarkup(<TeamLeadActions leadId={lead.id} telHref={null} whatsappHref={null} prefersWhatsApp={false} />);
  assert.doesNotMatch(html, />Call</);
  assert.doesNotMatch(html, /Mark done/);
});
