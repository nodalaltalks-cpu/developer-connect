import type { DatabaseAreaProbe, HealthStatus } from "./types.ts";
import { DATABASE_LATENCY_THRESHOLDS_MS, DATABASE_EARLY_WARNING_MS, TREND_RULE, HEALTH_CHECK_TIMEOUT_MS } from "./thresholds.ts";

/**
 * Pure helpers for the Firestore health checks (no Firestore import here, so they are unit-testable). The probes themselves
 * are tiny timed reads (limit 1) of one collection per area of the product; the point is to say WHERE it is failing.
 */

/** The areas probed: each one maps to a part of the product the founder can recognise. */
export const FIRESTORE_PROBE_AREAS: ReadonlyArray<{ id: string; label: string; collection: string; whatBreaks: string }> = [
  { id: "directory", label: "Developer directory", collection: "developers", whatBreaks: "the public directory, developer pages and search" },
  { id: "leads", label: "Leads / CRM", collection: "leads", whatBreaks: "the CRM, enquiries and the team workspace" },
  { id: "team", label: "Team accounts", collection: "staffMembers", whatBreaks: "team sign-in and the team workspace" },
  { id: "analytics", label: "Analytics events", collection: "analyticsEvents", whatBreaks: "visit tracking and the founder dashboards" },
  { id: "testimonials", label: "Testimonials", collection: "testimonials", whatBreaks: "the public testimonials" },
];

type ProbeProblem = NonNullable<DatabaseAreaProbe["problem"]>;

/** Maps a Firestore/gRPC error to a plain category. gRPC codes: 4 deadline, 7 permission, 8 quota, 9 missing index, 14 unavailable. */
export function classifyFirestoreError(error: unknown): { problem: ProbeProblem; message: string } {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  const text = error instanceof Error ? error.message : String(error);
  if (code === 8 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return { problem: "quota", message: "Daily free limit reached" };
  if (code === 9 || /requires an index/i.test(text)) return { problem: "index", message: "A required index is missing" };
  if (code === 7 || /PERMISSION_DENIED/i.test(text)) return { problem: "permission", message: "Permission denied by Firebase" };
  if (code === 4 || /DEADLINE_EXCEEDED|timed out/i.test(text)) return { problem: "timeout", message: "The request timed out" };
  if (code === 14 || /UNAVAILABLE/i.test(text)) return { problem: "unavailable", message: "Firebase is not reachable" };
  return { problem: "other", message: "Unexpected error" };
}

/** Status for one measured latency. Early warning sits below "slow" so the founder hears about it first. */
export function statusForLatency(latencyMs: number): HealthStatus {
  if (latencyMs > DATABASE_LATENCY_THRESHOLDS_MS.CRITICAL_ABOVE) return "ACTION_REQUIRED";
  if (latencyMs > DATABASE_EARLY_WARNING_MS) return "NEEDS_ATTENTION";
  return "HEALTHY";
}

/** Runs one probe: a timed read with a hard timeout, never throws. */
export async function runProbe(
  area: { id: string; label: string },
  read: () => Promise<unknown>,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS,
): Promise<DatabaseAreaProbe> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("timed out"), { code: 4 })), timeoutMs);
      }),
    ]);
    const latencyMs = Date.now() - start;
    return { id: area.id, label: area.label, status: statusForLatency(latencyMs), latencyMs, problem: null, message: null };
  } catch (error) {
    const { problem, message } = classifyFirestoreError(error);
    return { id: area.id, label: area.label, status: "ACTION_REQUIRED", latencyMs: null, problem, message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Early warning: true when the last few measurements are much slower than the ones before them, even though none has crossed
 * the "slow" line yet. Needs enough history to mean something; history is kept per server instance (see latency-history.ts).
 */
export function detectRisingLatency(samplesMs: number[]): { rising: boolean; recentMs: number | null; baselineMs: number | null } {
  if (samplesMs.length < TREND_RULE.MIN_SAMPLES) return { rising: false, recentMs: null, baselineMs: null };
  const recent = samplesMs.slice(-TREND_RULE.RECENT_COUNT);
  const baseline = samplesMs.slice(0, -TREND_RULE.RECENT_COUNT);
  const recentMs = Math.round(median(recent));
  const baselineMs = Math.round(median(baseline));
  const rising = recentMs > TREND_RULE.MIN_RECENT_MS && recentMs > baselineMs * TREND_RULE.RISE_FACTOR;
  return { rising, recentMs, baselineMs };
}

const MINUTE = 60_000;

/** When Firestore's free daily quotas next reset: midnight Pacific time. Returned as an instant plus founder-friendly text. */
export function nextQuotaReset(now: Date = new Date()): { at: Date; inMinutes: number; text: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const secondsIntoDay = get("hour") * 3600 + get("minute") * 60 + get("second");
  const at = new Date(now.getTime() + (86_400 - secondsIntoDay) * 1000);
  const inMinutes = Math.max(0, Math.round((at.getTime() - now.getTime()) / MINUTE));
  const clock = (zone: string) => at.toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" });
  const hours = Math.floor(inMinutes / 60);
  const text = `${clock("Asia/Dubai")} Dubai time / ${clock("Asia/Kolkata")} India time (in ${hours}h ${inMinutes % 60}m)`;
  return { at, inMinutes, text };
}
