import { cert } from "firebase-admin/app";
import { getFirestoreDb } from "../firestore/client.ts";
import {
  addPointsToDays,
  assessToday,
  emptyDay,
  ptDateKey,
  shiftDateKey,
  startOfPtDay,
  summarizeWindows,
  planAdvice,
  USAGE_KINDS,
  type DaysMap,
  type DayUsage,
  type PlanAdvice,
  type TodayStatus,
  type UsageKind,
  type WindowSummary,
} from "./usage.ts";

/**
 * Real Firestore usage, read from Google Cloud Monitoring (the same numbers the Firebase console's Usage tab shows):
 *   firestore.googleapis.com/document/{read,write,delete}_count
 * It needs the app's service account to hold the "Monitoring Viewer" role; without it the report says exactly that instead of
 * guessing. Google keeps these figures for about six weeks, so each finished day is also saved in one small Firestore
 * document (platformUsage/daily): that is what makes the 90-day, half-year and year views possible as time passes.
 *
 * Cost on the free plan is deliberately tiny: results are cached in memory for a minute, the stored history is one document
 * read, and a finished day is written at most once.
 */

const METRIC: Record<UsageKind, string> = {
  reads: "firestore.googleapis.com/document/read_count",
  writes: "firestore.googleapis.com/document/write_count",
  deletes: "firestore.googleapis.com/document/delete_count",
};
const HISTORY_DAYS = 40;
const CACHE_MS = 60_000;
const RESYNC_MS = 6 * 3600_000;

export type UsageProblem = "permission" | "api-disabled" | "not-configured" | "unreachable";

export interface UsageReport {
  /** CONNECTED: real numbers. NOT_CONNECTED: see `problem`. */
  connection: "CONNECTED" | "NOT_CONNECTED";
  problem: UsageProblem | null;
  serviceAccountEmail: string | null;
  projectId: string | null;
  checkedAt: Date;
  today: DayUsage | null;
  assessment: TodayStatus | null;
  windows: WindowSummary[];
  advice: PlanAdvice | null;
  /** Earliest day we hold a record for, or null. */
  historyFrom: string | null;
}

class UsageSourceError extends Error {
  problem: UsageProblem;
  constructor(problem: UsageProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

function account(): { projectId: string; email: string; credential: ReturnType<typeof cert> } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new UsageSourceError("not-configured", "FIREBASE_SERVICE_ACCOUNT is not set");
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(text) as Record<string, string>;
  return { projectId: parsed.project_id, email: parsed.client_email, credential: cert(parsed as never) };
}

interface RawPoint {
  interval?: { startTime?: string; endTime?: string };
  value?: { int64Value?: string; doubleValue?: number };
}

async function fetchMetric(kind: UsageKind, start: Date, end: Date, alignSeconds: number): Promise<Array<{ start: Date; value: number }>> {
  const { projectId, credential } = account();
  const token = (await credential.getAccessToken()).access_token;
  const points: Array<{ start: Date; value: number }> = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      filter: `metric.type="${METRIC[kind]}"`,
      "interval.startTime": start.toISOString(),
      "interval.endTime": end.toISOString(),
      "aggregation.alignmentPeriod": `${alignSeconds}s`,
      "aggregation.perSeriesAligner": "ALIGN_SUM",
      "aggregation.crossSeriesReducer": "REDUCE_SUM",
      view: "FULL",
    });
    if (pageToken) params.set("pageToken", pageToken);
    let response: Response;
    try {
      response = await fetch(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new UsageSourceError("unreachable", "Google Cloud Monitoring could not be reached");
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(body)) {
        throw new UsageSourceError("api-disabled", "The Cloud Monitoring API is turned off for this project");
      }
      if (response.status === 401 || response.status === 403) throw new UsageSourceError("permission", "The service account may not read monitoring data");
      throw new UsageSourceError("unreachable", `Cloud Monitoring answered ${response.status}`);
    }
    const body = (await response.json()) as { timeSeries?: Array<{ points?: RawPoint[] }>; nextPageToken?: string };
    for (const series of body.timeSeries ?? []) {
      for (const point of series.points ?? []) {
        const startTime = point.interval?.startTime;
        if (!startTime) continue;
        const value = Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);
        points.push({ start: new Date(startTime), value });
      }
    }
    pageToken = body.nextPageToken || undefined;
  } while (pageToken);
  return points;
}

async function fetchDays(start: Date, end: Date, alignSeconds: number): Promise<DaysMap> {
  const days: DaysMap = {};
  const results = await Promise.all(USAGE_KINDS.map((kind) => fetchMetric(kind, start, end, alignSeconds)));
  USAGE_KINDS.forEach((kind, i) => addPointsToDays(days, kind, results[i]));
  return days;
}

const COLLECTION = "platformUsage";
const DOC = "daily";

interface StoredUsage {
  days: DaysMap;
  syncedAt: number;
}

async function readStored(): Promise<StoredUsage> {
  try {
    const snap = await getFirestoreDb().collection(COLLECTION).doc(DOC).get();
    const data = snap.data() as { days?: DaysMap; syncedAt?: number } | undefined;
    return { days: data?.days ?? {}, syncedAt: data?.syncedAt ?? 0 };
  } catch {
    return { days: {}, syncedAt: 0 };
  }
}

async function writeStored(days: DaysMap, syncedAt: number): Promise<void> {
  try {
    await getFirestoreDb().collection(COLLECTION).doc(DOC).set({ days, syncedAt }, { merge: true });
  } catch {
    // Saving history is best effort: the live numbers above never depend on it.
  }
}

/** Fills in finished days from Google's hourly figures (about 6 weeks back) and saves them. */
async function syncHistory(stored: StoredUsage, now: Date): Promise<StoredUsage> {
  if (stored.syncedAt !== 0 && now.getTime() - stored.syncedAt < RESYNC_MS) return stored;
  const todayStart = startOfPtDay(now);
  const from = new Date(todayStart.getTime() - HISTORY_DAYS * 86_400_000);
  const fresh = await fetchDays(from, todayStart, 3600);
  const todayKey = ptDateKey(now);
  const days: DaysMap = { ...stored.days };
  const keys = Object.keys(fresh)
    .filter((k) => k < todayKey)
    .sort();
  if (keys.length > 0) {
    // Record every day from the first one with real usage up to yesterday, with zeros for quiet days in between.
    const first = [keys[0], ...Object.keys(days).sort().slice(0, 1)].sort()[0];
    for (let key = first; key < todayKey; key = shiftDateKey(key, 1)) days[key] = fresh[key] ?? days[key] ?? emptyDay();
  }
  const next = { days, syncedAt: now.getTime() };
  await writeStored(days, next.syncedAt);
  return next;
}

const globalState = globalThis as unknown as { __platformUsageCache?: { at: number; report: UsageReport } };

function notConnected(problem: UsageProblem, now: Date, projectId: string | null, email: string | null): UsageReport {
  return { connection: "NOT_CONNECTED", problem, serviceAccountEmail: email, projectId, checkedAt: now, today: null, assessment: null, windows: [], advice: null, historyFrom: null };
}

export async function getFirestoreUsage(now: Date = new Date()): Promise<UsageReport> {
  const cached = globalState.__platformUsageCache;
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached.report;

  let projectId: string | null = null;
  let email: string | null = null;
  let report: UsageReport;
  try {
    const acct = account();
    projectId = acct.projectId;
    email = acct.email;
    const todayStart = startOfPtDay(now);
    const [todayDays, stored] = await Promise.all([fetchDays(todayStart, now, 300), readStored()]);
    const synced = await syncHistory(stored, now);
    const todayKey = ptDateKey(now);
    const today = todayDays[todayKey] ?? emptyDay();
    const days: DaysMap = { ...synced.days, [todayKey]: today };
    const windows = summarizeWindows(days, now);
    const month = windows.find((w) => w.id === "month")!;
    const recorded = Object.keys(days).sort();
    report = {
      connection: "CONNECTED",
      problem: null,
      serviceAccountEmail: email,
      projectId,
      checkedAt: now,
      today,
      assessment: assessToday(today, now),
      windows,
      advice: planAdvice(month),
      historyFrom: recorded[0] ?? null,
    };
  } catch (error) {
    const problem = error instanceof UsageSourceError ? error.problem : "unreachable";
    report = notConnected(problem, now, projectId, email);
  }
  globalState.__platformUsageCache = { at: now.getTime(), report };
  return report;
}
