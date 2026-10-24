import { createHmac, timingSafeEqual } from "node:crypto";
import type { AutomationPlatform } from "../types.ts";

/**
 * Reading what Meta sends us. Nothing here sends anything or touches the database.
 *
 * Two things are proved before a delivery is trusted: that it was signed with our app secret (X-Hub-Signature-256 over the raw
 * body), and, when Meta first subscribes the webhook, that the verify token matches. Anything else is ignored.
 */

export interface IncomingComment {
  platform: AutomationPlatform;
  commentId: string;
  /** The post/media the comment is on, as the platform names it. */
  postId: string;
  text: string | null;
  commenterId: string | null;
  commenterUsername: string | null;
  commentedAt: Date | null;
  /** True for a reply to another comment. Private replies only work on top-level comments, so these are not automated. */
  isReply: boolean;
  /** True when the comment was written by our own account (our public reply comes back through the webhook; it must never trigger anything). */
  fromOwnAccount: boolean;
}

export type OwnAccountIds = Partial<Record<AutomationPlatform, string>>;

/** True only if `header` is the HMAC-SHA256 of `rawBody` under `appSecret`. Constant-time; any malformed header is a plain false. */
export function verifySignature(rawBody: string, header: string | null | undefined, appSecret: string): boolean {
  if (!appSecret || !header || !header.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Meta's subscribe handshake: echo the challenge only when the mode and the verify token are right. */
export function verifyChallenge(params: URLSearchParams, expectedToken: string): string | null {
  if (!expectedToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  const token = params.get("hub.verify_token") ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return params.get("hub.challenge");
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : typeof v === "number" ? String(v) : null);
const seconds = (v: unknown): Date | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};

/** Every new comment in one delivery. Entries that are not new comments (likes, edits, deletes, other fields) are dropped. */
export function parseComments(body: unknown, own: OwnAccountIds): IncomingComment[] {
  const root = obj(body);
  if (!root || !Array.isArray(root.entry)) return [];
  const platform: AutomationPlatform | null = root.object === "instagram" ? "INSTAGRAM" : root.object === "page" ? "FACEBOOK" : null;
  if (!platform) return [];

  const out: IncomingComment[] = [];
  for (const rawEntry of root.entry) {
    const entry = obj(rawEntry);
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const rawChange of entry.changes) {
      const change = obj(rawChange);
      const value = obj(change?.value);
      if (!change || !value) continue;
      const from = obj(value.from);
      const ownId = own[platform] ?? str(entry.id);

      if (platform === "INSTAGRAM" && change.field === "comments") {
        const commentId = str(value.id);
        const postId = str(obj(value.media)?.id);
        if (!commentId || !postId) continue;
        const commenterId = str(from?.id);
        out.push({
          platform,
          commentId,
          postId,
          text: typeof value.text === "string" ? value.text : null,
          commenterId,
          commenterUsername: str(from?.username),
          commentedAt: seconds(entry.time),
          isReply: str(value.parent_id) !== null,
          fromOwnAccount: commenterId !== null && commenterId === ownId,
        });
      } else if (platform === "FACEBOOK" && change.field === "feed" && value.item === "comment" && value.verb === "add") {
        const commentId = str(value.comment_id);
        const postId = str(value.post_id);
        if (!commentId || !postId) continue;
        const commenterId = str(from?.id);
        const parent = str(value.parent_id);
        out.push({
          platform,
          commentId,
          postId,
          text: typeof value.message === "string" ? value.message : null,
          commenterId,
          commenterUsername: str(from?.name),
          commentedAt: seconds(value.created_time) ?? seconds(entry.time),
          // On Facebook a top-level comment's parent is the post itself; anything else is a reply to a comment.
          isReply: parent !== null && parent !== postId,
          fromOwnAccount: commenterId !== null && commenterId === ownId,
        });
      }
    }
  }
  return out;
}

/** The ids a Facebook post may be stored under: the full "pageid_postid" and the bare post id. Instagram ids are used as given. */
export function postIdCandidates(platform: AutomationPlatform, postId: string): string[] {
  if (platform !== "FACEBOOK" || !postId.includes("_")) return [postId];
  return [postId, postId.slice(postId.indexOf("_") + 1)];
}
