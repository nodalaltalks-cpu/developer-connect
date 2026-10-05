import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The "returning buyer" cookie: a signed, opaque pointer to a lead so the
 * gate can offer one-tap continue instead of asking for the number again.
 *
 * It holds ONLY a lead id and an expiry, signed with an HMAC — never the phone
 * number, name or anything personal. It is httpOnly (set by a server action),
 * so page scripts and third parties cannot read it, and a tampered or expired
 * token verifies as "no lead" and simply shows the normal form.
 *
 * With no secret configured the feature is off (every buyer sees the normal
 * form) rather than falling back to an unsigned, forgeable value.
 */

export const LEAD_COOKIE_NAME = "dc_lead";
const VERSION = "v1";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signLeadToken(leadId: string, secret: string | undefined, now: Date, ttlSeconds: number): string | null {
  if (!secret) return null;
  const expiry = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = `${VERSION}.${leadId}.${expiry}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the lead id for a valid, unexpired token signed with `secret`; otherwise null. */
export function verifyLeadToken(token: string | undefined | null, secret: string | undefined, now: Date): string | null {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, leadId, expiryText, signature] = parts;
  if (version !== VERSION) return null;
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return null;
  const expiry = Number(expiryText);
  if (!Number.isInteger(expiry) || expiry * 1000 < now.getTime()) return null;

  const expected = Buffer.from(sign(`${version}.${leadId}.${expiryText}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return leadId;
}
