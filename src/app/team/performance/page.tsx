import Link from "next/link";
import { requireTab } from "@/lib/team/session";
import { SectionHeading } from "@/components/admin/empty-state";
import { CallMetricTiles, MetricTile } from "@/components/leads/call-metrics";
import { LiveRefresh } from "@/components/live-refresh";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatMoneyExact } from "@/lib/leads/format";
import { getMyPerformance } from "@/lib/leads/team-performance";
import type { LeadCurrency } from "@/lib/leads/types";

export const metadata = {
  title: "My performance | Developer Connects",
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

export default async function TeamPerformancePage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  // Scope is the signed-in member's own id from the session - never from the URL.
  const { actor } = await requireTab("performance");
  const params = await searchParams;
  const rangeKey = RANGES.find((r) => r.key === first(params.range))?.key ?? "last7";
  const perf = await getMyPerformance(createPostgresLeadRepositories(), actor, { range: rangeKey });

  return (
    <div>
      <LiveRefresh />
      <SectionHeading title={`My performance — ${perf.rangeLabel}`} description="Your own numbers, worked out from your real calls and activity. You cannot edit them, and nobody else's are shown here." />

      <nav aria-label="Time range" className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={`/team/performance?range=${r.key}`} aria-current={r.key === rangeKey ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${r.key === rangeKey ? "border-accent bg-accent-soft text-accent-hover" : "border-border text-foreground"}`}>
            {r.label}
          </Link>
        ))}
      </nav>

      <h2 className="mb-2 text-sm font-semibold text-foreground">Calls and follow-ups</h2>
      <CallMetricTiles metrics={perf.calls} followUps={{ created: perf.followUps.created, completed: perf.followUps.completed, missed: perf.followUps.missedNow }} />

      <h2 className="mb-2 mt-6 text-sm font-semibold text-foreground">Site visits and requirements</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricTile label="Visits scheduled" value={String(perf.siteVisits.scheduled)} />
        <MetricTile label="Visits completed" value={String(perf.siteVisits.completed)} />
        <MetricTile label="Visits no-show" value={String(perf.siteVisits.noShow)} />
        <MetricTile label="Requirements created" value={String(perf.requirementsCreated)} />
        <MetricTile label="Projects shortlisted" value={String(perf.projectsShortlisted)} />
        <MetricTile label="Leads returned" value={String(perf.leadsReturned)} />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-foreground">Right now</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricTile label="Open leads you own" value={String(perf.openLeads)} hint="a snapshot, not tied to the dates above" />
        {perf.bookings.length === 0 ? (
          <MetricTile label="Bookings on your leads" value="None yet" />
        ) : (
          perf.bookings.map((b) => <MetricTile key={b.currency} label="Bookings on your leads" value={formatMoneyExact(b.total, b.currency as LeadCurrency)} hint={`${b.count} ${b.count === 1 ? "booking" : "bookings"}`} />)
        )}
      </div>
    </div>
  );
}
