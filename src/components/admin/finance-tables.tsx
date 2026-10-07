import { formatRate } from "@/lib/leads/call-analytics";
import { formatMoneyExact as formatMoney } from "@/lib/leads/format";
import { formatRatio, type FinanceGroup } from "@/lib/leads/finance";
import type { LeadCurrency } from "@/lib/leads/types";

/**
 * Presentational finance tables (pure, server-rendered). One table PER CURRENCY: INR and AED are never mixed or
 * converted. A ratio with nothing to divide by is a dash. Nothing here is a score.
 */

const money = (v: number | null, c: LeadCurrency) => (v === null ? "—" : formatMoney(Math.round(v), c));

export function FinanceTable({ caption, firstColumn, groups, currency, withSpend = true }: { caption: string; firstColumn: string; groups: FinanceGroup[]; currency: LeadCurrency; withSpend?: boolean }) {
  const rows = groups.filter((g) => g.money[currency]);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing recorded in {currency}.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-3 font-medium">{firstColumn}</th>
            <th className="px-2 font-medium">Leads</th>
            <th className="px-2 font-medium">Qualified</th>
            <th className="px-2 font-medium">Visits</th>
            <th className="px-2 font-medium">Bookings</th>
            {withSpend && <th className="px-2 font-medium">Spend</th>}
            {withSpend && <th className="px-2 font-medium">Cost / lead</th>}
            {withSpend && <th className="px-2 font-medium">Cost / qualified</th>}
            {withSpend && <th className="px-2 font-medium">Cost / booking</th>}
            <th className="px-2 font-medium">Commission received</th>
            <th className="px-2 font-medium">Expected</th>
            <th className="px-2 font-medium">Outstanding</th>
            {withSpend && <th className="px-2 font-medium">Profit</th>}
            {withSpend && <th className="px-2 font-medium">ROAS</th>}
            {withSpend && <th className="pl-2 font-medium">ROI</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const m = g.money[currency]!;
            return (
              <tr key={g.key} className="border-t border-border align-top">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium text-foreground">
                  {g.label}
                </th>
                <td className="px-2">{g.counts.leads}</td>
                <td className="px-2">{g.counts.qualified}</td>
                <td className="px-2">{g.counts.siteVisits}</td>
                <td className="px-2">{m.bookings}</td>
                {withSpend && <td className="px-2">{money(m.spend, currency)}</td>}
                {withSpend && <td className="px-2">{money(m.cpl, currency)}</td>}
                {withSpend && <td className="px-2">{money(m.cpql, currency)}</td>}
                {withSpend && <td className="px-2">{money(m.costPerBooking, currency)}</td>}
                <td className="px-2">{money(m.commissionReceived, currency)}</td>
                <td className="px-2">{money(m.commissionExpected, currency)}</td>
                <td className="px-2">{money(m.outstanding, currency)}</td>
                {withSpend && <td className={`px-2 ${m.profit < 0 ? "text-red-700" : ""}`}>{money(m.profit, currency)}</td>}
                {withSpend && <td className="px-2">{formatRatio(m.roas)}</td>}
                {withSpend && <td className="pl-2">{m.roi === null ? "—" : formatRate(m.roi)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
