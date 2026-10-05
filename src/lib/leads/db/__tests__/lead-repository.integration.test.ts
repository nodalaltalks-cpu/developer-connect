import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * The lead service against the REAL PostgreSQL adapter and the REAL
 * migrations (0013/0014), on the disposable test database only (the guard
 * above refuses to run against production, and these skip when
 * TEST_DATABASE_URL is unset). This is where the guarantees that the
 * in-memory tests can only simulate are proven for real: atomic duplicate
 * detection under genuine concurrency, immutable history, erasure through
 * the database trigger, and rollback.
 */
const skip = !hasTestDatabase;

const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_integration_founder" };
const BUYER = { actorType: "BUYER" as const };
const HOUR = 3_600_000;

async function modules() {
  const [service, pg, memory, phone, schema, client, drizzle] = await Promise.all([
    import("../../lead-service.ts"),
    import("../postgres-repository.ts"),
    import("../../memory-repository.ts"),
    import("../../phone.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
  ]);
  return { service, pg, memory, phone, schema, db: client.getDb(), sql: drizzle.sql, eq: drizzle.eq };
}

/** A valid Indian mobile number nobody has used before. */
async function freshPhone(): Promise<string> {
  const { phone } = await modules();
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `+91 9${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
    const result = phone.normalizePhone(candidate);
    if (result.ok) return result.e164;
  }
  throw new Error("could not generate a valid test phone");
}

async function testDeveloper(name = "Lead Integration Co") {
  const { db, schema } = await modules();
  const id = randomUUID();
  const slug = `test-lead-integration-${randomUUID()}`;
  await db.insert(schema.developers).values({ id, displayName: `TEST — ${name}`, slug, city: "Mumbai", state: "Maharashtra", country: "India" });
  return { id, slug, displayName: `TEST — ${name}` };
}

function captureInput(developer: { id: string; slug: string; displayName: string }, phone: string, overrides: Record<string, unknown> = {}) {
  return {
    phone,
    name: "Integration Buyer",
    email: "integration.buyer@example.com",
    contactPreference: "WHATSAPP" as const,
    developer,
    website: { url: "https://example.test/", domain: "example.test", verifiedAt: new Date("2026-09-01T00:00:00.000Z") },
    sourceCta: "developer_page",
    sessionId: `session-${randomUUID()}`,
    currentTouch: { sessionId: "s", landingPath: "/developers/x", utmSource: "google", utmMedium: "cpc", utmCampaign: "brand" },
    ...overrides,
  };
}

// --- duplicates and concurrency ----------------------------------------------------------------

test("postgres: upsertByPhone is atomic — 20 concurrent inserts of one number create exactly ONE lead", { skip }, async () => {
  const { pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const e164 = await freshPhone();

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      repos.transaction((tx) =>
        tx.leads.upsertByPhone({ phoneE164: e164, name: null, email: null, contactPreference: "WHATSAPP", developerId: null, sourceCta: null, sessionId: null, userId: null, now: new Date() }),
      ),
    ),
  );

  assert.equal(results.filter((result) => result.created).length, 1, "exactly one insert won");
  assert.equal(new Set(results.map((result) => result.lead.id)).size, 1, "everyone got the same lead");
});

test("postgres: 15 simultaneous captures of one number (typed 5 different ways) produce one lead, one LEAD_CREATED and 14 LEAD_CAPTURED", { skip }, async () => {
  const { service, pg, db, sql } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const e164 = await freshPhone();
  const national = e164.replace("+91", "0");
  const spaced = `${e164.slice(0, 3)} ${e164.slice(3, 8)} ${e164.slice(8)}`;
  const forms = [e164, national, spaced, e164.slice(3), `91${e164.slice(3)}`];

  const results = await Promise.all(
    Array.from({ length: 15 }, (_, index) =>
      service.captureAssistanceLead(repos, captureInput(developer, forms[index % forms.length], { sessionId: `concurrent-${index}`, currentTouch: { sessionId: `concurrent-${index}`, utmSource: "google" } })),
    ),
  );

  const leadIds = new Set(results.map((result) => result.lead.id));
  assert.equal(leadIds.size, 1, "one lead");
  assert.equal(results.filter((result) => result.created).length, 1, "one submission created it");
  const [leadId] = [...leadIds];

  const counts = (
    await db.execute(sql`
      select event_type, count(*)::int as n from lead_events where lead_id = ${leadId}::uuid group by event_type`)
  ).rows as Array<{ event_type: string; n: number }>;
  const byType = Object.fromEntries(counts.map((row) => [row.event_type, row.n]));
  assert.equal(byType.LEAD_CREATED, 1);
  assert.equal(byType.LEAD_CAPTURED, 14);
  assert.equal(byType.OFFICIAL_WEBSITE_CLICKED, 15);
  assert.equal(byType.CONSENT_GIVEN, 15);

  const leadRows = (await db.execute(sql`select count(*)::int as n from leads where phone_e164 = ${e164}`)).rows as Array<{ n: number }>;
  assert.equal(leadRows[0].n, 1, "the database holds exactly one lead for this number");
  const consents = (await db.execute(sql`select count(*)::int as n from lead_consents where lead_id = ${leadId}::uuid`)).rows as Array<{ n: number }>;
  assert.equal(consents[0].n, 15);
});

test("postgres: captures of DIFFERENT numbers at the same moment each get their own lead", { skip }, async () => {
  const { service, pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const phones = await Promise.all([freshPhone(), freshPhone(), freshPhone(), freshPhone()]);
  const results = await Promise.all(phones.map((phone) => service.captureAssistanceLead(repos, captureInput(developer, phone))));
  assert.equal(new Set(results.map((result) => result.lead.id)).size, 4);
  assert.ok(results.every((result) => result.created));
});

// --- attribution -------------------------------------------------------------------------------

test("postgres: first-touch is preserved across visits; latest-touch moves; the first touch row is untouched", { skip }, async () => {
  const { service, pg, db, sql } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const e164 = await freshPhone();

  const first = await service.captureAssistanceLead(repos, captureInput(developer, e164, { currentTouch: { sessionId: "a", utmSource: "google", utmCampaign: "brand" } }));
  const later = await service.captureAssistanceLead(
    repos,
    captureInput(developer, e164, {
      currentTouch: { sessionId: "b", utmSource: "meta", utmCampaign: "retarget", fbclid: "FB1" },
      firstTouch: { sessionId: "b", utmSource: "meta" },
    }),
  );

  assert.equal(later.created, false);
  assert.equal(later.lead.firstTouchId, first.lead.firstTouchId, "first touch never replaced");
  assert.notEqual(later.lead.lastTouchId, first.lead.firstTouchId);

  const rows = (
    await db.execute(sql`select id, utm_source, utm_campaign, fbclid from marketing_touches where id in (${first.lead.firstTouchId}::uuid, ${later.lead.lastTouchId}::uuid)`)
  ).rows as Array<{ id: string; utm_source: string; utm_campaign: string; fbclid: string | null }>;
  const original = rows.find((row) => row.id === first.lead.firstTouchId)!;
  const latest = rows.find((row) => row.id === later.lead.lastTouchId)!;
  assert.deepEqual([original.utm_source, original.utm_campaign], ["google", "brand"]);
  assert.deepEqual([latest.utm_source, latest.fbclid], ["meta", "FB1"]);
});

// --- requirement updates -----------------------------------------------------------------------

test("postgres: requirement changes are applied together with an event holding the previous value", { skip }, async () => {
  const { service, pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const { lead } = await service.captureAssistanceLead(repos, captureInput(developer, await freshPhone()));

  await service.updateRequirement(repos, lead.id, { configuration: "2 BHK", budgetMax: 10_000_000, budgetCurrency: "INR" }, BUYER);
  const { lead: updated, changed } = await service.updateRequirement(repos, lead.id, { configuration: "3 BHK", budgetMax: 25_000_000 }, FOUNDER);
  assert.deepEqual(changed.sort(), ["budgetMax", "configuration"]);
  assert.equal(updated.configuration, "3 BHK");
  assert.equal(updated.budgetMax, 25_000_000);

  const events = (await service.getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "REQUIREMENT_UPDATED");
  const last = events.at(-1)!.payload.fields as Record<string, { from: unknown; to: unknown }>;
  assert.deepEqual(last.configuration, { from: "2 BHK", to: "3 BHK" });
  // The database's own constraints back the service's validation.
  await assert.rejects(() => service.updateRequirement(repos, lead.id, { budgetMin: 90_000_000 }, FOUNDER));
});

// --- atomicity ---------------------------------------------------------------------------------

test("postgres: a failure part-way through a capture rolls EVERYTHING back — no lead, no events, no orphan consent", { skip }, async () => {
  const { service, pg, db, sql } = await modules();
  const real = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const e164 = await freshPhone();

  const failing = {
    ...real,
    transaction: <T>(work: (repos: typeof real) => Promise<T>) =>
      real.transaction((tx) =>
        work({
          ...tx,
          events: {
            ...tx.events,
            append: async (event) => {
              if (event.eventType === "OFFICIAL_WEBSITE_CLICKED") throw new Error("simulated failure on the last event");
              return tx.events.append(event);
            },
          },
        }),
      ),
  };

  await assert.rejects(() => service.captureAssistanceLead(failing, captureInput(developer, e164)), /simulated/);

  const leadRows = (await db.execute(sql`select count(*)::int as n from leads where phone_e164 = ${e164}`)).rows as Array<{ n: number }>;
  assert.equal(leadRows[0].n, 0, "the lead insert was rolled back");

  // And the number is still free: a normal capture afterwards succeeds as a NEW lead.
  const retry = await service.captureAssistanceLead(real, captureInput(developer, e164));
  assert.equal(retry.created, true);
});

// --- erasure -----------------------------------------------------------------------------------

test("postgres: erasure removes personal data, keeps the immutable skeleton, and the trigger still blocks arbitrary edits", { skip }, async () => {
  const { service, pg, db, sql } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const e164 = await freshPhone();

  const { lead } = await service.captureAssistanceLead(
    repos,
    captureInput(developer, e164, { name: "Zainab Qureshi", email: "zainab.q@example.com", requirement: { location: "Villa 12 Palm Jumeirah", configuration: "4 BHK", timeline: "WITHIN_30_DAYS", budgetMax: 5_000_000, budgetCurrency: "AED" } }),
  );
  await service.addNote(repos, lead.id, "Zainab's sister Noor lives in the same building; prefers calls after 8", FOUNDER);
  await service.logContact(repos, lead.id, { channel: "WHATSAPP", outcome: "CONNECTED", note: "sent the Dubai brochure" }, FOUNDER);
  await service.changeLeadStatus(repos, lead.id, "NOT_INTERESTED", FOUNDER, { note: "chose a villa from Meraki" });
  const booking = await service.createBooking(repos, lead.id, { currency: "AED", bookingValue: 5_000_000, projectName: "Palm Villas" }, FOUNDER);

  const before = (await db.execute(sql`select id, event_type, actor_type, actor_id, developer_id, from_status, to_status, created_at from lead_events where lead_id = ${lead.id}::uuid order by created_at, id`))
    .rows as Array<Record<string, unknown>>;

  const erased = await service.eraseLead(repos, lead.id, FOUNDER);
  assert.ok(erased.erasedAt);
  assert.equal(erased.phoneE164, null);
  assert.equal(erased.name, null);
  assert.equal(erased.email, null);
  assert.equal(erased.location, null);

  // 1. No personal text survives anywhere in the lead's rows.
  const dump = JSON.stringify({
    lead: (await db.execute(sql`select * from leads where id = ${lead.id}::uuid`)).rows,
    events: (await db.execute(sql`select * from lead_events where lead_id = ${lead.id}::uuid`)).rows,
    consents: (await db.execute(sql`select * from lead_consents where lead_id = ${lead.id}::uuid`)).rows,
  });
  for (const secret of ["Zainab", "Qureshi", "zainab.q", e164.slice(3), "Noor", "Dubai brochure", "Meraki", "Palm Jumeirah", "Villa 12"]) {
    assert.ok(!dump.includes(secret), `"${secret}" survived erasure in the database`);
  }

  // 2. Every pre-existing event row still exists with identical structural columns.
  const after = (await db.execute(sql`select id, event_type, actor_type, actor_id, developer_id, from_status, to_status, created_at from lead_events where lead_id = ${lead.id}::uuid order by created_at, id`))
    .rows as Array<Record<string, unknown>>;
  for (const original of before) {
    const match = after.find((row) => row.id === original.id);
    assert.ok(match, `event ${String(original.id)} disappeared`);
    assert.deepEqual(match, original, "only the payload may differ");
  }
  const tail = after.filter((row) => !before.some((original) => original.id === row.id)).map((row) => row.event_type);
  assert.ok(tail.includes("LEAD_ERASED") && tail.includes("CONSENT_WITHDRAWN"));

  // 3. Consents are withdrawn; the booking (a financial record) survives.
  const consents = (await db.execute(sql`select count(*)::int as n from lead_consents where lead_id = ${lead.id}::uuid and withdrawn_at is null`)).rows as Array<{ n: number }>;
  assert.equal(consents[0].n, 0);
  assert.equal((await repos.bookings.getById(booking.id))?.bookingValue, 5_000_000);

  // 4. The trigger still refuses ANY edit or delete outside the erasure path.
  const refusal = (error: unknown) => /append-only/.test(String((error as { cause?: { message?: string } }).cause?.message ?? (error as Error).message));
  await assert.rejects(() => db.execute(sql`update lead_events set payload = '{"x":1}'::jsonb where lead_id = ${lead.id}::uuid`), refusal);
  await assert.rejects(() => db.execute(sql`delete from lead_events where lead_id = ${lead.id}::uuid`), refusal);
  await assert.rejects(() => db.execute(sql`update lead_events set event_type = 'NOTE_ADDED' where lead_id = ${lead.id}::uuid`), refusal);
});

test("postgres: after an erasure the same number is a brand-new lead (no link back)", { skip }, async () => {
  const { service, pg, db, sql } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const e164 = await freshPhone();

  const first = await service.captureAssistanceLead(repos, captureInput(developer, e164));
  await service.eraseLead(repos, first.lead.id, FOUNDER);
  const second = await service.captureAssistanceLead(repos, captureInput(developer, e164));

  assert.equal(second.created, true);
  assert.notEqual(second.lead.id, first.lead.id);
  const rows = (await db.execute(sql`select count(*)::int as n from leads where phone_e164 = ${e164}`)).rows as Array<{ n: number }>;
  assert.equal(rows[0].n, 1, "only the new lead carries the number");
});

test("postgres: erasure is refused for a non-founder actor and changes nothing", { skip }, async () => {
  const { service, pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper();
  const { lead } = await service.captureAssistanceLead(repos, captureInput(developer, await freshPhone()));
  await assert.rejects(() => service.eraseLead(repos, lead.id, BUYER), /Founder authorization required/);
  assert.equal((await repos.leads.getById(lead.id))!.erasedAt, null);
});

// --- Today queue and in-memory parity ----------------------------------------------------------

async function runScenario(repos: import("../../repository.ts").LeadRepositories, developer: { id: string; slug: string; displayName: string }, phones: [string, string, string], base: Date) {
  const { service } = await modules();
  const at = (hours: number) => new Date(base.getTime() + hours * HOUR);

  const a = await service.captureAssistanceLead(repos, captureInput(developer, phones[0], { requirement: { budgetMax: 30_000_000, budgetCurrency: "INR", timeline: "WITHIN_30_DAYS" } }), at(0));
  const b = await service.captureAssistanceLead(repos, captureInput(developer, phones[1]), at(1));
  await service.changeLeadStatus(repos, b.lead.id, "CONTACTED", FOUNDER, {}, at(2));
  await service.logContact(repos, b.lead.id, { channel: "WHATSAPP", outcome: "CONNECTED" }, FOUNDER, at(3));
  await service.setFollowUp(repos, b.lead.id, at(10), FOUNDER, at(4));
  const c = await service.captureAssistanceLead(repos, captureInput(developer, phones[2]), at(5));
  await service.changeLeadStatus(repos, c.lead.id, "CONTACTED", FOUNDER, {}, at(6));
  await service.logContact(repos, c.lead.id, { channel: "PHONE_CALL", outcome: "NO_ANSWER" }, FOUNDER, at(7));
  await service.logContact(repos, c.lead.id, { channel: "PHONE_CALL", outcome: "CONNECTED" }, FOUNDER, at(8));
  await service.captureAssistanceLead(repos, captureInput({ ...developer, displayName: "TEST — Second Developer", slug: `${developer.slug}-2` }, phones[2]), at(20));
  return { a: a.lead.id, b: b.lead.id, c: c.lead.id, at };
}

test("postgres: the SQL activity summaries agree exactly with the reference (in-memory) definition", { skip }, async () => {
  const { pg, memory } = await modules();
  const developer = await testDeveloper();
  const base = new Date("2026-10-01T00:00:00.000Z");

  const pgRepos = pg.createPostgresLeadRepositories();
  const memRepos = memory.createInMemoryLeadRepositories();
  const pgIds = await runScenario(pgRepos, developer, [await freshPhone(), await freshPhone(), await freshPhone()], base);
  const memIds = await runScenario(memRepos, developer, ["+919876500101", "+919876500102", "+919876500103"], base);

  const pgSummaries = await pgRepos.events.summarise([pgIds.a, pgIds.b, pgIds.c]);
  const memSummaries = await memRepos.events.summarise([memIds.a, memIds.b, memIds.c]);
  const norm = (s: (typeof pgSummaries)[number]) => ({
    lastContactAt: s.lastContactAt?.getTime() ?? null,
    contactAttempts: s.contactAttempts,
    lastBuyerActivityAt: s.lastBuyerActivityAt?.getTime() ?? null,
    lastBuyerActivityDeveloperName: s.lastBuyerActivityDeveloperName,
    firstDeveloperName: s.firstDeveloperName,
  });
  pgSummaries.forEach((summary, index) => assert.deepEqual(norm(summary), norm(memSummaries[index]), `lead ${index}`));

  // Spot-check the actual values too, so a shared mistake in both would still be caught.
  const c = norm(pgSummaries[2]);
  assert.equal(c.contactAttempts, 2);
  assert.equal(c.lastContactAt, pgIds.at(8).getTime());
  assert.equal(c.lastBuyerActivityAt, pgIds.at(20).getTime());
  assert.equal(c.lastBuyerActivityDeveloperName, "TEST — Second Developer");
  assert.equal(c.firstDeveloperName, developer.displayName);
});

test("postgres: summarise returns an empty summary for a lead with no matching events and nothing for an empty list", { skip }, async () => {
  const { pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  assert.deepEqual(await repos.events.summarise([]), []);
  const [summary] = await repos.events.summarise([randomUUID()]);
  assert.equal(summary.contactAttempts, 0);
  assert.equal(summary.lastContactAt, null);
});

test("postgres: getTodayQueue ranks real database leads with the approved rules and readable reasons", { skip }, async () => {
  const { service, pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper("Queue Co");
  const now = new Date();
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

  // Overdue follow-up (contacted 5 days ago, follow-up was due 3 hours ago).
  const overdue = await service.captureAssistanceLead(repos, captureInput(developer, await freshPhone()), ago(120));
  await service.changeLeadStatus(repos, overdue.lead.id, "CONTACTED", FOUNDER, {}, ago(119));
  await service.logContact(repos, overdue.lead.id, { channel: "WHATSAPP", outcome: "CONNECTED" }, FOUNDER, ago(118));
  await service.setFollowUp(repos, overdue.lead.id, ago(3), FOUNDER, ago(117));

  // A new, high-budget lead from 6 hours ago.
  const fresh = await service.captureAssistanceLead(
    repos,
    captureInput(developer, await freshPhone(), { requirement: { budgetMax: 25_000_000, budgetCurrency: "INR", timeline: "WITHIN_30_DAYS" } }),
    ago(6),
  );

  // A finished lead that must not appear.
  const booked = await service.captureAssistanceLead(repos, captureInput(developer, await freshPhone()), ago(50));
  await service.changeLeadStatus(repos, booked.lead.id, "BOOKED", FOUNDER, {}, ago(49));

  const queue = await service.getTodayQueue(repos, now, 500);
  const ours = queue.filter((entry) => [overdue.lead.id, fresh.lead.id, booked.lead.id].includes(entry.leadId));

  assert.deepEqual(ours.map((entry) => [entry.leadId, entry.bucket]), [
    [overdue.lead.id, "OVERDUE_FOLLOW_UP"],
    [fresh.lead.id, "NEW_LEAD"],
  ]);
  assert.match(ours[0].summary, /^Follow-up overdue by 3 hours • Last contacted 4 days ago$/);
  assert.equal(ours[1].summary, `New lead from ${developer.displayName} • ₹2.5 Cr budget • Wants to buy within 30 days • No contact attempt in 6 hours`);
  assert.ok(!ours.some((entry) => entry.leadId === booked.lead.id));
});

// --- verification untouched --------------------------------------------------------------------

test("postgres: capturing leads never changes a developer's verification data", { skip }, async () => {
  const { service, pg, db, sql } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper("Untouched Co");

  const snapshot = async () =>
    JSON.stringify({
      developer: (await db.execute(sql`select * from developers where id = ${developer.id}::uuid`)).rows,
      candidates: (await db.execute(sql`select * from website_candidates where developer_id = ${developer.id}::uuid`)).rows,
      verification: (await db.execute(sql`select count(*)::int as n from verification_events`)).rows,
    });

  const before = await snapshot();
  const phone = await freshPhone();
  const { lead } = await service.captureAssistanceLead(repos, captureInput(developer, phone));
  await service.captureAssistanceLead(repos, captureInput(developer, phone));
  await service.eraseLead(repos, lead.id, FOUNDER);
  assert.equal(await snapshot(), before);
});

// --- deterministic timeline order --------------------------------------------------------------

test("postgres: events written with the SAME timestamp keep their insertion order (the timeline is never shuffled)", { skip }, async () => {
  const { service, pg } = await modules();
  const repos = pg.createPostgresLeadRepositories();
  const developer = await testDeveloper("Order Co");
  const same = new Date();

  // A capture writes five events in one transaction, all stamped `same`.
  const { lead } = await service.captureAssistanceLead(repos, captureInput(developer, await freshPhone()), same);
  await service.addNote(repos, lead.id, "one", FOUNDER, same);
  await service.addNote(repos, lead.id, "two", FOUNDER, same);
  await service.addNote(repos, lead.id, "three", FOUNDER, same);

  const events = await service.getLeadTimeline(repos, lead.id);
  assert.deepEqual(
    events.map((event) => event.eventType),
    ["LEAD_CREATED", "CONSENT_GIVEN", "CONTACT_PREFERENCE_SELECTED", "OFFICIAL_WEBSITE_CLICKED", "NOTE_ADDED", "NOTE_ADDED", "NOTE_ADDED"],
  );
  assert.deepEqual(events.filter((event) => event.eventType === "NOTE_ADDED").map((event) => event.payload.note), ["one", "two", "three"]);
  assert.ok(events.every((event) => !("seq" in event)), "the ordering column is internal and never leaks into the domain object");
});
