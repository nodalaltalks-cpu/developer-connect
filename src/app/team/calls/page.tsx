import Link from "next/link";
import { requireEmployee } from "@/lib/team/session";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { CallMetricTiles } from "@/components/leads/call-metrics";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatCallDuration, getMyCallDashboard } from "@/lib/leads/call-analytics";
import { describeCall } from "@/lib/leads/call-view";
import { formatDateTimeFull, formatEnumLabel } from "@/lib/leads/format";
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
] as const;

export default async function TeamCallsPage({ searchParams }: PageProps<"/team/calls">) {
  // Scope is the signed-in member's own id from the session — never from the URL.
  const { actor } = await requireEmployee();
  const params = await searchParams;
  const dashboard = await getMyCallDashboard(createPostgresLeadRepositories(), actor, new Date(), { range: first(params.range), from: first(params.from), to: first(params.to) });
  const dialer = getTelephonyProvider();

  return (
    <div>
      <SectionHeading title={`My calls — ${dashboard.range.label}`} description="Real call records. Connected means more than 10 seconds of talk time; 10 seconds or less is Dialed. You cannot edit these numbers." />

      <nav aria-label="Range" className="mb-3 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={`/team/calls?range=${r.key}`} aria-current={dashboard.range.label === r.label ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium">
            {r.label}
          </Link>
        ))}
      </nav>

      {!dialer.configured && (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          No telephony provider is connected. Calls made from the Developer Connects Android app (your own SIM) are tracked and counted here; calls made from a phone&apos;s ordinary dialer are not.
        </p>
      )}

      <CallMetricTiles metrics={dashboard.metrics} followUps={dashboard.followUps} />

      <h2 className="mt-6 text-sm font-medium text-foreground">Recent calls</h2>
      {dashboard.recent.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No calls in this range" description="Calls you make from the Android app appear here as soon as the app reports them." />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {dashboard.recent.map(({ call, lead }) => (
            <li key={call.id}>
              <Link href={`/team/leads/${lead.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{lead.name ?? "Unnamed lead"}</span>
                  <span className="block text-xs text-muted-foreground">{formatDateTimeFull(call.initiatedAt)}</span>
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
