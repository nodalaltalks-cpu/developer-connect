import { formatCallDuration, formatRate, formatTalkTime, type CallMetrics, type EmployeeInsightRow, type HourlyBucket, type PeriodBucket } from "@/lib/leads/call-analytics";
import { formatMoney } from "@/lib/leads/format";
import type { LeadCurrency } from "@/lib/leads/types";

/**
 * Presentational pieces for call analytics (pure, server-rendered). Every figure arrives already computed from real call
 * records; nothing is derived here beyond layout, and there is no score or ranking anywhere.
 */

export function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Today (or any range) at a glance for one person. */
export function CallMetricTiles({ metrics, followUps }: { metrics: CallMetrics; followUps?: { created: number; completed: number; missed: number } }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <MetricTile label="Calls attempted" value={String(metrics.dialed)} />
      <MetricTile label="Connected" value={String(metrics.connected)} hint={metrics.dialed > 0 ? `${metrics.connected} of ${metrics.dialed} · ${formatRate(metrics.connectionRate)}` : "Nothing dialed yet"} />
      <MetricTile label="No answer" value={String(metrics.noAnswer)} />
      <MetricTile label="Busy" value={String(metrics.busy)} />
      <MetricTile label="Failed" value={String(metrics.failed + metrics.rejected)} hint={metrics.rejected > 0 ? `${metrics.rejected} rejected` : undefined} />
      <MetricTile label="Talk time" value={formatTalkTime(metrics.talkSeconds)} />
      <MetricTile label="Avg connected call" value={metrics.avgConnectedSeconds === null ? "—" : formatCallDuration(metrics.avgConnectedSeconds)} />
      {followUps && (
        <>
          <MetricTile label="Follow-ups created" value={String(followUps.created)} />
          <MetricTile label="Follow-ups completed" value={String(followUps.completed)} />
          <MetricTile label="Missed follow-ups" value={String(followUps.missed)} hint="open right now" />
        </>
      )}
    </div>
  );
}

const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;

/**
 * Calls by hour of day (India time): dialed AND connected on the same bar track, so the Founder sees when people are
 * actually productive. Bars are scaled to the busiest hour; the exact numbers are always printed beside them.
 */
export function HourlyChart({ hourly }: { hourly: HourlyBucket[] }) {
  const active = hourly.filter((h) => h.dialed > 0);
  if (active.length === 0) {
    return <p className="text-sm text-muted-foreground">No calls in this range, so there is nothing to chart.</p>;
  }
  const first = Math.max(0, Math.min(...active.map((h) => h.hour)) - 1);
  const last = Math.min(23, Math.max(...active.map((h) => h.hour)) + 1);
  const shown = hourly.filter((h) => h.hour >= first && h.hour <= last);
  const max = Math.max(...shown.map((h) => h.dialed), 1);
  return (
    <div>
      <ul className="space-y-1.5" aria-label="Calls by hour of day">
        {shown.map((h) => (
          <li key={h.hour} className="grid grid-cols-[3.5rem_1fr_6.5rem] items-center gap-2 text-sm">
            <span className="text-xs text-muted-foreground">{hourLabel(h.hour)}</span>
            <span className="relative h-5 overflow-hidden rounded bg-muted" role="img" aria-label={`${hourLabel(h.hour)}: ${h.dialed} dialed, ${h.connected} connected`}>
              <span className="absolute inset-y-0 left-0 rounded bg-border" style={{ width: `${(h.dialed / max) * 100}%` }} />
              <span className="absolute inset-y-0 left-0 rounded bg-accent" style={{ width: `${(h.connected / max) * 100}%` }} />
            </span>
            <span className="text-right text-xs text-foreground">
              {h.dialed} / {h.connected}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded bg-border align-middle" />
          Dialed
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded bg-accent align-middle" />
          Connected
        </span>
        <span>numbers: dialed / connected</span>
      </p>
    </div>
  );
}

export function PeriodTable({ periods, label }: { periods: PeriodBucket[]; label: string }) {
  if (periods.length === 0) return <p className="text-sm text-muted-foreground">No calls in this range.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-3 font-medium">{label}</th>
            <th className="px-2 font-medium">Dialed</th>
            <th className="px-2 font-medium">Connected</th>
            <th className="px-2 font-medium">Rate</th>
            <th className="px-2 font-medium">Talk time</th>
            <th className="pl-2 font-medium">Avg</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.key} className="border-t border-border">
              <th scope="row" className="py-1.5 pr-3 font-medium text-foreground">
                {p.key}
              </th>
              <td className="px-2">{p.dialed}</td>
              <td className="px-2">{p.connected}</td>
              <td className="px-2">{formatRate(p.connectionRate)}</td>
              <td className="px-2">{formatTalkTime(p.talkSeconds)}</td>
              <td className="pl-2">{p.avgConnectedSeconds === null ? "—" : formatCallDuration(p.avgConnectedSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One row per employee, activity and outcomes side by side — deliberately NOT sorted by calls and with no score, so
 * volume is never mistaken for effectiveness.
 */
/** What each person did in the range, beside the denominators that make it fair to compare. No score, no rank. */
export function ContributionTable({ rows }: { rows: EmployeeInsightRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">Employee contribution in the selected range</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Employee</th>
            <th className="px-2 font-medium">Leads owned</th>
            <th className="px-2 font-medium">Reached</th>
            <th className="px-2 font-medium">Requirements</th>
            <th className="px-2 font-medium">Shortlisted</th>
            <th className="px-2 font-medium">Visits set</th>
            <th className="px-2 font-medium">Visits per connected call</th>
            <th className="px-2 font-medium">Visits done / no-show</th>
            <th className="pl-2 font-medium">Visit completion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-t border-border align-top">
              <th scope="row" className="py-1.5 pr-3 font-medium text-foreground">{r.name}</th>
              <td className="px-2">{r.contribution.ownedLeads}</td>
              <td className="px-2">{formatRate(r.contribution.leadsReachedShare)}</td>
              <td className="px-2">{r.contribution.requirementsCreated}</td>
              <td className="px-2">{r.contribution.projectsShortlisted}</td>
              <td className="px-2">{r.contribution.siteVisitsScheduled}</td>
              <td className="px-2">{r.contribution.visitsPerConnectedCall === null ? "—" : r.contribution.visitsPerConnectedCall.toFixed(2)}</td>
              <td className="px-2">
                {r.contribution.siteVisitsCompleted} / {r.contribution.siteVisitsNoShow}
              </td>
              <td className="pl-2">{formatRate(r.contribution.visitCompletionRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        Ratios are shown with what they are measured against and are blank when there is nothing to measure against. A team member with fewer leads is not marked down for it; compare the ratios, not the totals.
      </p>
    </div>
  );
}

export function EmployeeTable({ rows }: { rows: EmployeeInsightRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <caption className="sr-only">Employee activity and outcomes</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Employee</th>
            <th className="px-2 font-medium">Dialed</th>
            <th className="px-2 font-medium">Connected</th>
            <th className="px-2 font-medium">Rate</th>
            <th className="px-2 font-medium">Talk time</th>
            <th className="px-2 font-medium">Avg</th>
            <th className="px-2 font-medium">Leads called</th>
            <th className="px-2 font-medium">FU made / done</th>
            <th className="px-2 font-medium">Missed FU</th>
            <th className="px-2 font-medium">Returned</th>
            <th className="px-2 font-medium">Qualified</th>
            <th className="px-2 font-medium">Site visits</th>
            <th className="px-2 font-medium">Booked</th>
            <th className="pl-2 font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-t border-border align-top">
              <th scope="row" className="py-1.5 pr-3 font-medium text-foreground">
                {r.name}
                {!r.active && <span className="ml-1 text-xs font-normal text-muted-foreground">(inactive)</span>}
              </th>
              <td className="px-2">{r.calls.dialed}</td>
              <td className="px-2">{r.calls.connected}</td>
              <td className="px-2">{formatRate(r.calls.connectionRate)}</td>
              <td className="px-2">{formatTalkTime(r.calls.talkSeconds)}</td>
              <td className="px-2">{r.calls.avgConnectedSeconds === null ? "—" : formatCallDuration(r.calls.avgConnectedSeconds)}</td>
              <td className="px-2">{r.calls.leadsCalled}</td>
              <td className="px-2">
                {r.followUps.created} / {r.followUps.completed}
              </td>
              <td className="px-2">{r.followUps.missedNow}</td>
              <td className="px-2">{r.leadsReturned}</td>
              <td className="px-2">{r.currentLeads.qualified}</td>
              <td className="px-2">{r.currentLeads.siteVisit}</td>
              <td className="px-2">{r.currentLeads.booked}</td>
              <td className="pl-2">
                {r.revenue.length === 0 ? "—" : r.revenue.map((x) => <span key={x.currency} className="block">{formatMoney(x.total, x.currency as LeadCurrency)}</span>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        Qualified, site visits, booked and revenue are where each person&apos;s CURRENT leads stand today — a snapshot, not credit for how they got there.
      </p>
    </div>
  );
}
