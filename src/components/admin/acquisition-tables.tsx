import type { AcquisitionGroup, AcquisitionMetrics } from "@/lib/leads/acquisition";
import { formatRate } from "@/lib/leads/call-analytics";

/**
 * Presentational tables for the acquisition report (pure, server-rendered). Every figure arrives already computed from
 * real lead records. A rate with nothing to divide by shows an em dash - never a made-up 0%. Cost per lead and per
 * qualified lead need recorded spend and are not shown here until spend exists.
 */

function Row({ label, m, strong = false }: { label: string; m: AcquisitionMetrics; strong?: boolean }) {
  return (
    <tr className={`border-t border-border align-top ${strong ? "font-medium" : ""}`}>
      <th scope="row" className="py-1.5 pr-3 text-left font-medium text-foreground">
        {label}
      </th>
      <td className="px-2">{m.leads}</td>
      <td className="px-2">{m.qualified}</td>
      <td className="px-2">{formatRate(m.qualifiedRate)}</td>
      <td className="px-2">{m.siteVisits}</td>
      <td className="px-2">{m.booked}</td>
      <td className="pl-2">{formatRate(m.bookedRate)}</td>
    </tr>
  );
}

export function AcquisitionTable({ caption, firstColumn, groups, totals }: { caption: string; firstColumn: string; groups: AcquisitionGroup[]; totals?: AcquisitionMetrics }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-3 font-medium">{firstColumn}</th>
            <th className="px-2 font-medium">Leads</th>
            <th className="px-2 font-medium">Qualified</th>
            <th className="px-2 font-medium">Qualified rate</th>
            <th className="px-2 font-medium">Site visits</th>
            <th className="px-2 font-medium">Booked</th>
            <th className="pl-2 font-medium">Booked rate</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Row key={g.key} label={g.label} m={g} />
          ))}
          {totals && <Row label="All leads" m={totals} strong />}
        </tbody>
      </table>
    </div>
  );
}
