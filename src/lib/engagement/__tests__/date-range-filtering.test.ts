import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryEngagementRepositories } from "../memory-repository.ts";

/**
 * Founder Dashboard global date filter — engagement repositories.
 * Real timestamps set by the repository itself (create()/softDelete()
 * both stamp `new Date()` internally, exactly as production does — never
 * injected here), checked against a range that genuinely includes "now"
 * vs. one that's entirely in the past. No mocked clock needed: a range
 * a few minutes wide around the real current instant is enough to prove
 * inclusive-start/exclusive-end filtering actually works.
 */

function rangeAroundNow(): { start: Date; end: Date } {
  const now = Date.now();
  return { start: new Date(now - 60_000), end: new Date(now + 60_000) };
}

const FAR_PAST_RANGE = { start: new Date("2020-01-01T00:00:00Z"), end: new Date("2020-01-02T00:00:00Z") };

test("engagement.reports.list: a range covering now includes a just-created report; a past range excludes it", async () => {
  const engagement = createInMemoryEngagementRepositories();
  await engagement.reports.create({
    developerId: "dev-1",
    category: "OFFICIAL_WEBSITE",
    details: "Wrong link",
  });

  const inRange = await engagement.reports.list(200, rangeAroundNow());
  assert.equal(inRange.length, 1);

  const outOfRange = await engagement.reports.list(200, FAR_PAST_RANGE);
  assert.deepEqual(outOfRange, []);

  // Omitting `range` entirely still returns everything, all-time — unchanged behavior.
  const allTime = await engagement.reports.list(200);
  assert.equal(allTime.length, 1);
});

test("engagement.newsletter.list: DATE-FILTERED signups vs. countActive's always-current SNAPSHOT", async () => {
  const engagement = createInMemoryEngagementRepositories();
  await engagement.newsletter.subscribe({ email: "reader@example.com", source: "footer" });

  const inRange = await engagement.newsletter.list(500, rangeAroundNow());
  assert.equal(inRange.length, 1);

  const outOfRange = await engagement.newsletter.list(500, FAR_PAST_RANGE);
  assert.deepEqual(outOfRange, []);

  // countActive never takes a range at all — always the current, live count.
  assert.equal(await engagement.newsletter.countActive(), 1);
});

test("engagement.contact.listTrash: uses deletedAt, not createdAt — a range covering now includes an item just moved to Trash", async () => {
  const engagement = createInMemoryEngagementRepositories();
  const submission = await engagement.contact.create({
    name: "Test Visitor",
    email: "visitor@example.com",
    reason: "GENERAL_QUESTION",
    message: "Hello",
  });
  await engagement.contact.softDelete(submission.id, "founder-1");

  const inRange = await engagement.contact.listTrash(200, rangeAroundNow());
  assert.equal(inRange.length, 1);
  assert.ok(inRange[0].deletedAt, "the Trash row must carry a real deletedAt");

  const outOfRange = await engagement.contact.listTrash(200, FAR_PAST_RANGE);
  assert.deepEqual(outOfRange, [], "a range that does not cover the real deletion moment must exclude it");

  // Restoring removes it from Trash entirely, independent of any range.
  await engagement.contact.restore(submission.id);
  assert.deepEqual(await engagement.contact.listTrash(200, rangeAroundNow()), []);
});

test("engagement.contact.list (active queue) has no range parameter at all — it is an operational SNAPSHOT, never date-filtered", async () => {
  const engagement = createInMemoryEngagementRepositories();
  await engagement.contact.create({
    name: "Test Visitor",
    email: "visitor@example.com",
    reason: "GENERAL_QUESTION",
    message: "Hello",
  });
  const active = await engagement.contact.list(200);
  assert.equal(active.length, 1);
});
