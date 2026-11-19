import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Testimonial } from "../../testimonials/model.ts";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

function make(over: Partial<Testimonial> = {}): Testimonial {
  const now = new Date();
  return {
    id: randomUUID(), status: "DRAFT", isIllustrative: false, scenario: null, requestTokenHash: randomUUID(), requestedVia: "LINK",
    authorName: "Asha K", displayMode: "FIRST_NAME_ONLY", city: "Mumbai", country: "India", helpedWith: null, experience: null,
    publishedText: null, isParaphrased: false, attributionDetail: null, enteredVia: "FORM", project: null, rating: null,
    permissionPublish: false, leadId: null, createdBy: "founder", createdAt: now, updatedAt: now, sentAt: null, receivedAt: null,
    approvedAt: null, approvedBy: null, publishedAt: null, archivedAt: null, rejectReason: null, ...over,
  } as Testimonial;
}

test("firestore testimonials: insert/get/save, token lookup, invariants, listPublished", { skip }, async () => {
  const { createFirestoreTestimonialRepository } = await import("../../testimonials/firestore/firestore-repository.ts");
  const repo = createFirestoreTestimonialRepository();
  const t = make();
  await repo.insert(t);
  assert.equal((await repo.getById(t.id))?.authorName, "Asha K");
  assert.equal((await repo.getByTokenHash(t.requestTokenHash!))?.id, t.id);

  await assert.rejects(() => repo.save({ ...t, isIllustrative: true, status: "PUBLISHED" } as Testimonial), /invariant/);

  const now = new Date();
  const pub = { ...t, status: "PUBLISHED" as const, experience: "great", publishedText: "great", permissionPublish: true, approvedAt: now, approvedBy: "f", publishedAt: now };
  await repo.save(pub);
  assert.ok((await repo.listPublished(50)).some((x) => x.id === t.id));
  assert.ok((await repo.countByStatus()).some((r) => r.status === "PUBLISHED" && r.count >= 1));
});

test("firestore transaction: read-your-writes, commits atomically, rolls back on throw", { skip }, async () => {
  const { createFirestoreTestimonialRepository } = await import("../../testimonials/firestore/firestore-repository.ts");
  const repo = createFirestoreTestimonialRepository();
  const t = make();

  await repo.transaction(async (tx) => {
    await tx.insert(t);
    assert.equal((await tx.getById(t.id))?.id, t.id); // visible inside before commit
    await tx.save({ ...t, status: "SENT", sentAt: new Date() });
    await tx.appendEvent({ id: randomUUID(), testimonialId: t.id, eventType: "SENT", fromStatus: "DRAFT", toStatus: "SENT", actor: "f", note: null, createdAt: new Date() });
  });
  assert.equal((await repo.getById(t.id))?.status, "SENT");
  assert.equal((await repo.listEvents(t.id)).length, 1);

  const u = make();
  await assert.rejects(() =>
    repo.transaction(async (tx) => {
      await tx.insert(u);
      throw new Error("boom");
    }),
  /boom/);
  assert.equal(await repo.getById(u.id), null);
});
