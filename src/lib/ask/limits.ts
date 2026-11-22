import type { PassageMarket } from "./corpus.ts";
import type { ChatTurn } from "./prompt.ts";

/**
 * The public assistant defends itself: small inputs, a short memory, and request limits per visitor and per day. The requests are
 * counted in memory on each server instance, which is a soft limit; the hard spending limit is the one set in the Anthropic console.
 */

export const LIMITS = {
  maxQuestionChars: 500,
  maxHistoryTurns: 6,
  maxHistoryTurnChars: 1500,
  /** Requests allowed per visitor in any ten minutes. */
  perTenMinutes: 8,
  /** Requests allowed per visitor per day. */
  perDay: 40,
} as const;

export interface AskInput {
  question: string;
  history: ChatTurn[];
  market: PassageMarket | undefined;
}

export type Validation = { ok: true; value: AskInput } | { ok: false; error: string };

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Control characters out; whitespace collapsed; capped.
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text.length === 0 ? null : text.slice(0, max);
}

export function validateAsk(body: unknown): Validation {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Send a question." };
  const record = body as Record<string, unknown>;

  const question = cleanText(record.question, LIMITS.maxQuestionChars);
  if (!question) return { ok: false, error: "Type a question first." };
  if (typeof record.question === "string" && record.question.trim().length > LIMITS.maxQuestionChars) {
    return { ok: false, error: `Please keep the question under ${LIMITS.maxQuestionChars} characters.` };
  }

  const history: ChatTurn[] = [];
  if (Array.isArray(record.history)) {
    for (const item of record.history.slice(-LIMITS.maxHistoryTurns)) {
      if (typeof item !== "object" || item === null) continue;
      const turn = item as Record<string, unknown>;
      const text = cleanText(turn.text, LIMITS.maxHistoryTurnChars);
      if (!text || (turn.role !== "user" && turn.role !== "assistant")) continue;
      history.push({ role: turn.role, text });
    }
  }
  // The conversation must alternate and start with the visitor, as the model requires; drop anything that breaks that.
  const alternating: ChatTurn[] = [];
  for (const turn of history) {
    const last = alternating[alternating.length - 1];
    if (!last && turn.role !== "user") continue;
    if (last && last.role === turn.role) continue;
    alternating.push(turn);
  }
  if (alternating.length > 0 && alternating[alternating.length - 1].role === "user") alternating.pop();

  const market = record.market === "india" || record.market === "dubai" ? record.market : undefined;
  return { ok: true, value: { question, history: alternating, market } };
}

interface Bucket {
  recent: number[];
  today: number[];
}

const buckets = new Map<string, Bucket>();
const TEN_MINUTES = 10 * 60_000;
const DAY = 24 * 3600_000;

export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, now: number = Date.now()): RateDecision {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { recent: [], today: [] };
    buckets.set(key, bucket);
  }
  bucket.recent = bucket.recent.filter((t) => now - t < TEN_MINUTES);
  bucket.today = bucket.today.filter((t) => now - t < DAY);
  if (bucket.recent.length >= LIMITS.perTenMinutes) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((TEN_MINUTES - (now - bucket.recent[0])) / 1000)) };
  }
  if (bucket.today.length >= LIMITS.perDay) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((DAY - (now - bucket.today[0])) / 1000)) };
  }
  bucket.recent.push(now);
  bucket.today.push(now);
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.today.length === 0 || now - b.today[b.today.length - 1] > DAY) buckets.delete(k);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

let dayStart = 0;
let dayCount = 0;

/** A soft daily ceiling on AI answers for the whole site, per server instance. Over it, visitors get search results instead. */
export function withinDailyCap(cap: number, now: number = Date.now()): boolean {
  if (now - dayStart > DAY) {
    dayStart = now;
    dayCount = 0;
  }
  if (dayCount >= cap) return false;
  dayCount += 1;
  return true;
}

/** For tests. */
export function resetLimits(): void {
  buckets.clear();
  dayStart = 0;
  dayCount = 0;
}

/** One visitor, as the request shows it. Only used in memory; never stored. */
export function visitorKey(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
