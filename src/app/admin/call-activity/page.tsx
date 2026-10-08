import { CallFilterBar } from "@/components/leads/call-filter-bar";
import { LiveRefresh } from "@/components/live-refresh";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { CALL_OUTCOME_LABEL, RANGE_PRESETS, formatCallDuration, getCallActivity, matchesCallFilter, parseCallOutcomeFilter, parseInsightFilters } from "@/lib/leads/call-analytics";
import { describeCall } from "@/lib/leads/call-view";
import { formatDateTimeFull, formatEnumLabel } from "@/lib/leads/format";
import { leadSourceLabel } from "@/lib/leads/lead-source";
import { getTelephonyProvider } from "@/lib/leads/telephony";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";
import { staffNameMap } from "@/lib/staff/staff-service";

export const metadata = {
  title: "Call activity | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CallActivityPage({ searchParams }: PageProps<"/admin/call-activity">) {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();

  const params = await searchParams;
  const now = new Date();
  const filters = parseInsightFilters({ range: first(params.range) ?? "today", employee: first(params.employee), source: first(params.source) }, now);
  const names = staffNameMap(await createPostgresStaffRepository().list());
  const outcome = parseCallOutcomeFilter(params.outcome);
  const rangeKey = (RANGE_PRESETS as readonly string[]).includes(first(params.range) ?? "") ? first(params.range)! : "today";
  const feed = (await getCallActivity(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id }, filters, 300)).filter((item) => matchesCallFilter(item, outcome)).slice(0, 100);
  const dialer = getTelephonyProvider();

  return (
    <div>
      <LiveRefresh />
      <SectionHeading title="Call activity" description="Recent calls placed through the internal dialer, as the telephony provider reported them. Private — visible only to you." />

      {!dialer.configured && (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          The internal dialer is not connected to a telephony provider yet, so no calls are being placed or recorded here. Calls made from a phone&apos;s own dialer are never counted.
        </p>
      )}

      <CallFilterBar basePath="/admin/call-activity" state={{ range: rangeKey, outcome, source: first(params.source) ?? "", employee: first(params.employee) }} />

      <h2 className="text-sm font-medium text-foreground">
        {filters.range.label} · {CALL_OUTCOME_LABEL[outcome]} · {feed.length}
      </h2>
      {feed.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No calls in this range" description="Calls appear here the moment the provider reports them." />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {feed.map(({ call, lead }) => (
            <li key={call.id}>
              <Link href={`/admin/leads/${lead.id}`} className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {names[call.staffUserId] ?? "Founder"} called {lead.name ?? "an erased lead"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTimeFull(call.initiatedAt)} · {leadSourceLabel({ sourceType: lead.sourceType, sourceDetail: null, creationMethod: lead.creationMethod })}
                  </span>
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
