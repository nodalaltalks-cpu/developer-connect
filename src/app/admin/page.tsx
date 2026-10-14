import { LiveRefresh } from "@/components/live-refresh";
import { getExecutiveOverview } from "@/lib/admin-analytics/queries";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getLeadCounts } from "@/lib/leads/lead-reads";
import { DATE_RANGE_OPTIONS, parseDateRangeKey, resolveDateRange } from "@/lib/admin-analytics/date-range";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { SectionHeading } from "@/components/admin/empty-state";
import { NorthStarMetric } from "@/components/admin/north-star-metric";
import { RateDisplay } from "@/components/admin/rate-display";
import { PlatformHealthSummaryCard } from "@/components/admin/platform-health-summary-card";

export default async function AdminOverviewPage({
  searchParams,
}: PageProps<"/admin">) {
  const resolvedSearchParams = await searchParams;
  const range = resolveDateRange(parseDateRangeKey(resolvedSearchParams.range));
  const overview = await getExecutiveOverview(range);
  // The buyers themselves, live: this page is otherwise about visitors and verification, so leads are shown here too.
  const leads = await getLeadCounts(createPostgresLeadRepositories(), new Date()).catch(() => null);
  const previousPeriodNoun = DATE_RANGE_OPTIONS.find((o) => o.key === range.key)!.label.toLowerCase();

  return (
    <div>
      <LiveRefresh />
      <SectionHeading
        title="Overview"
        description={`Real counts from the database — nothing here is estimated or fabricated. Search/engagement figures below reflect ${range.label}; developer/verification status counts are always the current, live state.`}
      />

      {leads && (
        <section aria-labelledby="overview-leads" className="mb-6">
          <h2 id="overview-leads" className="mb-3 text-base font-semibold text-foreground">
            Leads right now
          </h2>
          <StatGrid>
            <StatTile label="New (not yet contacted)" value={leads.new} href="/admin/leads?view=new#lead-list" tone={leads.new > 0 ? "green" : undefined} />
            <StatTile label="Missed leads" value={leads.overdue} href="/admin/leads?view=overdue#lead-list" />
            <StatTile label="Due today" value={leads.dueToday} href="/admin/leads?view=due_today#lead-list" />
            <StatTile label="Total leads" value={leads.total} href="/admin/leads?view=all#lead-list" />
          </StatGrid>
        </section>
      )}

      <div className="mb-6">
        <PlatformHealthSummaryCard />
      </div>

      <NorthStarMetric
        officialWebsiteClicks={overview.officialWebsiteClicks}
        conversion={overview.northStarConversion}
        comparison={overview.officialWebsiteClicksComparison}
        periodNoun={previousPeriodNoun}
      />

      <div className="mt-6">
        <h2 className="text-base font-semibold text-foreground">
          Search → connect request funnel
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The North Star above is the last step of this funnel — the counts below show where
          visitors are lost along the way, for {range.label}.
        </p>

        <div className="mt-4 space-y-2">
          {overview.funnel.map((step) => (
            <div
              key={step.label}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div>
                <p className="font-medium text-foreground">{step.label}</p>
                {step.conversionFromPrevious !== null && (
                  <p className="text-xs text-muted-foreground">
                    <RateDisplay rate={step.conversionFromPrevious} /> of the previous step
                  </p>
                )}
              </div>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {step.count}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-base font-semibold text-foreground">Secondary metrics</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational context — none of these are the primary outcome.
        </p>
        <div className="mt-4">
          <StatGrid>
            <StatTile label="Developers tracked" value={overview.developersTracked} />
            <StatTile label="Verified" value={overview.verifiedDevelopers} />
            <StatTile label="Pending verification" value={overview.pendingVerification} />
            <StatTile label="Needs re-verification" value={overview.needsReverification} />
            <StatTile
              label="Total searches"
              value={overview.totalSearches}
              hint={
                overview.searchVolumeComparison.sufficientData
                  ? `${overview.searchVolumeComparison.absoluteChange >= 0 ? "+" : ""}${overview.searchVolumeComparison.absoluteChange} vs previous ${previousPeriodNoun}`
                  : "Not enough data for a trend yet"
              }
            />
            <StatTile label="Zero-result searches" value={overview.zeroResultSearches} />
            <StatTile label="Developer page views" value={overview.developerPageViews} />
            <StatTile
              label="Active users"
              value={overview.activeUsers}
              hint="Signed-in, tracked at least one event"
            />
            <StatTile label="Profiles started" value={overview.profilesStarted} />
            <StatTile
              label="Mobile share"
              value={
                overview.mobileShare.denominator === 0 ? (
                  "N/A"
                ) : (
                  <RateDisplay rate={overview.mobileShare} />
                )
              }
            />
          </StatGrid>
        </div>
      </div>

      {overview.totalSearches === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No search activity yet — every number above will fill in as real visitors use Developer
          Connects.
        </p>
      )}
    </div>
  );
}
