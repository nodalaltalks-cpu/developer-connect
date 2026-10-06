import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Static guarantees for the internal dialer and call intelligence: a call record can only come from the server placing
 * it through a provider, its outcome only from the provider's verified events, metrics only from call records, the
 * webhook trusts nothing it cannot verify, and no vendor has been invented. These read source text, so a UI change
 * cannot bypass them.
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

const rel = (f: string) => path.relative(root, f).replaceAll("\\", "/");
const src = () => walk(path.join(root, "src"));

test("dialer: NO telephony provider has been invented — no adapter is registered, no SDK is installed, nothing is simulated", () => {
  const telephony = read("src/lib/leads/telephony.ts");
  assert.match(telephony, /const ADAPTERS: Record<string, \(env: Record<string, string \| undefined>\) => TelephonyProvider> = \{\};/, "the adapter registry is empty");
  const pkg = read("package.json");
  assert.doesNotMatch(pkg, /twilio|exotel|plivo|vonage|nexmo|knowlarity|ozonetel|myoperator|telnyx|sinch|sip\.js|jssip/i, "no telephony SDK is a dependency");
  assert.match(telephony, /return factory \? factory\(env\) : notConfiguredProvider;/, "an unknown provider name is NOT configured");
  assert.match(telephony, /configured: false/);
});

test("dialer: placing a call is refused BEFORE anything is written when no provider is configured", () => {
  const body = functionBody(read("src/lib/leads/call-service.ts"), "placeCall");
  const refuse = body.indexOf("if (!provider.configured) throw new TelephonyNotConfiguredError()");
  assert.ok(refuse !== -1);
  assert.ok(refuse < body.indexOf("repos.transaction"), "no transaction (and so no row, no event) before the check");
  assert.ok(body.indexOf("assertWorkingActor(actor)") < refuse, "identity is checked first of all");
});

test("dialer: a call record is created in exactly one place, and changed only by the dialer service", () => {
  const creators = src().filter((f) => /\bcalls\.create\(/.test(readFileSync(f, "utf8")) && !/memory-repository|postgres-repository|repository\.ts$/.test(f));
  assert.deepEqual(creators.map(rel), ["src/lib/leads/call-service.ts"]);
  const updaters = src().filter((f) => /\bcalls\.update\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(updaters.map(rel), ["src/lib/leads/call-service.ts"]);
  const events = src().filter((f) => /\bcalls\.appendEvent\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(events.map(rel), ["src/lib/leads/call-service.ts"]);
});

test("dialer: the browser can only say WHICH lead / call and the disposition — never a status, time, duration, number or provider id", () => {
  for (const file of ["src/app/team/_actions/team-actions.ts", "src/app/admin/_actions/lead-actions.ts"]) {
    const source = read(file);
    for (const name of ["placeMyCallAction", "getMyCallStatusAction", "setMyCallDispositionAction", "placeLeadCallAction", "getLeadCallStatusAction", "setLeadCallDispositionAction"]) {
      if (!source.includes(`export async function ${name}(`)) continue;
      const params = source.match(new RegExp(`export async function ${name}\\(([^)]*)\\)`))![1];
      assert.match(params, /^(leadId: string|callId: string(, disposition: CallDisposition)?)$/, `${name}(${params})`);
    }
  }
  const ui = read("src/components/leads/call-button.tsx");
  assert.doesNotMatch(ui, /status:\s*"(CONNECTED|COMPLETED)"|answeredAt\s*[:=]|durationSeconds\s*[:=]/, "the button never fabricates a call state");
  assert.doesNotMatch(ui, /_actions|lib\/leads\/db|call-service|@clerk/, "no server code, no identity in the client");
});

test("dialer: employees cannot create, edit or delete a call — there is no such operation, and the database refuses a rewrite", () => {
  const repository = read("src/lib/leads/repository.ts");
  const callRepo = repository.slice(repository.indexOf("export interface CallRepository"), repository.indexOf("export interface NewImportBatch"));
  assert.doesNotMatch(callRepo, /\bdelete\b|remove|destroy/i, "no delete on calls");
  const sql = read("src/lib/developer-connect/db/migrations/0021_phase2_dialer_and_lead_source.sql");
  assert.match(sql, /CREATE TRIGGER lead_calls_guard\s+BEFORE UPDATE OR DELETE ON lead_calls/);
  assert.match(sql, /a finished call cannot be changed/);
  assert.match(sql, /a disposition cannot be changed once set/);
  assert.match(sql, /CREATE TRIGGER lead_call_events_append_only\s+BEFORE UPDATE OR DELETE ON lead_call_events/);
  assert.match(sql, /CREATE UNIQUE INDEX "lead_call_events_idempotency_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "lead_calls_provider_call_key"/);
});

test("dialer: the webhook is 503 when unconfigured, verifies BEFORE reading any event, accepts only POST, and returns no lead or call data", () => {
  const route = read("src/app/api/telephony/webhook/route.ts");
  assert.ok(route.indexOf("if (!provider.configured)") < route.indexOf("request.text()"), "nothing is read when unconfigured");
  assert.match(route, /status: 503/);
  assert.ok(route.indexOf("provider.parseWebhook(") < route.indexOf("ingestProviderEvent("), "events exist only after verification");
  assert.match(route, /WebhookVerificationError \? 401/);
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)\b/);
  assert.match(route, /Response\.json\(\{ received: events\.length, applied \}\)/, "only counts are returned");
  assert.match(read("src/app/robots.ts"), /disallow: \[[^\]]*"\/api"/);
});

test("analytics: metrics come ONLY from call records — never from clicks, page visits, manual contact logs or notes", () => {
  const analytics = read("src/lib/leads/call-analytics.ts");
  assert.doesNotMatch(analytics.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /CONTACT_LOGGED|onClick|pageview|click/i);
  const pg = read("src/lib/leads/db/postgres-repository.ts");
  const aggregate = pg.slice(pg.indexOf("async aggregate(query: CallAggregateQuery)"), pg.indexOf("importBatches: {"));
  assert.match(aggregate, /\.from\(leadCalls\)/);
  assert.doesNotMatch(aggregate, /leadEvents|leadFollowUps|contact_logged/i, "the aggregate reads the call table only");
  assert.match(aggregate, /answeredAt\} is not null/, "connected = the provider reported it answered");
  assert.match(aggregate, /assertSafeTimeZone\(query\.timeZone\)/, "the zone is validated before it is written into SQL");
  // One aggregation serves every period — there is no per-period copy of the logic.
  assert.equal((read("src/lib/leads/call-analytics.ts").match(/repos\.calls\.aggregate\(/g) ?? []).length, 4, "employee grouping, hours, periods and the personal dashboard all use the one aggregate");
});

test("analytics: Founder screens are founder-gated and noindex; the employee's own page is employee-gated and takes no scope from the URL", () => {
  for (const file of ["src/app/admin/employee-insights/page.tsx", "src/app/admin/call-activity/page.tsx", "src/app/admin/leads/import/page.tsx"]) {
    const text = read(file);
    assert.ok(text.indexOf("await requireFounder()") !== -1, `${file} requires the Founder`);
    assert.match(text, /robots: \{ index: false, follow: false \}/);
    assert.match(text, /export const dynamic = "force-dynamic"/);
  }
  const mine = read("src/app/team/calls/page.tsx");
  assert.ok(mine.indexOf("await requireEmployee()") !== -1);
  assert.doesNotMatch(mine, /searchParams/);
  const analytics = read("src/lib/leads/call-analytics.ts");
  assert.match(functionBody(analytics, "getEmployeeInsights"), /assertFounder\(actor\)/);
  assert.match(functionBody(analytics, "getCallActivity"), /assertFounder\(actor\)/);
  assert.match(functionBody(analytics, "getMyCallDashboard"), /staffUserId: actor\.actorId/, "the personal dashboard is scoped by the verified actor");
  assert.doesNotMatch(analytics.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /\bscore\b|\brank\b/i, "no invented performance score or ranking");
});

test("lead source: kept separate from calls — the source columns live on leads, the call source only on lead_calls, and a call never writes a source", () => {
  const schema = read("src/lib/developer-connect/db/schema.ts");
  assert.match(schema, /sourceType: leadSourceTypeEnum\("source_type"\)/);
  assert.match(schema, /source: text\("source"\)\.notNull\(\)\.default\("INTERNAL_DIALER"\)/);
  const calls = read("src/lib/leads/call-service.ts");
  assert.doesNotMatch(calls, /sourceType|creationMethod|sourceDetail|importBatchId/, "the dialer never touches where a lead came from");
  const imp = read("src/lib/leads/lead-import-service.ts");
  assert.match(imp, /sourceType: "SELF_GENERATED"/);
  assert.match(functionBody(imp, "importLeadsFromCsv"), /assertFounder\(actor\)/);
  assert.doesNotMatch(imp, /consents\.create|CONSENT_GIVEN/, "an imported lead never gets a fabricated consent record");
});

test("exposure: the dialer and analytics code is not referenced by any public page, header, footer, sitemap or llms.txt", () => {
  const publicFiles = [
    ...walk(path.join(root, "src/app/(marketing)")),
    ...["src/app/developers", "src/app/faq", "src/app/privacy", "src/app/terms", "src/app/contact", "src/app/about", "src/app/buy-direct-from-developer"].flatMap((d) => (existsSync(path.join(root, d)) ? walk(path.join(root, d)) : [])),
    path.join(root, "src/components/site-header.tsx"),
    path.join(root, "src/components/site-footer.tsx"),
    path.join(root, "src/app/llms.txt/route.ts"),
  ];
  for (const file of publicFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /call-service|call-analytics|call-button|call-metrics|call-history|telephony|lead_calls|leadCalls|employee-insights|call-activity/, `${rel(file)} must not reference the dialer`);
  }
});

test("migration 0021: additive (lead columns, new tables, new enum values, triggers), separate from 0017–0020, nothing destructive", () => {
  const dir = path.join(root, "src/lib/developer-connect/db/migrations");
  const sql = readFileSync(path.join(dir, "0021_phase2_dialer_and_lead_source.sql"), "utf8");
  // Statement-level: "DELETE"/"UPDATE" appear only inside trigger definitions and messages, never as a statement.
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE)\b/im, "no destructive statement");
  assert.doesNotMatch(sql, /^\s*(DELETE FROM|UPDATE\s+\w+\s+SET)\b/im, "no data-rewriting statement");
  const alters = [...sql.matchAll(/ALTER TABLE "(\w+)" (\w+)/g)].filter((m) => m[1] === "leads");
  assert.ok(alters.length >= 5 && alters.every((m) => ["ADD"].includes(m[2]) || m[2] === "ADD"), "the only change to leads is ADD COLUMN / ADD CONSTRAINT");
  assert.doesNotMatch(sql, /INSERT INTO/i, "no data is written: existing leads take the column defaults");
  for (const prefix of ["0017_", "0018_", "0019_", "0020_"]) {
    const file = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(".sql"))!;
    assert.doesNotMatch(readFileSync(path.join(dir, file), "utf8"), /lead_calls|lead_call_events|lead_import_batches|source_type/, `${file} must not contain 0021's changes`);
  }
  assert.doesNotMatch(sql, /neon|pgcrypto/i);
});
