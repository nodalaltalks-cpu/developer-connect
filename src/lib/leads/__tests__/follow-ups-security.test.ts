import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Static guarantees for follow-up discipline: authorization is server-side and first, the restriction and the
 * missed detection live on the server, every resolution leaves an event, nothing public knows these screens exist,
 * and the migration is additive. These read source text, so a UI change cannot bypass them.
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

test("follow-ups security: every follow-up service operation checks identity BEFORE any read and ownership (+ the restriction) INSIDE the transaction", () => {
  const service = read("src/lib/leads/follow-up-service.ts");
  for (const name of ["scheduleFollowUp", "rescheduleFollowUp", "completeLeadFollowUp", "cancelLeadFollowUp", "returnLeadToFounder"]) {
    const body = functionBody(service, name);
    const identity = body.indexOf("assertWorkingActor(actor)");
    const firstRead = body.search(/repos\.transaction|tx\./);
    assert.ok(identity !== -1 && identity < firstRead, `${name}: identity first`);
    assert.match(body, /guardLeadAction\(tx, actor, lead, "(SET_FOLLOW_UP|COMPLETE_FOLLOW_UP|RETURN_LEAD)", now\)/, `${name}: ownership inside the transaction`);
  }
  const guard = service.slice(service.indexOf("export async function guardLeadAction"));
  assert.ok(guard.indexOf("assertMayAct(") < guard.indexOf("assertNotBlocked("), "ownership (not-found) is decided before the restriction message");
  assert.match(functionBody(service, "returnLeadToFounder"), /actor\.actorType !== "EMPLOYEE"\) \{\s*throw new UnauthorizedLeadActionError/, "only a team member returns a lead");
});

test("follow-ups security: the follow-up id must belong to THIS lead (IDOR), and a reason is mandatory for cancelling and returning", () => {
  const service = read("src/lib/leads/follow-up-service.ts");
  assert.match(service, /open\.id !== followUpId\)\) throw new LeadNotFoundError/);
  assert.match(functionBody(service, "completeLeadFollowUp"), /open\.id !== options\.followUpId\) throw new LeadNotFoundError/);
  assert.match(functionBody(service, "cancelLeadFollowUp"), /CANCEL_REASONS as readonly string\[\]\)\.includes\(reason\)/);
  assert.match(functionBody(service, "returnLeadToFounder"), /RETURN_REASONS as readonly string\[\]\)\.includes\(reason\)/);
});

test("follow-ups security: a missed follow-up cannot be dismissed — the reason-less clear is Founder-only and every employee path demands a reason", () => {
  const lead = read("src/lib/leads/lead-service.ts");
  const setFollowUp = functionBody(lead, "setFollowUp");
  assert.ok(setFollowUp.indexOf("assertFounder(actor)") !== -1 && setFollowUp.indexOf("assertFounder(actor)") < setFollowUp.indexOf("cancelLeadFollowUp("));
  const team = read("src/app/team/_actions/team-actions.ts");
  assert.doesNotMatch(team, /setFollowUp\(|NO_LONGER_NEEDED/, "no team action clears a follow-up without a reason");
});

test("follow-ups security: missed detection is server-side — no browser timer decides it, and the screens only display what the server computed", () => {
  const ui = read("src/components/leads/follow-up-section.tsx");
  assert.doesNotMatch(ui, /setInterval|setTimeout/, "no client timer");
  assert.doesNotMatch(ui, /_actions|lib\/leads\/db|requirement-service|follow-up-service|@clerk/, "no server code, no identity");
  assert.match(ui, /nowIso/, "overdue is shown relative to the server's now");
  const pg = read("src/lib/leads/db/postgres-repository.ts");
  assert.match(pg, /eq\(leadFollowUps\.status, "SCHEDULED"\),\s*lt\(leadFollowUps\.scheduledAt, now\)/, "the miss rule is in SQL: scheduled_at < now AND status = SCHEDULED");
  assert.match(pg, /\.update\(leadFollowUps\)[\s\S]*?status: "MISSED"[\s\S]*?\.returning\(\)/, "an atomic claim: only the statement that flips the row gets it back");
});

test("follow-ups security: timestamps are the server's — no action accepts a time for a historical event, and scheduled times are parsed in the business zone", () => {
  for (const rel of ["src/app/team/_actions/team-actions.ts", "src/app/admin/_actions/lead-actions.ts"]) {
    const source = read(rel);
    assert.match(source, /businessLocalToInstant\(scheduledAtLocal\)/, `${rel} parses the exact time server-side`);
    assert.doesNotMatch(source, /new Date\(dueAtIso\)|toISOString\(\)/, `${rel} does not trust a browser-built instant`);
    for (const name of source.match(/export async function (\w+)\(([^)]*)\)/g) ?? []) {
      assert.doesNotMatch(name, /\b(createdAt|completedAt|cancelledAt|timestamp|happenedAt|occurredAt)\b/i, `${name} must not take a historical time from the browser`);
    }
  }
});

test("follow-ups security: team and founder actions go through run() (identity first); the team actions take no actor/owner/staff from the browser", () => {
  const team = read("src/app/team/_actions/team-actions.ts");
  for (const name of ["setMyLeadFollowUpAction", "rescheduleMyLeadFollowUpAction", "completeMyLeadFollowUpAction", "cancelMyLeadFollowUpAction", "returnMyLeadAction"]) {
    const body = functionBody(team, name);
    assert.match(body, /return run\(leadId,/, `${name} goes through run()`);
    assert.doesNotMatch(body.slice(0, body.indexOf("{")), /actor|owner|staff|userId/i, `${name} takes no identity from the browser`);
  }
  const founder = read("src/app/admin/_actions/lead-actions.ts");
  for (const name of ["setLeadFollowUpAction", "rescheduleLeadFollowUpAction", "completeLeadFollowUpAction", "cancelLeadFollowUpAction"]) {
    assert.match(functionBody(founder, name), /return run\(leadId,/, `${name} goes through run() (founder first)`);
  }
  assert.ok(!/returnMyLeadAction|returnLeadToFounder/.test(founder), "the Founder reassigns, not 'returns'");
});

test("follow-ups security: the Founder's missed/returned pages and layout badges are founder-gated and noindex; the employee's missed page is employee-gated", () => {
  for (const rel of ["src/app/admin/missed-leads/page.tsx", "src/app/admin/returned-leads/page.tsx"]) {
    const text = read(rel);
    assert.ok(text.indexOf("await requireFounder()") !== -1, `${rel} requires the Founder`);
    assert.match(text, /robots: \{ index: false, follow: false \}/);
    assert.match(text, /export const dynamic = "force-dynamic"/);
  }
  const team = read("src/app/team/missed/page.tsx");
  assert.ok(team.indexOf("await requireEmployee()") !== -1);
  assert.doesNotMatch(team, /searchParams/, "a team member's scope never comes from the URL");
  const reads = read("src/lib/leads/follow-up-reads.ts");
  assert.match(reads, /const scope = isEmployee \? \{ ownerId: actor\.actorId! \}/, "an employee's missed list is always their own");
  assert.match(functionBody(reads, "getReturnedLeads"), /actor\.actorType !== "FOUNDER"/);
  assert.match(functionBody(reads, "getFounderAttention"), /actor\.actorType !== "FOUNDER"/);
});

test("follow-ups security: the notification path reuses the existing notification system and never puts a buyer's name or number in a notification", () => {
  const notifier = read("src/lib/leads/lead-notifier.ts");
  assert.match(notifier, /repo\.create\(/);
  const service = read("src/lib/leads/follow-up-service.ts");
  const notifications = [...service.matchAll(/(title|body): ("[^"]*"|`[^`]*`)/g)].map((m) => m[2]);
  assert.ok(notifications.length >= 6, "title and body of the missed, due-soon and returned notifications");
  for (const text of notifications) assert.doesNotMatch(text, /lead\.name|phone|email|\$\{lead/i, `notification text must not carry personal data: ${text}`);
  const types = read("src/lib/notifications/types.ts");
  for (const type of ["FOLLOW_UP_MISSED", "FOLLOW_UP_DUE", "LEAD_RETURNED", "LEAD_ASSIGNED"]) assert.ok(types.includes(`"${type}"`));
  assert.ok(!existsSync(path.join(root, "src/lib/leads/notification-service.ts")), "no second notification system");
});

test("follow-ups security: no public page, sitemap, llms.txt, header or footer references follow-up or returned-lead code", () => {
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
    assert.doesNotMatch(readFileSync(file, "utf8"), /follow-up-service|follow-up-reads|follow-up-section|missed-card|missed-leads|returned-leads|lead_follow_ups|leadFollowUps|\/team\/missed/, `${path.relative(root, file)} must not reference follow-up discipline`);
  }
});

test("migration 0020: additive, separate from 0017–0019, backfill is one INSERT … SELECT, and 0017 is untouched", () => {
  const dir = path.join(root, "src/lib/developer-connect/db/migrations");
  const sql = readFileSync(path.join(dir, "0020_phase2_follow_up_discipline.sql"), "utf8");
  assert.match(sql, /CREATE TABLE "lead_follow_ups"/);
  assert.match(sql, /lead_follow_ups_one_open_key/);
  for (const value of ["FOLLOW_UP_MISSED", "FOLLOW_UP_RESCHEDULED", "FOLLOW_UP_CANCELLED", "RETURNED_TO_FOUNDER", "FOLLOW_UP_DUE", "LEAD_RETURNED", "LEAD_ASSIGNED"]) assert.ok(sql.includes(`ADD VALUE '${value}'`), value);
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im, "no destructive or data-rewriting statement");
  const alters = [...sql.matchAll(/ALTER TABLE "(\w+)" (\w+)/g)].filter((m) => m[1] === "leads");
  assert.ok(alters.length === 3 && alters.every((m) => m[2] === "ADD"), "the only change to leads is three ADD COLUMNs");
  assert.deepEqual(sql.match(/INSERT INTO "(\w+)"/g), ['INSERT INTO "lead_follow_ups"']);
  for (const prefix of ["0017_", "0018_", "0019_"]) {
    const file = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(".sql"))!;
    assert.doesNotMatch(readFileSync(path.join(dir, file), "utf8"), /lead_follow_ups|returned_at/, `${file} must not contain 0020's changes`);
  }
  assert.doesNotMatch(sql, /neon|extension|pgcrypto/i);
});
