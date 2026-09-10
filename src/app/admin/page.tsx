import { getExecutiveOverview } from "@/lib/admin-analytics/queries";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { SectionHeading } from "@/components/admin/empty-state";
import { NorthStarMetric } from "@/components/admin/north-star-metric";
import { RateDisplay } from "@/components/admin/rate-display";

export default async function AdminOverviewPage() {
  const overview = await getExecutiveOverview();

  return (
    <div>
      <SectionHeading
        title="Overview"
        description="Real counts from the database — nothing here is estimated or fabricated."
      />

      <NorthStarMetric
        officialWebsiteClicks={overview.officialWebsiteClicks}
        conversion={overview.northStarConversion}
        comparison={overview.officialWebsiteClicksComparison}
      />

      <div className="mt-6">
        <h2 className="text-base font-semibold text-foreground">
          Search → official website funnel
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The North Star above is the last step of this funnel — the counts below show where
          visitors are lost along the way. All-time, cumulative.
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
                  ? `${overview.searchVolumeComparison.absoluteChange >= 0 ? "+" : ""}${overview.searchVolumeComparison.absoluteChange} vs previous 7 days`
                  : "Not enough data for a weekly trend yet"
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
          Connect.
        </p>
      )}
    </div>
  );
}
