import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { MetricTile } from "@/components/leads/call-metrics";
import { formatRate, formatTalkTime, parseInsightFilters } from "@/lib/leads/call-analytics";
import { getCommandCentre } from "@/lib/leads/command-centre-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { CURRENCIES, formatRatio } from "@/lib/leads/finance";
import { formatEnumLabel, formatMoneyExact } from "@/lib/leads/format";
import { createPostgresStaffRepository } from "@/lib/staff/db/postgres-repository";

export const metadata = {
  title: "Command centre | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGES = [
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
] as const;

export default async function CommandCentrePage({ searchParams }: PageProps<"/admin/command-centre">) {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const params = await searchParams;
  const now = new Date();
  const filters = parseInsightFilters({ range: first(params.range) ?? "last30" }, now);
  const cc = await getCommandCentre(createPostgresLeadRepositories(), createPostgresStaffRepository(), { actorType: "FOUNDER", actorId: user!.id }, filters, now);
  const chip = "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium";
  const pct = (v: number | null) => formatRate(v);
  const maxStage = Math.max(1, ...cc.sales.pipeline.map((s) => s.count));

  return (
    <div>
      <SectionHeading title={`Command centre — ${cc.range.label}`} description="What needs a decision, what happened, why, and who is responsible. Every figure is counted from real records; each block links to where you can act on it." />
      <nav aria-label="Range" className="mb-5 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={`/admin/command-centre?range=${r.key}`} aria-current={cc.range.label === r.label ? "page" : undefined} className={chip}>
            {r.label}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="text-base font-semibold text-foreground">
          Needs your attention
        </h2>
        {cc.attention.length === 0 ? (
          <p role="status" className="mt-2 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
            Nothing is waiting on you right now: no missed follow-ups, stale or unassigned leads, pending visits or unusual channel numbers.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {cc.attention.map((item, i) => (
              <li key={`${item.key}-${i}`} className={`rounded-lg border p-3 ${item.severity === "HIGH" ? "border-red-200" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-semibold text-foreground">{item.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${item.severity === "HIGH" ? "bg-red-50 text-red-800" : "bg-muted text-foreground"}`}>{item.severity === "HIGH" ? "Act now" : "Look at"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                <p className="mt-1 text-sm text-foreground">Next: {item.action}</p>
                <Link href={item.href} className="mt-2 inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-accent-hover hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="overview-heading" className="mt-8">
        <h2 id="overview-heading" className="text-base font-semibold text-foreground">
          What happened
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile label="Leads" value={String(cc.overview.leads)} hint="created in this range" />
          <MetricTile label="Qualified" value={String(cc.overview.qualified)} hint={pct(cc.sales.conversion.qualified)} />
          <MetricTile label="Site visits" value={String(cc.overview.siteVisits)} hint={pct(cc.sales.conversion.siteVisit)} />
          <MetricTile label="Bookings" value={String(cc.overview.bookings)} hint={pct(cc.sales.conversion.booked)} />
        </div>
        {CURRENCIES.filter((c) => cc.overview.money[c]).map((c) => {
          const m = cc.overview.money[c]!;
          return (
            <div key={c} className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">{c} (never mixed with other currencies)</p>
              <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricTile label="Marketing spend" value={formatMoneyExact(m.spend, c)} />
                <MetricTile label="Commission received" value={formatMoneyExact(m.received, c)} />
                <MetricTile label="Outstanding" value={formatMoneyExact(m.outstanding, c)} hint="all live bookings" />
                <MetricTile label="ROI" value={m.roi === null ? "—" : formatRate(m.roi)} hint={m.spend > 0 ? "received vs spend" : "no spend recorded"} />
              </div>
            </div>
          );
        })}
        <p className="mt-2 text-xs text-muted-foreground">
          Recent leads have had less time to qualify or book, so rates for a short range understate where they will end up.{" "}
          <Link href="/admin/finance" className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
            Full finance
          </Link>
        </p>
      </section>

      <section aria-labelledby="sales-heading" className="mt-8">
        <h2 id="sales-heading" className="text-base font-semibold text-foreground">
          Sales: where leads are now
        </h2>
        <ul className="mt-3 space-y-1.5">
          {cc.sales.pipeline.map((s) => (
            <li key={s.status} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 truncate text-foreground sm:w-48">{formatEnumLabel(s.status)}</span>
              <span className="h-2 min-w-0 flex-1 rounded bg-muted" aria-hidden="true">
                <span className="block h-2 rounded bg-accent" style={{ width: `${(s.count / maxStage) * 100}%` }} />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-foreground">{s.count}</span>
            </li>
          ))}
        </ul>
        {cc.sales.secondary.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Also: {cc.sales.secondary.map((s) => `${formatEnumLabel(s.status)} ${s.count}`).join(" · ")}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile label="Calls connected" value={`${cc.sales.calls.connected} of ${cc.sales.calls.dialed}`} hint={formatTalkTime(cc.sales.calls.talkSeconds) + " talk time"} />
          <MetricTile label="Follow-ups done" value={`${cc.sales.followUps.completed} of ${cc.sales.followUps.created}`} hint={`${cc.sales.followUps.missedNow} missed now`} />
          <MetricTile label="Visits scheduled" value={String(cc.sales.siteVisits.scheduled)} hint={`${cc.sales.siteVisits.completed} done · ${cc.sales.siteVisits.noShow} no-show`} />
          <MetricTile label="Booked" value={String(cc.overview.bookings)} />
        </div>
      </section>

      <section aria-labelledby="acq-heading" className="mt-8">
        <h2 id="acq-heading" className="text-base font-semibold text-foreground">
          Acquisition: which channels bring qualified buyers
        </h2>
        {cc.acquisition.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No leads in this range" description="Channels appear here once leads arrive." />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {cc.acquisition.map((g) => (
              <li key={g.key} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium text-foreground">{g.label}</p>
                <p className="text-xs text-muted-foreground">
                  {g.counts.leads} leads · {g.counts.qualified} qualified ({pct(g.counts.leads > 0 ? g.counts.qualified / g.counts.leads : null)}) · {g.counts.siteVisits} visits · {g.counts.bookings} bookings
                  {CURRENCIES.filter((c) => g.money[c]?.spend).map((c) => ` · ${c} cost per lead ${g.money[c]!.cpl === null ? "—" : formatMoneyExact(Math.round(g.money[c]!.cpl!), c)}, ROAS ${formatRatio(g.money[c]!.roas)}`).join("")}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          <Link href="/admin/acquisition" className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
            Acquisition detail
          </Link>
        </p>
      </section>

      <section aria-labelledby="proj-heading" className="mt-8">
        <h2 id="proj-heading" className="text-base font-semibold text-foreground">
          Projects: where the interest is
        </h2>
        {cc.projects.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No project has been shortlisted, visited or booked yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {cc.projects.map((p) => (
              <li key={p.projectId} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium text-foreground">
                  {p.name} <span className="text-xs font-normal text-muted-foreground">{p.developerName}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.shortlisted} shortlisted now · {p.visits} visits in range · {p.bookings} bookings
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="emp-heading" className="mt-8">
        <h2 id="emp-heading" className="text-base font-semibold text-foreground">
          Team: activity and contribution
        </h2>
        {cc.employees.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {cc.employees.map((e) => (
              <li key={e.userId} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium text-foreground">
                  {e.name}
                  {!e.active && <span className="ml-1 text-xs font-normal text-muted-foreground">(inactive)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.contribution.ownedLeads} leads owned · {e.calls.connected} of {e.calls.dialed} calls connected · {formatTalkTime(e.calls.talkSeconds)} talk · {e.followUps.completed}/{e.followUps.created} follow-ups done ({e.followUps.missedNow} missed) ·{" "}
                  {e.contribution.siteVisitsScheduled} visits set, {e.contribution.siteVisitsCompleted} done
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          No score and no ranking: compare the ratios beside the totals, because a person with fewer leads is not doing less.{" "}
          <Link href="/admin/employee-insights" className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
            Employee insights
          </Link>
        </p>
      </section>

      {cc.truncated && (
        <p role="status" className="mt-6 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          This range has more leads than the report reads at once, so lead figures cover the most recent ones only.
        </p>
      )}
    </div>
  );
}
