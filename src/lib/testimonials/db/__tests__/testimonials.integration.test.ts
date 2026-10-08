import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** The testimonial workflow against the REAL PostgreSQL adapter and its constraints (test database only). */
const skip = !hasTestDatabase;

test("integration: the real workflow, the database guards and the append-only audit trail", { skip }, async () => {
  const [{ createPostgresTestimonialRepository }, svc, client, drizzle, schema] = await Promise.all([
    import("../../postgres-repository.ts"),
    import("../../service.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
    import("../../../developer-connect/db/schema.ts"),
  ]);
  const repo = createPostgresTestimonialRepository();
  const db = client.getDb();
  const founder = { actorType: "FOUNDER" as const, actorId: `user_it_${randomUUID().slice(0, 10)}` };
  const experience = `TEST honest feedback ${randomUUID()} about a calm and clear conversation.`;

  const { testimonial, token } = await svc.createRequest(repo, { recipientName: "TEST Person" }, founder);
  await svc.markSent(repo, testimonial.id, "EMAIL", founder);
  await svc.submitByRequestToken(repo, token, { name: "TEST Person", displayMode: "FIRST_NAME_LAST_INITIAL", city: "Mumbai", country: "India", experience, permissionPublish: true });
  await assert.rejects(svc.submitByRequestToken(repo, token, { name: "X", experience }), svc.TestimonialStateError, "single use");
  await svc.moveToReview(repo, testimonial.id, founder);
  await svc.approve(repo, testimonial.id, founder);
  assert.ok(!(await svc.getPublishedTestimonials(repo, 200)).some((t) => t.experience === experience), "approved is not public");
  await svc.publish(repo, testimonial.id, founder);
  const pub = (await svc.getPublishedTestimonials(repo, 200)).find((t) => t.experience === experience);
  assert.ok(pub);
  assert.equal(pub.name, "TEST P.");
  assert.deepEqual(Object.keys(pub).sort(), ["experience", "helpedWith", "id", "name", "place", "project", "publishedAt"], "the public shape carries no contact or internal field");

  const events = await repo.listEvents(testimonial.id);
  assert.deepEqual(events.map((e) => e.toStatus), ["DRAFT", "SENT", "RECEIVED", "PENDING_APPROVAL", "APPROVED", "PUBLISHED"]);
  assert.ok(events.every((e) => e.actor));

  // The audit trail cannot be rewritten, not even with direct SQL.
  await assert.rejects(db.execute(drizzle.sql`update testimonial_events set note = 'x' where testimonial_id = ${testimonial.id}`), /append-only|Failed query/);
  await assert.rejects(db.execute(drizzle.sql`delete from testimonial_events where testimonial_id = ${testimonial.id}`), /append-only|Failed query/);

  // The database itself refuses an illustrative row that is approved or published.
  const seeded = await svc.seedIllustrativeDrafts(repo, founder);
  assert.ok(seeded.created >= 0);
  const [template] = await db.select().from(schema.testimonials).where(drizzle.eq(schema.testimonials.isIllustrative, true)).limit(1);
  assert.ok(template, "illustrative templates exist");
  await assert.rejects(db.update(schema.testimonials).set({ status: "PUBLISHED", permissionPublish: true, approvedAt: new Date() }).where(drizzle.eq(schema.testimonials.id, template.id)), /Failed query|violates check/);
  // ...and refuses a published row without consent.
  const { testimonial: second } = await svc.createRequest(repo, {}, founder);
  await assert.rejects(db.update(schema.testimonials).set({ status: "PUBLISHED", experience: "x", approvedAt: new Date() }).where(drizzle.eq(schema.testimonials.id, second.id)), /Failed query|violates check/);
  // The seed is idempotent against the real table.
  assert.deepEqual(await svc.seedIllustrativeDrafts(repo, founder), { created: 0 });
  // No template is ever public.
  assert.ok((await svc.getPublishedTestimonials(repo, 200)).every((t) => !/Illustrative buyer/.test(t.name)));
});
