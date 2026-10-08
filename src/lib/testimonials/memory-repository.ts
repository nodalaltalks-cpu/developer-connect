import type { Testimonial, TestimonialStatus } from "./model.ts";
import type { TestimonialEvent, TestimonialRepository } from "./service.ts";

/** In-memory adapter for unit tests. Mirrors what the database enforces (token uniqueness, the illustrative-never-public check, append-only events). */
export function createInMemoryTestimonialRepository(): TestimonialRepository & { events: TestimonialEvent[]; rows: Map<string, Testimonial> } {
  const rows = new Map<string, Testimonial>();
  const events: TestimonialEvent[] = [];

  const guard = (t: Testimonial) => {
    if (t.isIllustrative && (t.status === "APPROVED" || t.status === "PUBLISHED")) throw new Error("check violation: testimonials_illustrative_never_public_ck");
    if (t.status === "PUBLISHED" && !(t.permissionPublish && t.approvedAt && t.experience)) throw new Error("check violation: testimonials_published_consent_ck");
    if (t.requestTokenHash && [...rows.values()].some((r) => r.id !== t.id && r.requestTokenHash === t.requestTokenHash)) throw new Error("unique violation: testimonials_token_hash_key");
  };

  const repo: TestimonialRepository & { events: TestimonialEvent[]; rows: Map<string, Testimonial> } = {
    rows,
    events,
    async insert(t) {
      guard(t);
      rows.set(t.id, { ...t });
    },
    async getById(id) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
    async getByTokenHash(hash) {
      const row = [...rows.values()].find((r) => r.requestTokenHash === hash);
      return row ? { ...row } : null;
    },
    async save(t) {
      guard(t);
      rows.set(t.id, { ...t });
    },
    async list({ status, illustrative, limit }) {
      return [...rows.values()]
        .filter((r) => (status ? r.status === status : true) && (illustrative === undefined ? true : r.isIllustrative === illustrative))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async countByStatus() {
      const counts = new Map<string, { status: TestimonialStatus; illustrative: boolean; count: number }>();
      for (const r of rows.values()) {
        const key = `${r.status}|${r.isIllustrative}`;
        const entry = counts.get(key) ?? { status: r.status, illustrative: r.isIllustrative, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      }
      return [...counts.values()];
    },
    async appendEvent(e) {
      events.push({ ...e });
    },
    async listEvents(id) {
      return events.filter((e) => e.testimonialId === id).map((e) => ({ ...e }));
    },
    async listPublished(limit) {
      return [...rows.values()]
        .filter((r) => r.status === "PUBLISHED")
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async scenariosPresent() {
      return [...rows.values()].flatMap((r) => (r.scenario ? [r.scenario] : []));
    },
    async transaction(work) {
      const snapshotRows = new Map([...rows].map(([k, v]) => [k, { ...v }]));
      const snapshotEvents = events.length;
      try {
        return await work(repo);
      } catch (error) {
        rows.clear();
        for (const [k, v] of snapshotRows) rows.set(k, v);
        events.length = snapshotEvents;
        throw error;
      }
    },
  };
  return repo;
}
