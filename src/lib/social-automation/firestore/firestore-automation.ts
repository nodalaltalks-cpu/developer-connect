import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "../../firestore/client.ts";
import { reqDate, safeId, toDate, toTs } from "../../firestore/convert.ts";
import { priceFingerprint } from "../logic.ts";
import { postIdCandidates } from "../meta/webhook.ts";
import type { IncomingComment } from "../meta/webhook.ts";
import type { EventPatch, ProcessorStore } from "../process.ts";
import type { PostInput } from "../input.ts";
import type { AutomationCurrency, AutomationMode, AutomationPlatform, AutomationSettings, ContentFormat, PostConfig, ProjectFacts, TriggerIntent } from "../types.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import type { AutomationSummary, CommentEventRow, RepoResult } from "../db/postgres-automation.ts";

/**
 * Firestore side of the comment-to-DM automation. Founder-only callers.
 * Collections: socialAutomationSettings (id "global"), socialPostAutomations (triggers embedded as `triggers[]`, in
 * order), socialCommentEvents (document id = platform + comment id, which is the idempotency guard: a second delivery
 * of the same comment finds the document already there), and `lookups/socialPost:<platform>:<postId>` (one
 * configuration per post). Project facts are read from the `projects` collection, never copied.
 */

const SETTINGS = "socialAutomationSettings";
const POSTS = "socialPostAutomations";
const EVENTS = "socialCommentEvents";
const PROJECTS = "projects";

type Data = FirebaseFirestore.DocumentData;
const db = () => getFirestoreDb();

const toProject = (id: string, d: Data): ProjectFacts => ({
  id,
  name: d.name,
  city: d.city,
  locality: d.locality ?? null,
  priceMin: d.priceMin ?? null,
  priceMax: d.priceMax ?? null,
  currency: (d.currency ?? null) as AutomationCurrency | null,
  status: d.status,
});

const toConfig = (id: string, d: Data): PostConfig => ({
  id,
  platform: d.platform as AutomationPlatform,
  postId: d.postId ?? null,
  postUrl: d.postUrl ?? null,
  videoTitle: d.videoTitle,
  contentFormat: d.contentFormat as ContentFormat,
  mode: d.mode as AutomationMode,
  projectId: d.projectId ?? null,
  priceApproved: d.priceApproved === true,
  priceVerifiedAt: toDate(d.priceVerifiedAt),
  priceSnapshot: d.priceSnapshot ?? null,
  availabilityText: d.availabilityText ?? null,
  availabilityVerifiedAt: toDate(d.availabilityVerifiedAt),
  approvedDetails: d.approvedDetails ?? null,
  safeFallbackTemplate: d.safeFallbackTemplate ?? null,
  publicReplyTemplate: d.publicReplyTemplate ?? null,
  publicReplyFallbackTemplate: d.publicReplyFallbackTemplate ?? null,
  triggers: ((d.triggers ?? []) as Array<{ keyword: string; intent: string; dmTemplate: string }>).map((t) => ({ keyword: t.keyword, intent: t.intent as TriggerIntent, dmTemplate: t.dmTemplate })),
});

/** The CHECK constraints the PostgreSQL table carried. */
function assertPostInvariants(d: Data): void {
  const fail = (rule: string): never => {
    throw new Error(`social post invariant violated: ${rule}`);
  };
  if (!["INSTAGRAM", "FACEBOOK"].includes(d.platform)) fail("platform");
  if (!["REEL", "POST", "VIDEO"].includes(d.contentFormat)) fail("format");
  if (!["DISABLED", "DRY_RUN", "LIVE"].includes(d.mode)) fail("mode");
  if (d.mode === "LIVE" && !(d.postId && d.projectId && d.liveConfirmedAt && d.liveConfirmedBy)) fail("live needs a post, a project and a confirmation");
  if (d.priceApproved === true && !(d.priceVerifiedAt && d.priceSnapshot)) fail("approved price needs a verification and a snapshot");
}

const postKey = (platform: string, postId: string) => `socialPost:${platform}:${safeId(postId)}`;
const eventId = (platform: string, commentId: string) => `${platform}_${safeId(commentId)}`;

// --- settings -------------------------------------------------------------------------------------------------

export async function getSettings(): Promise<AutomationSettings> {
  const snap = await db().collection(SETTINGS).doc("global").get();
  if (!snap.exists) return DEFAULT_SETTINGS;
  const d = snap.data()!;
  return {
    enabled: d.enabled === true,
    priceMaxAgeDays: d.priceMaxAgeDays,
    availabilityMaxAgeDays: d.availabilityMaxAgeDays,
    defaultPublicReply: d.defaultPublicReply ?? null,
    defaultPublicReplyFallback: d.defaultPublicReplyFallback ?? null,
  };
}

export async function saveSettings(patch: Partial<AutomationSettings>, actor: string, now: Date): Promise<void> {
  const next = { ...(await getSettings()), ...patch };
  if (!(next.priceMaxAgeDays >= 1 && next.priceMaxAgeDays <= 365) || !(next.availabilityMaxAgeDays >= 1 && next.availabilityMaxAgeDays <= 365)) {
    throw new Error("settings invariant violated: max age must be between 1 and 365 days");
  }
  await db()
    .collection(SETTINGS)
    .doc("global")
    .set({ enabled: next.enabled, priceMaxAgeDays: next.priceMaxAgeDays, availabilityMaxAgeDays: next.availabilityMaxAgeDays, defaultPublicReply: next.defaultPublicReply ?? null, defaultPublicReplyFallback: next.defaultPublicReplyFallback ?? null, updatedAt: toTs(now), updatedBy: actor });
}

// --- projects -------------------------------------------------------------------------------------------------

export async function listProjects(): Promise<ProjectFacts[]> {
  const snap = await db().collection(PROJECTS).where("status", "==", "ACTIVE").orderBy("name", "asc").limit(500).get();
  return snap.docs.map((d) => toProject(d.id, d.data()));
}

export async function getProject(id: string): Promise<ProjectFacts | null> {
  const snap = await db().collection(PROJECTS).doc(id).get();
  return snap.exists ? toProject(id, snap.data()!) : null;
}

async function projectsById(ids: string[]): Promise<Map<string, ProjectFacts>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const docs = await db().getAll(...unique.map((id) => db().collection(PROJECTS).doc(id)));
  return new Map(docs.filter((d) => d.exists).map((d) => [d.id, toProject(d.id, d.data()!)]));
}

// --- post configuration ---------------------------------------------------------------------------------------

export async function listPosts(): Promise<Array<{ config: PostConfig; project: ProjectFacts | null; updatedAt: Date }>> {
  const snap = await db().collection(POSTS).orderBy("updatedAt", "desc").limit(300).get();
  if (snap.empty) return [];
  const byProject = await projectsById(snap.docs.flatMap((d) => (d.data().projectId ? [d.data().projectId as string] : [])));
  return snap.docs.map((d) => ({
    config: toConfig(d.id, d.data()),
    project: d.data().projectId ? (byProject.get(d.data().projectId) ?? null) : null,
    updatedAt: reqDate(d.data().updatedAt),
  }));
}

export async function getPost(id: string): Promise<{ config: PostConfig; project: ProjectFacts | null; updatedAt: Date } | null> {
  const snap = await db().collection(POSTS).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { config: toConfig(id, d), project: d.projectId ? await getProject(d.projectId) : null, updatedAt: reqDate(d.updatedAt) };
}

export async function findPostByPlatformId(platform: AutomationPlatform, postId: string): Promise<{ config: PostConfig; project: ProjectFacts | null } | null> {
  const snap = await db().collection(POSTS).where("platform", "==", platform).where("postId", "in", postIdCandidates(platform, postId)).limit(1).get();
  return snap.empty ? null : getPost(snap.docs[0].id);
}

const projectMissing = "That project could not be found.";

function triggersOf(input: PostInput) {
  const seen = new Set<string>();
  return input.triggers.map((t) => {
    // The same keyword may appear only once per post (a unique index in PostgreSQL).
    if (seen.has(t.keyword)) throw new Error(`Duplicate keyword ${t.keyword}.`);
    seen.add(t.keyword);
    return { keyword: t.keyword, intent: t.intent, dmTemplate: t.dmTemplate };
  });
}

export async function createPost(input: PostInput, actor: string, now: Date): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const id = randomUUID();
  const triggers = triggersOf(input);
  try {
    await db().runTransaction(async (tx) => {
      if (input.projectId && !(await tx.get(db().collection(PROJECTS).doc(input.projectId))).exists) throw new Error(projectMissing);
      if (input.postId) {
        const lookup = db().collection("lookups").doc(postKey(input.platform, input.postId));
        if ((await tx.get(lookup)).exists) throw new Error("DUPLICATE_POST");
        tx.create(lookup, { automationId: id });
      }
      const doc = {
        platform: input.platform,
        postId: input.postId ?? null,
        postUrl: input.postUrl ?? null,
        videoTitle: input.videoTitle,
        contentFormat: input.contentFormat,
        mode: "DRY_RUN",
        liveConfirmedAt: null,
        liveConfirmedBy: null,
        projectId: input.projectId ?? null,
        priceApproved: false,
        priceVerifiedAt: null,
        priceSnapshot: null,
        availabilityText: input.availabilityText ?? null,
        availabilityVerifiedAt: null,
        approvedDetails: input.approvedDetails ?? null,
        safeFallbackTemplate: input.safeFallbackTemplate ?? null,
        publicReplyTemplate: input.publicReplyTemplate ?? null,
        publicReplyFallbackTemplate: input.publicReplyFallbackTemplate ?? null,
        triggers,
        createdAt: toTs(now),
        updatedAt: toTs(now),
        updatedBy: actor,
      };
      assertPostInvariants(doc);
      tx.create(db().collection(POSTS).doc(id), doc);
    });
    return { ok: true, id };
  } catch (error) {
    if ((error as Error).message === "DUPLICATE_POST") return { ok: false, error: "That post is already configured. Open it from the list instead." };
    if ((error as Error).message === projectMissing) return { ok: false, error: projectMissing };
    throw error;
  }
}

/**
 * Saves the Founder's edits. Anything that changes what a message could say (project, availability, details) invalidates the
 * related verification, so a changed fact is never sent on the strength of an old check. Mode and price approval are not touched
 * here: they have their own explicit actions.
 */
export async function updatePost(id: string, input: PostInput, actor: string, now: Date): Promise<RepoResult> {
  const triggers = triggersOf(input);
  return db().runTransaction(async (tx) => {
      const ref = db().collection(POSTS).doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, error: "That post could not be found." };
      const current = snap.data()!;
      if (input.projectId && !(await tx.get(db().collection(PROJECTS).doc(input.projectId))).exists) return { ok: false as const, error: projectMissing };

      const oldKey = current.postId ? postKey(current.platform, current.postId) : null;
      const newKey = input.postId ? postKey(input.platform, input.postId) : null;
      let newLookupExists = false;
      if (newKey && newKey !== oldKey) {
        const existing = await tx.get(db().collection("lookups").doc(newKey));
        newLookupExists = existing.exists && existing.data()!.automationId !== id;
        if (newLookupExists) return { ok: false as const, error: "Another post already uses that platform and post ID." };
      }

      const projectChanged = (current.projectId ?? null) !== (input.projectId ?? null);
      const availabilityChanged = (current.availabilityText ?? null) !== (input.availabilityText ?? null);
      const next: Data = {
        ...current,
        platform: input.platform,
        postId: input.postId ?? null,
        postUrl: input.postUrl ?? null,
        videoTitle: input.videoTitle,
        contentFormat: input.contentFormat,
        projectId: input.projectId ?? null,
        availabilityText: input.availabilityText ?? null,
        approvedDetails: input.approvedDetails ?? null,
        safeFallbackTemplate: input.safeFallbackTemplate ?? null,
        publicReplyTemplate: input.publicReplyTemplate ?? null,
        publicReplyFallbackTemplate: input.publicReplyFallbackTemplate ?? null,
        triggers,
        updatedAt: toTs(now),
        updatedBy: actor,
      };
      if (projectChanged) Object.assign(next, { priceApproved: false, priceVerifiedAt: null, priceSnapshot: null, availabilityVerifiedAt: null });
      if (availabilityChanged) next.availabilityVerifiedAt = null;
      // Dropping the project while Live would break the rule; pointing a Live configuration at a different post is a new
      // decision. Either way it goes back to Dry run and must be confirmed again.
      if ((input.projectId === null || input.postId !== current.postId) && current.mode === "LIVE") Object.assign(next, { mode: "DRY_RUN", liveConfirmedAt: null, liveConfirmedBy: null });
      assertPostInvariants(next);

      if (oldKey !== newKey) {
        if (oldKey) tx.delete(db().collection("lookups").doc(oldKey));
        if (newKey) tx.create(db().collection("lookups").doc(newKey), { automationId: id });
      }
      tx.set(ref, next);
      return { ok: true as const };
    });
}

export async function deletePost(id: string): Promise<RepoResult> {
  try {
    const ref = db().collection(POSTS).doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      const d = snap.data()!;
      if (d.postId) await db().collection("lookups").doc(postKey(d.platform, d.postId)).delete();
      // The comment history stays; it just no longer points at the deleted configuration (ON DELETE SET NULL).
      const events = await db().collection(EVENTS).where("automationId", "==", id).get();
      for (let i = 0; i < events.docs.length; i += 400) {
        const batch = db().batch();
        for (const e of events.docs.slice(i, i + 400)) batch.update(e.ref, { automationId: null });
        await batch.commit();
      }
      await ref.delete();
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not delete the post." };
  }
}

export async function setPostMode(id: string, mode: AutomationMode, actor: string, now: Date): Promise<RepoResult> {
  const post = await getPost(id);
  if (!post) return { ok: false, error: "That post could not be found." };
  if (mode === "LIVE") {
    if (!post.config.postId) return { ok: false, error: "Link the published post (its ID) before going Live. A draft cannot receive comments." };
    if (!post.config.projectId) return { ok: false, error: "Choose the project this post is about before going Live." };
    if (post.config.triggers.length === 0) return { ok: false, error: "Add at least one trigger before going Live." };
  }
  await db()
    .collection(POSTS)
    .doc(id)
    .update({ mode, liveConfirmedAt: mode === "LIVE" ? toTs(now) : null, liveConfirmedBy: mode === "LIVE" ? actor : null, updatedAt: toTs(now), updatedBy: actor });
  return { ok: true };
}

export async function verifyPrice(id: string, actor: string, now: Date): Promise<RepoResult> {
  const post = await getPost(id);
  if (!post) return { ok: false, error: "That post could not be found." };
  if (!post.project) return { ok: false, error: "Choose the project first." };
  const snapshot = priceFingerprint(post.project);
  if (snapshot === null) return { ok: false, error: "This project has no price on file. Add one under Projects first." };
  await db().collection(POSTS).doc(id).update({ priceApproved: true, priceVerifiedAt: toTs(now), priceSnapshot: snapshot, updatedAt: toTs(now), updatedBy: actor });
  return { ok: true };
}

export async function revokePriceApproval(id: string, actor: string, now: Date): Promise<void> {
  const ref = db().collection(POSTS).doc(id);
  if (!(await ref.get()).exists) return;
  await ref.update({ priceApproved: false, priceVerifiedAt: null, priceSnapshot: null, updatedAt: toTs(now), updatedBy: actor });
}

export async function verifyAvailability(id: string, actor: string, now: Date): Promise<RepoResult> {
  const post = await getPost(id);
  if (!post) return { ok: false, error: "That post could not be found." };
  if (!post.config.availabilityText?.trim()) return { ok: false, error: "Write the availability first, then verify it." };
  await db().collection(POSTS).doc(id).update({ availabilityVerifiedAt: toTs(now), updatedAt: toTs(now), updatedBy: actor });
  return { ok: true };
}

// --- follow-up ------------------------------------------------------------------------------------------------

export async function setFollowUp(id: string, status: "OPEN" | "DONE" | "DISMISSED", note: string | null, now: Date): Promise<RepoResult> {
  const ref = db().collection(EVENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.followUpRequired !== true) return { ok: false, error: "That enquiry could not be found." };
  await ref.update({ followUpStatus: status, followUpNote: note, followUpUpdatedAt: toTs(now) });
  return { ok: true };
}

// --- analytics ------------------------------------------------------------------------------------------------

const DM_ATTEMPTED = new Set(["SENT", "FAILED", "INELIGIBLE"]);
const DM_FAILED = new Set(["FAILED", "INELIGIBLE"]);

export async function automationSummary(from: Date | null, to: Date | null): Promise<AutomationSummary> {
  let q: FirebaseFirestore.Query = db().collection(EVENTS);
  if (from) q = q.where("receivedAt", ">=", toTs(from));
  if (to) q = q.where("receivedAt", "<", toTs(to));
  const events = (await q.get()).docs.map((d) => d.data());

  const matched = (e: Data) => e.triggerKeyword != null;
  const sent = (e: Data) => e.dmStatus === "SENT";
  const attempted = (e: Data) => DM_ATTEMPTED.has(e.dmStatus);
  const failed = (e: Data) => DM_FAILED.has(e.dmStatus);
  const count = (rows: Data[], f: (e: Data) => boolean) => rows.filter(f).length;

  const group = (key: (e: Data) => string | null) => {
    const m = new Map<string, Data[]>();
    for (const e of events) {
      const k = key(e);
      if (k === null) continue;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  };

  const byPlatform = [...group((e) => e.platform)].map(([platform, rows]) => ({ platform, qualifying: count(rows, matched), dmSent: count(rows, sent) }));

  const automationIds = [...new Set(events.flatMap((e) => (e.automationId ? [e.automationId as string] : [])))];
  const titles = new Map<string, string>();
  if (automationIds.length) {
    for (const d of await db().getAll(...automationIds.map((id) => db().collection(POSTS).doc(id)))) if (d.exists) titles.set(d.id, d.data()!.videoTitle);
  }
  const projects = await projectsById(events.flatMap((e) => (e.projectId ? [e.projectId as string] : [])));
  const maxOf = (values: Array<string | null | undefined>) => values.filter((v): v is string => !!v).sort().at(-1) ?? null;

  const byPost = [...group((e) => `${e.platform}\u0000${e.postId}`)]
    .map(([key, rows]) => {
      const [platform, postId] = key.split("\u0000");
      return {
        platform,
        postId,
        title: maxOf(rows.map((e) => (e.automationId ? titles.get(e.automationId) : null))),
        projectName: maxOf(rows.map((e) => (e.projectId ? projects.get(e.projectId)?.name : null))),
        qualifying: count(rows, matched),
        dmSent: count(rows, sent),
        dmFailed: count(rows, failed),
      };
    })
    .sort((a, b) => b.qualifying - a.qualifying)
    .slice(0, 50);

  const byKeyword = [...group((e) => (matched(e) ? (e.triggerKeyword as string) : null))]
    .map(([keyword, rows]) => ({ keyword, qualifying: rows.length, dmAttempted: count(rows, attempted), dmSent: count(rows, sent) }))
    .sort((a, b) => b.qualifying - a.qualifying)
    .slice(0, 50);

  return {
    qualifying: count(events, matched),
    dmAttempted: count(events, attempted),
    dmSent: count(events, sent),
    dmFailed: count(events, failed),
    dryRuns: count(events, (e) => e.dmStatus === "DRY_RUN"),
    repliesCompleted: count(events, (e) => e.replyStatus === "SENT"),
    duplicatesIgnored: events.reduce((s, e) => s + (e.duplicateCount ?? 0), 0),
    needFollowUp: count(events, (e) => e.followUpRequired === true && e.followUpStatus === "OPEN"),
    byPlatform,
    byPost,
    byKeyword,
  };
}

export async function listCommentEvents(limit = 100, onlyFollowUp = false): Promise<CommentEventRow[]> {
  let q: FirebaseFirestore.Query = db().collection(EVENTS);
  if (onlyFollowUp) q = q.where("followUpRequired", "==", true).where("followUpStatus", "==", "OPEN");
  const snap = await q.orderBy("receivedAt", "desc").limit(limit).get();
  return snap.docs.map((doc) => {
    const r = doc.data();
    return {
      id: doc.id,
      platform: r.platform,
      postId: r.postId,
      commentId: r.commentId,
      commenterUsername: r.commenterUsername ?? null,
      commentText: r.commentText ?? null,
      receivedAt: reqDate(r.receivedAt),
      triggerKeyword: r.triggerKeyword ?? null,
      detectedIntent: r.detectedIntent ?? null,
      modeAtProcessing: r.modeAtProcessing ?? null,
      outcome: r.outcome,
      dmStatus: r.dmStatus,
      dmFailureReason: r.dmFailureReason ?? null,
      dmMessageId: r.dmMessageId ?? null,
      replyStatus: r.replyStatus,
      replyFailureReason: r.replyFailureReason ?? null,
      replyPlatformId: r.replyPlatformId ?? null,
      duplicateCount: r.duplicateCount ?? 0,
      followUpRequired: r.followUpRequired === true,
      followUpReason: r.followUpReason ?? null,
      followUpStatus: r.followUpStatus,
      followUpNote: r.followUpNote ?? null,
    };
  });
}

// --- the incoming-comment pipeline ----------------------------------------------------------------------------

export function createProcessorStore(): ProcessorStore {
  return {
    getSettings,
    findPost: findPostByPlatformId,

    async recordComment(comment: IncomingComment, now: Date) {
      const id = eventId(comment.platform, comment.commentId);
      const ref = db().collection(EVENTS).doc(id);
      try {
        await ref.create({
          platform: comment.platform,
          commentId: comment.commentId,
          postId: comment.postId,
          automationId: null,
          projectId: null,
          commenterId: comment.commenterId ?? null,
          commenterUsername: comment.commenterUsername ?? null,
          commentText: comment.text ?? null,
          commentedAt: comment.commentedAt ?? null,
          receivedAt: toTs(now),
          triggerKeyword: null,
          detectedIntent: null,
          modeAtProcessing: null,
          outcome: "RECEIVED",
          dmStatus: "NOT_ATTEMPTED",
          dmText: null,
          dmFailureReason: null,
          dmMessageId: null,
          dmAttemptedAt: null,
          replyStatus: "NOT_ATTEMPTED",
          replyText: null,
          replyFailureReason: null,
          replyPlatformId: null,
          replyAttemptedAt: null,
          duplicateCount: 0,
          followUpRequired: false,
          followUpReason: null,
          followUpStatus: "NONE",
          followUpNote: null,
          followUpUpdatedAt: null,
        });
        return { id };
      } catch (error) {
        // gRPC ALREADY_EXISTS (6): this comment was delivered before; count the repeat and do nothing else.
        if ((error as { code?: number }).code === 6) {
          await ref.update({ duplicateCount: FieldValue.increment(1) });
          return "duplicate" as const;
        }
        throw error;
      }
    },

    async updateEvent(id: string, patch: EventPatch) {
      await db().collection(EVENTS).doc(id).update(patch as Data);
    },
  };
}

export async function recentUnlinkedPosts(platform: AutomationPlatform, limit = 8): Promise<Array<{ postId: string; comments: number; lastAt: Date; sample: string | null }>> {
  const snap = await db()
    .collection(EVENTS)
    .where("platform", "==", platform)
    .where("outcome", "==", "NOT_CONFIGURED")
    .where("automationId", "==", null)
    .orderBy("receivedAt", "desc")
    .limit(500)
    .get();
  const byPost = new Map<string, { postId: string; comments: number; lastAt: Date; sample: string | null }>();
  for (const d of snap.docs) {
    const r = d.data();
    const at = reqDate(r.receivedAt);
    const cur = byPost.get(r.postId);
    if (!cur) byPost.set(r.postId, { postId: r.postId, comments: 1, lastAt: at, sample: r.commentText ?? null });
    else {
      cur.comments += 1;
      if (at > cur.lastAt) cur.lastAt = at;
      if (r.commentText && (!cur.sample || r.commentText > cur.sample)) cur.sample = r.commentText;
    }
  }
  return [...byPost.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime()).slice(0, limit);
}
