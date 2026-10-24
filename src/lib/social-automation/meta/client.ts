import type { AutomationPlatform } from "../types.ts";

/**
 * The only code that sends anything to Instagram or Facebook: a private reply (the DM) and a public reply under the comment.
 *
 * Credentials come from the environment and are checked per platform: without them `canSend` is false and the processor records
 * the comment for personal follow-up instead. A token is only ever put in the Authorization header, never in a URL, a stored
 * failure reason or a log line.
 */

export type SendResult = { ok: true; id: string | null } | { ok: false; reason: string };

export interface MetaSender {
  /** Whether this platform has everything it needs to send. */
  canSend(platform: AutomationPlatform): boolean;
  sendPrivateReply(platform: AutomationPlatform, commentId: string, text: string): Promise<SendResult>;
  replyPublicly(platform: AutomationPlatform, commentId: string, text: string): Promise<SendResult>;
}

export interface MetaCredentials {
  graphVersion: string;
  instagram: { accountId: string; accessToken: string } | null;
  facebook: { pageId: string; accessToken: string } | null;
}

export function metaCredentialsFromEnv(env: Record<string, string | undefined> = process.env): MetaCredentials {
  const pick = (key: string) => env[key]?.trim() || null;
  const igId = pick("META_IG_USER_ID");
  const igToken = pick("META_IG_ACCESS_TOKEN");
  const pageId = pick("META_FB_PAGE_ID");
  const pageToken = pick("META_FB_PAGE_ACCESS_TOKEN");
  return {
    graphVersion: pick("META_GRAPH_VERSION") ?? "v21.0",
    instagram: igId && igToken ? { accountId: igId, accessToken: igToken } : null,
    facebook: pageId && pageToken ? { pageId, accessToken: pageToken } : null,
  };
}

/** The ids of our own accounts, so the webhook can ignore comments we wrote ourselves. */
export function ownAccountIds(creds: MetaCredentials): Partial<Record<AutomationPlatform, string>> {
  return { INSTAGRAM: creds.instagram?.accountId, FACEBOOK: creds.facebook?.pageId };
}

const TIMEOUT_MS = 8000;

/** A short, safe description of a failed Graph call: Meta's own error code and message, never the request or any token. */
function describeFailure(status: number, body: unknown): string {
  const error = (body as { error?: { code?: unknown; error_subcode?: unknown; message?: unknown } } | null)?.error;
  const code = typeof error?.code === "number" ? `code ${error.code}${typeof error.error_subcode === "number" ? `/${error.error_subcode}` : ""}` : `HTTP ${status}`;
  const message = typeof error?.message === "string" ? error.message.slice(0, 200) : "request failed";
  return `${code}: ${message}`;
}

export function createMetaSender(creds: MetaCredentials = metaCredentialsFromEnv(), fetchImpl: typeof fetch = fetch): MetaSender {
  const base = `https://graph.facebook.com/${creds.graphVersion}`;

  async function post(path: string, token: string, payload: unknown): Promise<SendResult> {
    try {
      const response = await fetchImpl(`${base}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, reason: describeFailure(response.status, body) };
      const json = body as { message_id?: unknown; id?: unknown } | null;
      const id = typeof json?.message_id === "string" ? json.message_id : typeof json?.id === "string" ? json.id : null;
      return { ok: true, id };
    } catch (error) {
      return { ok: false, reason: error instanceof Error && error.name === "TimeoutError" ? "timed out talking to Meta" : "could not reach Meta" };
    }
  }

  return {
    canSend: (platform) => (platform === "INSTAGRAM" ? creds.instagram !== null : creds.facebook !== null),

    async sendPrivateReply(platform, commentId, text) {
      // Both platforms take the comment id as the recipient: Meta allows one private reply per comment, within 7 days.
      const account = platform === "INSTAGRAM" ? creds.instagram : creds.facebook;
      if (!account) return { ok: false, reason: "not configured" };
      const senderId = "accountId" in account ? account.accountId : account.pageId;
      return post(`${senderId}/messages`, account.accessToken, { recipient: { comment_id: commentId }, message: { text } });
    },

    async replyPublicly(platform, commentId, text) {
      const account = platform === "INSTAGRAM" ? creds.instagram : creds.facebook;
      if (!account) return { ok: false, reason: "not configured" };
      // Instagram answers a comment through /replies, Facebook through /comments.
      return post(`${encodeURIComponent(commentId)}/${platform === "INSTAGRAM" ? "replies" : "comments"}`, account.accessToken, { message: text });
    },
  };
}
