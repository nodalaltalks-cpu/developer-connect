import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test("firestore enquiries: history, duplicate suppression, ownership-checked rating, summary, seen, scrub", { skip }, async () => {
  const { createFirestoreBuyerEnquiryRepository } = await import("../../enquiries/firestore/firestore-repository.ts");
  const repo = createFirestoreBuyerEnquiryRepository();
  const user = `u-${randomUUID()}`;
  const stranger = `u-${randomUUID()}`;
  const leadId = randomUUID();
  const t0 = new Date();

  const a = await repo.create({ userId: user, leadId, kind: "DEVELOPER_CONNECT", developerId: null, title: "Lodha", detail: null, createdAt: t0 } as never);
  const b = await repo.create({ userId: user, leadId: null, kind: "WHATSAPP", developerId: null, title: "Chat", detail: "hi", createdAt: new Date(t0.getTime() + 10) } as never);

  assert.equal((await repo.findRecentDuplicate({ userId: user, kind: "DEVELOPER_CONNECT", title: "Lodha", detail: null, since: new Date(t0.getTime() - 1000) }))?.id, a.id);
  assert.equal(await repo.findRecentDuplicate({ userId: user, kind: "DEVELOPER_CONNECT", title: "Lodha", detail: "x", since: new Date(0) }), null);
  assert.deepEqual((await repo.listForUser(user)).map((e) => e.id), [b.id, a.id]);

  assert.equal(await repo.saveRating({ userId: stranger, id: a.id, rating: 5, comment: null, raterName: null, ratedAt: new Date() }), null);
  const rated = await repo.saveRating({ userId: user, id: a.id, rating: 2, comment: "slow", raterName: "Asha", ratedAt: new Date() });
  assert.equal(rated?.rating, 2);

  const rated2 = await repo.listRated({ limit: 10, maxStars: 3, since: new Date(t0.getTime() - 1000) });
  assert.ok(rated2.some((e) => e.id === a.id));
  assert.equal((await repo.listRated({ maxStars: 1, since: new Date(t0.getTime() - 1000) })).some((e) => e.id === a.id), false);

  const s = await repo.summary();
  assert.ok(s.rated >= 1 && s.totalEnquiries >= 2 && s.unseen >= 1 && s.needsAttention >= 1);
  assert.equal(s.distribution.length, 5);
  assert.ok(await repo.latestRatedAt());
  assert.ok((await repo.markAllSeen(new Date())) >= 1);
  assert.equal((await repo.summary()).unseen, 0);

  assert.equal(await repo.scrubForLead(leadId), 1);
  const scrubbed = (await repo.listForUser(user)).find((e) => e.id === a.id)!;
  assert.equal(scrubbed.comment, null);
  assert.equal(scrubbed.raterName, null);
  assert.equal(scrubbed.rating, 2);
});
