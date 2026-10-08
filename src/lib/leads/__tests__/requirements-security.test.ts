import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Static guarantees for the buyer-requirement feature: authorization is in the service and first, the actions are
 * server-side and gated, nothing public knows requirements exist, the migration is additive and separate from 0017,
 * the matching foundation has no score, and the code stays PostgreSQL-portable. These read source text, so a UI
 * change cannot bypass them.
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

const SERVICE_OPS = ["createRequirement", "updateRequirementDetails", "setRequirementStatus"];

test("requirements security: every service operation checks the actor's identity BEFORE any read, and ownership INSIDE the transaction", () => {
  const service = read("src/lib/leads/requirement-service.ts");
  for (const name of SERVICE_OPS) {
    const body = functionBody(service, name);
    const identity = body.indexOf("assertWorkingActor(actor)");
    const firstRead = body.search(/repos\.transaction|tx\./);
    assert.ok(identity !== -1, `${name} must run the identity gate`);
    assert.ok(identity < firstRead, `${name} must check who is acting before reading anything`);
    assert.ok(body.indexOf("loadLeadFor(tx, actor, leadId, now)") > firstRead, `${name}: the ownership check needs the lead, so it runs inside the transaction`);
  }
  const loader = service.slice(service.indexOf("async function loadLeadFor"), service.indexOf("async function loadRequirementOf"));
  assert.match(loader, /guardLeadAction\(tx, actor, lead, "MANAGE_REQUIREMENT", now\)/);
  assert.ok(loader.indexOf("guardLeadAction") < loader.indexOf("lead.erasedAt"), "a lead the employee may not see is NotFound before any erased-state message");
  assert.match(service.slice(service.indexOf("async function loadRequirementOf")), /requirement\.leadId !== leadId\) throw new LeadNotFoundError/, "a requirement must belong to THIS lead (IDOR)");
});

test("requirements security: the employee capability is exactly the requirement workflow, and nothing founder-only was opened", () => {
  const access = read("src/lib/leads/lead-access.ts");
  assert.match(access, /EMPLOYEE_CAPABILITIES = \["ADD_NOTE", "LOG_CONTACT", "SET_FOLLOW_UP", "COMPLETE_FOLLOW_UP", "MANAGE_REQUIREMENT", "RETURN_LEAD", "PLACE_CALL", "SHORTLIST_PROJECT", "MANAGE_SITE_VISIT", "QUALIFY_LEAD"\] as const/);
  const lead = read("src/lib/leads/lead-service.ts");
  assert.match(functionBody(lead, "updateRequirement"), /actor\.actorType === "EMPLOYEE"\) throw new UnauthorizedLeadActionError/, "the legacy editor stays closed to employees");
  for (const name of ["changeLeadStatus", "setTemperature", "assignLead", "createBooking", "updateBooking", "eraseLead"]) {
    assert.match(functionBody(lead, name), /assertFounder\(/, `${name} stays founder-only`);
  }
});

test("requirements security: founder requirement actions go through run() (founder check first) and take the requirement id from arguments only to be re-validated", () => {
  const source = read("src/app/admin/_actions/lead-actions.ts");
  const run = source.slice(source.indexOf("async function run("), source.indexOf("export async function setLeadTemperatureAction"));
  assert.ok(run.indexOf("requireFounderForAction()") < run.indexOf("work("));
  for (const name of ["createRequirementAction", "updateRequirementDetailsAction", "setRequirementStatusAction"]) {
    assert.match(functionBody(source, name), /return run\(leadId,/, `${name} goes through run()`);
  }
});

test("requirements security: team requirement actions go through run() (employee resolved first); no client-supplied identity", () => {
  const source = read("src/app/team/_actions/team-actions.ts");
  const run = source.slice(source.indexOf("async function run("), source.indexOf("export async function addMyLeadNoteAction"));
  assert.ok(run.indexOf("requireEmployeeForAction()") < run.indexOf("work(actor"));
  for (const name of ["createMyRequirementAction", "updateMyRequirementAction", "setMyRequirementStatusAction"]) {
    const body = functionBody(source, name);
    assert.match(body, /return run\(leadId,/);
    assert.doesNotMatch(body.slice(0, body.indexOf("{")), /actor|owner|staff|userId/i, `${name} takes no identity from the browser`);
  }
});

test("requirements security: the shared requirement UI imports no server actions and no storage — the page passes the actions in", () => {
  const ui = read("src/components/leads/requirement-section.tsx");
  assert.doesNotMatch(ui, /_actions|lib\/leads\/db|memory-repository|requirement-service|@clerk|next\/headers/);
  assert.match(ui, /^"use client";/);
  for (const [page, actions] of [
    ["src/app/admin/leads/[id]/page.tsx", ["createRequirementAction", "updateRequirementDetailsAction", "setRequirementStatusAction"]],
    ["src/app/team/leads/[id]/page.tsx", ["createMyRequirementAction", "updateMyRequirementAction", "setMyRequirementStatusAction"]],
  ] as const) {
    const text = read(page);
    for (const action of actions) assert.ok(text.includes(`${action}.bind(null, lead.id)`), `${page} binds ${action} to its own lead`);
  }
});

test("requirements security: no public page, sitemap, llms.txt, header or footer references requirements", () => {
  const publicFiles = [
    ...walk(path.join(root, "src/app/(marketing)")),
    ...["src/app/developers", "src/app/faq", "src/app/privacy", "src/app/terms", "src/app/contact", "src/app/about", "src/app/buy-direct-from-developer"].flatMap((d) =>
      existsSync(path.join(root, d)) ? walk(path.join(root, d)) : [],
    ),
    path.join(root, "src/components/site-header.tsx"),
    path.join(root, "src/components/site-footer.tsx"),
    path.join(root, "src/app/llms.txt/route.ts"),
    path.join(root, "src/app/robots.ts"),
  ];
  for (const file of publicFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /requirement-section|requirement-service|requirement-view|lead_requirements|leadRequirements|toMatchableRequirement/, `${path.relative(root, file)} must not reach requirement data`);
  }
  // Only the two private areas (and the lib) may use the shared section.
  const users = walk(path.join(root, "src")).filter((f) => /from "@\/components\/leads\/requirement-section"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(users.map((f) => path.relative(root, f).replaceAll("\\", "/")).sort(), ["src/app/admin/leads/[id]/page.tsx", "src/app/team/leads/[id]/page.tsx"]);
  // components/leads is shared by the two private areas only: nothing public imports from it.
  const sharedUsers = walk(path.join(root, "src")).filter((f) => /from "@\/components\/leads\//.test(readFileSync(f, "utf8")));
  for (const file of sharedUsers) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    assert.ok(/^src\/app\/(admin|team)\//.test(rel) || /^src\/components\/(admin|team|leads)\//.test(rel), `${rel} must not use the shared private components`);
  }
});

test("requirements security: event payloads are built from ids, enums, numbers and field names only — never locations or notes", () => {
  const service = read("src/lib/leads/requirement-service.ts");
  const payloads = [...service.matchAll(/appendEvent\(tx, leadId, "(\w+)", actor, now, (\{[\s\S]*?\})\);/g)];
  assert.equal(payloads.length, 4, "create, supersede-close, update, status change");
  for (const [, type, payload] of payloads) {
    assert.doesNotMatch(payload, /locations?\b(?!:\s*\{\s*changed)|notes\b(?!:\s*\{\s*changed)/, `${type} payload must not carry location or notes text`);
  }
  assert.match(service, /fields\.notes = \{ changed: true \}/);
  assert.match(service, /fields\.locations = \{ changed: true \}/);
});

test("matching foundation: types and a data-preparation helper only — no engine, no score, no percentage, no storage or framework imports", () => {
  const matching = read("src/lib/leads/matching.ts");
  assert.doesNotMatch(matching, /from "(?!\.\/)[^"]+"/, "no external imports");
  const code = matching.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /repository|postgres|drizzle|next\/|@clerk/i, "no storage or framework in the matching contract");
  assert.doesNotMatch(code, /\bscore\b|percent|probability|confidence/i, "no scoring vocabulary outside comments");
  assert.doesNotMatch(code, /fetch\(|await /, "no I/O");
  assert.match(matching, /export interface RequirementMatcher<Project>/);
});

test("migration: 0019 is additive, separate from 0017/0018, never touches production data destructively, and 0017 is untouched", () => {
  const dir = path.join(root, "src/lib/developer-connect/db/migrations");
  const sql = readFileSync(path.join(dir, "0019_phase2_buyer_requirements.sql"), "utf8");
  assert.match(sql, /CREATE TABLE "lead_requirements"/);
  assert.match(sql, /CREATE TABLE "lead_requirement_locations"/);
  assert.match(sql, /lead_requirements_one_active_key/);
  assert.match(sql, /ADD VALUE 'REQUIREMENT_CREATED'/);
  assert.match(sql, /ADD VALUE 'REQUIREMENT_STATUS_CHANGED'/);
  // Statement-level checks (the generated foreign keys legitimately contain "ON DELETE" / "ON UPDATE").
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im, "no destructive or data-rewriting statement");
  assert.doesNotMatch(sql, /ALTER TABLE "(leads|lead_events|bookings|staff_members|lead_consents|marketing_touches)"/i, "no existing table is altered");
  // The only data statements are the two INSERT ... SELECT backfills, both reading from leads.
  const inserts = sql.match(/INSERT INTO "(\w+)"/g) ?? [];
  assert.deepEqual(inserts, ['INSERT INTO "lead_requirements"', 'INSERT INTO "lead_requirement_locations"']);
  const m17 = readdirSync(dir).filter((f) => /^0017_.*\.sql$/.test(f));
  assert.equal(m17.length, 1);
  assert.doesNotMatch(readFileSync(path.join(dir, m17[0]), "utf8"), /lead_requirement|staff_members/, "0017 must not contain later changes");
  assert.doesNotMatch(readFileSync(path.join(dir, "0018_phase2_staff_foundation.sql"), "utf8"), /lead_requirement/, "0018 must not contain Step 3 changes");
});

test("portability: the requirement code uses standard PostgreSQL only — no Neon-specific application logic, no Firebase", () => {
  const files = [
    "src/lib/leads/requirement-service.ts",
    "src/lib/leads/requirement-locations.ts",
    "src/lib/leads/requirement-view.ts",
    "src/lib/leads/matching.ts",
    "src/lib/leads/db/postgres-repository.ts",
    "src/components/leads/requirement-section.tsx",
  ];
  for (const rel of files) {
    assert.doesNotMatch(read(rel), /@neondatabase|neon\.tech|neon_|firebase|firestore/i, `${rel} must stay provider-neutral`);
  }
  assert.doesNotMatch(read("src/lib/developer-connect/db/migrations/0019_phase2_buyer_requirements.sql"), /neon|extension|pgcrypto/i);
  assert.match(read("src/lib/developer-connect/db/migrations/0019_phase2_buyer_requirements.sql"), /gen_random_uuid\(\)/, "built-in since PostgreSQL 13");
});
