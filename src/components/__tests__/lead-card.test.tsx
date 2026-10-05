import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadCard, nextActionLine } from "../admin/leads/lead-card.tsx";
import { TimelineCard, AttributionCard, RequirementCard } from "../admin/leads/lead-detail-sections.tsx";
import type { LeadListItem } from "../../lib/leads/lead-reads.ts";
import type { Lead, LeadEvent, MarketingTouch } from "../../lib/leads/types.ts";

/**
 * Renders the founder's lead card and detail sections (their pure views) and
 * checks what the founder would see on a phone. Run with
 * `node --import tsx --test` (the components are TSX).
 */

const NOW = new Date("2026-10-06T10:00:00.000Z");

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Asha Verma",
    phoneE164: "+919876543210",
    email: null,
    contactPreference: "WHATSAPP",
    status: "NEW",
    temperature: "HOT",
    ownerId: null,
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
    nextFollowUpAt: null,
    lastActivityAt: new Date(NOW.getTime() - 3 * 3_600_000),
    erasedAt: null,
    createdAt: new Date(NOW.getTime() - 5 * 3_600_000),
    updatedAt: NOW,
    ...overrides,
  };
}

const item = (overrides: Partial<LeadListItem> = {}, leadOverrides: Partial<Lead> = {}): LeadListItem => ({
  lead: lead(leadOverrides),
  developerName: "Acme Realty",
  summary: null,
  attention: null,
  followUp: null,
  ...overrides,
});

const card = (value: LeadListItem) => renderToStaticMarkup(<ul><LeadCard item={value} now={NOW} /></ul>);

test("card: shows the essentials a founder needs at a glance", () => {
  const html = card(item());
  for (const expected of ["Asha Verma", "Hot", "New", "Acme Realty", "Thane", "₹2 Cr budget", "Developer page", "Last activity 3 hours ago"]) {
    assert.ok(html.includes(expected), `missing ${expected}`);
  }
});

test("card: Call and WhatsApp are real links to the phone dialer and WhatsApp, sized for a thumb", () => {
  const html = card(item());
  assert.ok(html.includes('href="tel:+919876543210"'));
  assert.ok(html.includes('href="https://wa.me/919876543210"'));
  assert.ok(html.includes('rel="noopener noreferrer"'), "the WhatsApp link opens safely in a new tab");
  assert.equal((html.match(/min-h-11/g) ?? []).length >= 2, true, "both actions are at least 44px tall");
});

test("card: the preferred channel is the primary button", () => {
  const whatsapp = card(item({}, { contactPreference: "WHATSAPP" }));
  assert.match(whatsapp, /bg-accent[^"]*"[^>]*>WhatsApp/);
  const phone = card(item({}, { contactPreference: "PHONE_CALL" }));
  assert.match(phone, /bg-accent[^"]*"[^>]*>Call/);
});

test("card: the lead opens through its own link, separate from the Call/WhatsApp buttons", () => {
  const html = card(item());
  assert.ok(html.includes('href="/admin/leads/11111111-1111-4111-8111-111111111111"'));
  assert.ok(html.indexOf("</a>") < html.indexOf("tel:"), "the lead link closes before the Call button, so a Call tap can never open the lead");
});

test("card: an erased or malformed number never produces a dial or WhatsApp link", () => {
  const erased = card(item({}, { phoneE164: null, erasedAt: NOW, name: null }));
  assert.ok(!erased.includes("tel:") && !erased.includes("wa.me"));
  const junk = card(item({}, { phoneE164: "javascript:alert(1)" }));
  assert.ok(!junk.includes("tel:") && !junk.includes("wa.me") && !junk.includes("javascript:"));
});

test("card: hostile text is escaped, never injected as markup", () => {
  const html = card(item({ developerName: "<img src=x onerror=alert(1)>" }, { name: "<script>alert(1)</script>", location: '"><svg onload=alert(1)>' }));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<svg"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("card: no layout that forces sideways scrolling on a phone", () => {
  const html = card(item());
  assert.ok(!html.includes("overflow-x-scroll") && !html.includes("whitespace-nowrap"));
  assert.ok(html.includes("truncate"), "a long name is cut with an ellipsis instead of widening the page");
});

test("next action: overdue and due-today follow-ups are called out; otherwise the queue reason; otherwise the honest 'none set'", () => {
  const due = new Date("2026-10-06T08:00:00.000Z");
  assert.equal(nextActionLine(item({ followUp: "OVERDUE" }, { nextFollowUpAt: due })).tone, "alert");
  assert.match(nextActionLine(item({ followUp: "OVERDUE" }, { nextFollowUpAt: due })).text, /overdue/i);
  assert.equal(nextActionLine(item({ followUp: "TODAY" }, { nextFollowUpAt: new Date("2026-10-06T12:00:00Z") })).tone, "soon");
  assert.equal(nextActionLine(item({ attention: { bucket: "NEW_LEAD", reasons: ["New lead"], summary: "New lead from Acme" } })).text, "New lead from Acme");
  assert.equal(nextActionLine(item()).text, "No follow-up set");
});

test("card: an unrated lead says 'Not rated' rather than inventing a temperature", () => {
  assert.ok(card(item({}, { temperature: null })).includes("Not rated"));
});

// --- detail sections ---------------------------------------------------------------------------

const touch = (id: string, overrides: Partial<MarketingTouch> = {}): MarketingTouch => ({
  id,
  sessionId: "s",
  occurredAt: NOW,
  landingPath: "/developers/acme",
  referrer: "https://www.google.com/",
  utmSource: "google",
  utmMedium: "cpc",
  utmCampaign: "brand",
  utmContent: null,
  utmTerm: null,
  gclid: "GCLID-1",
  fbclid: null,
  ...overrides,
});

test("attribution: first and latest touch are shown separately; only fields that exist appear", () => {
  const html = renderToStaticMarkup(
    <AttributionCard
      firstTouch={touch("a", { landingPath: "/first", utmSource: "google" })}
      lastTouch={touch("b", { landingPath: "/second", utmSource: "facebook", gclid: null, fbclid: "FB-9" })}
      sourceCta="developer_page"
    />,
  );
  assert.ok(html.includes("First touch") && html.includes("Latest touch"));
  assert.ok(html.indexOf("/first") < html.indexOf("Latest touch"), "the first touch's landing page sits under First touch");
  assert.ok(html.indexOf("/second") > html.indexOf("Latest touch"));
  assert.ok(html.includes("GCLID-1") && html.includes("FB-9"));
  assert.ok(!html.includes("Campaign</dt><dd class=\"min-w-0 break-words text-foreground\">null"));
});

test("attribution: when first and latest are the same row it says so instead of repeating it", () => {
  const same = touch("a");
  const html = renderToStaticMarkup(<AttributionCard firstTouch={same} lastTouch={same} sourceCta={null} />);
  assert.ok(html.includes("Same as the first touch"));
});

test("attribution: nothing recorded is stated plainly", () => {
  const html = renderToStaticMarkup(<AttributionCard firstTouch={null} lastTouch={null} sourceCta={null} />);
  assert.ok(html.includes("Not recorded"));
});

test("requirement: empty requirement says nothing is recorded; filled one formats the budget", () => {
  assert.ok(renderToStaticMarkup(<RequirementCard lead={lead({ location: null, budgetMax: null, budgetCurrency: null })} />).includes("Nothing recorded yet"));
  const filled = renderToStaticMarkup(<RequirementCard lead={lead({ budgetMin: 10_000_000, budgetMax: 20_000_000, timeline: "WITHIN_30_DAYS", purpose: "INVESTMENT" })} />);
  assert.ok(filled.includes("₹1 Cr–₹2 Cr") && filled.includes("Within 30 days") && filled.includes("Investment"));
});

test("timeline: newest first, who did it, notes shown, hostile note escaped", () => {
  const ev = (id: string, minute: number, eventType: LeadEvent["eventType"], actorType: LeadEvent["actorType"], payload: Record<string, unknown> = {}): LeadEvent => ({
    id,
    leadId: "l",
    eventType,
    actorType,
    actorId: null,
    developerId: null,
    fromStatus: null,
    toStatus: null,
    payload,
    createdAt: new Date(NOW.getTime() + minute * 60_000),
  });
  const html = renderToStaticMarkup(
    <TimelineCard events={[ev("1", 0, "LEAD_CREATED", "BUYER"), ev("2", 5, "NOTE_ADDED", "FOUNDER", { note: "<b>bold</b> call back" })]} />,
  );
  assert.ok(html.indexOf("Note added") < html.indexOf("Lead created"), "most recent first");
  assert.ok(html.includes("Buyer") && html.includes("You"));
  assert.ok(html.includes("&lt;b&gt;bold&lt;/b&gt; call back") && !html.includes("<b>bold"));
});
