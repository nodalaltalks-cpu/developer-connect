import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { FinanceTable } from "@/components/admin/finance-tables";
import { parseInsightFilters } from "@/lib/leads/call-analytics";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { CURRENCIES } from "@/lib/leads/finance";
import { getFinanceView } from "@/lib/leads/finance-service";
import { formatDateTimeFull, formatMoneyExact as formatMoney } from "@/lib/leads/format";

export const metadata = {
  title: "Finance | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const RANGES = [
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
] as const;

export default async function FinancePage({ searchParams }: PageProps<"/admin/finance">) {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const params = await searchParams;
  const range = parseInsightFilters({ range: first(params.range) ?? "last30", from: first(params.from), to: first(params.to) }, new Date()).range;
  const basis = first(params.basis) === "latest" ? "latest" : "first";
  const view = await getFinanceView(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id }, { from: range.from, to: range.to }, basis);
  const { report } = view;
  const chip = "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium";
  const empty = report.totals.counts.leads === 0 && CURRENCIES.every((c) => !report.totals.money[c]);

  return (
    <div>
      <SectionHeading title={`Finance — ${range.label}`} description="What the money bought: spend, leads, bookings and commission, per currency. INR and AED are never mixed or converted." />
      <nav aria-label="Range" className="mb-3 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={`/admin/finance?range=${r.key}&basis=${basis}`} aria-current={range.label === r.label ? "page" : undefined} className={chip}>
            {r.label}
          </Link>
        ))}
        <Link href="/admin/spend" className={chip}>
          Record spend
        </Link>
      </nav>
      <p className="mb-4 text-xs text-muted-foreground">
        Leads are those created in this range; spend is what was dated in it; commission is what has been recorded so far against those leads&apos; bookings, so recent leads will look worse than they will end up. Revenue means commission
        (received = cash in), not the buyer&apos;s booking value.
      </p>
      {report.truncated && (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          This range has more leads than the report reads at once, so it covers the most recent ones only.
        </p>
      )}

      {Object.keys(view.outstandingTotals).length > 0 && (
        <section aria-label="Outstanding commission" className="mb-6 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Outstanding commission (all live bookings)</h2>
          <p className="mt-1 text-sm text-foreground">
            {CURRENCIES.filter((c) => view.outstandingTotals[c]).map((c) => `${formatMoney(view.outstandingTotals[c]!, c)}`).join(" · ")}
          </p>
          <ul className="mt-2 text-xs text-muted-foreground">
            {view.outstanding.slice(0, 10).map(({ booking, outstanding }) => (
              <li key={booking.id}>
                <Link href={`/admin/leads/${booking.leadId}`} className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
                  {booking.projectName ?? "Booking"}
                </Link>{" "}
                — {formatMoney(outstanding, booking.currency)} outstanding · booked {formatDateTimeFull(booking.bookedAt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {empty ? (
        <EmptyState title="Nothing to report in this range" description="Record marketing spend and bookings; the economics fill in from them." />
      ) : (
        CURRENCIES.map((currency) => (
          <section key={currency} aria-label={`${currency} figures`} className="mb-10">
            <h2 className="text-base font-semibold text-foreground">{currency}</h2>
            <h3 className="mt-4 text-sm font-medium text-foreground">By channel</h3>
            <div className="mt-2">
              <FinanceTable caption={`Channel economics in ${currency}`} firstColumn="Channel" groups={report.byChannel} currency={currency} />
            </div>
            <h3 className="mt-6 text-sm font-medium text-foreground">By campaign</h3>
            <div className="mt-2">
              <FinanceTable caption={`Campaign economics in ${currency}`} firstColumn="Campaign" groups={report.byCampaign} currency={currency} />
            </div>
            <h3 className="mt-6 text-sm font-medium text-foreground">By project (revenue only)</h3>
            <div className="mt-2">
              <FinanceTable caption={`Project revenue in ${currency}`} firstColumn="Project" groups={report.byProject} currency={currency} withSpend={false} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Spend is recorded by channel and campaign, not by project, so project figures show revenue without a cost or ROI rather than an invented split.</p>
          </section>
        ))
      )}
    </div>
  );
}
