import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Static guarantees for the Phase 2 (team / ownership) surface: authorization is server-side and first, nothing is
 * exposed publicly, the migration is additive and separate from Stage 5's, and the team code stays clear of
 * analytics and personal-data tooling. These read source text — they cannot be bypassed by a UI change.
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

test("security: every team server action checks the Founder FIRST, before any input or data is touched", () => {
  const staffActions = read("src/app/admin/_actions/staff-actions.ts");
  assert.match(staffActions, /^"use server";/);
  for (const name of ["addStaffMemberAction", "setStaffActiveAction"]) {
    const body = functionBody(staffActions, name);
    const guard = body.indexOf("await requireFounderForAction()");
    assert.ok(guard !== -1, `${name} has no founder guard`);
    assert.ok(guard < body.search(/findClerkUserByEmail|createPostgresStaffRepository|addStaffMember\(|setStaffActive\(/), `${name}: guard must come first`);
  }

  const leadActions = read("src/app/admin/_actions/lead-actions.ts");
  const run = leadActions.slice(leadActions.indexOf("async function run("), leadActions.indexOf("export async function setLeadTemperatureAction"));
  assert.ok(run.indexOf("requireFounderForAction()") < run.indexOf("work("), "assignLeadAction goes through run(), which checks the founder first");
  assert.match(functionBody(leadActions, "assignLeadAction"), /return run\(leadId,/);
});

test("security: the team pages are founder-gated and never indexed", () => {
  const page = read("src/app/admin/staff/page.tsx");
  assert.ok(page.indexOf("await requireFounder()") !== -1);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
});

test("security: no public page, sitemap or llms.txt knows the team exists", () => {
  const publicFiles = [
    ...walk(path.join(root, "src/app/(marketing)")),
    ...["src/app/developers", "src/app/faq", "src/app/privacy", "src/app/terms"].flatMap((d) => (existsSync(path.join(root, d)) ? walk(path.join(root, d)) : [])),
    path.join(root, "src/components/site-header.tsx"),
    path.join(root, "src/components/site-footer.tsx"),
  ];
  for (const file of publicFiles) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /lib\/staff|staff-actions|admin\/staff|staffMembers|authorizeStaffActor/, `${path.relative(root, file)} must not reference the team`);
  }
  for (const rel of ["src/app/sitemap.ts", "src/app/llms.txt/route.ts", "src/app/robots.ts"]) {
    if (existsSync(path.join(root, rel))) assert.doesNotMatch(read(rel), /admin\/staff|\/staff\b/i, rel);
  }
});

test("security: the team module stays framework-free and away from analytics and buyer personal data", () => {
  for (const file of walk(path.join(root, "src/lib/staff"))) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /from "(next|@clerk)[^"]*"/, `${path.relative(root, file)} must not import a framework or Clerk`);
    assert.doesNotMatch(text, /admin-analytics|phoneE164|developer-intelligence/, `${path.relative(root, file)} must not touch analytics or phone numbers`);
  }
  const access = read("src/lib/leads/lead-access.ts");
  assert.doesNotMatch(access, /from "(next|@clerk)[^"]*"/);
});

test("security: Clerk email lookup lives only in the founder-only action, and requires exactly one match", () => {
  const users = walk(path.join(root, "src")).filter((f) => readFileSync(f, "utf8").includes("findClerkUserByEmail"));
  const rel = users.map((f) => path.relative(root, f).replaceAll("\\", "/")).sort();
  assert.deepEqual(rel, ["src/app/admin/_actions/staff-actions.ts", "src/lib/admin-analytics/clerk-users.ts"]);
  assert.match(read("src/lib/admin-analytics/clerk-users.ts"), /users\.length !== 1\) return null/);
});

test("migration: 0018 is additive, separate from 0017, and 0017 is untouched", () => {
  const dir = path.join(root, "src/lib/developer-connect/db/migrations");
  const sql = readFileSync(path.join(dir, "0018_phase2_staff_foundation.sql"), "utf8");
  assert.doesNotMatch(sql, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|ALTER TABLE[^;]*(DROP|ALTER COLUMN|RENAME)|UPDATE\s/i, "no destructive or data-rewriting statement");
  assert.match(sql, /CREATE TABLE "staff_members"/);
  assert.match(sql, /ADD VALUE 'EMPLOYEE'/);
  assert.match(sql, /CREATE INDEX "leads_owner_idx"/);
  const names = readdirSync(dir).filter((f) => /^0017_.*\.sql$/.test(f));
  assert.equal(names.length, 1);
  assert.doesNotMatch(readFileSync(path.join(dir, names[0]), "utf8"), /staff_members|leads_owner_idx|EMPLOYEE/, "0017 must not contain Phase 2 changes");
});

test("security: an employee can never reach the buyer-side or founder-only paths through the actor type", () => {
  const service = read("src/lib/leads/lead-service.ts");
  assert.match(functionBody(service, "updateRequirement"), /actor\.actorType === "EMPLOYEE"\) throw new UnauthorizedLeadActionError/);
  const staff = read("src/lib/staff/staff-service.ts");
  const builders = staff.match(/actorType: "EMPLOYEE"/g) ?? [];
  assert.equal(builders.length, 1, "exactly one place builds an EMPLOYEE actor: authorizeStaffActor");
  const everywhere = walk(path.join(root, "src")).filter((f) => /actorType: "EMPLOYEE"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(everywhere.map((f) => path.relative(root, f).replaceAll("\\", "/")), ["src/lib/staff/staff-service.ts"]);
});
