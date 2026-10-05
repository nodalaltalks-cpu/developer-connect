import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static guards for the architectural promises of the lead system. They read
 * source files rather than run code, so they keep protecting the boundaries
 * even when a future change would still compile and pass behavioural tests.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const leadsRoot = path.resolve(here, ".."); // src/lib/leads
const srcRoot = path.resolve(here, "../../.."); // src

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function listFiles(dir: string, accept: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, accept));
    else if (accept(full)) out.push(full);
  }
  return out;
}

const leadSources = listFiles(leadsRoot, (file) => file.endsWith(".ts") && !file.includes(`${path.sep}__tests__${path.sep}`));

/** Strips line and block comments so a rule is checked against code, not prose. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// --- privacy: nothing here logs ----------------------------------------------------------------

test("privacy: the lead library never logs (phones, emails and notes pass through this code)", () => {
  for (const file of leadSources) {
    assert.doesNotMatch(code(read(file)), /\bconsole\s*\./, `${path.relative(srcRoot, file)} must not call console.*`);
  }
});

// --- isolation: the lead system is framework-free and apart from verification ------------------

test("isolation: the lead domain imports no Clerk, Next.js or React (authorization lives in the caller)", () => {
  for (const file of leadSources) {
    const source = code(read(file));
    assert.doesNotMatch(source, /from\s+["'](@clerk|next\/|next["']|react)/, `${path.relative(srcRoot, file)} imports a framework`);
  }
});

test("isolation: the lead system never imports the developer-verification pipeline", () => {
  const forbidden = /developer-connect\/(verification-service|candidate-service|developer-service|lifecycle|publish-state|verification-queue|denylist|url)\b/;
  for (const file of leadSources) {
    assert.doesNotMatch(code(read(file)), forbidden, `${path.relative(srcRoot, file)} reaches into verification code`);
  }
});

test("isolation: the only developer-connect modules the lead library touches are the shared db client/schema and READ-ONLY public shapes", () => {
  // The assistance gate must read the verified website to resolve a destination, so it may use the public view
  // shape, the repository TYPES and the analytics event contract — never a verification writer (see the test above).
  const allowed = /developer-connect\/(db\/(client|schema)|public-view|repository|events)\.ts$/;
  for (const file of leadSources) {
    const imports = [...code(read(file)).matchAll(/from\s+["']([^"']*developer-connect[^"']*)["']/g)].map((match) => match[1]);
    for (const specifier of imports) {
      assert.match(specifier, allowed, `${path.relative(srcRoot, file)} imports ${specifier}`);
    }
  }
});

test("isolation: the lead tables reference developers.id only — never website_candidates, evidence or verification events", () => {
  const schema = read(path.join(srcRoot, "lib/developer-connect/db/schema.ts"));
  const leadSection = schema.slice(schema.indexOf("Revenue Operating System"));
  assert.doesNotMatch(leadSection, /websiteCandidates\.id|evidence\.id|verificationEvents\.id|developerEditEvents\.id/);
  assert.match(leadSection, /references\(\(\) => developers\.id/);
});

test("isolation: analytics and verification code never import the lead system", () => {
  for (const relative of ["lib/developer-connect/events.ts", "lib/developer-connect/db/postgres-analytics-sink.ts", "lib/developer-connect/verification-service.ts", "lib/developer-connect/candidate-service.ts"]) {
    assert.doesNotMatch(read(path.join(srcRoot, relative)), /lib\/leads|\.\.\/leads|\.\/leads/, `${relative} must not import the lead system`);
  }
});

test("isolation: public pages and components never import the lead storage adapters directly", () => {
  const publicFiles = listFiles(path.join(srcRoot, "components"), (file) => /\.tsx?$/.test(file)).concat(
    listFiles(path.join(srcRoot, "app"), (file) => /(page|layout)\.tsx$/.test(file) && !file.includes(`${path.sep}admin${path.sep}`)),
  );
  for (const file of publicFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /lib\/leads\/(db|memory-repository)/, `${path.relative(srcRoot, file)} imports a lead adapter`);
  }
});

// --- immutability is part of the repository contract -------------------------------------------

function interfaceBlock(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name}`);
  assert.notEqual(start, -1, `${name} not found`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function methodNames(block: string): string[] {
  return [...code(block).matchAll(/^\s{2}(\w+)\s*[(<]/gm)].map((match) => match[1]);
}

test("immutability: the repository contract offers NO update or delete on events, touches or consents", () => {
  const source = read(path.join(leadsRoot, "repository.ts"));
  assert.deepEqual(methodNames(interfaceBlock(source, "LeadEventRepository")), ["append", "listByLead", "summarise", "redactPayloads"]);
  assert.deepEqual(methodNames(interfaceBlock(source, "TouchRepository")), ["create", "getById", "countBySessionSince"]);
  assert.deepEqual(methodNames(interfaceBlock(source, "ConsentRepository")), ["create", "listByLead", "withdrawActive"]);
});

test("immutability: the PostgreSQL adapter never issues a DELETE, and rewrites an event only inside redactPayloads", () => {
  const source = code(read(path.join(leadsRoot, "db/postgres-repository.ts")));
  assert.doesNotMatch(source, /\.delete\(/, "no row is ever deleted");
  assert.doesNotMatch(source, /\bdelete\s+from\b/i);
  assert.doesNotMatch(source, /update\(marketingTouches\)/, "touches are never updated");
  assert.equal((source.match(/update\(leadEvents\)/g) ?? []).length, 1, "exactly one place may rewrite an event");

  const redactStart = source.indexOf("async redactPayloads");
  const rewrite = source.indexOf("update(leadEvents)");
  assert.ok(redactStart !== -1 && rewrite > redactStart, "the single event rewrite lives inside redactPayloads");
  // ...and it only ever sets the payload column.
  assert.match(source.slice(rewrite, rewrite + 80), /\.set\(\{ payload: next \}\)/);
});

test("immutability: the in-memory adapter has the same shape (no event update/delete) so tests cannot hide a violation", () => {
  const source = code(read(path.join(leadsRoot, "memory-repository.ts")));
  assert.doesNotMatch(source, /state\.events\s*=\s*state\.events\.filter/);
  assert.doesNotMatch(source, /state\.events\.splice/);
});

// --- authorization: founder-only operations are guarded in the service itself ------------------

function functionBody(source: string, name: string): string {
  const start = source.search(new RegExp(`export async function ${name}\\b`));
  assert.notEqual(start, -1, `${name} not found`);
  const next = source.slice(start + 1).search(/\nexport (async )?function /);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test("authorization: every founder-only service operation calls assertFounder before doing anything", () => {
  const source = read(path.join(leadsRoot, "lead-service.ts"));
  for (const name of ["changeLeadStatus", "addNote", "setFollowUp", "logContact", "createBooking", "updateBooking", "eraseLead"]) {
    const body = functionBody(source, name);
    const guard = body.indexOf("assertFounder(");
    const firstWrite = body.search(/repos\.transaction|tx\./);
    assert.ok(guard !== -1, `${name} has no founder guard`);
    assert.ok(firstWrite === -1 || guard < firstWrite, `${name} must check the actor before touching data`);
  }
});

test("authorization: the buyer-facing operations never require a founder (and cannot claim to be one)", () => {
  const source = read(path.join(leadsRoot, "lead-service.ts"));
  assert.doesNotMatch(functionBody(source, "captureAssistanceLead"), /assertFounder\(/);
  assert.doesNotMatch(functionBody(source, "recordWebsiteRedirect"), /assertFounder\(/);
  // captureAssistanceLead hard-codes the BUYER actor; callers cannot pass one in.
  assert.match(functionBody(source, "captureAssistanceLead"), /actorType: "BUYER"/);
  // updateRequirement serves both buyer and founder, but a FOUNDER actor must prove itself.
  assert.match(functionBody(source, "updateRequirement"), /if \(actor\.actorType === "FOUNDER"\) assertFounder\(actor\)/);
});

// --- no PII in analytics -----------------------------------------------------------------------

function fieldNames(block: string): string[] {
  return [...code(block).matchAll(/^\s{2}(\w+)\??\s*:/gm)].map((match) => match[1]);
}

test("no PII in analytics: the four funnel events carry only coarse, non-identifying fields", () => {
  const source = read(path.join(srcRoot, "lib/developer-connect/events.ts"));
  const allowed: Record<string, string[]> = {
    AssistanceGateShownEvent: ["eventName", "developerId", "sourceCta", "returningVisitor"],
    AssistanceFormStartedEvent: ["eventName", "developerId", "sourceCta"],
    LeadSubmittedEvent: ["eventName", "developerId", "sourceCta", "contactPreference", "newLead"],
    OfficialWebsiteRedirectedEvent: ["eventName", "developerId", "targetDomain"],
  };
  for (const [name, expected] of Object.entries(allowed)) {
    assert.deepEqual(fieldNames(interfaceBlock(source, name)), expected, `${name} fields changed`);
  }
});

test("no PII in analytics: no analytics event of ANY kind has a phone, email, name, note, lead id or WhatsApp field", () => {
  const source = code(read(path.join(srcRoot, "lib/developer-connect/events.ts")));
  assert.doesNotMatch(source, /^\s+(phone\w*|email\w*|whatsapp\w*|leadId|lead_id|notes?|fullName|firstName|lastName|name)\??\s*:/im);
});

test("no PII in analytics: the analytics enum lists the funnel events and none that would carry lead data", () => {
  const schema = read(path.join(srcRoot, "lib/developer-connect/db/schema.ts"));
  const start = schema.indexOf('pgEnum("analytics_event_name"');
  const enumBlock = schema.slice(start, schema.indexOf("]);", start));
  for (const name of ["assistance_gate_shown", "assistance_form_started", "lead_submitted", "official_website_redirected"]) {
    assert.ok(enumBlock.includes(`"${name}"`), `${name} missing from the enum`);
  }
  assert.doesNotMatch(enumBlock, /lead_(phone|email|note|created|status)/);
});

test("no PII in lead events: payload keys that could hold typed personal text are all outside the survive-erasure allowlist", async () => {
  const { redactPayload } = await import("../redaction.ts");
  for (const [type, key] of [
    ["NOTE_ADDED", "note"],
    ["CONTACT_LOGGED", "note"],
    ["STATUS_CHANGED", "note"],
    ["LEAD_CAPTURED", "contactDetailsDiffered"],
  ] as const) {
    assert.equal(key in redactPayload(type, { [key]: "typed text" }), false, `${type}.${key} survives erasure`);
  }
});
