import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignmentStart, eventsFromAssignment } from "../lead-reads.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 14, 8, minutes));
let n = 0;
const ev = (eventType: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  id: `e${++n}`,
  eventType,
  createdAt: at(minutes),
  actorId: (extra.actorId as string | undefined) ?? null,
  payload: (extra.payload as Record<string, unknown> | undefined) ?? {},
});

test("history scope: an employee's trail starts the moment the lead was assigned to them", () => {
  const events = [
    ev("LEAD_CREATED", 0),
    ev("NOTE_ADDED", 5, { actorId: "founder-1", payload: { note: "Spoke to buyer on the phone" } }),
    ev("OWNER_CHANGED", 10, { actorId: "founder-1", payload: { from: null, to: "emp-1" } }),
    ev("NOTE_ADDED", 12, { actorId: "emp-1", payload: { note: "Called, wants 2 BHK" } }),
  ];
  assert.equal(assignmentStart(events as never, "emp-1")?.getTime(), at(10).getTime());
  const visible = eventsFromAssignment(events as never, "emp-1");
  assert.deepEqual(visible.map((e) => e.eventType), ["OWNER_CHANGED", "NOTE_ADDED"]);
  assert.ok(!visible.some((e) => e.payload.note === "Spoke to buyer on the phone"), "the Founder's earlier comment is not shown");
});

test("history scope: a lead reassigned to the same person shows from the latest assignment; another employee's earlier work is hidden", () => {
  const events = [
    ev("OWNER_CHANGED", 1, { payload: { from: null, to: "emp-2" } }),
    ev("NOTE_ADDED", 2, { actorId: "emp-2", payload: { note: "emp-2 comment" } }),
    ev("OWNER_CHANGED", 20, { payload: { from: "emp-2", to: "emp-1" } }),
    ev("NOTE_ADDED", 25, { actorId: "emp-1", payload: { note: "mine" } }),
  ];
  const mine = eventsFromAssignment(events as never, "emp-1");
  assert.deepEqual(mine.map((e) => e.payload.note ?? e.eventType), ["OWNER_CHANGED", "mine"]);
});

test("history scope: with no assignment record an employee sees only what they wrote themselves", () => {
  const events = [ev("LEAD_CREATED", 0), ev("NOTE_ADDED", 3, { actorId: "someone-else" }), ev("NOTE_ADDED", 4, { actorId: "emp-1", payload: { note: "mine" } })];
  assert.equal(assignmentStart(events as never, "emp-1"), null);
  assert.deepEqual(eventsFromAssignment(events as never, "emp-1").map((e) => e.payload.note), ["mine"]);
});

test("lead pages: short and quick; the removed sections live on the founder's details page; one trail; no note box, no suggestions", () => {
  const team = read("src/app/team/leads/[id]/page.tsx");
  const founder = read("src/app/admin/leads/[id]/page.tsx");
  for (const [name, page] of [["team", team], ["founder", founder]] as const) {
    assert.doesNotMatch(page, /LeadJourney|AttributionCard|ConsentCard|AuditCard|BookingsCard|FounderLeadBookings|TimelineCard/, `${name} lead page keeps the six removed sections off the screen`);
    assert.match(page, /<TrailCard /, `${name} lead page shows the single history trail`);
  }
  assert.match(founder, /\/admin\/leads\/\$\{lead\.id\}\/details/, "the founder reaches the removed sections from the lead");
  const details = read("src/app/admin/leads/[id]/details/page.tsx");
  for (const piece of ["requireFounder()", "FounderLeadBookings", "LeadJourney", "AttributionCard", "ConsentCard", "AuditCard", "TimelineCard"]) assert.ok(details.includes(piece), `details page has ${piece}`);
  for (const wrapper of ["src/app/team/_components/lead-projects-visits.tsx", "src/app/admin/leads/_components/lead-projects-visits.tsx"]) {
    const source = read(wrapper);
    assert.doesNotMatch(source, /NextStepCard|SiteVisitsSection/, `${wrapper}: no recommended-next-step card, no duplicate site-visit block`);
    assert.match(source, /ProjectsSection/);
  }
  assert.doesNotMatch(read("src/components/leads/follow-up-section.tsx"), /Tomorrow 10 AM|In 3 days|Next week/, "no quick-time suggestion chips");
  assert.doesNotMatch(read("src/components/team/team-lead-actions.tsx"), /Add a note|addMyLeadNoteAction/);
  assert.doesNotMatch(read("src/components/admin/leads/lead-actions-panel.tsx"), /Add a note/);
  assert.match(read("src/components/team/interaction-comment.tsx"), /label = "Comments"/);
  assert.match(read("src/lib/leads/lead-reads.ts"), /eventsFromAssignment\(/);
});

test("trail: leaves out bookkeeping, shows a note as a Comment with its day, date, time and year, newest first", () => {
  const source = read("src/components/admin/leads/lead-detail-sections.tsx");
  assert.match(source, /export function TrailCard/);
  for (const hidden of ["CONSENT_GIVEN", "CONTACT_PREFERENCE_SELECTED", "WHATSAPP_OPENED", "CALL_PLACED"]) assert.ok(source.includes(`"${hidden}"`), `${hidden} is hidden from the trail`);
  assert.match(source, /headline: "Comment"/);
  assert.match(source, /formatDateTimeWithDay\(line\.at\)/);
  assert.match(source, /\.reverse\(\)/);
});
