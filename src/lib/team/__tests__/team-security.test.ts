import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Static guarantees for the team workspace (/team): authorization is server-side and first, the owner scope never
 * comes from the browser, nothing founder-only is reachable from it, and nothing public knows it exists. These read
 * source text, so a UI change cannot bypass them.
 */

const root = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start !== -1, `${name} not found`);
  const next = source.indexOf("\nexport ", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const ACTIVITY_ACTIONS = [
  "addMyLeadNoteAction",
  "recordMyQualificationAction",
  "recordMyWhatsAppOpenedAction",
  "logMyLeadContactAction",
  "setMyLeadFollowUpAction",
  "rescheduleMyLeadFollowUpAction",
  "completeMyLeadFollowUpAction",
  "cancelMyLeadFollowUpAction",
  "returnMyLeadAction",
];
const REQUIREMENT_ACTIONS = ["createMyRequirementAction", "updateMyRequirementAction", "setMyRequirementStatusAction", "shortlistMyProjectAction", "removeMyShortlistAction", "scheduleMySiteVisitAction", "changeMySiteVisitAction"];
// The dialer actions return richer results than run() can (a call id, a call view), so they resolve the employee
// THEMSELVES as their first statement.
const DIALER_ACTIONS = ["placeMyCallAction", "prepareMyDeviceCallAction", "reportMyDeviceCallAction", "getMyCallStatusAction", "setMyCallDispositionAction", "lookupMyColdCallNumberAction", "prepareMyColdCallAction", "saveMyColdCallLeadAction", "searchMyProjectsAction", "skipMyQueueLeadAction"];
const TEAM_ACTIONS = [...ACTIVITY_ACTIONS, ...REQUIREMENT_ACTIONS, ...DIALER_ACTIONS];

test("team security: every team action resolves the signed-in employee FIRST (through run()), and run() does so before any input or data", () => {
  const source = read("src/app/team/_actions/team-actions.ts");
  assert.match(source, /^"use server";/);
  const run = source.slice(source.indexOf("async function run("), source.indexOf("export async function addMyLeadNoteAction"));
  assert.ok(run.indexOf("await requireEmployeeForAction()") !== -1);
  assert.ok(run.indexOf("requireEmployeeForAction()") < run.indexOf("UUID.test"), "authorization before input checks");
  assert.ok(run.indexOf("requireEmployeeForAction()") < run.indexOf("work(actor"), "authorization before any work");
  for (const name of TEAM_ACTIONS.filter((n) => !DIALER_ACTIONS.includes(n))) assert.match(functionBody(source, name), /return run\(leadId,/, `${name} goes through run()`);
  for (const name of DIALER_ACTIONS) {
    const body = functionBody(source, name);
    assert.match(body.slice(body.indexOf("{") + 1).trimStart(), /^const \{ actor \} = await requireEmployeeForAction\(\);/, `${name} resolves the employee first`);
  }
  // The actor comes from the session. No exported action accepts who/owner/staff from the browser.
  const exported = [...source.matchAll(/export async function (\w+)\(([^)]*)\)/g)];
  assert.deepEqual(exported.map((m) => m[1]).sort(), [...TEAM_ACTIONS].sort(), "exactly the activity, follow-up, return and requirement actions are exported");
  for (const [, name, args] of exported) assert.doesNotMatch(args, /actor|owner|staff|userId/i, `${name} must not take identity from the caller`);
});

test("team security: the team actions can only do the four activities and the requirement workflow — no founder-only operation is imported", () => {
  const source = read("src/app/team/_actions/team-actions.ts");
  const imported = source.match(/import \{([^}]*)\} from "@\/lib\/leads\/lead-service"/)![1].split(",").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(imported.filter((n) => !n.startsWith("type ")).sort(), ["addNote", "logContact"]);
  const followUpOps = source.match(/import \{([^}]*)\} from "@\/lib\/leads\/follow-up-service"/)![1].split(",").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(followUpOps.sort(), ["cancelLeadFollowUp", "completeLeadFollowUp", "rescheduleFollowUp", "returnLeadToFounder", "scheduleFollowUp"]);
  const requirementOps = source.match(/import \{([^}]*)\} from "@\/lib\/leads\/requirement-service"/)![1].split(",").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(requirementOps.sort(), ["createRequirement", "setRequirementStatus", "updateRequirementDetails"]);
  // updateRequirement (the legacy single-field editor) and every founder-only operation stay out of reach.
  assert.doesNotMatch(source, /lead-actions|staff-actions|requireFounder|assignLead|changeLeadStatus|setTemperature|\bupdateRequirement\b|createBooking|eraseLead/);
});

test("team security: employee pages and components never import founder actions or founder-only screens", () => {
  const files = [...walk(path.join(root, "src/app/team")), ...walk(path.join(root, "src/components/team"))];
  assert.ok(files.length >= 5);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = path.relative(root, file);
    assert.doesNotMatch(text, /admin\/_actions|requireFounder|lead-actions-panel|lead-owner-card|lead-erase-card|staff-manager|staff-actions|admin-nav/, `${rel} must not reach founder-only code`);
    assert.doesNotMatch(text, /BookingsCard|ConsentCard|AttributionCard|AuditCard|getLeadDetail\(|getLeadsPage\(|getAttentionItems|getLeadCounts/, `${rel} must not use founder read models`);
  }
});

test("team security: every /team page and the layout resolve the employee on the server, and the owner scope never comes from the URL", () => {
  for (const rel of ["src/app/team/layout.tsx", "src/app/team/page.tsx", "src/app/team/leads/[id]/page.tsx"]) {
    const text = read(rel);
    const gate = rel.endsWith("layout.tsx") ? "await getTeamAccess(" : "await requireEmployee()";
    assert.ok(text.indexOf(gate) !== -1, `${rel} must call ${gate}`);
    assert.match(text, /robots: \{ index: false, follow: false \}/, `${rel} noindex`);
  }
  const page = read("src/app/team/page.tsx");
  assert.match(page, /getMyLeadsPage\(repos, actor,/, "the list is scoped by the verified actor");
  assert.match(page, /getMyWorkState\(repos, actor,/, "the work queue is scoped by the verified actor");
  assert.doesNotMatch(page, /params\.(owner|staff)|params\[["'](owner|staff)/i);
  assert.doesNotMatch(read("src/app/team/leads/[id]/page.tsx"), /searchParams|getLeadDetail\(/);
});

test("team security: the session helper resolves from the Clerk session only, and denies unknown/inactive/founder alike", () => {
  const session = read("src/lib/team/session.ts");
  assert.match(session, /await auth\(\)/);
  assert.match(session, /resolveEmployeeOrClaim\(createPostgresStaffRepository\(\), userId, verifiedEmails\)/);
  assert.match(session, /if \(!employee\) notFound\(\)/);
  assert.match(session, /if \(!employee\) throw new NotATeamMemberError/);
  const access = read("src/lib/staff/employee-access.ts");
  assert.doesNotMatch(access, /from "(next|@clerk)[^"]*"/, "the resolver stays framework-free and testable");
});

test("team security: /team is behind the sign-in gate, disallowed in robots, and absent from the sitemap, llms.txt and public pages", () => {
  assert.match(read("src/proxy.ts"), /createRouteMatcher\(\[[^\]]*"\/team\(\.\*\)"/);
  assert.match(read("src/app/robots.ts"), /disallow: \[[^\]]*"\/team"/);
  const publicFiles = [
    ...walk(path.join(root, "src/app/(marketing)")),
    ...["src/app/developers", "src/app/faq", "src/app/privacy", "src/app/terms", "src/app/contact", "src/app/about", "src/app/buy-direct-from-developer"].flatMap((d) =>
      existsSync(path.join(root, d)) ? walk(path.join(root, d)) : [],
    ),
    path.join(root, "src/components/site-header.tsx"),
    path.join(root, "src/components/site-footer.tsx"),
    path.join(root, "src/app/llms.txt/route.ts"),
  ];
  for (const file of publicFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /["'`]\/team\b|lib\/team|app\/team|components\/team|getMyLead/, `${path.relative(root, file)} must not reference the team workspace`);
  }
  const sitemapFiles = ["src/app/sitemap.xml", "src/app/sitemap.ts"].filter((rel) => existsSync(path.join(root, rel)));
  for (const rel of sitemapFiles) {
    const files = statSync(path.join(root, rel)).isDirectory() ? walk(path.join(root, rel)) : [path.join(root, rel)];
    for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), /\/team\b/, `${rel} must not list /team`);
  }
});

test("team security: the founder navigation is untouched by the team workspace, and the team layout never renders founder navigation", () => {
  assert.doesNotMatch(read("src/components/admin/admin-nav.tsx"), /\/team\b/);
  assert.doesNotMatch(read("src/app/team/layout.tsx"), /AdminNav|admin\//);
  assert.match(read("src/app/admin/layout.tsx"), /await requireFounder\(\)/, "the founder layout still gates /admin");
});

test("team security: the owner-scoped list ANDs the owner onto every view in SQL, and the reads take the owner from the actor", () => {
  const pg = read("src/lib/leads/db/postgres-repository.ts");
  assert.match(pg, /query\.ownerId === undefined \? rules : and\(eq\(leads\.ownerId, query\.ownerId\), rules\)/);
  const reads = read("src/lib/leads/lead-reads.ts");
  const body = reads.slice(reads.indexOf("export async function getMyLeadsPage"));
  assert.match(body, /ownerId: actor\.actorId/);
  assert.match(body, /actor\.actorType !== "EMPLOYEE"/);
});

test("team security: the team workspace itself added no migration — 0018 is still the staff foundation; later Phase 2 steps add 0019, 0020, 0021, 0022 and 0023 only", () => {
  const dir = path.join(root, "src/lib/developer-connect/db/migrations");
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(sql.includes("0018_phase2_staff_foundation.sql"));
  const from = sql.indexOf("0018_phase2_staff_foundation.sql");
  // Later phases add migrations after these; the Phase 2 chain itself must stay exactly this and in order.
  assert.deepEqual(sql.slice(from, from + 6), ["0018_phase2_staff_foundation.sql", "0019_phase2_buyer_requirements.sql", "0020_phase2_follow_up_discipline.sql", "0021_phase2_dialer_and_lead_source.sql", "0022_phase2a_mobile_sim_calling.sql", "0023_phase4_projects_site_visits.sql"]);
});
