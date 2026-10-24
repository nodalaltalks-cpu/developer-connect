import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../../developer-connect/db/client.ts";
import { projects, socialAutomationSettings, socialCommentEvents, socialPostAutomations, socialPostTriggers } from "../../developer-connect/db/schema.ts";
import { priceFingerprint } from "../logic.ts";
import { postIdCandidates } from "../meta/webhook.ts";
import type { IncomingComment } from "../meta/webhook.ts";
import type { EventPatch, ProcessorStore } from "../process.ts";
import type { PostInput } from "../input.ts";
import type { AutomationCurrency, AutomationMode, AutomationPlatform, AutomationSettings, ContentFormat, PostConfig, ProjectFacts, TriggerIntent } from "../types.ts";
import { DEFAULT_SETTINGS } from "../types.ts";

/** The database side of the comment-to-DM automation. Founder-only callers; nothing here is reachable from a public page. */

export type RepoResult = { ok: true } | { ok: false; error: string };

const toProject = (row: typeof projects.$inferSelect): ProjectFacts => ({
  id: row.id,
  name: row.name,
  city: row.city,
  locality: row.locality,
  priceMin: row.priceMin,
  priceMax: row.priceMax,
  currency: row.currency as AutomationCurrency | null,
  status: row.status,
});

type PostRow = typeof socialPostAutomations.$inferSelect;
type TriggerRow = typeof socialPostTriggers.$inferSelect;

const toConfig = (row: PostRow, triggers: TriggerRow[]): PostConfig => ({
  id: row.id,
  platform: row.platform as AutomationPlatform,
  postId: row.postId,
  postUrl: row.postUrl,
  videoTitle: row.videoTitle,
  contentFormat: row.contentFormat as ContentFormat,
  mode: row.mode as AutomationMode,
  projectId: row.projectId,
  priceApproved: row.priceApproved,
  priceVerifiedAt: row.priceVerifiedAt,
  priceSnapshot: row.priceSnapshot,
  availabilityText: row.availabilityText,
  availabilityVerifiedAt: row.availabilityVerifiedAt,
  approvedDetails: row.approvedDetails,
  safeFallbackTemplate: row.safeFallbackTemplate,
  publicReplyTemplate: row.publicReplyTemplate,
  publicReplyFallbackTemplate: row.publicReplyFallbackTemplate,
  triggers: triggers
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({ keyword: t.keyword, intent: t.intent as TriggerIntent, dmTemplate: t.dmTemplate })),
});

// --- settings -------------------------------------------------------------------------------------------------

export async function getSettings(): Promise<AutomationSettings> {
  const [row] = await getDb().select().from(socialAutomationSettings).where(eq(socialAutomationSettings.id, "global")).limit(1);
  if (!row) return DEFAULT_SETTINGS;
  return {
    enabled: row.enabled,
    priceMaxAgeDays: row.priceMaxAgeDays,
    availabilityMaxAgeDays: row.availabilityMaxAgeDays,
    defaultPublicReply: row.defaultPublicReply,
    defaultPublicReplyFallback: row.defaultPublicReplyFallback,
  };
}

const fields = (s: AutomationSettings) => ({
  enabled: s.enabled,
  priceMaxAgeDays: s.priceMaxAgeDays,
  availabilityMaxAgeDays: s.availabilityMaxAgeDays,
  defaultPublicReply: s.defaultPublicReply,
  defaultPublicReplyFallback: s.defaultPublicReplyFallback,
});

export async function saveSettings(patch: Partial<AutomationSettings>, actor: string, now: Date): Promise<void> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await getDb()
    .insert(socialAutomationSettings)
    .values({ id: "global", ...fields(next), updatedAt: now, updatedBy: actor })
    .onConflictDoUpdate({ target: socialAutomationSettings.id, set: { ...fields(next), updatedAt: now, updatedBy: actor } });
}

// --- projects -------------------------------------------------------------------------------------------------

export async function listProjects(): Promise<ProjectFacts[]> {
  const rows = await getDb().select().from(projects).where(eq(projects.status, "ACTIVE")).orderBy(asc(projects.name)).limit(500);
  return rows.map(toProject);
}

export async function getProject(id: string): Promise<ProjectFacts | null> {
  const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ? toProject(row) : null;
}

// --- post configuration ---------------------------------------------------------------------------------------

export async function listPosts(): Promise<Array<{ config: PostConfig; project: ProjectFacts | null; updatedAt: Date }>> {
  const db = getDb();
  const rows = await db.select().from(socialPostAutomations).orderBy(desc(socialPostAutomations.updatedAt)).limit(300);
  if (rows.length === 0) return [];
  const triggers = await db.select().from(socialPostTriggers);
  const projectRows = await db.select().from(projects);
  const byProject = new Map(projectRows.map((p) => [p.id, toProject(p)]));
  return rows.map((row) => ({
    config: toConfig(row, triggers.filter((t) => t.automationId === row.id)),
    project: row.projectId ? (byProject.get(row.projectId) ?? null) : null,
    updatedAt: row.updatedAt,
  }));
}

export async function getPost(id: string): Promise<{ config: PostConfig; project: ProjectFacts | null; updatedAt: Date } | null> {
  const db = getDb();
  const [row] = await db.select().from(socialPostAutomations).where(eq(socialPostAutomations.id, id)).limit(1);
  if (!row) return null;
  const triggers = await db.select().from(socialPostTriggers).where(eq(socialPostTriggers.automationId, id));
  return { config: toConfig(row, triggers), project: row.projectId ? await getProject(row.projectId) : null, updatedAt: row.updatedAt };
}

/** The post a webhook comment belongs to, if the Founder configured it. */
export async function findPostByPlatformId(platform: AutomationPlatform, postId: string): Promise<{ config: PostConfig; project: ProjectFacts | null } | null> {
  const [row] = await getDb()
    .select({ id: socialPostAutomations.id })
    .from(socialPostAutomations)
    .where(and(eq(socialPostAutomations.platform, platform), inArray(socialPostAutomations.postId, postIdCandidates(platform, postId))))
    .limit(1);
  return row ? getPost(row.id) : null;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export async function createPost(input: PostInput, actor: string, now: Date): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const id = randomUUID();
  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(socialPostAutomations).values({
        id,
        platform: input.platform,
        postId: input.postId,
        postUrl: input.postUrl,
        videoTitle: input.videoTitle,
        contentFormat: input.contentFormat,
        mode: "DRY_RUN",
        projectId: input.projectId,
        availabilityText: input.availabilityText,
        approvedDetails: input.approvedDetails,
        safeFallbackTemplate: input.safeFallbackTemplate,
        publicReplyTemplate: input.publicReplyTemplate,
        publicReplyFallbackTemplate: input.publicReplyFallbackTemplate,
        createdAt: now,
        updatedAt: now,
        updatedBy: actor,
      });
      await tx.insert(socialPostTriggers).values(input.triggers.map((t, i) => ({ id: randomUUID(), automationId: id, keyword: t.keyword, intent: t.intent, dmTemplate: t.dmTemplate, sortOrder: i })));
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "That post is already configured. Open it from the list instead." };
    if ((error as { code?: string })?.code === "23503") return { ok: false, error: "That project could not be found." };
    throw error;
  }
}

/**
 * Saves the Founder's edits. Anything that changes what a message could say (project, availability, details) invalidates the
 * related verification, so a changed fact is never sent on the strength of an old check. Mode and price approval are not touched
 * here: they have their own explicit actions.
 */
export async function updatePost(id: string, input: PostInput, actor: string, now: Date): Promise<RepoResult> {
  try {
    return await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(socialPostAutomations).where(eq(socialPostAutomations.id, id)).limit(1);
      if (!current) return { ok: false as const, error: "That post could not be found." };
      const projectChanged = current.projectId !== input.projectId;
      const availabilityChanged = (current.availabilityText ?? null) !== input.availabilityText;
      const patch: Partial<typeof socialPostAutomations.$inferInsert> = {
        platform: input.platform,
        postId: input.postId,
        postUrl: input.postUrl,
        videoTitle: input.videoTitle,
        contentFormat: input.contentFormat,
        projectId: input.projectId,
        availabilityText: input.availabilityText,
        approvedDetails: input.approvedDetails,
        safeFallbackTemplate: input.safeFallbackTemplate,
        publicReplyTemplate: input.publicReplyTemplate,
        publicReplyFallbackTemplate: input.publicReplyFallbackTemplate,
        updatedAt: now,
        updatedBy: actor,
      };
      if (projectChanged) Object.assign(patch, { priceApproved: false, priceVerifiedAt: null, priceSnapshot: null, availabilityVerifiedAt: null });
      if (availabilityChanged) patch.availabilityVerifiedAt = null;
      // Dropping the project while Live would break the database rule; fall back to Dry Run instead.
      // Pointing a Live configuration at a different post is a new decision: it goes back to Dry run and must be confirmed again.
      if ((input.projectId === null || input.postId !== current.postId) && current.mode === "LIVE") Object.assign(patch, { mode: "DRY_RUN", liveConfirmedAt: null, liveConfirmedBy: null });
      await tx.update(socialPostAutomations).set(patch).where(eq(socialPostAutomations.id, id));
      await tx.delete(socialPostTriggers).where(eq(socialPostTriggers.automationId, id));
      await tx.insert(socialPostTriggers).values(input.triggers.map((t, i) => ({ id: randomUUID(), automationId: id, keyword: t.keyword, intent: t.intent, dmTemplate: t.dmTemplate, sortOrder: i })));
      return { ok: true as const };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Another post already uses that platform and post ID." };
    if ((error as { code?: string })?.code === "23503") return { ok: false, error: "That project could not be found." };
    throw error;
  }
}

export async function deletePost(id: string): Promise<RepoResult> {
  try {
    await getDb().delete(socialPostAutomations).where(eq(socialPostAutomations.id, id));
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not delete the post." };
  }
}

/**
 * Sets the post's mode. LIVE additionally needs a project and is recorded with who confirmed and when; the caller must already
 * have required the Founder's explicit confirmation. Leaving LIVE clears that confirmation, so going Live again asks again.
 */
export async function setPostMode(id: string, mode: AutomationMode, actor: string, now: Date): Promise<RepoResult> {
  const post = await getPost(id);
  if (!post) return { ok: false, error: "That post could not be found." };
  if (mode === "LIVE") {
    if (!post.config.postId) return { ok: false, error: "Link the published post (its ID) before going Live. A draft cannot receive comments." };
    if (!post.config.projectId) return { ok: false, error: "Choose the project this post is about before going Live." };
    if (post.config.triggers.length === 0) return { ok: false, error: "Add at least one trigger before going Live." };
  }
  await getDb()
    .update(socialPostAutomations)
    .set({ mode, liveConfirmedAt: mode === "LIVE" ? now : null, liveConfirmedBy: mode === "LIVE" ? actor : null, updatedAt: now, updatedBy: actor })
    .where(eq(socialPostAutomations.id, id));
  return { ok: true };
}

/** The Founder checked the project's current price and approves it for automatic messages. Captures the price as it is right now. */
export async function verifyPrice(id: string, actor: string, now: Date): Promise<RepoResult> {
  const post = await getPost(id);
  if (!post) return { ok: false, error: "That post could not be found." };
  if (!post.project) return { ok: false, error: "Choose the project first." };
  const snapshot = priceFingerprint(post.project);
  if (snapshot === null) return { ok: false, error: "This project has no price on file. Add one under Projects first." };
  await getDb().update(socialPostAutomations).set({ priceApproved: true, priceVerifiedAt: now, priceSnapshot: snapshot, updatedAt: now, updatedBy: actor }).where(eq(socialPostAutomations.id, id));
  return { ok: true };
}

export async function revokePriceApproval(id: string, actor: string, now: Date): Promise<void> {
  await getDb().update(socialPostAutomations).set({ priceApproved: false, priceVerifiedAt: null, priceSnapshot: null, updatedAt: now, updatedBy: actor }).where(eq(socialPostAutomations.id, id));
}

export async function verifyAvailability(id: string, actor: string, now: Date): Promise<RepoResult> {
  const post = await getPost(id);
  if (!post) return { ok: false, error: "That post could not be found." };
  if (!post.config.availabilityText?.trim()) return { ok: false, error: "Write the availability first, then verify it." };
  await getDb().update(socialPostAutomations).set({ availabilityVerifiedAt: now, updatedAt: now, updatedBy: actor }).where(eq(socialPostAutomations.id, id));
  return { ok: true };
}

// --- follow-up ------------------------------------------------------------------------------------------------

export async function setFollowUp(eventId: string, status: "OPEN" | "DONE" | "DISMISSED", note: string | null, now: Date): Promise<RepoResult> {
  const rows = await getDb()
    .update(socialCommentEvents)
    .set({ followUpStatus: status, followUpNote: note, followUpUpdatedAt: now })
    .where(and(eq(socialCommentEvents.id, eventId), eq(socialCommentEvents.followUpRequired, true)))
    .returning({ id: socialCommentEvents.id });
  return rows.length > 0 ? { ok: true } : { ok: false, error: "That enquiry could not be found." };
}

// --- analytics ------------------------------------------------------------------------------------------------

export interface AutomationSummary {
  qualifying: number;
  dmAttempted: number;
  dmSent: number;
  dmFailed: number;
  dryRuns: number;
  repliesCompleted: number;
  duplicatesIgnored: number;
  needFollowUp: number;
  byPlatform: Array<{ platform: string; qualifying: number; dmSent: number }>;
  byPost: Array<{ platform: string; postId: string; title: string | null; projectName: string | null; qualifying: number; dmSent: number; dmFailed: number }>;
  byKeyword: Array<{ keyword: string; qualifying: number; dmAttempted: number; dmSent: number }>;
}

export interface CommentEventRow {
  id: string;
  platform: string;
  postId: string;
  commentId: string;
  commenterUsername: string | null;
  commentText: string | null;
  receivedAt: Date;
  triggerKeyword: string | null;
  detectedIntent: string | null;
  modeAtProcessing: string | null;
  outcome: string;
  dmStatus: string;
  dmFailureReason: string | null;
  dmMessageId: string | null;
  replyStatus: string;
  replyFailureReason: string | null;
  replyPlatformId: string | null;
  duplicateCount: number;
  followUpRequired: boolean;
  followUpReason: string | null;
  followUpStatus: string;
  followUpNote: string | null;
}

/**
 * Counts come straight from the stored events. "Attempted" means the platform was actually asked (sent, refused or failed);
 * a Dry Run is counted on its own and never as a send. Nothing here says a message was read: Meta's webhook does not tell us.
 */
export async function automationSummary(from: Date | null, to: Date | null): Promise<AutomationSummary> {
  const db = getDb();
  const inRange = and(from ? gte(socialCommentEvents.receivedAt, from) : undefined, to ? lt(socialCommentEvents.receivedAt, to) : undefined);
  const matched = sql`${socialCommentEvents.triggerKeyword} is not null`;
  const attempted = sql`${socialCommentEvents.dmStatus} in ('SENT', 'FAILED', 'INELIGIBLE')`;
  const sent = sql`${socialCommentEvents.dmStatus} = 'SENT'`;
  const failed = sql`${socialCommentEvents.dmStatus} in ('FAILED', 'INELIGIBLE')`;
  const n = (cond: ReturnType<typeof sql>) => sql<number>`count(*) filter (where ${cond})::int`;

  const [total] = await db
    .select({
      qualifying: n(matched),
      dmAttempted: n(attempted),
      dmSent: n(sent),
      dmFailed: n(failed),
      dryRuns: n(sql`${socialCommentEvents.dmStatus} = 'DRY_RUN'`),
      repliesCompleted: n(sql`${socialCommentEvents.replyStatus} = 'SENT'`),
      duplicatesIgnored: sql<number>`coalesce(sum(${socialCommentEvents.duplicateCount}), 0)::int`,
      needFollowUp: n(sql`${socialCommentEvents.followUpRequired} and ${socialCommentEvents.followUpStatus} = 'OPEN'`),
    })
    .from(socialCommentEvents)
    .where(inRange);

  const byPlatform = await db
    .select({ platform: socialCommentEvents.platform, qualifying: n(matched), dmSent: n(sent) })
    .from(socialCommentEvents)
    .where(inRange)
    .groupBy(socialCommentEvents.platform);

  const byPost = await db
    .select({
      platform: socialCommentEvents.platform,
      postId: socialCommentEvents.postId,
      title: sql<string | null>`max(${socialPostAutomations.videoTitle})`,
      projectName: sql<string | null>`max(${projects.name})`,
      qualifying: n(matched),
      dmSent: n(sent),
      dmFailed: n(failed),
    })
    .from(socialCommentEvents)
    .leftJoin(socialPostAutomations, eq(socialPostAutomations.id, socialCommentEvents.automationId))
    .leftJoin(projects, eq(projects.id, socialCommentEvents.projectId))
    .where(inRange)
    .groupBy(socialCommentEvents.platform, socialCommentEvents.postId)
    .orderBy(desc(n(matched)))
    .limit(50);

  const byKeyword = await db
    .select({ keyword: sql<string>`${socialCommentEvents.triggerKeyword}`, qualifying: n(matched), dmAttempted: n(attempted), dmSent: n(sent) })
    .from(socialCommentEvents)
    .where(and(inRange, matched))
    .groupBy(socialCommentEvents.triggerKeyword)
    .orderBy(desc(n(matched)))
    .limit(50);

  return { ...total, byPlatform, byPost, byKeyword };
}

export async function listCommentEvents(limit = 100, onlyFollowUp = false): Promise<CommentEventRow[]> {
  const rows = await getDb()
    .select()
    .from(socialCommentEvents)
    .where(onlyFollowUp ? and(eq(socialCommentEvents.followUpRequired, true), eq(socialCommentEvents.followUpStatus, "OPEN")) : undefined)
    .orderBy(desc(socialCommentEvents.receivedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    postId: r.postId,
    commentId: r.commentId,
    commenterUsername: r.commenterUsername,
    commentText: r.commentText,
    receivedAt: r.receivedAt,
    triggerKeyword: r.triggerKeyword,
    detectedIntent: r.detectedIntent,
    modeAtProcessing: r.modeAtProcessing,
    outcome: r.outcome,
    dmStatus: r.dmStatus,
    dmFailureReason: r.dmFailureReason,
    dmMessageId: r.dmMessageId,
    replyStatus: r.replyStatus,
    replyFailureReason: r.replyFailureReason,
    replyPlatformId: r.replyPlatformId,
    duplicateCount: r.duplicateCount,
    followUpRequired: r.followUpRequired,
    followUpReason: r.followUpReason,
    followUpStatus: r.followUpStatus,
    followUpNote: r.followUpNote,
  }));
}

// --- the incoming-comment pipeline ----------------------------------------------------------------------------

/** The database side of `processComment`. One comment is one row; the unique (platform, comment_id) makes a second delivery a no-op. */
export function createProcessorStore(): ProcessorStore {
  return {
    getSettings,
    findPost: findPostByPlatformId,

    async recordComment(comment: IncomingComment, now: Date) {
      const db = getDb();
      const id = randomUUID();
      const inserted = await db
        .insert(socialCommentEvents)
        .values({
          id,
          platform: comment.platform,
          commentId: comment.commentId,
          postId: comment.postId,
          commenterId: comment.commenterId,
          commenterUsername: comment.commenterUsername,
          commentText: comment.text,
          commentedAt: comment.commentedAt,
          receivedAt: now,
        })
        .onConflictDoNothing({ target: [socialCommentEvents.platform, socialCommentEvents.commentId] })
        .returning({ id: socialCommentEvents.id });
      if (inserted.length > 0) return { id };
      await db
        .update(socialCommentEvents)
        .set({ duplicateCount: sql`${socialCommentEvents.duplicateCount} + 1` })
        .where(and(eq(socialCommentEvents.platform, comment.platform), eq(socialCommentEvents.commentId, comment.commentId)));
      return "duplicate" as const;
    },

    async updateEvent(id: string, patch: EventPatch) {
      await getDb().update(socialCommentEvents).set(patch).where(eq(socialCommentEvents.id, id));
    },
  };
}

/**
 * Posts that received comments but have no configuration yet, newest first. This is how the Founder finds the platform's ID for a
 * reel that was just published: the first comment on it shows up here and can be linked to the draft with one tap.
 */
export async function recentUnlinkedPosts(platform: AutomationPlatform, limit = 8): Promise<Array<{ postId: string; comments: number; lastAt: Date; sample: string | null }>> {
  const rows = await getDb()
    .select({
      postId: socialCommentEvents.postId,
      comments: sql<number>`count(*)::int`,
      lastAt: sql<Date>`max(${socialCommentEvents.receivedAt})`,
      sample: sql<string | null>`max(${socialCommentEvents.commentText})`,
    })
    .from(socialCommentEvents)
    .where(and(eq(socialCommentEvents.platform, platform), isNull(socialCommentEvents.automationId), eq(socialCommentEvents.outcome, "NOT_CONFIGURED")))
    .groupBy(socialCommentEvents.postId)
    .orderBy(desc(sql`max(${socialCommentEvents.receivedAt})`))
    .limit(limit);
  return rows.map((r) => ({ ...r, lastAt: new Date(r.lastAt) }));
}
