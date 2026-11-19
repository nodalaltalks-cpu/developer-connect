import { directCtx, type DocView, type FsCtx } from "../../firestore/tx.ts";
import { monotonic, reqDate, toDate, toTs } from "../../firestore/convert.ts";
import type { DisplayMode, EnteredVia, RequestChannel, Testimonial, TestimonialStatus } from "../model.ts";
import type { TestimonialEvent, TestimonialRepository } from "../service.ts";

const TESTIMONIALS = "testimonials";
const EVENTS = "testimonialEvents";

const STATUSES = ["DRAFT", "SENT", "RECEIVED", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "ARCHIVED", "REJECTED"];
const DISPLAY_MODES = ["FULL_NAME", "FIRST_NAME_LAST_INITIAL", "FIRST_NAME_ONLY", "ANONYMOUS"];

/**
 * The CHECK constraints the PostgreSQL table enforced, kept as a backstop here because Firestore has none. The service
 * layer validates first; this guarantees a bug there still cannot publish an illustrative or unconsented testimonial.
 */
function assertInvariants(t: Testimonial): void {
  const fail = (rule: string): never => {
    throw new Error(`testimonial invariant violated: ${rule}`);
  };
  if (!STATUSES.includes(t.status)) fail("status");
  if (!DISPLAY_MODES.includes(t.displayMode)) fail("displayMode");
  if (t.rating !== null && !(t.rating >= 1 && t.rating <= 5)) fail("rating 1..5");
  if (t.requestedVia !== null && !["WHATSAPP", "EMAIL", "LINK"].includes(t.requestedVia)) fail("requestedVia");
  if (t.enteredVia !== "FORM" && t.enteredVia !== "FOUNDER_ENTERED") fail("enteredVia");
  if (t.isIllustrative && (t.status === "APPROVED" || t.status === "PUBLISHED")) fail("illustrative never public");
  if (t.status === "PUBLISHED" && !(t.permissionPublish && t.approvedAt && t.experience !== null)) fail("published needs consent");
  if ((t.status === "APPROVED" || t.status === "PUBLISHED") && t.publishedText === null) fail("approved needs published text");
  const len = (s: string | null) => (s ?? "").length;
  if (len(t.experience) > 2000 || len(t.helpedWith) > 500 || len(t.authorName) > 120 || len(t.publishedText) > 2000 || len(t.attributionDetail) > 160) fail("text length");
}

function toDoc(t: Testimonial) {
  return {
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
    createdAt: toTs(t.createdAt),
    updatedAt: toTs(t.updatedAt),
    sentAt: toTs(t.sentAt),
    receivedAt: toTs(t.receivedAt),
    approvedAt: toTs(t.approvedAt),
    approvedBy: t.approvedBy,
    publishedAt: toTs(t.publishedAt),
    archivedAt: toTs(t.archivedAt),
    rejectReason: t.rejectReason,
  };
}

function toTestimonial(v: DocView): Testimonial {
  const d = v.data()!;
  return {
    id: v.id,
    status: d.status as TestimonialStatus,
    isIllustrative: d.isIllustrative === true,
    scenario: d.scenario ?? null,
    requestTokenHash: d.requestTokenHash ?? null,
    requestedVia: (d.requestedVia ?? null) as RequestChannel | null,
    authorName: d.authorName ?? null,
    displayMode: d.displayMode as DisplayMode,
    city: d.city ?? null,
    country: d.country ?? null,
    helpedWith: d.helpedWith ?? null,
    experience: d.experience ?? null,
    publishedText: d.publishedText ?? null,
    isParaphrased: d.isParaphrased === true,
    attributionDetail: d.attributionDetail ?? null,
    enteredVia: d.enteredVia as EnteredVia,
    project: d.project ?? null,
    rating: d.rating ?? null,
    permissionPublish: d.permissionPublish === true,
    leadId: d.leadId ?? null,
    createdBy: d.createdBy,
    createdAt: reqDate(d.createdAt),
    updatedAt: reqDate(d.updatedAt),
    sentAt: toDate(d.sentAt),
    receivedAt: toDate(d.receivedAt),
    approvedAt: toDate(d.approvedAt),
    approvedBy: d.approvedBy ?? null,
    publishedAt: toDate(d.publishedAt),
    archivedAt: toDate(d.archivedAt),
    rejectReason: d.rejectReason ?? null,
  };
}

function build(ctx: FsCtx): TestimonialRepository {
  const col = (name: string) => ctx.db.collection(name);

  const repo: TestimonialRepository = {
    async insert(t) {
      assertInvariants(t);
      await ctx.create(col(TESTIMONIALS).doc(t.id), toDoc(t));
    },
    async getById(id) {
      const v = await ctx.get(col(TESTIMONIALS).doc(id));
      return v.exists ? toTestimonial(v) : null;
    },
    async getByTokenHash(hash) {
      const rows = await ctx.query(col(TESTIMONIALS).where("requestTokenHash", "==", hash).limit(1));
      return rows[0] ? toTestimonial(rows[0]) : null;
    },
    async save(t) {
      assertInvariants(t);
      // The creation facts are never rewritten: only mutable fields go in the patch.
      const { createdBy, createdAt, requestTokenHash, isIllustrative, scenario, enteredVia, ...mutable } = toDoc(t);
      void createdBy; void createdAt; void requestTokenHash; void isIllustrative; void scenario; void enteredVia;
      await ctx.update(col(TESTIMONIALS).doc(t.id), mutable);
    },
    async list({ status, illustrative, limit }) {
      let q: FirebaseFirestore.Query = col(TESTIMONIALS);
      if (status) q = q.where("status", "==", status);
      if (illustrative !== undefined) q = q.where("isIllustrative", "==", illustrative);
      const rows = await ctx.query(q.orderBy("createdAt", "desc").limit(limit));
      return rows.map(toTestimonial);
    },
    async countByStatus() {
      // A handful of rows in total: read two fields of each and group here (Firestore has no GROUP BY).
      const rows = await ctx.query(col(TESTIMONIALS).select("status", "isIllustrative"));
      const tally = new Map<string, { status: TestimonialStatus; illustrative: boolean; count: number }>();
      for (const r of rows) {
        const d = r.data()!;
        const illustrative = d.isIllustrative === true;
        const key = `${d.status}|${illustrative}`;
        const cur = tally.get(key) ?? { status: d.status as TestimonialStatus, illustrative, count: 0 };
        cur.count += 1;
        tally.set(key, cur);
      }
      return [...tally.values()];
    },
    async appendEvent(e) {
      await ctx.create(col(EVENTS).doc(e.id), {
        testimonialId: e.testimonialId,
        eventType: e.eventType,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actor: e.actor,
        note: e.note,
        createdAt: toTs(e.createdAt),
        _ord: monotonic(),
      });
    },
    async listEvents(testimonialId) {
      const rows = await ctx.query(col(EVENTS).where("testimonialId", "==", testimonialId).orderBy("createdAt", "asc").orderBy("_ord", "asc"));
      return rows.map<TestimonialEvent>((v) => {
        const d = v.data()!;
        return {
          id: v.id,
          testimonialId: d.testimonialId,
          eventType: d.eventType,
          fromStatus: (d.fromStatus ?? null) as TestimonialStatus | null,
          toStatus: (d.toStatus ?? null) as TestimonialStatus | null,
          actor: d.actor,
          note: d.note ?? null,
          createdAt: reqDate(d.createdAt),
        };
      });
    },
    async listPublished(limit) {
      const rows = await ctx.query(
        col(TESTIMONIALS)
          .where("status", "==", "PUBLISHED")
          .where("isIllustrative", "==", false)
          .where("permissionPublish", "==", true)
          .orderBy("publishedAt", "desc")
          .limit(limit),
      );
      // approvedAt is guaranteed by the PUBLISHED invariant, but the public page must never rely on that alone.
      return rows.map(toTestimonial).filter((t) => t.approvedAt !== null);
    },
    async scenariosPresent() {
      const rows = await ctx.query(col(TESTIMONIALS).select("scenario"));
      return rows.flatMap((r) => (r.data()!.scenario ? [r.data()!.scenario as string] : []));
    },
    async transaction(work) {
      return ctx.run((inner) => work(build(inner)));
    },
  };
  return repo;
}

export function createFirestoreTestimonialRepository(): TestimonialRepository {
  return build(directCtx());
}
