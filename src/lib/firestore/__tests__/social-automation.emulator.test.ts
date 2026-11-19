import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test("firestore social automation: settings, posts, uniqueness, live rules, price verification, comment idempotency, summary", { skip }, async () => {
  const a = await import("../../social-automation/firestore/firestore-automation.ts");
  const { getFirestoreDb } = await import("../client.ts");
  const now = new Date();
  const tag = randomUUID().slice(0, 8);

  assert.equal((await a.getSettings()).enabled, false, "off by default");
  await a.saveSettings({ enabled: true, priceMaxAgeDays: 10 }, "founder", now);
  const settings = await a.getSettings();
  assert.deepEqual([settings.enabled, settings.priceMaxAgeDays], [true, 10]);
  await assert.rejects(() => a.saveSettings({ priceMaxAgeDays: 0 }, "founder", now), /between 1 and 365/);
  await a.saveSettings({ enabled: false, priceMaxAgeDays: 14 }, "founder", now);

  const projectId = randomUUID();
  await getFirestoreDb().collection("projects").doc(projectId).set({ name: `Proj ${tag}`, city: "Mumbai", locality: null, priceMin: 1000, priceMax: 2000, currency: "INR", status: "ACTIVE" });
  assert.ok((await a.listProjects()).some((p) => p.id === projectId));

  const input = (over: Record<string, unknown> = {}) => ({
    platform: "INSTAGRAM" as const, postId: `post_${tag}`, postUrl: null, videoTitle: `Reel ${tag}`, contentFormat: "REEL" as const,
    projectId, availabilityText: "2 BHK available", approvedDetails: null, safeFallbackTemplate: null, publicReplyTemplate: null,
    publicReplyFallbackTemplate: null, triggers: [{ keyword: "PRICE", intent: "PRICE" as const, dmTemplate: "hi" }], ...over,
  });

  const created = await a.createPost(input() as never, "founder", now);
  assert.equal(created.ok, true);
  const id = (created as { id: string }).id;
  assert.deepEqual(await a.createPost(input() as never, "founder", now), { ok: false, error: "That post is already configured. Open it from the list instead." });
  assert.deepEqual(await a.createPost(input({ postId: `x_${tag}`, projectId: randomUUID() }) as never, "founder", now), { ok: false, error: "That project could not be found." });
  await assert.rejects(() => a.createPost(input({ postId: `y_${tag}`, triggers: [{ keyword: "A", intent: "PRICE", dmTemplate: "1" }, { keyword: "A", intent: "PRICE", dmTemplate: "2" }] }) as never, "f", now), /Duplicate keyword/);

  const found = await a.findPostByPlatformId("INSTAGRAM", `post_${tag}`);
  assert.equal(found?.config.id, id);
  assert.equal(found?.project?.name, `Proj ${tag}`);

  // Going Live needs a published post, a project and a trigger.
  const draft = await a.createPost(input({ postId: null, projectId: null }) as never, "founder", now);
  const draftId = (draft as { id: string }).id;
  assert.match(((await a.setPostMode(draftId, "LIVE", "founder", now)) as { error: string }).error, /Link the published post/);

  assert.equal((await a.verifyPrice(id, "founder", now)).ok, true);
  assert.equal((await a.getPost(id))?.config.priceApproved, true);
  assert.equal((await a.setPostMode(id, "LIVE", "founder", now)).ok, true);
  assert.equal((await a.getPost(id))?.config.mode, "LIVE");

  // Changing the project drops the price approval (a changed fact is never sent on an old check) but stays Live.
  const other = randomUUID();
  await getFirestoreDb().collection("projects").doc(other).set({ name: `Other ${tag}`, city: "Pune", priceMin: 5, priceMax: 6, currency: "INR", status: "ACTIVE" });
  assert.equal((await a.updatePost(id, input({ projectId: other }) as never, "founder", now)).ok, true);
  const after = (await a.getPost(id))!.config;
  assert.deepEqual([after.mode, after.priceApproved, after.priceSnapshot], ["LIVE", false, null]);
  // Removing the project (or pointing at a different post) while Live falls back to Dry run and clears the confirmation.
  assert.equal((await a.updatePost(id, input({ projectId: null }) as never, "founder", now)).ok, true);
  assert.equal((await a.getPost(id))!.config.mode, "DRY_RUN");
  assert.equal((await a.updatePost(id, input({ projectId: other }) as never, "founder", now)).ok, true);
  assert.equal((await a.updatePost(randomUUID(), input() as never, "f", now)).ok, false);

  // The comment pipeline: one comment is one row, a repeat only counts itself.
  const store = a.createProcessorStore();
  const comment = { platform: "INSTAGRAM" as const, commentId: `c_${tag}`, postId: `unlinked_${tag}`, text: "price?", commenterId: "u1", commenterUsername: "buyer", commentedAt: now, isReply: false, fromOwnAccount: false };
  const first = await store.recordComment(comment, now);
  assert.notEqual(first, "duplicate");
  assert.equal(await store.recordComment(comment, now), "duplicate");
  await store.updateEvent((first as { id: string }).id, { outcome: "NOT_CONFIGURED" } as never);
  const rows = await a.listCommentEvents(50);
  assert.equal(rows.find((r) => r.commentId === `c_${tag}`)?.duplicateCount, 1);
  assert.ok((await a.recentUnlinkedPosts("INSTAGRAM", 20)).some((p) => p.postId === `unlinked_${tag}` && p.comments === 1));

  await store.updateEvent((first as { id: string }).id, { triggerKeyword: "PRICE", dmStatus: "SENT", followUpRequired: true, followUpStatus: "OPEN" } as never);
  const summary = await a.automationSummary(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
  assert.ok(summary.qualifying >= 1 && summary.dmSent >= 1 && summary.needFollowUp >= 1 && summary.duplicatesIgnored >= 1);
  assert.ok(summary.byKeyword.some((k) => k.keyword === "PRICE"));
  assert.ok((await a.listCommentEvents(50, true)).some((r) => r.commentId === `c_${tag}`));
  assert.equal((await a.setFollowUp((first as { id: string }).id, "DONE", "called", now)).ok, true);
  assert.equal((await a.setFollowUp(randomUUID(), "DONE", null, now)).ok, false);

  assert.equal((await a.deletePost(id)).ok, true);
  assert.equal(await a.getPost(id), null);
  // The freed post id can be configured again.
  assert.equal((await a.createPost(input({ projectId: other }) as never, "founder", now)).ok, true);
});
