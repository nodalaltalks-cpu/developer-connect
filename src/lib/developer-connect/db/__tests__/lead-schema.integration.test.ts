import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasTestDatabase } from "../test-db-guard.ts";

/**
 * Database-level guarantees of the Revenue OS Phase 1 tables (migrations
 * 0013/0014). Like the other integration tests these only run against the
 * disposable test database and are skipped when TEST_DATABASE_URL is unset.
 * They assert what the DATABASE enforces by itself — not application code.
 */
const skip = !hasTestDatabase;

function appendOnlyError(error: unknown): boolean {
  // drizzle wraps the driver error ("Failed query: ..."); the trigger text is on the cause.
  const cause = (error as { cause?: { message?: string } }).cause?.message ?? "";
  return /append-only/.test(cause) || /append-only/.test((error as Error).message);
}

function randomPhone(): string {
  return `+9199${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

async function db() {
  const { getDb } = await import("../client.ts");
  return getDb();
}

async function insertLead(overrides: Record<string, unknown> = {}) {
  const { leads } = await import("../schema.ts");
  const id = randomUUID();
  await (await db())
    .insert(leads)
    .values({ id, phoneE164: randomPhone(), contactPreference: "WHATSAPP", ...overrides });
  return id;
}

async function insertEvent(leadId: string, payload: Record<string, unknown> = { note: "TEST — private note" }) {
  const { leadEvents } = await import("../schema.ts");
  const id = randomUUID();
  await (await db())
    .insert(leadEvents)
    .values({ id, leadId, eventType: "NOTE_ADDED", actorType: "FOUNDER", actorId: "user_test", payload });
  return id;
}

test("leads: the phone number is the duplicate key — a second lead with the same E.164 is rejected", { skip }, async () => {
  const phone = randomPhone();
  await insertLead({ phoneE164: phone });
  await assert.rejects(() => insertLead({ phoneE164: phone }));
});

test("leads: a lead must have a phone unless it has been erased; erased leads can coexist", { skip }, async () => {
  await assert.rejects(() => insertLead({ phoneE164: null }));
  const erasedAt = new Date();
  await insertLead({ phoneE164: null, erasedAt });
  await insertLead({ phoneE164: null, erasedAt });
});

test("leads: budget range and non-negative budgets are enforced by the database", { skip }, async () => {
  await assert.rejects(() => insertLead({ budgetMin: 5_000_000, budgetMax: 1_000_000 }));
  await assert.rejects(() => insertLead({ budgetMin: -1 }));
  await insertLead({ budgetMin: 1_000_000, budgetMax: 5_000_000, budgetCurrency: "INR" });
});

test("lead_events: DELETE and ordinary UPDATE are rejected", { skip }, async () => {
  const { sql } = await import("drizzle-orm");
  const leadId = await insertLead();
  const eventId = await insertEvent(leadId);
  const database = await db();

  await assert.rejects(() => database.execute(sql`delete from lead_events where id = ${eventId}`), appendOnlyError);
  await assert.rejects(
    () => database.execute(sql`update lead_events set event_type = 'LEAD_ERASED' where id = ${eventId}`),
    appendOnlyError,
  );
  // Even rewriting just the payload is refused outside an erasure.
  await assert.rejects(
    () => database.execute(sql`update lead_events set payload = '{}'::jsonb where id = ${eventId}`),
    appendOnlyError,
  );
});

test("lead_events: during an erasure ONLY the payload may be redacted — every other column stays immutable", { skip }, async () => {
  const { sql } = await import("drizzle-orm");
  const leadId = await insertLead();
  const eventId = await insertEvent(leadId);
  const database = await db();

  // Redacting payload with the erasure setting on succeeds...
  await database.transaction(async (tx) => {
    await tx.execute(sql`select set_config('dc.allow_lead_erasure', 'on', true)`);
    await tx.execute(sql`update lead_events set payload = '{"redacted": true}'::jsonb where id = ${eventId}`);
  });
  const [redacted] = (
    await database.execute(sql`select payload, event_type from lead_events where id = ${eventId}`)
  ).rows as Array<{ payload: { redacted?: boolean }; event_type: string }>;
  assert.equal(redacted.payload.redacted, true);
  assert.equal(redacted.event_type, "NOTE_ADDED");

  // ...but changing anything else is still refused, setting or not.
  await assert.rejects(
    () =>
      database.transaction(async (tx) => {
        await tx.execute(sql`select set_config('dc.allow_lead_erasure', 'on', true)`);
        await tx.execute(sql`update lead_events set event_type = 'LEAD_ERASED' where id = ${eventId}`);
      }),
    appendOnlyError,
  );
  // And the setting is transaction-local: it does not leak to later statements.
  await assert.rejects(
    () => database.execute(sql`update lead_events set payload = '{}'::jsonb where id = ${eventId}`),
    appendOnlyError,
  );
  // DELETE is never allowed, even during an erasure.
  await assert.rejects(
    () =>
      database.transaction(async (tx) => {
        await tx.execute(sql`select set_config('dc.allow_lead_erasure', 'on', true)`);
        await tx.execute(sql`delete from lead_events where id = ${eventId}`);
      }),
    appendOnlyError,
  );
});

test("marketing_touches: immutable — attribution can never be rewritten or removed", { skip }, async () => {
  const { sql } = await import("drizzle-orm");
  const { marketingTouches } = await import("../schema.ts");
  const database = await db();
  const id = randomUUID();
  await database.insert(marketingTouches).values({ id, sessionId: "test-session", utmSource: "google" });

  await assert.rejects(() => database.execute(sql`update marketing_touches set utm_source = 'meta' where id = ${id}`), appendOnlyError);
  await assert.rejects(() => database.execute(sql`delete from marketing_touches where id = ${id}`), appendOnlyError);
});

test("leads: first-touch and latest-touch are pointers to immutable touches, so both can differ without overwriting", { skip }, async () => {
  const { marketingTouches, leads } = await import("../schema.ts");
  const { eq } = await import("drizzle-orm");
  const database = await db();
  const first = randomUUID();
  const latest = randomUUID();
  await database.insert(marketingTouches).values([
    { id: first, sessionId: "s1", utmSource: "google", utmCampaign: "brand" },
    { id: latest, sessionId: "s1", utmSource: "meta", utmCampaign: "retarget" },
  ]);
  const leadId = await insertLead({ firstTouchId: first, lastTouchId: first });
  await database.update(leads).set({ lastTouchId: latest }).where(eq(leads.id, leadId));

  const [row] = await database.select().from(leads).where(eq(leads.id, leadId));
  assert.equal(row.firstTouchId, first);
  assert.equal(row.lastTouchId, latest);
  const touches = await database.select().from(marketingTouches).where(eq(marketingTouches.id, first));
  assert.equal(touches[0].utmSource, "google", "the first touch row itself is untouched");
});

test("lead_consents: never deleted or rewritten; a withdrawal can be recorded exactly once", { skip }, async () => {
  const { sql } = await import("drizzle-orm");
  const { leadConsents } = await import("../schema.ts");
  const database = await db();
  const leadId = await insertLead();
  const id = randomUUID();
  await database.insert(leadConsents).values({
    id,
    leadId,
    purpose: "PROPERTY_ASSISTANCE",
    channel: "WHATSAPP",
    textVersion: "v1",
    textShown: "TEST — consent wording",
  });

  await assert.rejects(() => database.execute(sql`delete from lead_consents where id = ${id}`), appendOnlyError);
  await assert.rejects(
    () => database.execute(sql`update lead_consents set text_shown = 'rewritten' where id = ${id}`),
    appendOnlyError,
  );
  await database.execute(sql`update lead_consents set withdrawn_at = now() where id = ${id}`);
  await assert.rejects(
    () => database.execute(sql`update lead_consents set withdrawn_at = now() + interval '1 day' where id = ${id}`),
    appendOnlyError,
  );
});

test("bookings: negative amounts are rejected; developers referenced by a lead cannot be deleted", { skip }, async () => {
  const { sql } = await import("drizzle-orm");
  const { bookings, developers } = await import("../schema.ts");
  const database = await db();
  const leadId = await insertLead();

  await assert.rejects(() =>
    database.insert(bookings).values({
      id: randomUUID(),
      leadId,
      currency: "INR",
      bookingValue: -1,
      createdBy: "user_test",
    }),
  );
  await database.insert(bookings).values({
    id: randomUUID(),
    leadId,
    currency: "AED",
    bookingValue: 1_500_000,
    commissionExpected: 30_000,
    createdBy: "user_test",
  });

  // Foreign key to developers is RESTRICT: a developer with a lead can never be removed.
  const developerId = randomUUID();
  await database.insert(developers).values({
    id: developerId,
    displayName: "TEST — Lead FK Co",
    slug: `test-lead-fk-${randomUUID()}`,
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  });
  await insertLead({ developerId });
  await assert.rejects(() => database.execute(sql`delete from developers where id = ${developerId}`));
});

test("enums: the new anonymous funnel events and the LEAD_NEW notification type exist", { skip }, async () => {
  const { sql } = await import("drizzle-orm");
  const database = await db();
  const { rows } = await database.execute(sql`
    select unnest(enum_range(null::analytics_event_name))::text as v
    union all select unnest(enum_range(null::notification_type))::text`);
  const values = rows.map((row) => (row as { v: string }).v);
  for (const expected of [
    "assistance_gate_shown",
    "assistance_form_started",
    "lead_submitted",
    "official_website_redirected",
    "LEAD_NEW",
    // existing values must still be there
    "official_website_clicked",
    "CONTACT_STATUS_UPDATE",
  ]) {
    assert.ok(values.includes(expected), `missing enum value ${expected}`);
  }
});

test("verification tables are untouched: the migration adds no column to developers or website_candidates", { skip }, async () => {
  const { sql } = await import("drizzle-orm");
  const database = await db();
  const { rows } = await database.execute(sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name in ('developers', 'website_candidates', 'evidence', 'verification_events')`);
  const columns = rows.map((row) => `${(row as { table_name: string }).table_name}.${(row as { column_name: string }).column_name}`);
  assert.ok(!columns.some((column) => /lead|booking|touch|consent/i.test(column)), "no lead-related column leaked into verification tables");
});
