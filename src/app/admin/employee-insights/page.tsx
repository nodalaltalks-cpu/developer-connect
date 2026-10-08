import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { SectionHeading } from "@/components/admin/empty-state";
import { CallMetricTiles, ContributionTable, EmployeeTable, HourlyChart, PeriodTable } from "@/components/leads/call-metrics";
import { getEmployeeInsights, parseInsightFilters, PERIODS, RANGE_PRESETS } from "@/lib/leads/call-analytics";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { formatEnumLabel } from "@/lib/leads/format";
import { getTelephonyProvider } from "@/lib/leads/telephony";
import { CALL_STATUSES, LEAD_SOURCE_TYPES } from "@/lib/leads/types";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";

export const metadata = {
  title: "Employee insights | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const FIELD = "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground";
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGE_LABEL: Record<(typeof RANGE_PRESETS)[number], string> = { today: "Today", yesterday: "Yesterday", last7: "Last 7 days", last30: "Last 30 days", custom: "Custom range" };

export default async function EmployeeInsightsPage({ searchParams }: PageProps<"/admin/employee-insights">) {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();

  const params = await searchParams;
  const now = new Date();
  const filters = parseInsightFilters(
    { range: first(params.range), from: first(params.from), to: first(params.to), period: first(params.period), employee: first(params.employee), source: first(params.source), status: first(params.status), connected: first(params.connected) },
    now,
  );
  const staff = createPostgresStaffRepository();
  const insights = await getEmployeeInsights(createPostgresLeadRepositories(), staff, { actorType: "FOUNDER", actorId: user!.id }, filters, now);
  const team = await staff.list();
  const dialer = getTelephonyProvider();

  return (
    <div>
      <SectionHeading title="Employee insights" description="Real sales activity from the internal dialer's call records — activity and outcomes side by side. No scores, no ranking." />

      {!dialer.configured && (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          The internal dialer is not connected to a telephony provider yet, so there are no call records to analyse. Everything below fills in from real calls once it is connected; nothing is estimated in the meantime.
        </p>
      )}

      <form method="get" className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter insights">
        <label className="text-sm text-foreground">
          Date range
          <select name="range" defaultValue={first(params.range) ?? "today"} className={`${FIELD} mt-1`}>
            {RANGE_PRESETS.map((r) => (
              <option key={r} value={r}>
                {RANGE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          From (custom)
          <input type="date" name="from" defaultValue={first(params.from) ?? ""} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-sm text-foreground">
          To (custom)
          <input type="date" name="to" defaultValue={first(params.to) ?? ""} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-sm text-foreground">
          Report by
          <select name="period" defaultValue={filters.period} className={`${FIELD} mt-1`}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {formatEnumLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          Employee
          <select name="employee" defaultValue={first(params.employee) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">Everyone</option>
            {team.map((m) => (
              <option key={m.id} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          Lead source
          <select name="source" defaultValue={first(params.source) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">All</option>
            {LEAD_SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s === "DIGITAL" ? "Digital" : "Self-generated"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          Call outcome
          <select name="status" defaultValue={first(params.status) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">Any</option>
            {CALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatEnumLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          Connected?
          <select name="connected" defaultValue={first(params.connected) ?? ""} className={`${FIELD} mt-1`}>
            <option value="">Either</option>
            <option value="yes">Connected</option>
            <option value="no">Not connected</option>
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover sm:col-span-2 lg:col-span-4">
          Apply filters
        </button>
      </form>

      <p className="mb-3 text-sm text-muted-foreground">
        {filters.range.label} · times in India time (IST)
      </p>

      <CallMetricTiles
        metrics={{ dialed: insights.totals.dialed, connected: insights.totals.connected, connectionRate: insights.totals.connectionRate, noAnswer: 0, busy: 0, failed: 0, rejected: 0, talkSeconds: insights.totals.talkSeconds, avgConnectedSeconds: insights.totals.avgConnectedSeconds, leadsCalled: 0 }}
      />

      <h2 className="mt-8 text-sm font-semibold text-foreground">Calls by hour</h2>
      <p className="mb-3 text-xs text-muted-foreground">When people are actually dialing and connecting, for the selected filters.</p>
      <HourlyChart hourly={insights.hourly} />

      <h2 className="mt-8 text-sm font-semibold text-foreground">By {filters.period === "daily" ? "day" : filters.period === "weekly" ? "week (Monday)" : filters.period === "monthly" ? "month" : filters.period === "quarterly" ? "quarter" : "year"}</h2>
      <div className="mt-3">
        <PeriodTable periods={insights.periods} label={formatEnumLabel(filters.period)} />
      </div>

      <h2 className="mt-8 text-sm font-semibold text-foreground">Employees</h2>
      <div className="mt-3">
        <EmployeeTable rows={insights.rows} />
        <h3 className="mt-6 text-sm font-medium text-foreground">Contribution in this range</h3>
        <div className="mt-2">
          <ContributionTable rows={insights.rows} />
        </div>
      </div>
    </div>
  );
}
