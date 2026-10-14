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
  for (const page of [team, founder]) {
    assert.doesNotMatch(page, /NextStepCard|SiteVisitsSection|ProjectsSection|ProjectsAndVisits/, "no separate Projects card, no recommended-next-step card, no duplicate site-visit block");
    assert.match(page, /<RequirementSection/);
    assert.match(page, /searchProjects=\{/, "the project is chosen inside the buyer requirement");
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
  assert.match(source, /entry\.comment/, "a note is shown as the comment of its entry");
  assert.match(source, /formatDateTimeWithDay\(entry\.at\)/);
  assert.match(source, /entries\.reverse\(\)/);
  assert.match(source, /<details open=\{defaultOpen\}>/, "folded away until tapped");
  assert.match(source, /SAVE_WINDOW_MS/, "one save is one entry, not a line per field");
});

test("missed leads: one name everywhere (no separate 'overdue'), tiles open the list they count, hot/warm/cold is the lead status", () => {
  const founderLeads = read("src/app/admin/leads/page.tsx");
  assert.match(founderLeads, /label="Missed leads"/);
  assert.doesNotMatch(founderLeads, /Overdue follow-ups|No overdue follow-ups/);
  for (const view of ["all", "new", "hot", "warm", "cold", "overdue", "due_today", "qualified"]) assert.ok(founderLeads.includes(`tileHref("${view}")`), `${view} tile is a link`);
  assert.match(founderLeads, /id="lead-list"/);
  assert.match(read("src/components/admin/stat-tile.tsx"), /href\?: string/);
  const today = read("src/components/team/today-panel.tsx");
  assert.match(today, /label="Missed leads"/);
  assert.doesNotMatch(today, /label="Missed"/);
  assert.match(read("src/app/team/page.tsx"), /id="my-leads-list"/);
  assert.match(read("src/components/admin/leads/leads-view-tabs.tsx"), /overdue: "Missed leads"/);
  const panel = read("src/components/admin/leads/lead-actions-panel.tsx");
  assert.match(panel, /<Section title="Lead status">/);
  assert.doesNotMatch(panel, /<Section title="Temperature">|Clear temperature/);
  for (const file of ["src/app/admin/leads/[id]/page.tsx", "src/app/team/leads/[id]/page.tsx", "src/components/admin/leads/lead-card.tsx"]) {
    assert.doesNotMatch(read(file), /Follow-up overdue/, `${file} says Missed, not overdue`);
  }
});

test("erased leads: follow-ups of an erased lead are not counted as created or completed", () => {
  const sql = read("src/lib/leads/db/postgres-repository.ts");
  const stats = sql.slice(sql.indexOf("async statsByStaff(from, to, now)"), sql.indexOf("async eraseForLead(leadId) {\n        await db.update(leadFollowUps)"));
  assert.equal((stats.match(/liveLead/g) ?? []).length, 3, "created, completed and missed all exclude erased leads");
  assert.match(read("src/lib/leads/memory-repository.ts"), /const live = !!owner && !owner\.erasedAt && !owner\.prospect;/);
});

test("requirement with projects: at least one project is required, and the founder can see leads project by project", () => {
  const service = read("src/lib/leads/project-service.ts");
  assert.match(service, /export async function saveRequirementWithProjects/);
  assert.match(service, /ids\.length === 0\) throw new LeadValidationError\("projects", PROJECT_REQUIRED_MESSAGE\)/);
  assert.match(service, /advanceStatus: false/, "choosing a project does not move the lead's status");
  assert.match(read("src/components/leads/requirement-section.tsx"), /Add at least one project/);
  assert.match(read("src/app/team/_actions/team-actions.ts"), /saveRequirementWithProjects\(createPostgresLeadRepositories\(\), leadId, requirementId, input, projectIds, actor\)/);
  assert.match(read("src/app/admin/projects/page.tsx"), /countActiveByProject\(\)/);
  assert.match(read("src/app/admin/projects/[id]/page.tsx"), /requireFounder\(\)/);
  assert.match(read("src/lib/leads/timeline.ts"), /Lead status: /, "history says lead status, not temperature");
});

test("real time: every lead-driven dashboard screen refreshes itself, and the overview shows the leads", () => {
  for (const page of [
    "src/app/admin/page.tsx", "src/app/admin/leads/page.tsx", "src/app/admin/leads/[id]/page.tsx", "src/app/admin/missed-leads/page.tsx",
    "src/app/admin/returned-leads/page.tsx", "src/app/admin/staff/page.tsx", "src/app/admin/employee-insights/page.tsx", "src/app/admin/finance/page.tsx",
    "src/app/admin/projects/page.tsx", "src/app/admin/ratings/page.tsx", "src/app/team/page.tsx", "src/app/team/leads/[id]/page.tsx",
  ]) assert.match(read(page), /<LiveRefresh \/>/, `${page} refreshes live`);
  assert.match(read("src/app/admin/page.tsx"), /getLeadCounts\(/);
  assert.match(read("src/app/api/live/route.ts"), /latestRatedAt\(\)/, "a new rating moves the live cursor");
});
