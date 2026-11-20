import type { UsageReport } from "@/lib/platform-health/usage-source";
import { FREE_DAILY_LIMITS, USAGE_KINDS, USAGE_WARN_AT, USAGE_CRITICAL_AT, type UsageKind } from "@/lib/platform-health/usage";
import { nextQuotaReset } from "@/lib/platform-health/firestore-probe";

const KIND_TITLE: Record<UsageKind, string> = { reads: "Reads", writes: "Writes", deletes: "Deletes" };
const fmt = (n: number) => n.toLocaleString("en-IN");

function dayLabel(key: string | null): string {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

const ADVICE_STYLE = {
  ok: "border-green-200 bg-green-50",
  watch: "border-amber-200 bg-amber-50",
  upgrade: "border-red-200 bg-red-50",
  unknown: "border-border bg-muted/30",
} as const;

const PROBLEM_TEXT: Record<NonNullable<UsageReport["problem"]>, { title: string; steps: string }> = {
  billing: {
    title: "Live usage needs Google billing, which the free Spark plan does not have",
    steps:
      "Google only shares exact usage numbers (through Cloud Monitoring) with projects that have a billing account attached. The permission is already correct. Until billing is attached, check Firebase console → Firestore → Usage for today's numbers; the daily limit alerts on this page still work.",
  },
  permission: {
    title: "Usage isn't connected yet: one permission is missing",
    steps:
      "Google Cloud console → IAM & Admin → IAM → find the service account below → Edit → add the role “Monitoring Viewer” → Save. The numbers appear here within a minute.",
  },
  "api-disabled": {
    title: "Usage isn't connected yet: Cloud Monitoring is turned off",
    steps: "Google Cloud console → APIs & Services → Library → “Cloud Monitoring API” → Enable. Then add the “Monitoring Viewer” role to the service account below.",
  },
  "not-configured": { title: "Usage isn't connected: no Firebase key is set", steps: "Set FIREBASE_SERVICE_ACCOUNT in Vercel." },
  unreachable: { title: "Usage could not be read right now", steps: "Google Cloud Monitoring did not answer. This page tries again every few seconds." },
};

function Meter({ kind, used }: { kind: UsageKind; used: number }) {
  const limit = FREE_DAILY_LIMITS[kind];
  const ratio = used / limit;
  const color = ratio >= USAGE_CRITICAL_AT ? "bg-red-500" : ratio >= USAGE_WARN_AT ? "bg-amber-500" : "bg-green-500";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-foreground">{KIND_TITLE[kind]}</span>
        <span className="text-muted-foreground">
          {fmt(used)} of {fmt(limit)} · {Math.round(ratio * 100)}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${KIND_TITLE[kind]} used today`}>
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

/** Firestore free-plan usage: today against the daily limits, then day / week / month / quarter / half-year / year, plus when to plan the paid plan. */
export function PlatformHealthUsage({ usage }: { usage: UsageReport }) {
  if (usage.connection === "NOT_CONNECTED") {
    const info = PROBLEM_TEXT[usage.problem ?? "unreachable"];
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Firestore usage</p>
        <p className="mt-2 font-medium text-foreground">🟡 {info.title}</p>
        <p className="mt-1 text-sm text-foreground">{info.steps}</p>
        {usage.detail && <p className="mt-2 break-words text-xs text-muted-foreground">Google says: {usage.detail}</p>}
        {usage.serviceAccountEmail && (
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Service account: {usage.serviceAccountEmail}
            {usage.projectId ? ` · project ${usage.projectId}` : ""}
          </p>
        )}
      </div>
    );
  }

  const today = usage.today!;
  const reset = nextQuotaReset(usage.checkedAt);
  const advice = usage.advice!;
  const windows = usage.windows;

  return (
    <div className="mt-6 rounded-lg border border-border p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Firestore usage today (free plan)</p>
      <div className="mt-3 space-y-3">
        {USAGE_KINDS.map((kind) => (
          <Meter key={kind} kind={kind} used={today[kind]} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Resets at {reset.text}.
        {usage.assessment?.projected
          ? ` At today's pace the day ends near ${fmt(usage.assessment.projected.reads)} reads and ${fmt(usage.assessment.projected.writes)} writes.`
          : " A projection for the day appears after the first two hours."}{" "}
        Figures come from Google and can lag by a few minutes.
      </p>

      <div className={`mt-5 rounded-lg border p-4 ${ADVICE_STYLE[advice.level]}`}>
        <p className="font-medium text-foreground">
          {advice.level === "ok" ? "🟢" : advice.level === "watch" ? "🟡" : advice.level === "upgrade" ? "🔴" : "⚪"} Paid plan: {advice.headline}
        </p>
        <p className="mt-1 text-sm text-foreground">{advice.detail}</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Period</th>
              <th className="py-2 pr-3 text-right font-semibold">Reads</th>
              <th className="py-2 pr-3 text-right font-semibold">Writes</th>
              <th className="py-2 pr-3 text-right font-semibold">Deletes</th>
              <th className="py-2 pr-3 text-right font-semibold">Busiest day</th>
              <th className="py-2 text-right font-semibold">Days recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {windows.map((w) => {
              const busiest = USAGE_KINDS.map((kind) => ({ kind, ...w.peak[kind], ratio: w.peak[kind].value / FREE_DAILY_LIMITS[kind] })).sort((a, b) => b.ratio - a.ratio)[0];
              return (
                <tr key={w.id}>
                  <td className="py-2 pr-3 text-foreground">{w.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(w.totals.reads)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(w.totals.writes)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(w.totals.deletes)}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">
                    {w.daysCovered > 0 && busiest.value > 0 ? `${Math.round(busiest.ratio * 100)}% ${KIND_TITLE[busiest.kind].toLowerCase()} · ${dayLabel(busiest.day)}` : "—"}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    {w.daysCovered}/{w.daysInWindow}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Days are Pacific-time days, the same days Google caps and bills on. Google keeps about six weeks of figures, so each finished day is saved here and the longer
        periods fill in as time passes{usage.historyFrom ? ` (recording since ${dayLabel(usage.historyFrom)})` : ""}. “Busiest day” is the day closest to a free daily limit
        ({fmt(FREE_DAILY_LIMITS.reads)} reads, {fmt(FREE_DAILY_LIMITS.writes)} writes, {fmt(FREE_DAILY_LIMITS.deletes)} deletes).
      </p>
    </div>
  );
}
