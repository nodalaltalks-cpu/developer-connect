import type { PeriodComparison } from "@/lib/admin-analytics/period-comparison";

/**
 * Shows "insufficient data" honestly instead of a percentage computed
 * from a handful of events — see period-comparison.ts for the threshold.
 */
export function PeriodComparisonDisplay({ comparison }: { comparison: PeriodComparison }) {
  if (!comparison.sufficientData) {
    return (
      <p className="text-xs text-muted-foreground">
        Insufficient data for a 7-day comparison yet ({comparison.currentValue} this week,{" "}
        {comparison.previousValue} the week before).
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
      {changeLabel} vs previous 7 days ({comparison.previousValue} → {comparison.currentValue})
    </p>
  );
}
