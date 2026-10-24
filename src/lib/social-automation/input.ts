import { unknownPlaceholders } from "./logic.ts";
import { CONTENT_FORMATS, INTENTS, PLATFORMS } from "./types.ts";
import type { AutomationPlatform, ContentFormat, TriggerIntent } from "./types.ts";

/** Validation for what the Founder types into the post configuration. The browser sends text only; times and ids are the server's. */

export interface PostInput {
  platform: AutomationPlatform;
  /** Null until the reel is published and linked. */
  postId: string | null;
  postUrl: string | null;
  videoTitle: string;
  contentFormat: ContentFormat;
  projectId: string | null;
  availabilityText: string | null;
  approvedDetails: string | null;
  safeFallbackTemplate: string | null;
  publicReplyTemplate: string | null;
  publicReplyFallbackTemplate: string | null;
  triggers: Array<{ keyword: string; intent: TriggerIntent; dmTemplate: string }>;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_ID = /^[A-Za-z0-9_.:-]{3,100}$/;
const KEYWORD = /^[\p{L}\p{N}][\p{L}\p{N} ]{0,28}[\p{L}\p{N}]$|^[\p{L}\p{N}]{2}$/u;
const META_HOSTS = /(^|\.)(instagram\.com|facebook\.com|fb\.watch|fb\.com)$/i;

const text = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (trimmed.length > max) return undefined;
  return trimmed === "" ? null : trimmed;
};

/**
 * The rules for the two public replies, shared by a post and by the common reply in the settings. A public reply is posted as-is,
 * so it takes no placeholders, and the one used when NO DM went out must not claim one did. Returns the problem, or null.
 */
export function validatePublicReplies(sent: string | null, notSent: string | null): string | null {
  if ((sent && /\[[^\]]+\]/.test(sent)) || (notSent && /\[[^\]]+\]/.test(notSent))) return "The public reply cannot contain [placeholders].";
  if (notSent && /\b(dm|direct message|messaged you|sent you)\b/i.test(notSent)) return "The fallback public reply is used when NO message was sent, so it must not say a DM was sent.";
  return null;
}

export function validatePostInput(raw: Record<string, unknown>): ValidationResult<PostInput> {
  const platform = raw.platform;
  if (typeof platform !== "string" || !(PLATFORMS as readonly string[]).includes(platform)) return { ok: false, message: "Choose Instagram or Facebook." };

  // Left empty while the reel is being prepared; it is linked to the published post later.
  const postIdText = typeof raw.postId === "string" ? raw.postId.trim() : "";
  if (postIdText !== "" && !POST_ID.test(postIdText)) return { ok: false, message: "Enter the post ID exactly as the platform gives it (letters, numbers, - _ . :), or leave it empty until the reel is published." };
  const postId = postIdText === "" ? null : postIdText;

  let postUrl: string | null = null;
  const urlText = text(raw.postUrl, 500);
  if (urlText === undefined) return { ok: false, message: "That post link is too long." };
  if (urlText) {
    try {
      const url = new URL(urlText);
      if (url.protocol !== "https:" || !META_HOSTS.test(url.hostname)) throw new Error("host");
      postUrl = url.toString();
    } catch {
      return { ok: false, message: "The post link must be an https link on Instagram or Facebook." };
    }
  }

  const videoTitle = typeof raw.videoTitle === "string" ? raw.videoTitle.trim() : "";
  if (videoTitle.length < 2 || videoTitle.length > 120) return { ok: false, message: "Give the video a title of 2–120 characters." };

  const contentFormat = raw.contentFormat;
  if (typeof contentFormat !== "string" || !(CONTENT_FORMATS as readonly string[]).includes(contentFormat)) return { ok: false, message: "Choose Reel, Post or Video." };

  let projectId: string | null = null;
  if (raw.projectId !== undefined && raw.projectId !== null && raw.projectId !== "") {
    if (typeof raw.projectId !== "string" || !UUID.test(raw.projectId)) return { ok: false, message: "Choose a project from the list." };
    projectId = raw.projectId;
  }

  const availabilityText = text(raw.availabilityText, 200);
  const approvedDetails = text(raw.approvedDetails, 800);
  const safeFallbackTemplate = text(raw.safeFallbackTemplate, 900);
  const publicReplyTemplate = text(raw.publicReplyTemplate, 300);
  const publicReplyFallbackTemplate = text(raw.publicReplyFallbackTemplate, 300);
  if (availabilityText === undefined) return { ok: false, message: "Availability is limited to 200 characters." };
  if (approvedDetails === undefined) return { ok: false, message: "Approved details are limited to 800 characters." };
  if (safeFallbackTemplate === undefined) return { ok: false, message: "The safe fallback message is limited to 900 characters." };
  if (publicReplyTemplate === undefined || publicReplyFallbackTemplate === undefined) return { ok: false, message: "Public replies are limited to 300 characters." };

  if (safeFallbackTemplate) {
    const bad = unknownPlaceholders(safeFallbackTemplate);
    if (bad.length > 0) return { ok: false, message: `The safe fallback uses an unknown placeholder: [${bad[0]}].` };
    if (/\[(Verified Price|Availability|Approved Details)\]/.test(safeFallbackTemplate)) return { ok: false, message: "The safe fallback may only use [Property Name] and [Location]." };
  }
  const replyProblem = validatePublicReplies(publicReplyTemplate, publicReplyFallbackTemplate);
  if (replyProblem) return { ok: false, message: replyProblem };

  const rawTriggers = Array.isArray(raw.triggers) ? raw.triggers : [];
  if (rawTriggers.length < 1 || rawTriggers.length > 12) return { ok: false, message: "Add between 1 and 12 trigger keywords." };
  const seen = new Set<string>();
  const triggers: PostInput["triggers"] = [];
  for (const item of rawTriggers) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const keyword = typeof entry.keyword === "string" ? entry.keyword.trim().replace(/\s+/g, " ").toUpperCase() : "";
    if (!KEYWORD.test(keyword)) return { ok: false, message: `"${keyword || "(blank)"}" is not a valid keyword. Use 2–30 letters or numbers.` };
    if (seen.has(keyword)) return { ok: false, message: `The keyword ${keyword} is listed twice.` };
    seen.add(keyword);
    const intent = entry.intent;
    if (typeof intent !== "string" || !(INTENTS as readonly string[]).includes(intent)) return { ok: false, message: `Choose what ${keyword} is asking for.` };
    const dmTemplate = typeof entry.dmTemplate === "string" ? entry.dmTemplate.trim() : "";
    if (dmTemplate.length < 5 || dmTemplate.length > 900) return { ok: false, message: `The message for ${keyword} must be 5–900 characters.` };
    const bad = unknownPlaceholders(dmTemplate);
    if (bad.length > 0) return { ok: false, message: `The message for ${keyword} uses an unknown placeholder: [${bad[0]}].` };
    triggers.push({ keyword, intent: intent as TriggerIntent, dmTemplate });
  }

  return {
    ok: true,
    value: {
      platform: platform as AutomationPlatform,
      postId,
      postUrl,
      videoTitle,
      contentFormat: contentFormat as ContentFormat,
      projectId,
      availabilityText,
      approvedDetails,
      safeFallbackTemplate,
      publicReplyTemplate,
      publicReplyFallbackTemplate,
      triggers,
    },
  };
}
