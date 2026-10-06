import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addNote,
  assignOwner,
  captureAssistanceLead,
  changeLeadStatus,
  completeFollowUp,
  eraseLead,
  getLeadTimeline,
  logContact,
  setFollowUp,
  setTemperature,
  updateRequirement,
} from "../lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { getAttentionItems, getLeadCounts, getLeadDetail, getLeadsPage } from "../lead-reads.ts";
import { compareForView, countLeads, endOfDayIn, followUpState, matchesView } from "../lead-views.ts";
import { describeTimeline } from "../timeline.ts";
import { telHref, whatsappHref } from "../contact-links.ts";
import { redactPayload } from "../redaction.ts";
import { BUYER, DEVELOPER_A, FOUNDER, captureInput, hoursFrom, minutes, T0 } from "./test-helpers.ts";

/**
 * Stage 4 — the founder CRM's domain rules: temperature, owner, follow-up
 * completion, call/WhatsApp outcomes, the list views and counts, the detail
 * read model and the timeline wording. In-memory repositories; the SQL
 * twins of these rules are proven in db/__tests__/founder-crm.integration.test.ts.
 */

async function newLead(repos = createInMemoryLeadRepositories(), overrides = {}, at = T0) {
  const { lead } = await captureAssistanceLead(repos, captureInput(overrides), at);
  return { repos, lead };
}

const types = (events: { eventType: string }[]) => events.map((event) => event.eventType);

// --- temperature -------------------------------------------------------------------------------

test("temperature: starts unrated, is separate from status, and every change records the previous value", async () => {
  const { repos, lead } = await newLead();
  assert.equal(lead.temperature, null);

  const hot = await setTemperature(repos, lead.id, "HOT", FOUNDER, minutes(1));
  assert.equal(hot.temperature, "HOT");
  assert.equal(hot.status, "NEW", "changing temperature never changes the pipeline status");

  await setTemperature(repos, lead.id, "WARM", FOUNDER, minutes(2));
  await setTemperature(repos, lead.id, null, FOUNDER, minutes(3));

  const changes = (await getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "TEMPERATURE_CHANGED");
  assert.deepEqual(
    changes.map((event) => [event.payload.from, event.payload.to]),
    [
      [null, "HOT"],
      ["HOT", "WARM"],
      ["WARM", null],
    ],
  );
  assert.ok(changes.every((event) => event.actorType === "FOUNDER" && event.actorId === FOUNDER.actorId));
});

test("temperature: status changes leave temperature alone", async () => {
  const { repos, lead } = await newLead();
  await setTemperature(repos, lead.id, "HOT", FOUNDER, minutes(1));
  const moved = await changeLeadStatus(repos, lead.id, "QUALIFIED", FOUNDER, {}, minutes(2));
  assert.equal(moved.temperature, "HOT");
  assert.equal(moved.status, "QUALIFIED");
});

test("temperature: rejects an invalid value, a no-op, and any non-founder actor — and writes nothing", async () => {
  const { repos, lead } = await newLead();
  await setTemperature(repos, lead.id, "COLD", FOUNDER, minutes(1));
  const before = (await getLeadTimeline(repos, lead.id)).length;

  await assert.rejects(() => setTemperature(repos, lead.id, "BOILING" as never, FOUNDER, minutes(2)), LeadValidationError);
  await assert.rejects(() => setTemperature(repos, lead.id, "COLD", FOUNDER, minutes(2)), LeadStateError);
  await assert.rejects(() => setTemperature(repos, lead.id, "HOT", BUYER, minutes(2)), UnauthorizedLeadActionError);
  await assert.rejects(() => setTemperature(repos, lead.id, "HOT", { actorType: "FOUNDER" }, minutes(2)), UnauthorizedLeadActionError);
  assert.equal((await getLeadTimeline(repos, lead.id)).length, before);
});

// --- follow-ups --------------------------------------------------------------------------------

test("follow-up: set with a note, completed (recording what was due), then nothing is left to complete", async () => {
  const { repos, lead } = await newLead();
  const due = hoursFrom(T0, 24);
  await setFollowUp(repos, lead.id, due, FOUNDER, minutes(1), { note: "Send the brochure" });

  let events = await getLeadTimeline(repos, lead.id);
  const set = events.find((event) => event.eventType === "FOLLOW_UP_SET")!;
  assert.equal(set.payload.note, "Send the brochure");
  assert.equal(set.payload.dueAt, due.toISOString());

  const done = await completeFollowUp(repos, lead.id, FOUNDER, minutes(30), { note: "Sent" });
  assert.equal(done.nextFollowUpAt, null);
  events = await getLeadTimeline(repos, lead.id);
  const completed = events.find((event) => event.eventType === "FOLLOW_UP_COMPLETED")!;
  assert.equal(completed.payload.dueAt, due.toISOString());

  await assert.rejects(() => completeFollowUp(repos, lead.id, FOUNDER, minutes(31)), LeadStateError);
  await assert.rejects(() => completeFollowUp(repos, lead.id, BUYER, minutes(31)), UnauthorizedLeadActionError);
});

// --- owner -------------------------------------------------------------------------------------

test("owner: changes are recorded with from/to, a no-op is refused, only the founder may assign", async () => {
  const { repos, lead } = await newLead();
  assert.equal(lead.ownerId, null);
  const assigned = await assignOwner(repos, lead.id, "staff_1", FOUNDER, minutes(1));
  assert.equal(assigned.ownerId, "staff_1");
  await assignOwner(repos, lead.id, null, FOUNDER, minutes(2));

  const changes = (await getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "OWNER_CHANGED");
  assert.deepEqual(
    changes.map((event) => [event.payload.from, event.payload.to]),
    [
      [null, "staff_1"],
      ["staff_1", null],
    ],
  );
  await assert.rejects(() => assignOwner(repos, lead.id, null, FOUNDER, minutes(3)), LeadStateError);
  await assert.rejects(() => assignOwner(repos, lead.id, "staff_2", BUYER, minutes(3)), UnauthorizedLeadActionError);
});

// --- call / WhatsApp outcomes ------------------------------------------------------------------

test("contact: call and WhatsApp outcomes are recorded as contact attempts; unsupported outcomes are refused", async () => {
  const { repos, lead } = await newLead();
  for (const [channel, outcome] of [
    ["PHONE_CALL", "NO_ANSWER"],
    ["PHONE_CALL", "BUSY"],
    ["PHONE_CALL", "FAILED"],
    ["PHONE_CALL", "CONNECTED"],
    ["WHATSAPP", "SENT"],
    ["WHATSAPP", "REPLIED"],
  ] as const) {
    await logContact(repos, lead.id, { channel, outcome }, FOUNDER, minutes(5));
  }
  const summary = (await repos.events.summarise([lead.id]))[0];
  assert.equal(summary.contactAttempts, 6);

  await assert.rejects(() => logContact(repos, lead.id, { channel: "PHONE_CALL", outcome: "TELEPATHY" as never }, FOUNDER), LeadValidationError);
  await assert.rejects(() => logContact(repos, lead.id, { channel: "EMAIL" as never, outcome: "SENT" }, FOUNDER), LeadValidationError);
});

test("contact links: only a valid E.164 number becomes a tel: or WhatsApp link", () => {
  assert.equal(telHref("+919876543210"), "tel:+919876543210");
  assert.equal(whatsappHref("+919876543210"), "https://wa.me/919876543210");
  assert.equal(whatsappHref("+971501234567"), "https://wa.me/971501234567");
  for (const bad of [null, "", "9876543210", "+91 98765 43210", "javascript:alert(1)", "+1;rm -rf", "+0123456789"]) {
    assert.equal(telHref(bad), null, String(bad));
    assert.equal(whatsappHref(bad), null, String(bad));
  }
});

// --- views, counts and the founder's day -------------------------------------------------------

test("endOfDayIn: the founder's day ends at midnight India time, wherever the server runs", () => {
  // 2026-10-05 20:00 UTC = 2026-10-06 01:30 IST -> that IST day ends 2026-10-06 18:30 UTC.
  assert.equal(endOfDayIn(new Date("2026-10-05T20:00:00Z")).toISOString(), "2026-10-06T18:30:00.000Z");
  // 2026-10-05 10:00 UTC = 15:30 IST on the 5th -> ends 2026-10-05 18:30 UTC.
  assert.equal(endOfDayIn(new Date("2026-10-05T10:00:00Z")).toISOString(), "2026-10-05T18:30:00.000Z");
  // Exactly at the boundary the NEW day begins.
  assert.equal(endOfDayIn(new Date("2026-10-05T18:30:00Z")).toISOString(), "2026-10-06T18:30:00.000Z");
});

test("followUpState: overdue, today and upcoming are mutually exclusive", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  const end = endOfDayIn(now);
  assert.equal(followUpState(null, now, end), null);
  assert.equal(followUpState(new Date("2026-10-05T09:59:00Z"), now, end), "OVERDUE");
  assert.equal(followUpState(new Date("2026-10-05T12:00:00Z"), now, end), "TODAY");
  assert.equal(followUpState(new Date("2026-10-06T05:00:00Z"), now, end), "UPCOMING");
});

async function seedPortfolio() {
  const repos = createInMemoryLeadRepositories({ [DEVELOPER_A.id]: DEVELOPER_A.displayName });
  const mk = async (phone: string, name: string) =>
    (await captureAssistanceLead(repos, captureInput({ phone, name, sessionId: `s-${phone}`, currentTouch: { sessionId: `s-${phone}`, landingPath: "/" } }), T0)).lead;
  const a = await mk("+91 98765 11111", "Hot Buyer");
  const b = await mk("+91 98765 22222", "Warm Buyer");
  const c = await mk("+91 98765 33333", "Cold Buyer");
  const d = await mk("+91 98765 44444", "Booked Buyer");
  const e = await mk("+91 98765 55555", "Lost Hot Buyer");
  const f = await mk("+91 98765 66666", "Overdue Buyer");
  const now = hoursFrom(T0, 5);
  await setTemperature(repos, a.id, "HOT", FOUNDER, minutes(1));
  await setTemperature(repos, b.id, "WARM", FOUNDER, minutes(1));
  await setTemperature(repos, c.id, "COLD", FOUNDER, minutes(1));
  await setTemperature(repos, e.id, "HOT", FOUNDER, minutes(1));
  await changeLeadStatus(repos, e.id, "LOST", FOUNDER, { reasonCode: "PRICE" }, minutes(2));
  await changeLeadStatus(repos, d.id, "BOOKED", FOUNDER, {}, minutes(2));
  await changeLeadStatus(repos, b.id, "QUALIFIED", FOUNDER, {}, minutes(2));
  await changeLeadStatus(repos, c.id, "SITE_VISIT_SCHEDULED", FOUNDER, {}, minutes(2));
  await setFollowUp(repos, f.id, hoursFrom(T0, 1), FOUNDER, minutes(3)); // overdue at `now`
  await setFollowUp(repos, a.id, hoursFrom(now, 2), FOUNDER, minutes(3)); // later today
  return { repos, now, ids: { a, b, c, d, e, f } };
}

test("counts: only reliable counts, closed-out leads excluded from hot/warm/cold and follow-ups", async () => {
  const { repos, now } = await seedPortfolio();
  const counts = await getLeadCounts(repos, now);
  assert.deepEqual(counts, {
    total: 6,
    new: 2, // only a and f are still NEW (b, c, d, e were moved on)
    hot: 1, // e is HOT but LOST -> excluded
    warm: 1,
    cold: 1,
    overdue: 1,
    dueToday: 1,
    qualified: 1,
    siteVisitScheduled: 1,
    booked: 1,
  });
});

test("views: each list matches its definition, newest activity first, follow-ups by due time", async () => {
  const { repos, now, ids } = await seedPortfolio();
  const page = async (view: Parameters<typeof getLeadsPage>[1]) => (await getLeadsPage(repos, view, 1, now)).items.map((item) => item.lead.id);

  assert.deepEqual(await page("hot"), [ids.a.id]);
  assert.deepEqual(await page("warm"), [ids.b.id]);
  assert.deepEqual(await page("cold"), [ids.c.id]);
  assert.deepEqual(await page("overdue"), [ids.f.id]);
  assert.deepEqual(await page("due_today"), [ids.a.id]);
  assert.deepEqual(await page("qualified"), [ids.b.id]);
  assert.equal((await page("all")).length, 6);
});

test("views: pagination is bounded and stable; an out-of-range page is simply empty", async () => {
  const { repos, now } = await seedPortfolio();
  const first = await getLeadsPage(repos, "all", 1, now, 4);
  const second = await getLeadsPage(repos, "all", 2, now, 4);
  const third = await getLeadsPage(repos, "all", 3, now, 4);
  assert.equal(first.items.length, 4);
  assert.equal(second.items.length, 2);
  assert.equal(third.items.length, 0);
  assert.equal(first.total, 6);
  assert.equal(first.pageCount, 2);
  const seen = new Set([...first.items, ...second.items].map((item) => item.lead.id));
  assert.equal(seen.size, 6, "no lead is repeated or skipped across pages");
  // Garbage page numbers fall back to page 1 rather than throwing.
  assert.equal((await getLeadsPage(repos, "all", Number.NaN, now, 4)).page, 1);
  assert.equal((await getLeadsPage(repos, "all", -3, now, 4)).page, 1);
});

test("views: an erased lead is never listed or counted", async () => {
  const { repos, now, ids } = await seedPortfolio();
  await eraseLead(repos, ids.c.id, FOUNDER, minutes(10));
  const counts = await getLeadCounts(repos, now);
  assert.equal(counts.total, 5);
  assert.equal(counts.cold, 0);
  assert.equal((await getLeadsPage(repos, "all", 1, now)).items.some((item) => item.lead.id === ids.c.id), false);
});

test("view rules are exposed as pure functions that agree with the counts", async () => {
  const { repos, now, ids } = await seedPortfolio();
  const all = [ids.a, ids.b, ids.c, ids.d, ids.e, ids.f].map((lead) => ({ ...lead }));
  const live = (await Promise.all(all.map((lead) => repos.leads.getById(lead.id)))).filter((lead) => lead !== null);
  const end = endOfDayIn(now);
  assert.equal(countLeads(live, now, end).hot, live.filter((lead) => matchesView(lead, "hot", now, end)).length);
  assert.ok([...live].sort(compareForView("all")).length === 6);
});

// --- attention view reuses the Today queue -----------------------------------------------------

test("attention: is the existing Today queue, with its reasons — and booked or lost leads never appear", async () => {
  const { repos, now, ids } = await seedPortfolio();
  const items = await getAttentionItems(repos, now);
  const idsShown = items.map((item) => item.lead.id);
  assert.equal(idsShown[0], ids.f.id, "an overdue follow-up outranks everything");
  assert.ok(!idsShown.includes(ids.d.id), "booked is finished");
  assert.ok(items.every((item) => item.attention && item.attention.reasons.length > 0), "every entry explains why it is here");
  assert.ok(items[0].attention!.summary.toLowerCase().includes("overdue"));
  assert.equal(items[0].developerName, DEVELOPER_A.displayName);
});

// --- detail read model --------------------------------------------------------------------------

test("detail: first and latest touch stay separate; developers viewed are distinct and ordered", async () => {
  const repos = createInMemoryLeadRepositories({ [DEVELOPER_A.id]: DEVELOPER_A.displayName });
  const first = await captureAssistanceLead(repos, captureInput({ currentTouch: { sessionId: "session-1", landingPath: "/first", utmSource: "google", gclid: "G123" } }), T0);
  await captureAssistanceLead(
    repos,
    captureInput({ sessionId: "session-2", currentTouch: { sessionId: "session-2", landingPath: "/second", utmSource: "facebook", fbclid: "F456" } }),
    minutes(60),
  );

  const detail = await getLeadDetail(repos, first.lead.id, minutes(61));
  assert.ok(detail);
  assert.equal(detail.firstTouch?.landingPath, "/first");
  assert.equal(detail.firstTouch?.gclid, "G123");
  assert.equal(detail.lastTouch?.landingPath, "/second");
  assert.equal(detail.lastTouch?.fbclid, "F456");
  assert.notEqual(detail.firstTouch?.id, detail.lastTouch?.id);
  assert.deepEqual(detail.developersViewed, [DEVELOPER_A.displayName]);
  assert.equal(detail.developerName, DEVELOPER_A.displayName);
  assert.equal(detail.consents.length, 2);
  assert.equal(await getLeadDetail(repos, "00000000-0000-4000-8000-000000000000"), null);
});

// --- timeline wording and history integrity ----------------------------------------------------

test("timeline: every Stage 4 action reads clearly, in order, and notes appear only as detail", async () => {
  const { repos, lead } = await newLead();
  await setTemperature(repos, lead.id, "HOT", FOUNDER, minutes(1));
  await changeLeadStatus(repos, lead.id, "CONTACTED", FOUNDER, {}, minutes(2));
  await logContact(repos, lead.id, { channel: "PHONE_CALL", outcome: "NO_ANSWER" }, FOUNDER, minutes(3));
  await logContact(repos, lead.id, { channel: "WHATSAPP", outcome: "SENT", note: "Sent brochure" }, FOUNDER, minutes(4));
  await setFollowUp(repos, lead.id, hoursFrom(T0, 24), FOUNDER, minutes(5), { note: "Ask about budget" });
  await completeFollowUp(repos, lead.id, FOUNDER, minutes(6));
  await updateRequirement(repos, lead.id, { configuration: "2 BHK" }, FOUNDER, minutes(7));
  await addNote(repos, lead.id, "Wants east-facing", FOUNDER, minutes(8));
  await assignOwner(repos, lead.id, "staff_1", FOUNDER, minutes(9));

  const lines = describeTimeline(await getLeadTimeline(repos, lead.id));
  const headlines = lines.map((line) => line.headline);
  assert.ok(headlines.includes("Temperature: none → hot"));
  assert.ok(headlines.includes("Status: new → contacted"));
  assert.ok(headlines.includes("Call attempted — No answer"));
  assert.ok(headlines.includes("WhatsApp — Sent"));
  assert.ok(headlines.some((line) => line.startsWith("Follow-up scheduled — ")), "scheduled with its exact date and time");
  assert.ok(headlines.includes("Follow-up completed"));
  assert.ok(headlines.some((line) => line.startsWith("Requirement updated (configuration")));
  assert.ok(headlines.includes("Owner changed"));
  assert.equal(lines.find((line) => line.headline === "Note added")?.detail, "Wants east-facing");
  assert.equal(lines.find((line) => line.headline.startsWith("Follow-up scheduled"))?.detail, "Ask about budget");
  assert.equal(lines.find((line) => line.by === "You")?.by, "You");
  assert.equal(lines[0].by, "Buyer");
});

test("history: Stage 4 changes only ever append — earlier events are untouched", async () => {
  const { repos, lead } = await newLead();
  const before = await getLeadTimeline(repos, lead.id);
  await setTemperature(repos, lead.id, "HOT", FOUNDER, minutes(1));
  await assignOwner(repos, lead.id, "staff_1", FOUNDER, minutes(2));
  await setFollowUp(repos, lead.id, hoursFrom(T0, 5), FOUNDER, minutes(3));
  await completeFollowUp(repos, lead.id, FOUNDER, minutes(4));
  const after = await getLeadTimeline(repos, lead.id);
  assert.deepEqual(after.slice(0, before.length), before);
  assert.deepEqual(types(after).slice(before.length), ["TEMPERATURE_CHANGED", "OWNER_CHANGED", "FOLLOW_UP_SET", "FOLLOW_UP_COMPLETED"]);
});

test("erasure: notes, follow-up notes and owner ids do not survive; temperature and owner events keep only non-identifying values", async () => {
  const { repos, lead } = await newLead();
  await setTemperature(repos, lead.id, "HOT", FOUNDER, minutes(1));
  await setFollowUp(repos, lead.id, hoursFrom(T0, 5), FOUNDER, minutes(2), { note: "call about the loan" });
  await completeFollowUp(repos, lead.id, FOUNDER, minutes(3), { note: "private detail" });
  await eraseLead(repos, lead.id, FOUNDER, minutes(10));

  const serialised = JSON.stringify(await getLeadTimeline(repos, lead.id));
  assert.ok(!serialised.includes("call about the loan"));
  assert.ok(!serialised.includes("private detail"));
  assert.deepEqual(redactPayload("TEMPERATURE_CHANGED", { from: null, to: "HOT", extra: "x" }), { from: null, to: "HOT", redacted: true });
  assert.deepEqual(redactPayload("FOLLOW_UP_COMPLETED", { dueAt: "2026-10-06T00:00:00Z", note: "secret" }), { redacted: true });
});

test("erased lead: temperature, owner and follow-up changes are refused", async () => {
  const { repos, lead } = await newLead();
  await eraseLead(repos, lead.id, FOUNDER, minutes(10));
  await assert.rejects(() => setTemperature(repos, lead.id, "HOT", FOUNDER, minutes(11)), LeadStateError);
  await assert.rejects(() => assignOwner(repos, lead.id, "staff_1", FOUNDER, minutes(11)), LeadStateError);
  await assert.rejects(() => completeFollowUp(repos, lead.id, FOUNDER, minutes(11)), LeadStateError);
});
