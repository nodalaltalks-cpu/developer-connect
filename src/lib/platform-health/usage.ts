import type { HealthStatus, PlatformHealthWarning } from "./types.ts";

/**
 * Pure maths for Firestore usage against the free plan: no network, no Firestore, so it is fully unit-tested.
 * Firestore's free daily quotas reset at midnight Pacific time, so a "day" here is a Pacific-time day (the same day Google
 * bills and caps on), written as YYYY-MM-DD.
 */

export const FREE_DAILY_LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000 } as const;
export type UsageKind = keyof typeof FREE_DAILY_LIMITS;
export const USAGE_KINDS: readonly UsageKind[] = ["reads", "writes", "deletes"];

export interface DayUsage {
  reads: number;
  writes: number;
  deletes: number;
}
export type DaysMap = Record<string, DayUsage>;

/** Early-warning lines for today's usage, as a share of the free daily limit. */
export const USAGE_WARN_AT = 0.7;
export const USAGE_CRITICAL_AT = 0.9;

const QUOTA_ZONE = "America/Los_Angeles";

export const emptyDay = (): DayUsage => ({ reads: 0, writes: 0, deletes: 0 });

/** The Pacific-time calendar day (YYYY-MM-DD) an instant falls on. */
export function ptDateKey(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: QUOTA_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Calendar arithmetic on a YYYY-MM-DD key (immune to daylight-saving changes). */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Seconds since Pacific midnight for an instant. */
export function secondsIntoPtDay(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: QUOTA_ZONE, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
}

export function startOfPtDay(at: Date): Date {
  return new Date(at.getTime() - secondsIntoPtDay(at) * 1000);
}

/** Adds metric points (each with a start instant and a count) into per-day totals for one kind. */
export function addPointsToDays(days: DaysMap, kind: UsageKind, points: Array<{ start: Date; value: number }>): void {
  for (const point of points) {
    const key = ptDateKey(point.start);
    (days[key] ??= emptyDay())[kind] += point.value;
  }
}

export interface WindowSummary {
  id: string;
  label: string;
  /** How many of the window's days we actually have a record for. */
  daysCovered: number;
  daysInWindow: number;
  totals: DayUsage;
  avgPerDay: DayUsage;
  peak: Record<UsageKind, { day: string | null; value: number }>;
  daysOverWarn: number;
  daysOverLimit: number;
}

export const WINDOWS: ReadonlyArray<{ id: string; label: string; days: number }> = [
  { id: "today", label: "Today", days: 1 },
  { id: "yesterday", label: "Yesterday", days: 1 },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "quarter", label: "Last 90 days (quarter)", days: 90 },
  { id: "half", label: "Last 180 days (half-year)", days: 180 },
  { id: "year", label: "Last 365 days (year)", days: 365 },
];

const share = (day: DayUsage): number => Math.max(...USAGE_KINDS.map((kind) => day[kind] / FREE_DAILY_LIMITS[kind]));

export function summarizeWindows(days: DaysMap, now: Date): WindowSummary[] {
  const today = ptDateKey(now);
  return WINDOWS.map((window) => {
    // "Yesterday" is the single day before today; every other window ends today and reaches back `days` days.
    const keys =
      window.id === "yesterday"
        ? [shiftDateKey(today, -1)]
        : Array.from({ length: window.days }, (_, i) => shiftDateKey(today, -i));
    const totals = emptyDay();
    const peak = {
      reads: { day: null as string | null, value: 0 },
      writes: { day: null as string | null, value: 0 },
      deletes: { day: null as string | null, value: 0 },
    };
    let covered = 0;
    let overWarn = 0;
    let overLimit = 0;
    for (const key of keys) {
      const day = days[key];
      if (!day) continue;
      covered += 1;
      for (const kind of USAGE_KINDS) {
        totals[kind] += day[kind];
        if (day[kind] > peak[kind].value) peak[kind] = { day: key, value: day[kind] };
      }
      const s = share(day);
      if (s >= USAGE_WARN_AT) overWarn += 1;
      if (s >= 1) overLimit += 1;
    }
    const avg = (kind: UsageKind) => (covered > 0 ? Math.round(totals[kind] / covered) : 0);
    return {
      id: window.id,
      label: window.label,
      daysCovered: covered,
      daysInWindow: keys.length,
      totals,
      avgPerDay: { reads: avg("reads"), writes: avg("writes"), deletes: avg("deletes") },
      peak,
      daysOverWarn: overWarn,
      daysOverLimit: overLimit,
    };
  });
}

export interface TodayStatus {
  status: HealthStatus;
  percent: Record<UsageKind, number>;
  /** The kind closest to its limit, and its share. */
  worst: { kind: UsageKind; percent: number };
  /** Projected end-of-day usage at today's pace, or null when too little of the day has passed to say. */
  projected: DayUsage | null;
  /** When the cap would be reached at today's pace (only when it would be reached before the reset). */
  capReachedAt: { kind: UsageKind; at: Date } | null;
}

const MIN_ELAPSED_FOR_PROJECTION_S = 2 * 3600;

export function assessToday(today: DayUsage, now: Date): TodayStatus {
  const percent = {
    reads: (today.reads / FREE_DAILY_LIMITS.reads) * 100,
    writes: (today.writes / FREE_DAILY_LIMITS.writes) * 100,
    deletes: (today.deletes / FREE_DAILY_LIMITS.deletes) * 100,
  };
  const worstKind = USAGE_KINDS.reduce((a, b) => (percent[b] > percent[a] ? b : a));
  const worst = { kind: worstKind, percent: percent[worstKind] };
  const elapsed = secondsIntoPtDay(now);
  let projected: DayUsage | null = null;
  let capReachedAt: TodayStatus["capReachedAt"] = null;
  if (elapsed >= MIN_ELAPSED_FOR_PROJECTION_S) {
    const factor = 86_400 / elapsed;
    projected = {
      reads: Math.round(today.reads * factor),
      writes: Math.round(today.writes * factor),
      deletes: Math.round(today.deletes * factor),
    };
    const dayStart = startOfPtDay(now).getTime();
    for (const kind of USAGE_KINDS) {
      const used = today[kind];
      const limit = FREE_DAILY_LIMITS[kind];
      if (used > 0 && used < limit && projected[kind] > limit) {
        const at = new Date(dayStart + ((elapsed * limit) / used) * 1000);
        if (!capReachedAt || at < capReachedAt.at) capReachedAt = { kind, at };
      }
    }
  }
  const fraction = worst.percent / 100;
  const status: HealthStatus = fraction >= USAGE_CRITICAL_AT ? "ACTION_REQUIRED" : fraction >= USAGE_WARN_AT || capReachedAt ? "NEEDS_ATTENTION" : "HEALTHY";
  return { status, percent, worst, projected, capReachedAt };
}

export const KIND_LABEL: Record<UsageKind, string> = { reads: "reads", writes: "writes", deletes: "deletes" };

/** Warning cards for the Platform Health list. A cap actually being hit is reported by the database probes instead. */
export function usageWarnings(assessment: TodayStatus, timeText: (at: Date) => string): PlatformHealthWarning[] {
  const out: PlatformHealthWarning[] = [];
  const { worst } = assessment;
  const limit = FREE_DAILY_LIMITS[worst.kind];
  if (worst.percent >= 100) return out;
  if (assessment.status === "ACTION_REQUIRED") {
    out.push({
      id: "usage-near-cap",
      category: "DATABASE",
      level: "ACTION_REQUIRED",
      title: `Free daily ${KIND_LABEL[worst.kind]} limit almost used up`,
      explanation: `Today's ${KIND_LABEL[worst.kind]} are at ${Math.round(worst.percent)}% of the ${limit.toLocaleString("en-IN")} free per day. When it hits 100% the site stops loading data until the daily reset.`,
      recommendedAction: "Upgrade the Firebase project to Blaze before the cap is reached, or wait for the reset.",
    });
  } else if (assessment.status === "NEEDS_ATTENTION") {
    const pace = assessment.capReachedAt
      ? ` At today's pace the ${KIND_LABEL[assessment.capReachedAt.kind]} limit would be reached around ${timeText(assessment.capReachedAt.at)}.`
      : "";
    out.push({
      id: "usage-high",
      category: "DATABASE",
      level: "NEEDS_ATTENTION",
      title: `Early warning: ${KIND_LABEL[worst.kind]} are running high today`,
      explanation: `Today's ${KIND_LABEL[worst.kind]} are at ${Math.round(worst.percent)}% of the ${limit.toLocaleString("en-IN")} free per day.${pace}`,
      recommendedAction: "Keep an eye on it. If this repeats most days, plan the move to a paid plan.",
    });
  }
  return out;
}

export interface PlanAdvice {
  level: "ok" | "watch" | "upgrade" | "unknown";
  headline: string;
  detail: string;
}

/** A plain, rule-based read of the last 30 days: when to plan the paid plan. No prediction beyond the stated rules. */
export function planAdvice(month: WindowSummary): PlanAdvice {
  if (month.daysCovered < 7) {
    return {
      level: "unknown",
      headline: "Not enough history yet",
      detail: `Only ${month.daysCovered} day${month.daysCovered === 1 ? "" : "s"} of usage recorded so far. A useful read needs at least 7.`,
    };
  }
  if (month.daysOverLimit > 0) {
    return {
      level: "upgrade",
      headline: "Move to a paid plan",
      detail: `The free daily limit was reached on ${month.daysOverLimit} of the last ${month.daysCovered} recorded days. On those days the site could not load data.`,
    };
  }
  if (month.daysOverWarn >= 3) {
    return {
      level: "upgrade",
      headline: "Plan the upgrade now",
      detail: `Usage went above ${Math.round(USAGE_WARN_AT * 100)}% of a free daily limit on ${month.daysOverWarn} of the last ${month.daysCovered} days. One busy day would hit the cap.`,
    };
  }
  if (month.daysOverWarn >= 1) {
    return {
      level: "watch",
      headline: "Keep watching",
      detail: `Usage went above ${Math.round(USAGE_WARN_AT * 100)}% of a free daily limit on ${month.daysOverWarn} day${month.daysOverWarn === 1 ? "" : "s"} in the last ${month.daysCovered}. No cap was hit.`,
    };
  }
  const biggest = Math.max(...USAGE_KINDS.map((kind) => (month.peak[kind].value / FREE_DAILY_LIMITS[kind]) * 100));
  return {
    level: "ok",
    headline: "The free plan is enough for now",
    detail: `The busiest day in the last ${month.daysCovered} days used ${Math.round(biggest)}% of a free daily limit.`,
  };
}
