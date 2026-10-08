import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../developer-connect/db/client.ts";
import * as schema from "../developer-connect/db/schema.ts";
import type { DisplayMode, EnteredVia, RequestChannel, Testimonial, TestimonialStatus } from "./model.ts";
import type { TestimonialEvent, TestimonialRepository } from "./service.ts";

type Db = NodePgDatabase<typeof schema>;
type Row = typeof schema.testimonials.$inferSelect;

const toTestimonial = (r: Row): Testimonial => ({
  id: r.id,
  status: r.status as TestimonialStatus,
  isIllustrative: r.isIllustrative,
  scenario: r.scenario,
  requestTokenHash: r.requestTokenHash,
  requestedVia: r.requestedVia as RequestChannel | null,
  authorName: r.authorName,
  displayMode: r.displayMode as DisplayMode,
  city: r.city,
  country: r.country,
  helpedWith: r.helpedWith,
  experience: r.experience,
  publishedText: r.publishedText,
  isParaphrased: r.isParaphrased,
  attributionDetail: r.attributionDetail,
  enteredVia: r.enteredVia as EnteredVia,
  project: r.project,
  rating: r.rating,
  permissionPublish: r.permissionPublish,
  leadId: r.leadId,
  createdBy: r.createdBy,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  sentAt: r.sentAt,
  receivedAt: r.receivedAt,
  approvedAt: r.approvedAt,
  approvedBy: r.approvedBy,
  publishedAt: r.publishedAt,
  archivedAt: r.archivedAt,
  rejectReason: r.rejectReason,
});

const values = (t: Testimonial) => ({
  id: t.id,
  status: t.status,
  isIllustrative: t.isIllustrative,
  scenario: t.scenario,
  requestTokenHash: t.requestTokenHash,
  requestedVia: t.requestedVia,
  authorName: t.authorName,
  displayMode: t.displayMode,
  city: t.city,
  country: t.country,
  helpedWith: t.helpedWith,
  experience: t.experience,
  publishedText: t.publishedText,
  isParaphrased: t.isParaphrased,
  attributionDetail: t.attributionDetail,
  enteredVia: t.enteredVia,
  project: t.project,
  rating: t.rating,
  permissionPublish: t.permissionPublish,
  leadId: t.leadId,
  createdBy: t.createdBy,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  sentAt: t.sentAt,
  receivedAt: t.receivedAt,
  approvedAt: t.approvedAt,
  approvedBy: t.approvedBy,
  publishedAt: t.publishedAt,
  archivedAt: t.archivedAt,
  rejectReason: t.rejectReason,
});

function build(db: Db): TestimonialRepository {
  const repo: TestimonialRepository = {
    async insert(t) {
      await db.insert(schema.testimonials).values(values(t));
    },
    async getById(id) {
      const [row] = await db.select().from(schema.testimonials).where(eq(schema.testimonials.id, id));
      return row ? toTestimonial(row) : null;
    },
    async getByTokenHash(hash) {
      const [row] = await db.select().from(schema.testimonials).where(eq(schema.testimonials.requestTokenHash, hash));
      return row ? toTestimonial(row) : null;
    },
    async save(t) {
      // The creation facts (id, createdBy, createdAt, token hash, illustrative flag, scenario) are never rewritten.
      const { id, createdBy, createdAt, requestTokenHash, isIllustrative, scenario, enteredVia, ...mutable } = values(t);
      void id; void createdBy; void createdAt; void requestTokenHash; void isIllustrative; void scenario; void enteredVia;
      await db.update(schema.testimonials).set(mutable).where(eq(schema.testimonials.id, t.id));
    },
    async list({ status, illustrative, limit }) {
      const conditions: SQL[] = [];
      if (status) conditions.push(eq(schema.testimonials.status, status));
      if (illustrative !== undefined) conditions.push(eq(schema.testimonials.isIllustrative, illustrative));
      const rows = await db
        .select()
        .from(schema.testimonials)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.testimonials.createdAt), desc(schema.testimonials.id))
        .limit(limit);
      return rows.map(toTestimonial);
    },
    async countByStatus() {
      const rows = await db
        .select({ status: schema.testimonials.status, illustrative: schema.testimonials.isIllustrative, count: sql<number>`count(*)::int` })
        .from(schema.testimonials)
        .groupBy(schema.testimonials.status, schema.testimonials.isIllustrative);
      return rows.map((r) => ({ status: r.status as TestimonialStatus, illustrative: r.illustrative, count: r.count }));
    },
    async appendEvent(e) {
      await db.insert(schema.testimonialEvents).values({ id: e.id, testimonialId: e.testimonialId, eventType: e.eventType, fromStatus: e.fromStatus, toStatus: e.toStatus, actor: e.actor, note: e.note, createdAt: e.createdAt });
    },
    async listEvents(testimonialId) {
      const rows = await db.select().from(schema.testimonialEvents).where(eq(schema.testimonialEvents.testimonialId, testimonialId)).orderBy(schema.testimonialEvents.createdAt);
      return rows.map<TestimonialEvent>((r) => ({ id: r.id, testimonialId: r.testimonialId, eventType: r.eventType, fromStatus: r.fromStatus as TestimonialStatus | null, toStatus: r.toStatus as TestimonialStatus | null, actor: r.actor, note: r.note, createdAt: r.createdAt }));
    },
    async listPublished(limit) {
      const rows = await db
        .select()
        .from(schema.testimonials)
        .where(and(eq(schema.testimonials.status, "PUBLISHED"), eq(schema.testimonials.isIllustrative, false), eq(schema.testimonials.permissionPublish, true), isNotNull(schema.testimonials.approvedAt)))
        .orderBy(desc(schema.testimonials.publishedAt))
        .limit(limit);
      return rows.map(toTestimonial);
    },
    async scenariosPresent() {
      const rows = await db.select({ scenario: schema.testimonials.scenario }).from(schema.testimonials).where(isNotNull(schema.testimonials.scenario));
      return rows.flatMap((r) => (r.scenario ? [r.scenario] : []));
    },
    async transaction(work) {
      // Nests via SAVEPOINT when already inside a transaction.
      return db.transaction((tx) => work(build(tx as unknown as Db)));
    },
  };
  return repo;
}

export function createPostgresTestimonialRepository(): TestimonialRepository {
  return build(getDb());
}

export { build as buildTestimonialRepository };
