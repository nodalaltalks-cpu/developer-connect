import type { PeriodComparison } from "@/lib/admin-analytics/period-comparison";

/**
 * Shows "insufficient data" honestly instead of a percentage computed
 * from a handful of events — see period-comparison.ts for the threshold.
 *
 * `periodNoun` (e.g. "month", "quarter", "6 months") names whatever the
 * Founder Dashboard's global date filter currently has selected — this
 * used to hard-code "7 days" back when the comparison itself was a fixed
 * week-over-week window; now it always describes the real selected range
 * (see date-range.ts's getPreviousPeriod, which defines what "previous"
 * means for each option).
 */
export function PeriodComparisonDisplay({
  comparison,
  periodNoun,
}: {
  comparison: PeriodComparison;
  periodNoun: string;
}) {
  if (!comparison.sufficientData) {
    return (
      <p className="text-xs text-muted-foreground">
        Insufficient data for a {periodNoun} comparison yet ({comparison.currentValue} this{" "}
        {periodNoun}, {comparison.previousValue} the previous {periodNoun}).
      </p>
    );
  }

  const sign = comparison.absoluteChange > 0 ? "+" : "";
  const changeLabel =
    comparison.percentChange !== null
      ? `${sign}${comparison.percentChange}%`
      : `${sign}${comparison.absoluteChange}`;

  return (
    <p className="text-xs text-muted-foreground">
      {changeLabel} vs previous {periodNoun} ({comparison.previousValue} → {comparison.currentValue})
    </p>
  );
}
