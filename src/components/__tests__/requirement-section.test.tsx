import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { RequirementSection } from "../leads/requirement-section.tsx";
import type { RequirementView } from "../../lib/leads/requirement-view.ts";

/**
 * The requirement section (pure rendering of its initial state): what the Founder and a team member see, the
 * order of the details, that history is folded away, and that nothing but requirement controls is offered.
 */

const noop = async () => ({ ok: true as const });

const ACTIVE: RequirementView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  status: "ACTIVE",
  locations: ["Thane", "Navi Mumbai"],
  propertyType: "Apartment",
  configuration: "2 BHK",
  budgetMin: 8_000_000,
  budgetMax: 12_000_000,
  budgetCurrency: "INR",
  purpose: "SELF_USE",
  timeline: "ONE_TO_THREE_MONTHS",
  notes: "Wants to be near the station",
  updatedAt: "2026-10-06T08:00:00.000Z",
  createdAt: "2026-10-05T08:00:00.000Z",
};
const OLD: RequirementView = { ...ACTIVE, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "CLOSED", locations: ["Pune"], notes: null };

function render(requirements: RequirementView[], prefill = {}) {
  return renderToStaticMarkup(<RequirementSection requirements={requirements} prefill={prefill} onCreate={noop} onUpdate={noop} onSetStatus={noop} />);
}

test("requirement section: the current requirement reads top to bottom — location, budget, configuration, type, purpose, timeline, notes", () => {
  const html = render([ACTIVE]);
  const order = ["Location", "Budget", "Configuration", "Property type", "Purpose", "Timeline", "Notes"].map((label) => html.indexOf(`>${label}<`));
  assert.ok(order.every((index) => index > -1), "every row is shown");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in the agreed order");
  assert.match(html, /Thane, Navi Mumbai/);
  assert.match(html, /2 BHK/);
  assert.match(html, /Self use/);
  assert.match(html, /Active/);
});

test("requirement section: Edit and Put on hold are the fast actions; the rest sits behind More", () => {
  const html = render([ACTIVE]);
  assert.match(html, /Edit/);
  assert.match(html, /Put on hold/);
  const more = html.indexOf("<summary");
  assert.ok(more > -1);
  for (const label of ["Mark fulfilled", "Close", "Start a new one"]) assert.ok(html.indexOf(label) > more, `${label} is inside the More disclosure`);
});

test("requirement section: with no requirement it offers one clear action; with only history it says there is no active one", () => {
  assert.match(render([]), /No requirement recorded yet/);
  assert.match(render([]), /Add requirement/);
  const onlyHistory = render([OLD]);
  assert.match(onlyHistory, /No active requirement/);
  assert.match(onlyHistory, /Earlier requirements \(1\)/);
});

test("requirement section: an ON_HOLD requirement is current and can be resumed", () => {
  const html = render([{ ...ACTIVE, status: "ON_HOLD" }]);
  assert.match(html, /On hold/);
  assert.match(html, /Resume/);
  assert.doesNotMatch(html, /Put on hold/);
});

test("requirement section: earlier requirements are folded away with their status and details; the current one is not repeated there", () => {
  const html = render([ACTIVE, OLD]);
  assert.match(html, /Earlier requirements \(1\)/);
  const history = html.slice(html.indexOf("Earlier requirements"));
  assert.match(history, /Closed/);
  assert.match(history, /Pune/);
  assert.doesNotMatch(history, /Navi Mumbai/);
});

test("requirement section: mobile-first — 44px targets, no horizontal overflow classes, no decorative effects", () => {
  const html = render([ACTIVE, OLD]);
  assert.match(html, /min-h-11/);
  assert.doesNotMatch(html, /overflow-x-scroll|whitespace-nowrap|min-w-\[|w-\[\d{3,}px\]/);
  assert.doesNotMatch(html, /gradient|backdrop-blur|blur-/);
});

test("requirement section: hostile text is escaped, never injected as markup", () => {
  const html = render([{ ...ACTIVE, locations: ["<img src=x onerror=alert(1)>"], notes: "<script>alert(1)</script>" }]);
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test("requirement section: offers only requirement controls — no lead status, temperature, owner, booking or erase", () => {
  const html = render([ACTIVE, OLD]);
  for (const forbidden of ["Temperature", "Update status", "Assign", "Booking", "Commission", "Erase"]) {
    assert.doesNotMatch(html, new RegExp(forbidden), `must not offer "${forbidden}"`);
  }
});
