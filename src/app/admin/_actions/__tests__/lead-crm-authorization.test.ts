import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Static security checks for the founder CRM (Stage 4). The actions and pages
 * import Clerk and Next.js server modules, which cannot load under
 * `node --test` (same constraint as authorization-boundary.test.ts), so these
 * read the source and assert the properties that keep private lead data
 * founder-only.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../../../"); // src
const read = (relative: string) => readFileSync(path.join(srcRoot, relative), "utf8");
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const actions = read("app/admin/_actions/lead-actions.ts");

test("lead actions: every exported action goes through run(), and run() authorizes the founder before anything else", () => {
  const exported = [...code(actions).matchAll(/export async function (\w+)\(/g)].map((match) => match[1]);
  assert.ok(exported.length >= 7, "the CRM actions exist");
  // The dialer and import actions return richer results than run() can (a call id, counts), so they authorize the
  // Founder THEMSELVES — as their very first statement, before any argument is looked at.
  const DIRECT = ["placeLeadCallAction", "getLeadCallStatusAction", "setLeadCallDispositionAction", "importLeadsAction"];
  for (const name of exported) {
    const body = code(actions).slice(code(actions).indexOf(`export async function ${name}(`));
    const end = body.indexOf("\nexport async function", 10);
    const text = end === -1 ? body : body.slice(0, end);
    if (DIRECT.includes(name)) {
      const open = text.indexOf("{");
      assert.match(text.slice(open + 1).trimStart(), /^const founderId = await requireFounderForAction\(\);/, `${name} must authorize the founder first`);
      continue;
    }
    assert.match(text, /return run\(leadId,/, `${name} must delegate to run()`);
  }
  for (const name of DIRECT) assert.ok(exported.includes(name), `${name} exists`);

  const runBody = code(actions).slice(code(actions).indexOf("async function run("));
  const auth = runBody.indexOf("requireFounderForAction()");
  assert.ok(auth !== -1, "run() calls requireFounderForAction");
  for (const later of ["UUID.test", "createPostgresLeadRepositories", "work("]) {
    assert.ok(runBody.indexOf(later) > auth, `${later} must come after the authorization check`);
  }
});

test("lead actions: the acting founder comes from the verified session, never from a client argument", () => {
  assert.doesNotMatch(code(actions), /actorId\s*:\s*(?!founderId)\S/, "actorId is only ever the verified founder id");
  for (const [, params] of code(actions).matchAll(/export async function \w+\(([^)]*)\)/g)) {
    assert.doesNotMatch(params, /actor|founder|userId|ownerId/i, `an action must not accept who is acting: (${params})`);
  }
});

test("lead actions: nothing deletes history — the ONLY removal is the founder's erasure of personal data, through one dedicated action", () => {
  const source = code(actions);
  assert.doesNotMatch(source, /\b(delete|destroy|truncate|redact)\w*\b/i, "no delete/destroy/truncate/redact anywhere in the CRM actions");
  // eraseLead is only reachable through the confirmation guard, and only from eraseLeadAction.
  assert.doesNotMatch(source, /\beraseLead\b/, "the raw eraseLead must not be called directly — use the confirmed wrapper");
  const callers = [...source.matchAll(/eraseLeadOnFounderRequest\(/g)];
  assert.equal(callers.length, 1, "exactly one call site for the erasure wrapper");
  const exportedErase = [...source.matchAll(/export async function (\w*[Ee]rase\w*)\(/g)].map((match) => match[1]);
  assert.deepEqual(exportedErase, ["eraseLeadAction"], "exactly one erasure action is exported");
  assert.match(source, /export async function eraseLeadAction\(leadId: string, confirmation: string\)[^]*?return run\(leadId,/, "erasure goes through run() — founder check first");
});

test("erasure: there is no public way in — no public action, page or API route can reach it, and only the CRM screen uses the action", () => {
  const allowed = new Set([
    "app/admin/_actions/lead-actions.ts",
    "lib/leads/erasure.ts",
    "lib/leads/lead-service.ts",
    "components/admin/leads/lead-erase-card.tsx",
  ]);
  const offenders = walk(srcRoot)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/__tests__|\.test\./.test(file))
    .filter((file) => /\b(eraseLead|eraseLeadOnFounderRequest|eraseLeadAction)\b/.test(code(readFileSync(file, "utf8"))))
    .map((file) => path.relative(srcRoot, file).split(path.sep).join("/"))
    .filter((file) => !allowed.has(file));
  assert.deepEqual(offenders, [], "erasure referenced outside its founder-only path");

  // The public gate actions must not expose it.
  assert.doesNotMatch(code(read("app/_actions/lead-gate-actions.ts")), /erase/i);
});

test("erasure screen: the card calls the founder action, needs the typed word, and the page shows it only to a founder for a lead that is not already erased", () => {
  const card = code(read("components/admin/leads/lead-erase-card.tsx"));
  assert.match(card, /eraseLeadAction\(leadId, typed\)/);
  assert.match(card, /disabled=\{!confirmed \|\| pending\}/, "the destructive button stays disabled until the word is typed");
  assert.doesNotMatch(card, /actorId|userId|founderId/i, "the browser never says who is acting");

  const page = code(read("app/admin/leads/[id]/page.tsx"));
  assert.match(page, /\{!erased && <LeadEraseCard leadId=\{lead\.id\} \/>\}/);
  assert.ok(page.indexOf("await requireFounder()") < page.indexOf("<LeadEraseCard"), "mounted only after founder authorization");
});

test("lead actions: errors returned to the browser are short messages, never raw errors", () => {
  assert.doesNotMatch(code(actions), /error\.stack|String\(error\)|JSON\.stringify\(error|console\./);
});

test("lead pages: each re-checks founder authorization itself, before reading any lead data", () => {
  for (const page of ["app/admin/leads/page.tsx", "app/admin/leads/[id]/page.tsx"]) {
    const source = code(read(page));
    const auth = source.indexOf("await requireFounder()");
    assert.ok(auth !== -1, `${page} must call requireFounder()`);
    for (const dataCall of ["createPostgresLeadRepositories()", "getLeadDetail(", "getLeadsPage(", "getAttentionItems(", "getLeadCounts("]) {
      const at = source.indexOf(dataCall);
      if (at !== -1) assert.ok(at > auth, `${page}: ${dataCall} must come after requireFounder()`);
    }
    assert.match(source, /export const dynamic = "force-dynamic"/, `${page} must never be cached or prerendered`);
  }
});

test("lead pages: not indexable, and the id in the URL is validated as a UUID before use", () => {
  for (const page of ["app/admin/leads/page.tsx", "app/admin/leads/[id]/page.tsx"]) {
    assert.match(read(page), /robots:\s*\{\s*index:\s*false/);
  }
  const detail = read("app/admin/leads/[id]/page.tsx");
  assert.match(detail, /UUID\.test\(id\)/);
  assert.match(detail, /notFound\(\)/);
});

test("proxy still gates every /admin route, which includes the CRM", () => {
  assert.match(read("proxy.ts"), /"\/admin\(\.\*\)"/);
});

test("CRM screens never reach analytics, logs or public routes", () => {
  const files = [
    ...walk(path.join(srcRoot, "components/admin/leads")),
    ...walk(path.join(srcRoot, "app/admin/leads")),
    path.join(srcRoot, "app/admin/_actions/lead-actions.ts"),
  ];
  assert.ok(files.length >= 8);
  for (const file of files) {
    const source = code(readFileSync(file, "utf8"));
    const label = path.relative(srcRoot, file);
    assert.doesNotMatch(source, /console\./, `${label} logs`);
    assert.doesNotMatch(source, /recordAnalytics|analytics-sink|trackEvent|gtag\(|posthog|sendBeacon/i, `${label} sends analytics`);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, `${label} injects HTML`);
  }
});

test("public surfaces never link to or expose the CRM: sitemap, robots, llms.txt and public components", () => {
  for (const file of ["lib/sitemap-entries.ts", "app/llms.txt/route.ts", "app/robots.ts"]) {
    try {
      assert.doesNotMatch(read(file), /admin\/leads/, `${file} mentions the CRM`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // components/admin, components/team and components/leads (shared by the two) are PRIVATE, session-gated areas. They
  // are held to their own, stricter guarantees in lib/team/__tests__/team-security.test.ts and
  // lib/leads/__tests__/requirements-security.test.ts (which also proves only private pages import components/leads).
  const publicFiles = walk(path.join(srcRoot, "components")).filter(
    (file) =>
      !file.includes(`${path.sep}admin${path.sep}`) &&
      !file.includes(`${path.sep}components${path.sep}team${path.sep}`) &&
      !file.includes(`${path.sep}components${path.sep}leads${path.sep}`) &&
      !file.includes("__tests__") &&
      /\.tsx?$/.test(file),
  );
  for (const file of publicFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /admin\/leads|lib\/leads\/lead-reads|lead-actions/, `${path.relative(srcRoot, file)} reaches the CRM`);
  }
});

test("lead detail: the whole timeline is rendered from stored events — there is no edit or delete control for history", () => {
  for (const file of ["components/admin/leads/lead-detail-sections.tsx", "components/admin/leads/lead-card.tsx"]) {
    assert.doesNotMatch(code(read(file)), /<button|<form|onClick|useState|"use client"/, `${file} must be read-only`);
  }
  const panel = code(read("components/admin/leads/lead-actions-panel.tsx"));
  assert.doesNotMatch(panel, /delete|erase|remove/i);
});

test("temperature, status and follow-up controls exist and call the matching founder actions", () => {
  const panel = read("components/admin/leads/lead-actions-panel.tsx");
  for (const action of [
    "setLeadTemperatureAction",
    "changeLeadStatusAction",
    "addLeadNoteAction",
    "logLeadContactAction",
  ]) {
    assert.ok(panel.includes(`${action}(`), `${action} is wired into the panel`);
  }
  // The buyer requirement moved out of the panel into its own section, wired on the lead page to the three
  // founder requirement actions (the legacy single-field editor is gone, so there is one source of truth).
  assert.doesNotMatch(panel, /updateLeadRequirementAction|Edit requirement/);
  const page = read("app/admin/leads/[id]/page.tsx");
  for (const action of ["createRequirementAction", "updateRequirementDetailsAction", "setRequirementStatusAction"]) {
    assert.ok(page.includes(`${action}.bind(null, lead.id)`), `${action} is wired into the founder lead page`);
  }
  // Follow-ups likewise live in their own section now (exact time, type, reschedule, cancel with a reason).
  for (const action of ["setLeadFollowUpAction", "rescheduleLeadFollowUpAction", "completeLeadFollowUpAction", "cancelLeadFollowUpAction"]) {
    assert.ok(page.includes(`${action}.bind(null, lead.id)`), `${action} is wired into the founder lead page`);
  }
  assert.doesNotMatch(panel, /setLeadFollowUpAction|completeLeadFollowUpAction/, "the panel no longer carries a date-only follow-up control");
  // Call/WhatsApp only RECORD an outcome once the founder taps one — opening the dialer alone logs nothing.
  assert.match(panel, /Only what you tap is recorded/);
  assert.match(panel, /onClick=\{\(\) => setChannel\(/);
});

test("mobile: inputs are 16px (no iOS zoom) and every control is at least 44px tall", () => {
  const panel = read("components/admin/leads/lead-actions-panel.tsx");
  assert.match(panel, /text-base/);
  assert.match(panel, /min-h-11/);
  assert.doesNotMatch(panel, /text-xs[^"]*\binput\b/);
});
