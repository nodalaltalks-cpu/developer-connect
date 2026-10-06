import Link from "next/link";
import { requireEmployee } from "@/lib/team/session";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { CallMetricTiles } from "@/components/leads/call-metrics";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatCallDuration, getMyCallDashboard } from "@/lib/leads/call-analytics";
import { formatDateTimeFull, formatEnumLabel } from "@/lib/leads/format";
import { getTelephonyProvider } from "@/lib/leads/telephony";

export const metadata = {
  title: "My calls | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const STATUS_WORD = { INITIATED: "Dialing", RINGING: "Ringing", CONNECTED: "Connected", COMPLETED: "Connected", NO_ANSWER: "No answer", BUSY: "Busy", FAILED: "Failed", REJECTED: "Rejected" } as const;

export default async function TeamCallsPage() {
  // Scope is the signed-in member's own id from the session — never from the URL.
  const { actor } = await requireEmployee();
  const dashboard = await getMyCallDashboard(createPostgresLeadRepositories(), actor, new Date());
  const dialer = getTelephonyProvider();

  return (
    <div>
      <SectionHeading title="My calls — today" description="Real call records from the internal dialer. You cannot edit these numbers." />

      {!dialer.configured && (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          The internal dialer is not connected to a telephony provider yet, so no calls are being tracked or counted. These figures will fill in once calls are placed through it.
        </p>
      )}

      <CallMetricTiles metrics={dashboard.metrics} followUps={dashboard.followUps} />

      <h2 className="mt-6 text-sm font-medium text-foreground">Recent calls</h2>
      {dashboard.recent.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No calls yet" description="Calls you place through the internal dialer appear here the moment the provider reports them." />
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
                  {STATUS_WORD[call.status]}
                  {call.answeredAt && call.durationSeconds !== null ? ` · ${formatCallDuration(call.durationSeconds)}` : ""}
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
