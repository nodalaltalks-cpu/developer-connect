import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { processComment } from "../process.ts";
import type { EventPatch, ProcessorStore } from "../process.ts";
import { parseComments, postIdCandidates, verifyChallenge, verifySignature } from "../meta/webhook.ts";
import type { IncomingComment } from "../meta/webhook.ts";
import { createMetaSender, metaCredentialsFromEnv } from "../meta/client.ts";
import type { MetaSender, SendResult } from "../meta/client.ts";
import { choosePublicReply, DEFAULT_PUBLIC_REPLY, priceFingerprint } from "../logic.ts";
import { validatePostInput, validatePublicReplies } from "../input.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import type { AutomationSettings, PostConfig, ProjectFacts } from "../types.ts";

/** No database, no network: a fake store records what would be saved, a fake sender records what would be sent. */

const NOW = new Date("2026-10-24T10:00:00Z");
const project: ProjectFacts = { id: "11111111-1111-4111-8111-111111111111", name: "Skyline Heights", city: "Mumbai", locality: "Bandra", priceMin: 25_000_000, priceMax: 40_000_000, currency: "INR", status: "ACTIVE" };

function config(over: Partial<PostConfig> = {}): PostConfig {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    platform: "INSTAGRAM",
    postId: "1789",
    postUrl: null,
    videoTitle: "Walkthrough",
    contentFormat: "REEL",
    mode: "LIVE",
    projectId: project.id,
    priceApproved: true,
    priceVerifiedAt: new Date(NOW.getTime() - 86_400_000),
    priceSnapshot: priceFingerprint(project),
    availabilityText: null,
    availabilityVerifiedAt: null,
    approvedDetails: "Sea-facing, 3 towers.",
    safeFallbackTemplate: "Hi! Thanks for your interest in [Property Name] in [Location]. I'll get back to you personally.",
    publicReplyTemplate: null,
    publicReplyFallbackTemplate: null,
    triggers: [
      { keyword: "PRICE", intent: "PRICE", dmTemplate: "Hi! [Property Name] in [Location] is listed at [Verified Price]." },
      { keyword: "DETAILS", intent: "DETAILS", dmTemplate: "Details: [Approved Details]" },
    ],
    ...over,
  };
}

const comment = (over: Partial<IncomingComment> = {}): IncomingComment => ({
  platform: "INSTAGRAM",
  commentId: "c1",
  postId: "1789",
  text: "Price please",
  commenterId: "u1",
  commenterUsername: "buyer",
  commentedAt: new Date(NOW.getTime() - 60_000),
  isReply: false,
  fromOwnAccount: false,
  ...over,
});

function setup(opts: { post?: PostConfig | null; settings?: Partial<AutomationSettings>; canSend?: boolean; dm?: SendResult; reply?: SendResult; seen?: boolean } = {}) {
  const events = new Map<string, EventPatch>();
  const sent: Array<{ kind: "dm" | "reply"; text: string }> = [];
  const seen = new Set<string>(opts.seen ? ["INSTAGRAM:c1"] : []);
  const store: ProcessorStore = {
    getSettings: async () => ({ ...DEFAULT_SETTINGS, enabled: true, ...opts.settings }),
    findPost: async () => (opts.post === null ? null : { config: opts.post ?? config(), project }),
    recordComment: async (c) => {
      const key = `${c.platform}:${c.commentId}`;
      if (seen.has(key)) return "duplicate";
      seen.add(key);
      events.set(key, {});
      return { id: key };
    },
    updateEvent: async (id, patch) => void events.set(id, { ...events.get(id), ...patch }),
  };
  const meta: MetaSender = {
    canSend: () => opts.canSend ?? true,
    sendPrivateReply: async (_p, _c, text) => (sent.push({ kind: "dm", text }), opts.dm ?? { ok: true, id: "m1" }),
    replyPublicly: async (_p, _c, text) => (sent.push({ kind: "reply", text }), opts.reply ?? { ok: true, id: "r1" }),
  };
  return { events, sent, run: (c: IncomingComment) => processComment(c, { store, meta, now: () => NOW }), event: () => events.get("INSTAGRAM:c1")! };
}

// --- processing ----------------------------------------------------------------------------------------------

test("Live: a matching comment sends the DM, then the public reply, and counts as processed", async () => {
  const t = setup();
  assert.equal(await t.run(comment()), "SENT");
  assert.deepEqual(t.sent.map((s) => s.kind), ["dm", "reply"]);
  assert.match(t.sent[0].text, /Skyline Heights in Bandra, Mumbai/);
  assert.equal(t.sent[1].text, DEFAULT_PUBLIC_REPLY);
  assert.equal(t.event().dmStatus, "SENT");
  assert.equal(t.event().replyStatus, "SENT");
  assert.equal(t.event().outcome, "PROCESSED");
  assert.equal(t.event().followUpRequired, undefined);
});

test("the common public reply from the settings is used unless the post has its own", async () => {
  const common = setup({ settings: { defaultPublicReply: "Thanks! Check your DMs." } });
  await common.run(comment());
  assert.equal(common.sent[1].text, "Thanks! Check your DMs.");
  const own = setup({ post: config({ publicReplyTemplate: "Sent!" }), settings: { defaultPublicReply: "Thanks! Check your DMs." } });
  await own.run(comment());
  assert.equal(own.sent[1].text, "Sent!");
});

test("a comment without a keyword is recorded and nothing is sent", async () => {
  const t = setup();
  assert.equal(await t.run(comment({ text: "Lovely video" })), "NO_MATCH");
  assert.deepEqual(t.sent, []);
  assert.equal(t.event().outcome, "NO_MATCH");
});

test("a reply to another comment is never automated", async () => {
  const t = setup();
  assert.equal(await t.run(comment({ isReply: true })), "NO_MATCH");
  assert.deepEqual(t.sent, []);
});

test("our own comment (the public reply coming back through the webhook) is ignored entirely", async () => {
  const t = setup();
  assert.equal(await t.run(comment({ fromOwnAccount: true, text: "Check your DMs, price sent" })), "IGNORED");
  assert.deepEqual(t.sent, []);
  assert.equal(t.events.size, 0);
});

test("a second delivery of the same comment sends nothing", async () => {
  const t = setup({ seen: true });
  assert.equal(await t.run(comment()), "DUPLICATE");
  assert.deepEqual(t.sent, []);
});

test("a post that is not configured is recorded as such and nothing is sent", async () => {
  const t = setup({ post: null });
  assert.equal(await t.run(comment()), "NOT_CONFIGURED");
  assert.equal(t.event().outcome, "NOT_CONFIGURED");
  assert.deepEqual(t.sent, []);
});

test("Dry run records what Live would do and sends nothing, even with the switch on", async () => {
  const t = setup({ post: config({ mode: "DRY_RUN" }) });
  assert.equal(await t.run(comment()), "DRY_RUN");
  assert.deepEqual(t.sent, []);
  assert.equal(t.event().dmStatus, "DRY_RUN");
  assert.match(t.event().dmText ?? "", /Skyline Heights/);
  assert.equal(t.event().replyStatus, "DRY_RUN");
  assert.equal(t.event().triggerKeyword, "PRICE");
});

test("Disabled mode counts the enquiry but sends nothing", async () => {
  const t = setup({ post: config({ mode: "DISABLED" }) });
  assert.equal(await t.run(comment()), "AUTOMATION_OFF");
  assert.deepEqual(t.sent, []);
  assert.equal(t.event().triggerKeyword, "PRICE");
});

test("Live with the global switch OFF sends nothing and puts the enquiry on the follow-up list", async () => {
  const t = setup({ settings: { enabled: false } });
  assert.equal(await t.run(comment()), "AUTOMATION_OFF");
  assert.deepEqual(t.sent, []);
  assert.equal(t.event().followUpRequired, true);
  assert.equal(t.event().followUpStatus, "OPEN");
});

test("Live without Meta credentials sends nothing and puts the enquiry on the follow-up list", async () => {
  const t = setup({ canSend: false });
  assert.equal(await t.run(comment()), "AUTOMATION_OFF");
  assert.deepEqual(t.sent, []);
  assert.equal(t.event().followUpRequired, true);
});

test("a DM that fails is recorded as failed, flagged, and the public reply does NOT claim a DM", async () => {
  const t = setup({ dm: { ok: false, reason: "code 10: not allowed" }, post: config({ publicReplyFallbackTemplate: "Thanks! We will message you soon." }) });
  assert.equal(await t.run(comment()), "NEEDS_MANUAL");
  assert.equal(t.event().dmStatus, "FAILED");
  assert.match(t.event().dmFailureReason ?? "", /not allowed/);
  assert.equal(t.event().followUpRequired, true);
  assert.deepEqual(t.sent.map((s) => s.kind), ["dm", "reply"]);
  assert.equal(t.sent[1].text, "Thanks! We will message you soon.");
});

test("a failed DM with no fallback reply posts no public reply at all", async () => {
  const t = setup({ dm: { ok: false, reason: "x" } });
  await t.run(comment());
  assert.deepEqual(t.sent.map((s) => s.kind), ["dm"]);
  assert.equal(t.event().replyStatus, "SKIPPED");
});

test("DM sent but the public reply fails: both outcomes are recorded as they happened", async () => {
  const t = setup({ reply: { ok: false, reason: "code 100" } });
  assert.equal(await t.run(comment()), "SENT");
  assert.equal(t.event().dmStatus, "SENT");
  assert.equal(t.event().replyStatus, "FAILED");
});

test("a stale price is never quoted: the safe fallback goes out and the enquiry is flagged", async () => {
  const t = setup({ post: config({ priceVerifiedAt: new Date(NOW.getTime() - 40 * 86_400_000) }) });
  assert.equal(await t.run(comment()), "SENT");
  assert.doesNotMatch(t.sent[0].text, /₹/);
  assert.match(t.sent[0].text, /personally/);
  assert.equal(t.event().followUpRequired, true);
});

test("when nothing safe can be sent, nothing is sent and the enquiry is flagged", async () => {
  const t = setup({ post: config({ priceApproved: false, safeFallbackTemplate: null }) });
  assert.equal(await t.run(comment()), "NEEDS_MANUAL");
  assert.deepEqual(t.sent, []);
  assert.equal(t.event().dmStatus, "INELIGIBLE");
  assert.equal(t.event().followUpRequired, true);
});

test("a comment older than Meta's 7-day private-reply window is not messaged", async () => {
  const t = setup();
  assert.equal(await t.run(comment({ commentedAt: new Date(NOW.getTime() - 8 * 86_400_000) })), "NEEDS_MANUAL");
  assert.deepEqual(t.sent, []);
  assert.equal(t.event().followUpRequired, true);
});

test("choosePublicReply: post wording, then common wording, then built-in; the not-sent reply never falls back to a DM claim", () => {
  const none = { publicReplyTemplate: null, publicReplyFallbackTemplate: null };
  assert.equal(choosePublicReply(none, true), DEFAULT_PUBLIC_REPLY);
  assert.equal(choosePublicReply(none, true, { defaultPublicReply: "Common", defaultPublicReplyFallback: null }), "Common");
  assert.equal(choosePublicReply({ ...none, publicReplyTemplate: "Own" }, true, { defaultPublicReply: "Common", defaultPublicReplyFallback: null }), "Own");
  assert.equal(choosePublicReply(none, false), null);
  assert.equal(choosePublicReply(none, false, { defaultPublicReply: "Check your DMs", defaultPublicReplyFallback: "We will reach out" }), "We will reach out");
});

// --- Meta plumbing --------------------------------------------------------------------------------------------

const sign = (body: string, secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

test("signature: only the exact HMAC of the raw body under the secret passes", () => {
  const body = '{"object":"instagram"}';
  assert.equal(verifySignature(body, sign(body, "s3cret"), "s3cret"), true);
  assert.equal(verifySignature(body, sign(body, "other"), "s3cret"), false);
  assert.equal(verifySignature(body + " ", sign(body, "s3cret"), "s3cret"), false);
  assert.equal(verifySignature(body, "sha256=zz", "s3cret"), false);
  assert.equal(verifySignature(body, null, "s3cret"), false);
  assert.equal(verifySignature(body, sign(body, ""), ""), false);
});

test("handshake: the challenge is echoed only for the right mode and token", () => {
  const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "12345" });
  assert.equal(verifyChallenge(ok, "tok"), "12345");
  assert.equal(verifyChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "bad", "hub.challenge": "1" }), "tok"), null);
  assert.equal(verifyChallenge(ok, ""), null);
});

test("parses an Instagram comment and marks our own account's comments", () => {
  const body = {
    object: "instagram",
    entry: [
      {
        id: "IG1",
        time: 1_792_000_000,
        changes: [
          { field: "comments", value: { id: "c9", text: "Price?", from: { id: "u7", username: "asha" }, media: { id: "m5", media_product_type: "REELS" } } },
          { field: "comments", value: { id: "c10", text: "Sent!", from: { id: "IG1", username: "us" }, media: { id: "m5" } } },
          { field: "comments", value: { id: "c11", text: "yes", parent_id: "c9", from: { id: "u8", username: "x" }, media: { id: "m5" } } },
          { field: "mentions", value: { id: "zzz" } },
        ],
      },
    ],
  };
  const parsed = parseComments(body, { INSTAGRAM: "IG1" });
  assert.equal(parsed.length, 3);
  assert.deepEqual([parsed[0].commentId, parsed[0].postId, parsed[0].commenterUsername, parsed[0].fromOwnAccount, parsed[0].isReply], ["c9", "m5", "asha", false, false]);
  assert.equal(parsed[1].fromOwnAccount, true);
  assert.equal(parsed[2].isReply, true);
});

test("parses a Facebook page comment; only new top-level-or-reply comments, and replies are told apart", () => {
  const body = {
    object: "page",
    entry: [
      {
        id: "PG1",
        time: 1_792_000_000,
        changes: [
          { field: "feed", value: { item: "comment", verb: "add", comment_id: "fc1", post_id: "PG1_555", parent_id: "PG1_555", message: "Price", from: { id: "p9", name: "Ravi" }, created_time: 1_792_000_100 } },
          { field: "feed", value: { item: "comment", verb: "add", comment_id: "fc2", post_id: "PG1_555", parent_id: "fc1", message: "Price", from: { id: "p8", name: "Sam" } } },
          { field: "feed", value: { item: "comment", verb: "edited", comment_id: "fc3", post_id: "PG1_555", message: "x", from: { id: "p7" } } },
          { field: "feed", value: { item: "like", verb: "add", post_id: "PG1_555" } },
        ],
      },
    ],
  };
  const parsed = parseComments(body, {});
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].isReply, false);
  assert.equal(parsed[1].isReply, true);
  assert.equal(parsed[0].text, "Price");
  assert.deepEqual(postIdCandidates("FACEBOOK", "PG1_555"), ["PG1_555", "555"]);
  assert.deepEqual(postIdCandidates("INSTAGRAM", "17_8"), ["17_8"]);
});

test("garbage payloads parse to nothing instead of throwing", () => {
  for (const junk of [null, 5, "x", [], {}, { object: "instagram" }, { object: "instagram", entry: [null, { changes: "no" }] }]) assert.deepEqual(parseComments(junk, {}), []);
});

test("sender: no credentials means it cannot send; a failure never leaks the token", async () => {
  assert.equal(createMetaSender(metaCredentialsFromEnv({})).canSend("INSTAGRAM"), false);
  assert.deepEqual(await createMetaSender(metaCredentialsFromEnv({})).sendPrivateReply("INSTAGRAM", "c1", "hi"), { ok: false, reason: "not configured" });

  const creds = metaCredentialsFromEnv({ META_IG_USER_ID: "IG1", META_IG_ACCESS_TOKEN: "SECRET-TOKEN" });
  let seenUrl = "";
  let seenAuth = "";
  const failing = (async (url: string, init: RequestInit) => {
    seenUrl = url;
    seenAuth = String((init.headers as Record<string, string>).authorization);
    return new Response(JSON.stringify({ error: { code: 10, message: "Permission denied" } }), { status: 400 });
  }) as unknown as typeof fetch;
  const result = await createMetaSender(creds, failing).sendPrivateReply("INSTAGRAM", "c1", "hi");
  assert.deepEqual(result, { ok: false, reason: "code 10: Permission denied" });
  assert.match(seenUrl, /\/IG1\/messages$/);
  assert.doesNotMatch(seenUrl, /SECRET-TOKEN/);
  assert.equal(seenAuth, "Bearer SECRET-TOKEN");

  const ok = (async () => new Response(JSON.stringify({ message_id: "mid.1" }), { status: 200 })) as unknown as typeof fetch;
  assert.deepEqual(await createMetaSender(creds, ok).sendPrivateReply("INSTAGRAM", "c1", "hi"), { ok: true, id: "mid.1" });
});

// --- configuration input -------------------------------------------------------------------------------------

const validInput = { platform: "INSTAGRAM", postId: "", videoTitle: "New reel", contentFormat: "REEL", triggers: [{ keyword: "price", intent: "PRICE", dmTemplate: "Hi! [Property Name] is [Verified Price]." }] };

test("a reel can be configured before it is published: the post ID may be empty, but a bad one is refused", () => {
  const draft = validatePostInput(validInput);
  assert.equal(draft.ok && draft.value.postId, null);
  const linked = validatePostInput({ ...validInput, postId: " 1789 " });
  assert.equal(linked.ok && linked.value.postId, "1789");
  assert.equal(validatePostInput({ ...validInput, postId: "has spaces!" }).ok, false);
});

test("common public replies follow the same rules as a post's own", () => {
  assert.equal(validatePublicReplies("Thanks, check your DMs", null), null);
  assert.match(validatePublicReplies("Hi [Property Name]", null) ?? "", /placeholders/);
  assert.match(validatePublicReplies(null, "We sent you a DM") ?? "", /must not say/);
  assert.equal(validatePublicReplies(null, "We will reach out soon"), null);
});
