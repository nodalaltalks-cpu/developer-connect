import {
  getSearchIntelligence,
  getExecutiveOverview,
  getHighPriorityVerificationOpportunities,
  getUserBehaviorIntelligence,
  getRetentionMetrics,
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
  const [search, overview, opportunities, behavior, retention] = await Promise.all([
    getSearchIntelligence(),
    getExecutiveOverview(),
    getHighPriorityVerificationOpportunities(),
    getUserBehaviorIntelligence(),
    getRetentionMetrics(),
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
  const zeroResultOnly = behavior.segments.find((s) => s.segment === "ZERO_RESULT_ONLY");
  if (zeroResultOnly && zeroResultOnly.count > 0 && behavior.distinctSessions > 0) {
    const rate = computeRate(zeroResultOnly.count, behavior.distinctSessions);
    observations.push(
      `${formatRate(rate)} of all sessions searched at least once and never once got a successful result — see Users & Profiles for the segment breakdown.`,
    );
  }
  const d7 = retention.windows.find((w) => w.windowDays === 7);
  if (d7 && d7.eligibleSessions > 0) {
    observations.push(
      `${formatRate(d7.rate)} of sessions old enough to measure came back within 7 days of their first visit.`,
    );
  }
  if (search.searchBehavior.searchingSessions > 0 && search.searchBehavior.refinedSearchSessions > 0) {
    const refinedRate = computeRate(search.searchBehavior.refinedSearchSessions, search.searchBehavior.searchingSessions);
    observations.push(`${formatRate(refinedRate)} of searching sessions tried more than one query — refining their search rather than finding what they wanted on the first try.`);
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
