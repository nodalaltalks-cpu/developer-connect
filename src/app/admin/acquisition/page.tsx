import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { requireFounder } from "@/lib/auth";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { AcquisitionTable } from "@/components/admin/acquisition-tables";
import { parseInsightFilters } from "@/lib/leads/call-analytics";
import { getAcquisitionReport } from "@/lib/leads/campaign-service";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";

export const metadata = {
  title: "Acquisition | Developer Connects",
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

export default async function AcquisitionPage({ searchParams }: PageProps<"/admin/acquisition">) {
  // The layout also gates /admin, but a layout is not re-run on every client navigation.
  await requireFounder();
  const user = await currentUser();
  const params = await searchParams;
  const now = new Date();
  const range = parseInsightFilters({ range: first(params.range) ?? "last30", from: first(params.from), to: first(params.to) }, now).range;
  const basis = first(params.basis) === "latest" ? "latest" : "first";
  const report = await getAcquisitionReport(createPostgresLeadRepositories(), { actorType: "FOUNDER", actorId: user!.id }, { from: range.from, to: range.to }, basis);
  const href = (r: string, b: string) => `/admin/acquisition?range=${r}&basis=${b}`;
  const chip = "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium";

  return (
    <div>
      <SectionHeading title={`Acquisition — ${range.label}`} description="Where leads came from and what they became, counted from real lead records. A lead is counted once, on the touch you choose." />

      <nav aria-label="Range" className="mb-2 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={href(r.key, basis)} aria-current={range.label === r.label ? "page" : undefined} className={chip}>
            {r.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Attribution" className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Attribute by</span>
        <Link href={href(first(params.range) ?? "last30", "first")} aria-current={basis === "first" ? "page" : undefined} className={chip}>
          First touch
        </Link>
        <Link href={href(first(params.range) ?? "last30", "latest")} aria-current={basis === "latest" ? "page" : undefined} className={chip}>
          Latest touch
        </Link>
      </nav>

      {report.truncated && (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
          This range has more leads than the report reads at once, so it covers the most recent ones only. Choose a shorter range for the full picture.
        </p>
      )}

      {report.totals.leads === 0 ? (
        <EmptyState title="No leads in this range" description="Leads appear here when someone asks to connect or when you import or add leads." />
      ) : (
        <>
          <h2 className="text-sm font-semibold text-foreground">By channel</h2>
          <div className="mt-2">
            <AcquisitionTable caption="Leads by acquisition channel" firstColumn="Channel" groups={report.byChannel} totals={report.totals} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">“Direct / unknown” means no ad click, campaign tag or referring site was recorded - it is not proof the visitor typed the address.</p>

          <h2 className="mt-8 text-sm font-semibold text-foreground">By campaign</h2>
          <div className="mt-2">
            <AcquisitionTable caption="Leads by campaign" firstColumn="Campaign" groups={report.byCampaign} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A lead belongs to at most one campaign, matched by its utm_campaign tag. A tag with no campaign defined shows as “Untracked tag”.{" "}
            <Link href="/admin/campaigns" className="text-accent-hover hover:underline">
              Manage campaigns
            </Link>
          </p>

          <h2 className="mt-8 text-sm font-semibold text-foreground">By landing page</h2>
          <div className="mt-2">
            <AcquisitionTable caption="Leads by landing page" firstColumn="Landing page" groups={report.byLandingPage} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Cost per lead and per qualified lead need recorded marketing spend, which is not tracked yet, so they are not shown rather than estimated.</p>
        </>
      )}
    </div>
  );
}
