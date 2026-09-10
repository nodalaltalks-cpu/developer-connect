import {
  getSearchIntelligence,
  getExecutiveOverview,
  getHighPriorityVerificationOpportunities,
} from "@/lib/admin-analytics/queries";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { formatRate, computeRate } from "@/lib/admin-analytics/rate";

/**
 * Every line this page renders is a direct, mechanically-derived fact
 * from the database — never a synthesized insight, correlation-as-
 * causation claim, or generated narrative. That's a deliberate boundary:
 * the founder forms hypotheses; this page only ever states observations.
 * Every rate quoted here goes through rate.ts, so a tiny sample always
 * carries its own counts rather than a bare, over-confident percentage.
 */
export default async function AdminLearningPage() {
  const [search, overview, opportunities] = await Promise.all([
    getSearchIntelligence(),
    getExecutiveOverview(),
    getHighPriorityVerificationOpportunities(),
  ]);

  const observations: string[] = [];
  if (search.highDemandUnverified.length > 0) {
    const top = search.highDemandUnverified[0];
    observations.push(
      `"${top.query}" was searched ${top.count} time${top.count === 1 ? "" : "s"} and returned no verified developer — the clearest current verification-priority signal.`,
    );
  }
  if (overview.totalSearches > 0) {
    const zeroRate = computeRate(overview.zeroResultSearches, overview.totalSearches);
    observations.push(`${formatRate(zeroRate)} of searches so far have returned zero results.`);
  }
  if (overview.developerPageViews > 0) {
    const clickRate = computeRate(overview.officialWebsiteClicks, overview.developerPageViews);
    observations.push(`${formatRate(clickRate)} of developer page views led to an official-website click.`);
  }
  const unverifiedOpportunities = opportunities.filter((o) => o.status === "INDEXED_UNVERIFIED");
  if (unverifiedOpportunities.length > 0) {
    observations.push(
      `${unverifiedOpportunities.length} indexed developer${unverifiedOpportunities.length === 1 ? " has" : "s have"} real search demand and no verified website yet — see Search Intelligence for the list.`,
    );
  }

  return (
    <div>
      <SectionHeading
        title="Learning"
        description="Observations only — mechanically derived from real data, never a generated hypothesis or claimed cause."
      />

      {observations.length === 0 ? (
        <EmptyState
          title="Not enough data yet"
          description="Observations appear here once there's real search and engagement history to derive them from."
        />
      ) : (
        <ul className="space-y-3">
          {observations.map((observation) => (
            <li key={observation} className="rounded-lg border border-border p-4 text-sm">
              <span className="mr-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-hover">
                OBSERVATION
              </span>
              {observation}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-foreground">Growth experiments</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Deferred to a future phase. No experiment-tracking schema exists yet — building one now,
          with zero experiments to record, would be exactly the kind of premature infrastructure
          Phase 2D was asked to avoid. When it&apos;s needed, the loop is CHANGE → METRIC → BEFORE →
          AFTER → RESULT → LEARNING, and this page is where it will live.
        </p>
      </div>
    </div>
  );
}
