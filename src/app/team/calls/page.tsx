import Link from "next/link";
import { requireTab } from "@/lib/team/session";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { CallMetricTiles } from "@/components/leads/call-metrics";
import { CallFilterBar } from "@/components/leads/call-filter-bar";
import { LiveRefresh } from "@/components/live-refresh";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { CALL_OUTCOME_LABEL, formatCallDuration, formatRate, formatTalkTime, getMyCallDashboard, matchesCallFilter, parseCallOutcomeFilter } from "@/lib/leads/call-analytics";
import { describeCall } from "@/lib/leads/call-view";
import { formatDateTimeWithDay, formatEnumLabel } from "@/lib/leads/format";
import { getTelephonyProvider } from "@/lib/leads/telephony";

export const metadata = {
  title: "My calls | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "all", label: "Since the start" },
] as const;

/** "2026-10-09" → "Fri 9 Oct 2026". The key is already a business-zone calendar date, so no time zone is involved. */
function formatDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function TeamCallsPage({ searchParams }: PageProps<"/team/calls">) {
  // Scope is the signed-in member's own id from the session — never from the URL.
  const { actor } = await requireTab("calls");
  const params = await searchParams;
  const dashboard = await getMyCallDashboard(createPostgresLeadRepositories(), actor, new Date(), { range: first(params.range), from: first(params.from), to: first(params.to) });
  const dialer = getTelephonyProvider();
  const rangeKey = RANGES.find((r) => r.label === dashboard.range.label)?.key ?? "today";
  const outcome = parseCallOutcomeFilter(params.outcome);
  const source = first(params.source) === "COLD_CALL" || first(params.source) === "DIGITAL" ? (first(params.source) as "COLD_CALL" | "DIGITAL") : "";
  const calls = dashboard.recent.filter((item) => matchesCallFilter(item, outcome, source || undefined));

  return (
    <div>
      <LiveRefresh />
      <SectionHeading title={`My calls — ${dashboard.range.label}`} description="Real call records. Connected means more than 10 seconds of talk time; 10 seconds or less is Dialed. You cannot edit these numbers." />

      <CallFilterBar basePath="/team/calls" state={{ range: rangeKey, outcome, source }} />

      {!dialer.configured && (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          No telephony provider is connected. Calls made from the Developer Connects Android app (your own SIM) are tracked and counted here; calls made from a phone&apos;s ordinary dialer are not.
        </p>
      )}

      <CallMetricTiles metrics={dashboard.metrics} followUps={dashboard.followUps} />

      {/* Tap to slide open: the member's own day-by-day call log for the range chosen above. */}
      <details className="group mt-4 rounded-lg border border-border">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
          <span>
            My call log by day
            <span className="block text-xs font-normal text-muted-foreground">
              {dashboard.metrics.dialed} calls · {formatTalkTime(dashboard.metrics.talkSeconds)} talk time · {dashboard.range.label}
            </span>
          </span>
          <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <div className="border-t border-border px-4 py-3">
          {dashboard.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls in this range yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[20rem] text-left text-sm">
                <caption className="sr-only">Calls by day</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">Calls</th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">Connected</th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">Rate</th>
                    <th scope="col" className="py-1 text-right font-medium">Talk time</th>
                  </tr>
                </thead>
                <tbody>
                  {[...dashboard.daily].reverse().map((day) => (
                    <tr key={day.key} className="border-t border-border">
                      <td className="py-2 pr-3 text-foreground">{formatDayKey(day.key)}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{day.dialed}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{day.connected}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{formatRate(day.connectionRate)}</td>
                      <td className="py-2 text-right text-foreground">{formatTalkTime(day.talkSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Talk time comes from the phone&apos;s call log in the Android app. Calls placed from a browser are counted but have no talk time.</p>
        </div>
      </details>

      <h2 className="mt-6 text-sm font-medium text-foreground">
        {CALL_OUTCOME_LABEL[outcome]} · {calls.length}
      </h2>
      {calls.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No calls in this range" description="Calls you make from the Android app appear here as soon as the app reports them." />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {calls.slice(0, 100).map(({ call, lead }) => (
            <li key={call.id}>
              {/* A cold-called prospect is not a lead yet, so it has no lead screen: it opens the call-details form instead. */}
              <Link href={lead.prospect ? `/team/cold-call/${lead.id}` : `/team/leads/${lead.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{lead.name ?? (lead.prospect ? lead.phoneE164 : "Unnamed lead")}</span>
                  <span className="block text-xs text-muted-foreground">{formatDateTimeWithDay(call.initiatedAt)}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-foreground">
                  {describeCall(call)}
                  {call.classification === "CONNECTED" && call.durationSeconds !== null ? ` · ${formatCallDuration(call.durationSeconds)}` : ""}
                  {call.disposition ? <span className="block text-muted-foreground">{formatEnumLabel(call.disposition)}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
