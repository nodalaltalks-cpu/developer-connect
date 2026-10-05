import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * The assistance gate's server core against the REAL PostgreSQL adapters, the
 * REAL analytics sink and the REAL migrations — on the disposable test
 * database only (skipped without TEST_DATABASE_URL; the guard above refuses to
 * run against production). Developers are created and VERIFIED through the
 * normal pipeline, exactly as production data is.
 */
const skip = !hasTestDatabase;
const founder = { actorType: "FOUNDER" as const, actorId: "user_gate_integration" };

async function setup() {
  const [gate, leadPg, devPg, sink, devService, candidateService, verification, phone, client, drizzle] = await Promise.all([
    import("../../gate/gate-service.ts"),
    import("../postgres-repository.ts"),
    import("../../../developer-connect/db/postgres-repository.ts"),
    import("../../../developer-connect/db/postgres-analytics-sink.ts"),
    import("../../../developer-connect/developer-service.ts"),
    import("../../../developer-connect/candidate-service.ts"),
    import("../../../developer-connect/verification-service.ts"),
    import("../../phone.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
  ]);
  const developers = devPg.createPostgresRepositories();
  const leads = leadPg.createPostgresLeadRepositories();
  return { gate, leads, developers, analytics: sink.postgresAnalyticsSink, devService, candidateService, verification, phone, db: client.getDb(), sql: drizzle.sql };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function verifiedDeveloper(s: Setup, name = "Gate Integration Co") {
  const developer = await s.devService.createDeveloper(s.developers.developers, { displayName: `TEST — ${name} ${randomUUID().slice(0, 8)}`, city: "Mumbai", state: "Maharashtra", country: "India" });
  const domain = `gate-it-${randomUUID()}.example`;
  const candidate = await s.candidateService.submitWebsiteCandidate(s.developers, { developerId: developer.id, url: `https://${domain}/home`, discoverySource: "MANUAL_SUBMISSION", actor: founder });
  await s.verification.approveAndPublishCandidate(s.developers, candidate.id, founder, "gate integration test");
  return { id: developer.id, slug: developer.slug, displayName: developer.displayName, url: `https://${domain}/home`, domain };
}

async function unverifiedDeveloper(s: Setup) {
  const developer = await s.devService.createDeveloper(s.developers.developers, { displayName: `TEST — Unverified ${randomUUID().slice(0, 8)}`, city: "Pune", state: "Maharashtra", country: "India" });
  await s.candidateService.submitWebsiteCandidate(s.developers, { developerId: developer.id, url: `https://unverified-${randomUUID()}.example/`, discoverySource: "MANUAL_SUBMISSION", actor: founder });
  return { id: developer.id };
}

async function freshPhone(s: Setup): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = s.phone.normalizePhone(`+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`);
    if (result.ok) return result.e164;
  }
  throw new Error("no phone");
}

function deps(s: Setup, now: () => Date = () => new Date()) {
  return { developers: s.developers, leads: s.leads, analytics: s.analytics, now };
}

const ctx = () => ({ sessionId: `gate-it-session-${randomUUID()}`, userId: null, deviceType: "mobile" as const });
const submission = (developerId: string, phone: string, extra: Record<string, unknown> = {}) => ({
  developerId,
  sourceCta: "developer_page" as const,
  phone,
  phoneCountry: "IN" as const,
  contactPreference: "WHATSAPP" as const,
  name: "Gate Buyer",
  attribution: { currentTouch: { utmSource: "google", utmMedium: "cpc", utmCampaign: "brand", landingPath: "/developers/x" } },
  ...extra,
});

test("postgres gate: a verified developer + valid number saves the lead, consent, attribution and events, then returns the verified URL", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const phone = await freshPhone(s);

  const { response, leadId } = await s.gate.submitGate(deps(s), ctx(), submission(developer.id, phone));
  assert.ok(response.ok);
  assert.equal(response.destinationUrl, developer.url);
  assert.equal(response.destinationDomain, developer.domain);
  assert.ok(leadId);

  const lead = (await s.leads.leads.getById(leadId!))!;
  assert.equal(lead.phoneE164, phone);
  assert.equal(lead.developerId, developer.id);
  assert.equal(lead.status, "NEW");
  const [consent] = await s.leads.consents.listByLead(leadId!);
  assert.match(consent.textShown, /not with the developer/);
  const touch = (await s.leads.touches.getById(lead.firstTouchId!))!;
  assert.equal(touch.utmSource, "google");

  const timeline = await s.leads.events.listByLead(leadId!);
  assert.deepEqual(timeline.map((e) => e.eventType), ["LEAD_CREATED", "CONSENT_GIVEN", "CONTACT_PREFERENCE_SELECTED", "OFFICIAL_WEBSITE_CLICKED", "DEVELOPER_WEBSITE_REDIRECTED"]);
  assert.equal(timeline.find((e) => e.eventType === "OFFICIAL_WEBSITE_CLICKED")!.payload.websiteUrl, developer.url);
});

test("postgres gate: an unverified developer cannot produce a destination — no redirect and NO lead row", { skip }, async () => {
  const s = await setup();
  const unverified = await unverifiedDeveloper(s);
  const phone = await freshPhone(s);

  const { response, leadId } = await s.gate.submitGate(deps(s), ctx(), submission(unverified.id, phone));
  assert.equal(response.ok, false);
  assert.equal(!response.ok && response.code, "NOT_VERIFIED");
  assert.equal(leadId, null);
  assert.ok(!("destinationUrl" in response));

  const rows = (await s.db.execute(s.sql`select count(*)::int as n from leads where phone_e164 = ${phone}`)).rows as Array<{ n: number }>;
  assert.equal(rows[0].n, 0);
});

test("postgres gate: hostile client fields cannot change where the buyer is sent", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const hostile = { ...submission(developer.id, await freshPhone(s)), url: "https://evil.example/", redirect: "//evil.example", destinationUrl: "javascript:alert(1)" };
  const { response } = await s.gate.submitGate(deps(s), ctx(), hostile as never);
  assert.ok(response.ok);
  assert.equal(response.destinationUrl, developer.url);
  assert.ok(!JSON.stringify(response).includes("evil"));
});

test("postgres gate: 8 simultaneous submissions of one number create exactly ONE lead, and every buyer is sent on", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const phone = await freshPhone(s);
  const results = await Promise.all(Array.from({ length: 8 }, () => s.gate.submitGate(deps(s), ctx(), submission(developer.id, phone))));

  assert.ok(results.every((result) => result.response.ok));
  assert.equal(new Set(results.map((result) => result.leadId)).size, 1);
  const rows = (await s.db.execute(s.sql`select count(*)::int as n from leads where phone_e164 = ${phone}`)).rows as Array<{ n: number }>;
  assert.equal(rows[0].n, 1);
});

test("postgres gate: a returning buyer continues with one tap using the number on file", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const other = await verifiedDeveloper(s, "Second Gate Co");
  const first = await s.gate.submitGate(deps(s), ctx(), submission(developer.id, await freshPhone(s)));

  const state = await s.gate.getGateState(deps(s), ctx(), other.id, "directory_card", first.leadId, "required");
  assert.equal(state.mode, "required");
  assert.ok("returning" in state && state.returning);
  const again = await s.gate.continueAsReturning(deps(s), ctx(), first.leadId, { developerId: other.id, sourceCta: "directory_card" });
  assert.ok(again.response.ok);
  assert.equal(again.response.destinationUrl, other.url);
  assert.equal(again.leadId, first.leadId);

  const clicks = (await s.leads.events.listByLead(first.leadId!)).filter((e) => e.eventType === "OFFICIAL_WEBSITE_CLICKED");
  assert.deepEqual(clicks.map((c) => c.developerId), [developer.id, other.id]);
  const lead = (await s.leads.leads.getById(first.leadId!))!;
  assert.equal(lead.developerId, developer.id, "the originally researched developer is kept");
});

test("postgres gate: a database failure shows an error — NO destination, NO half-saved lead — and a retry then works", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const phone = await freshPhone(s);

  const failing = {
    ...s.leads,
    transaction: <T>(work: (repos: typeof s.leads) => Promise<T>) =>
      s.leads.transaction((tx) =>
        work({
          ...tx,
          events: {
            ...tx.events,
            append: async (event) => {
              if (event.eventType === "OFFICIAL_WEBSITE_CLICKED") throw new Error("simulated outage");
              return tx.events.append(event);
            },
          },
        }),
      ),
  };
  const broken = await s.gate.submitGate({ ...deps(s), leads: failing }, ctx(), submission(developer.id, phone));
  assert.equal(broken.response.ok, false);
  assert.equal(!broken.response.ok && broken.response.code, "TEMPORARY_FAILURE");
  assert.ok(!("destinationUrl" in broken.response));
  const none = (await s.db.execute(s.sql`select count(*)::int as n from leads where phone_e164 = ${phone}`)).rows as Array<{ n: number }>;
  assert.equal(none[0].n, 0, "the lead insert rolled back");

  const retry = await s.gate.submitGate(deps(s), ctx(), submission(developer.id, phone));
  assert.ok(retry.response.ok);
});

test("postgres gate: an invalid phone saves nothing", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const session = ctx();
  const { response } = await s.gate.submitGate(deps(s), session, submission(developer.id, "12345"));
  assert.equal(!response.ok && response.code, "INVALID_PHONE");
  const touches = (await s.db.execute(s.sql`select count(*)::int as n from marketing_touches where session_id = ${session.sessionId}`)).rows as Array<{ n: number }>;
  assert.equal(touches[0].n, 0, "not even an attribution row is left behind");
});

test("postgres gate: the rate limit counts real touch rows — the sixth submission in a window is refused", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const session = ctx();
  const outcomes: string[] = [];
  for (let i = 0; i < 6; i++) {
    const { response } = await s.gate.submitGate(deps(s), session, submission(developer.id, await freshPhone(s)));
    outcomes.push(response.ok ? "ok" : response.code);
  }
  assert.deepEqual(outcomes, ["ok", "ok", "ok", "ok", "ok", "RATE_LIMITED"]);
});

test("postgres gate: funnel events land in analytics_events (shown → started → submitted → redirected) with NO personal data", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const session = ctx();
  const phone = await freshPhone(s);

  await s.gate.getGateState(deps(s), session, developer.id, "developer_page", null, "required");
  await s.gate.recordFormStarted(deps(s), session, developer.id, "developer_page");
  const { leadId } = await s.gate.submitGate(deps(s), session, submission(developer.id, phone, { name: "Meera Kapoor" }));
  await s.gate.submitGate(deps(s), session, submission(developer.id, "12345")); // a failed attempt must not leak either

  const rows = (
    await s.db.execute(s.sql`select event_name, developer_id, payload, session_id, user_id from analytics_events where session_id = ${session.sessionId} order by occurred_at, id`)
  ).rows as Array<{ event_name: string; developer_id: string; payload: Record<string, unknown>; session_id: string; user_id: string | null }>;

  assert.deepEqual(rows.map((r) => r.event_name), ["assistance_gate_shown", "assistance_form_started", "lead_submitted", "official_website_redirected"]);
  assert.ok(rows.every((r) => r.developer_id === developer.id));
  const submitted = rows.find((r) => r.event_name === "lead_submitted")!;
  assert.deepEqual(submitted.payload, { sourceCta: "developer_page", contactPreference: "WHATSAPP", newLead: true, deviceType: "mobile" });
  assert.equal(rows.find((r) => r.event_name === "official_website_redirected")!.payload.targetDomain, developer.domain);

  const dump = JSON.stringify(rows);
  for (const secret of [phone, phone.slice(3), "Meera", "Kapoor", leadId!, "google", "@"]) {
    assert.ok(!dump.includes(secret), `"${secret}" leaked into analytics_events`);
  }
});

test("postgres gate: capturing a lead never changes the developer's verification data", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const snapshot = async () =>
    JSON.stringify({
      developer: (await s.db.execute(s.sql`select * from developers where id = ${developer.id}::uuid`)).rows,
      candidates: (await s.db.execute(s.sql`select * from website_candidates where developer_id = ${developer.id}::uuid`)).rows,
      events: (await s.db.execute(s.sql`select count(*)::int as n from verification_events`)).rows,
    });
  const before = await snapshot();
  const phone = await freshPhone(s);
  await s.gate.submitGate(deps(s), ctx(), submission(developer.id, phone));
  await s.gate.submitGate(deps(s), ctx(), submission(developer.id, phone));
  assert.equal(await snapshot(), before);
});

test("postgres gate: LEAD_GATE_MODE=off releases only the VERIFIED destination, with no lead — and still nothing for an unverified developer", { skip }, async () => {
  const s = await setup();
  const developer = await verifiedDeveloper(s);
  const unverified = await unverifiedDeveloper(s);
  const off = await s.gate.getGateState(deps(s), ctx(), developer.id, "developer_page", null, "off");
  assert.deepEqual(off, { mode: "off", destinationUrl: developer.url, destinationDomain: developer.domain });
  assert.equal((await s.gate.getGateState(deps(s), ctx(), unverified.id, "developer_page", null, "off")).mode, "unavailable");
});
