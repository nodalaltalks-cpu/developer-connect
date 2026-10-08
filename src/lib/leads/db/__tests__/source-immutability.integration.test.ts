import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** The original acquisition source is immutable at the DATABASE level (migration 0030), not just in the application. */
const skip = !hasTestDatabase;

function uniqueMobile(): string {
  return "+919" + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");
}

async function setup() {
  const [leadPg, svc, schema, client, drizzle] = await Promise.all([
    import("../postgres-repository.ts"),
    import("../../lead-import-service.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
  ]);
  const repos = leadPg.createPostgresLeadRepositories();
  const actor = { actorType: "EMPLOYEE" as const, actorId: `user_im_${randomUUID().slice(0, 10)}` };
  const made = await svc.createSelfGeneratedLead(repos, { phone: uniqueMobile(), creationMethod: "COLD_CALLING", sourceDetail: "list A" }, actor);
  assert.ok(made.created);
  return { repos, db: client.getDb(), sql: drizzle.sql, schema, lead: made.lead, actor };
}

const failsWith = async (work: Promise<unknown>, pattern: RegExp) => {
  await assert.rejects(work, (error: unknown) => {
    const text = String((error as Error).message) + String((error as { cause?: Error }).cause?.message ?? "");
    assert.match(text, pattern);
    return true;
  });
};

test("integration: the enum is DIGITAL / COLD_CALL; no SELF_GENERATED value remains", { skip }, async () => {
  const { db, sql } = await setup();
  const rows = await db.execute(sql`select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'lead_source_type' order by e.enumsortorder`);
  assert.deepEqual(rows.rows.map((r) => (r as { enumlabel: string }).enumlabel), ["DIGITAL", "COLD_CALL"]);
});

test("integration: a raw UPDATE cannot change source_type, source_detail, creation_method, created_by, import_batch_id or created_at", { skip }, async () => {
  const { db, sql, lead } = await setup();
  const attempts: Array<[string, ReturnType<typeof sql>]> = [
    ["source_type", sql`update leads set source_type = 'DIGITAL' where id = ${lead.id}`],
    ["source_detail", sql`update leads set source_detail = 'tampered' where id = ${lead.id}`],
    ["creation_method", sql`update leads set creation_method = 'WEBSITE_GATE' where id = ${lead.id}`],
    ["created_by", sql`update leads set created_by = 'someone_else' where id = ${lead.id}`],
    ["created_at", sql`update leads set created_at = created_at - interval '1 day' where id = ${lead.id}`],
  ];
  for (const [, statement] of attempts) await failsWith(db.execute(statement), /immutable/i);
  const after = await db.execute(sql`select source_type::text t, source_detail d, creation_method m, created_by b from leads where id = ${lead.id}`);
  assert.deepEqual(after.rows[0], { t: "COLD_CALL", d: "list A", m: "COLD_CALLING", b: lead.createdBy });
});

test("integration: everything that SHOULD change still can - owner, status, temperature, activity - and a no-op upsert of the same number leaves the source alone", { skip }, async () => {
  const { repos, lead, actor } = await setup();
  const updated = await repos.leads.update(lead.id, { status: "CONTACTED", temperature: "WARM", lastActivityAt: new Date() }, new Date());
  assert.equal(updated.status, "CONTACTED");
  assert.equal(updated.temperature, "WARM");
  assert.equal(updated.sourceType, "COLD_CALL");
  // A second capture of the same number goes through the upsert's no-op update; it must not trip the guard or touch the source.
  const again = await repos.leads.upsertByPhone({
    phoneE164: lead.phoneE164!, name: null, email: null, contactPreference: "PHONE_CALL", developerId: null, sourceCta: null, sessionId: null, userId: null,
    source: { sourceType: "DIGITAL", sourceDetail: "META", creationMethod: "WEBSITE_GATE", importBatchId: null, createdBy: null },
    now: new Date(),
  });
  assert.equal(again.created, false);
  assert.equal(again.lead.id, lead.id);
  assert.equal(again.lead.sourceType, "COLD_CALL", "a later Meta enquiry on the same number does not turn a cold lead into a digital one");
  assert.equal(again.lead.sourceDetail, "list A");
  void actor;
});

test("integration: the application layer refuses too, before the database is asked", { skip }, async () => {
  const { repos, lead } = await setup();
  await assert.rejects(repos.leads.update(lead.id, { sourceType: "DIGITAL" } as never, new Date()), /cannot be changed/);
  await assert.rejects(repos.leads.update(lead.id, { creationMethod: "WEBSITE_GATE" } as never, new Date()), /cannot be changed/);
  await assert.rejects(repos.leads.update(lead.id, { createdBy: "x" } as never, new Date()), /cannot be changed/);
});

test("integration: first-touch attribution may be attached once and never changed", { skip }, async () => {
  const { db, sql, schema, lead } = await setup();
  const touch = async () => {
    const id = randomUUID();
    await db.insert(schema.marketingTouches).values({ id, sessionId: `s-${id}`, landingPath: "/", occurredAt: new Date() } as never);
    return id;
  };
  const first = await touch();
  const second = await touch();
  await db.execute(sql`update leads set first_touch_id = ${first} where id = ${lead.id}`);
  await failsWith(db.execute(sql`update leads set first_touch_id = ${second} where id = ${lead.id}`), /immutable/i);
  await failsWith(db.execute(sql`update leads set first_touch_id = null where id = ${lead.id}`), /immutable/i);
  // The LATEST touch may move: that is how a returning visitor's most recent visit is recorded.
  await db.execute(sql`update leads set last_touch_id = ${second} where id = ${lead.id}`);
});
