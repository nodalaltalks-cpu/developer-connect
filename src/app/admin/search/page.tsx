import Link from "next/link";
import { getSearchIntelligence, getHighPriorityVerificationOpportunities } from "@/lib/admin-analytics/queries";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import type { VerificationOpportunity } from "@/lib/admin-analytics/types";

const STATUS_LABEL: Record<VerificationOpportunity["status"], string> = {
  NOT_INDEXED: "Search demand exists, but developer record is not currently indexed.",
  INDEXED_UNVERIFIED: "Developer indexed, official website not yet verified.",
  INDEXED_VERIFIED: "Developer already verified — likely a name-matching gap, not a verification gap.",
};

export default async function AdminSearchIntelligencePage() {
  const [intel, opportunities] = await Promise.all([
    getSearchIntelligence(),
    getHighPriorityVerificationOpportunities(),
  ]);

  return (
    <div>
      <SectionHeading
        title="Search Intelligence"
        description="What people actually search for — and, critically, what returns nothing."
      />

      <StatGrid>
        <StatTile label="Total searches" value={intel.totalSearches} />
        <StatTile label="Unique queries" value={intel.uniqueQueries} />
        <StatTile
          label="Sessions that refined their search"
          value={intel.searchBehavior.refinedSearchSessions}
          hint={`of ${intel.searchBehavior.searchingSessions} searching sessions — tried more than one query`}
        />
        <StatTile
          label="Sessions that repeated a search"
          value={intel.searchBehavior.repeatedSearchSessions}
          hint="searched the exact same term again"
        />
      </StatGrid>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Top searches</h2>
          {intel.topQueries.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No searches yet" description="Top queries will appear here once real visitors start searching." />
            </div>
          ) : (
            <ol className="mt-3 divide-y divide-border rounded-lg border border-border">
              {intel.topQueries.map((row) => (
                <li key={row.query} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-foreground">{row.query}</span>
                  <span className="text-muted-foreground">{row.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">High-priority verification opportunities</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every zero-result search, checked against the real developer directory — never a
            synthesized demand score.
          </p>
          {opportunities.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No zero-result searches yet"
                description="This list fills in the moment someone searches for a developer Developer Connects doesn't have verified yet."
              />
            </div>
          ) : (
            <ol className="mt-3 divide-y divide-border rounded-lg border border-border">
              {opportunities.map((opportunity) => (
                <li key={opportunity.query} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{opportunity.query}</span>
                    <span className="text-muted-foreground">{opportunity.searchCount}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{STATUS_LABEL[opportunity.status]}</p>
                  {opportunity.status === "INDEXED_UNVERIFIED" && opportunity.developer && (
                    <Link
                      href={`/admin/developers/${opportunity.developer.id}`}
                      className="mt-1 inline-block text-xs font-medium text-accent-hover hover:underline"
                    >
                      Review {opportunity.developer.displayName} →
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
