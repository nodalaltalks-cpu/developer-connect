import type { RateMetric } from "@/lib/admin-analytics/rate";
import type { PeriodComparison } from "@/lib/admin-analytics/period-comparison";
import { RateDisplay } from "./rate-display";
import { PeriodComparisonDisplay } from "./period-comparison-display";

/**
 * The one metric this whole product exists to produce. Deliberately the
 * only thing on the page with an accent border and oversized number —
 * everything else on Overview is a plain StatTile by comparison. No
 * gradients/animation; hierarchy comes from size and restraint, not
 * decoration.
 */
export function NorthStarMetric({
  officialWebsiteClicks,
  conversion,
  comparison,
}: {
  officialWebsiteClicks: number;
  conversion: RateMetric;
  comparison: PeriodComparison;
}) {
  return (
    <div className="rounded-lg border-2 border-accent bg-accent-soft p-6">
      <p className="text-sm font-medium text-accent-hover">North Star — Verified Official Website Visits</p>
      <p className="mt-2 text-5xl font-semibold tracking-tight text-foreground">
        {officialWebsiteClicks}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        <RateDisplay rate={conversion} /> of all searches ended with a visitor reaching a real
        developer&apos;s official website.
      </p>
      <div className="mt-2">
        <PeriodComparisonDisplay comparison={comparison} />
      </div>
    </div>
  );
}
