import { hasTestDatabase } from "../../../developer-connect/db/test-db-guard.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Comment-to-DM configuration and analytics on the REAL PostgreSQL adapter (TEST database only, migration 0040). Nothing here
 * contacts Instagram or Facebook. Every row it creates is tagged and removed afterwards.
 */
const skip = !hasTestDatabase;

async function modules() {
  const [repo, schema, client, drizzle, logic] = await Promise.all([
    import("../postgres-automation.ts"),
    import("../../../developer-connect/db/schema.ts"),
    import("../../../developer-connect/db/client.ts"),
    import("drizzle-orm"),
    import("../../logic.ts"),
  ]);
  return { repo, schema, db: client.getDb(), eq: drizzle.eq, inArray: drizzle.inArray, logic };
}

const TRIGGERS = [{ keyword: "PRICE", intent: "PRICE" as const, dmTemplate: "[Property Name]: [Verified Price]" }];

function input(tag: string, projectId: string | null, postId = `it-${tag}`) {
  return {
    platform: "INSTAGRAM" as const,
    postId,
    postUrl: null,
    videoTitle: `TEST — ${tag}`,
    contentFormat: "REEL" as const,
    projectId,
    availabilityText: "units available",
    approvedDetails: null,
    safeFallbackTemplate: null,
    publicReplyTemplate: null,
    publicReplyFallbackTemplate: null,
    triggers: TRIGGERS,
  };
}

test("integration: post configuration, Live guard, verification invalidation, duplicate-comment guard and analytics", { skip }, async () => {
  const { repo, schema, db, eq, inArray, logic } = await modules();
  const tag = randomUUID().slice(0, 8);
  const now = new Date();
  const projectId = randomUUID();
  const projectBId = randomUUID();
  const postIds: string[] = [];
  const commentIds: string[] = [];

  try {
    await db.insert(schema.projects).values([
      { id: projectId, name: `TEST Skyline ${tag}`, city: "Mumbai", locality: "Bandra", priceMin: 25_000_000, priceMax: 40_000_000, currency: "INR", createdBy: "TEST" },
      { id: projectBId, name: `TEST Palm ${tag}`, city: "Dubai", priceMin: 1_500_000, priceMax: 2_500_000, currency: "AED", createdBy: "TEST" },
    ]);

    // A new post is a Dry run, never Live.
    const created = await repo.createPost(input(tag, projectId), "tester", now);
    assert.ok(created.ok);
    if (!created.ok) return;
    postIds.push(created.id);
    let post = await repo.getPost(created.id);
    assert.equal(post?.config.mode, "DRY_RUN");
    assert.equal(post?.config.priceApproved, false);
    assert.equal(post?.config.triggers.length, 1);

    // The same platform + post id cannot be configured twice.
    const dup = await repo.createPost(input(tag, projectId), "tester", now);
    assert.deepEqual(dup, { ok: false, error: "That post is already configured. Open it from the list instead." });

    // Live needs a project: refused by the repository, and the database constraint backs it up.
    const noProject = await repo.createPost(input(`${tag}b`, null), "tester", now);
    assert.ok(noProject.ok);
    if (noProject.ok) {
      postIds.push(noProject.id);
      assert.equal((await repo.setPostMode(noProject.id, "LIVE", "tester", now)).ok, false);
      await assert.rejects(db.update(schema.socialPostAutomations).set({ mode: "LIVE" }).where(eq(schema.socialPostAutomations.id, noProject.id)));
    }
    // Going Live records who and when; leaving Live clears it.
    assert.ok((await repo.setPostMode(created.id, "LIVE", "tester", now)).ok);
    post = await repo.getPost(created.id);
    assert.equal(post?.config.mode, "LIVE");
    assert.ok((await repo.setPostMode(created.id, "DRY_RUN", "tester", now)).ok);

    // Price verification snapshots the current price; changing the project's price then invalidates it.
    assert.ok((await repo.verifyPrice(created.id, "tester", now)).ok);
    post = await repo.getPost(created.id);
    assert.deepEqual(logic.priceBlockers(post!.config, post!.project!, await repo.getSettings(), now), []);
    await db.update(schema.projects).set({ priceMax: 50_000_000 }).where(eq(schema.projects.id, projectId));
    post = await repo.getPost(created.id);
    assert.deepEqual(logic.priceBlockers(post!.config, post!.project!, await repo.getSettings(), now), ["price_changed_since_verification"]);

    // Re-verifying works again; re-pointing the post at another project clears price and availability verification.
    assert.ok((await repo.verifyPrice(created.id, "tester", now)).ok);
    assert.ok((await repo.verifyAvailability(created.id, "tester", now)).ok);
    assert.ok((await repo.updatePost(created.id, input(tag, projectBId), "tester", now)).ok);
    post = await repo.getPost(created.id);
    assert.equal(post?.config.priceApproved, false);
    assert.equal(post?.config.priceVerifiedAt, null);
    assert.equal(post?.config.availabilityVerifiedAt, null);
    assert.equal(post?.project?.currency, "AED");

    // Settings default to OFF and 14 days; the emergency switch round-trips.
    const before = await repo.getSettings();
    assert.equal(before.enabled, false);
    assert.equal(before.priceMaxAgeDays, 14);
    await repo.saveSettings({ enabled: true }, "tester", now);
    assert.equal((await repo.getSettings()).enabled, true);
    await repo.saveSettings({ enabled: false }, "tester", now);
    assert.equal((await repo.getSettings()).enabled, false);

    // One comment, one row: a second insert of the same comment is rejected by the unique key.
    const commentId = `it-comment-${tag}`;
    commentIds.push(commentId);
    const base = { platform: "INSTAGRAM", commentId, postId: `it-${tag}`, automationId: created.id, projectId: projectBId, receivedAt: new Date(Date.UTC(2001, 5, 6, 7, 0, 0)) };
    await db.insert(schema.socialCommentEvents).values({ id: randomUUID(), ...base, triggerKeyword: "PRICE", detectedIntent: "PRICE", dmStatus: "SENT", replyStatus: "FAILED", replyFailureReason: "rate limited" });
    await assert.rejects(db.insert(schema.socialCommentEvents).values({ id: randomUUID(), ...base }));
    // Independent statuses: the DM succeeded while the public reply failed, and both are stored as they happened.
    const c2 = `it-comment2-${tag}`;
    commentIds.push(c2);
    await db.insert(schema.socialCommentEvents).values({ id: randomUUID(), ...base, commentId: c2, triggerKeyword: "PRICE", detectedIntent: "PRICE", dmStatus: "FAILED", dmFailureReason: "token expired", replyStatus: "NOT_ATTEMPTED", followUpRequired: true, followUpStatus: "OPEN", duplicateCount: 2 });
    const c3 = `it-comment3-${tag}`;
    commentIds.push(c3);
    await db.insert(schema.socialCommentEvents).values({ id: randomUUID(), ...base, commentId: c3, triggerKeyword: "PRICE", detectedIntent: "PRICE", dmStatus: "DRY_RUN", replyStatus: "DRY_RUN" });
    // The database refuses a status outside the allowed set.
    await assert.rejects(db.insert(schema.socialCommentEvents).values({ id: randomUUID(), ...base, commentId: `bad-${tag}`, dmStatus: "READ" }));

    // Analytics are counted from the stored rows only, inside an isolated historic window.
    const from = new Date(Date.UTC(2001, 5, 6, 6, 0, 0));
    const to = new Date(Date.UTC(2001, 5, 6, 8, 0, 0));
    const summary = await repo.automationSummary(from, to);
    assert.equal(summary.qualifying, 3);
    assert.equal(summary.dmAttempted, 2, "a dry run is not an attempt");
    assert.equal(summary.dmSent, 1);
    assert.equal(summary.dmFailed, 1);
    assert.equal(summary.dryRuns, 1);
    assert.equal(summary.repliesCompleted, 0, "the failed public reply is not counted as completed");
    assert.equal(summary.duplicatesIgnored, 2);
    assert.equal(summary.needFollowUp, 1);
    assert.deepEqual(summary.byKeyword, [{ keyword: "PRICE", qualifying: 3, dmAttempted: 2, dmSent: 1 }]);
    assert.equal(summary.byPlatform[0].platform, "INSTAGRAM");
    assert.equal(summary.byPost[0].projectName, `TEST Palm ${tag}`);

    // Follow-up can be closed, and only on an enquiry that needed one.
    const open = (await repo.listCommentEvents(20, true)).find((e) => e.commentId === c2);
    assert.ok(open);
    assert.ok((await repo.setFollowUp(open!.id, "DONE", "called back", now)).ok);
    assert.equal((await repo.automationSummary(from, to)).needFollowUp, 0);
    const notNeeded = (await repo.listCommentEvents(50)).find((e) => e.commentId === c3);
    assert.equal((await repo.setFollowUp(notNeeded!.id, "DONE", null, now)).ok, false);

    // Deleting a configuration keeps the recorded comments.
    assert.ok((await repo.deletePost(created.id)).ok);
    const kept = await db.select().from(schema.socialCommentEvents).where(inArray(schema.socialCommentEvents.commentId, commentIds));
    assert.equal(kept.length, 3);
    assert.ok(kept.every((row) => row.automationId === null));
  } finally {
    await db.delete(schema.socialCommentEvents).where(inArray(schema.socialCommentEvents.commentId, commentIds));
    if (postIds.length) await db.delete(schema.socialPostAutomations).where(inArray(schema.socialPostAutomations.id, postIds));
    await db.delete(schema.projects).where(inArray(schema.projects.id, [projectId, projectBId]));
    await db.delete(schema.socialAutomationSettings);
  }
});

test("integration: a reel set up before publishing (draft), linked later, and the comment pipeline's one-row-per-comment guard", { skip }, async () => {
  const { repo, schema, db, eq, inArray } = await modules();
  const tag = randomUUID().slice(0, 8);
  const now = new Date();
  const projectId = randomUUID();
  const postIds: string[] = [];
  const platformPostId = `it-pipe-${tag}`;
  const commentId = `it-comment-${tag}`;

  try {
    await db.insert(schema.projects).values({ id: projectId, name: `TEST Draft ${tag}`, city: "Mumbai", priceMin: 1, priceMax: 2, currency: "INR", createdBy: "TEST" });

    // A draft has no post ID, can be saved, and cannot go Live (nor receive a comment) until it is linked.
    const created = await repo.createPost({ ...input(tag, projectId), postId: null }, "tester", now);
    assert.ok(created.ok);
    if (!created.ok) return;
    postIds.push(created.id);
    assert.equal((await repo.getPost(created.id))?.config.postId, null);
    const early = await repo.setPostMode(created.id, "LIVE", "tester", now);
    assert.equal(early.ok, false);
    assert.equal(await repo.findPostByPlatformId("INSTAGRAM", platformPostId), null);

    // A comment on a post nobody configured yet is stored, and the post shows up as a suggestion for linking.
    const store = repo.createProcessorStore();
    const incoming = { platform: "INSTAGRAM" as const, commentId, postId: platformPostId, text: "price?", commenterId: "u1", commenterUsername: "asha", commentedAt: now, isReply: false, fromOwnAccount: false };
    const first = await store.recordComment(incoming, now);
    assert.notEqual(first, "duplicate");
    if (first === "duplicate") return;
    await store.updateEvent(first.id, { outcome: "NOT_CONFIGURED" });
    assert.equal(await store.recordComment(incoming, now), "duplicate");
    const [row] = await db.select().from(schema.socialCommentEvents).where(eq(schema.socialCommentEvents.id, first.id));
    assert.equal(row.duplicateCount, 1);
    assert.ok((await repo.recentUnlinkedPosts("INSTAGRAM")).some((p) => p.postId === platformPostId));

    // Linking the draft makes the post findable and eligible to go Live, with the explicit confirmation recorded.
    const linked = await repo.updatePost(created.id, { ...input(tag, projectId), postId: platformPostId }, "tester", now);
    assert.ok(linked.ok);
    assert.equal((await repo.findPostByPlatformId("INSTAGRAM", platformPostId))?.config.id, created.id);
    assert.equal((await repo.setPostMode(created.id, "LIVE", "tester", now)).ok, true);
    // Pointing a Live post at a different post sends it back to Dry run.
    await repo.updatePost(created.id, { ...input(tag, projectId), postId: `${platformPostId}-b` }, "tester", now);
    assert.equal((await repo.getPost(created.id))?.config.mode, "DRY_RUN");

    // The common public replies are stored and read back.
    const before = await repo.getSettings();
    await repo.saveSettings({ defaultPublicReply: `Thanks ${tag}`, defaultPublicReplyFallback: null }, "tester", now);
    assert.equal((await repo.getSettings()).defaultPublicReply, `Thanks ${tag}`);
    await repo.saveSettings({ defaultPublicReply: before.defaultPublicReply, defaultPublicReplyFallback: before.defaultPublicReplyFallback }, "tester", now);
  } finally {
    await db.delete(schema.socialCommentEvents).where(eq(schema.socialCommentEvents.commentId, commentId));
    if (postIds.length) await db.delete(schema.socialPostAutomations).where(inArray(schema.socialPostAutomations.id, postIds));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
  }
});
