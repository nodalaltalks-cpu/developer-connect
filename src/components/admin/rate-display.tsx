import type { RateMetric } from "@/lib/admin-analytics/rate";

/** "N/A", or "50% (1 of 2)" — every rate in the dashboard renders through this, never a bare percentage. */
export function RateDisplay({ rate }: { rate: RateMetric }) {
  if (rate.denominator === 0) {
    return <span className="text-muted-foreground">N/A</span>;
  }
  return (
    <span>
      {rate.percent}%{" "}
      <span className="text-muted-foreground">
        ({rate.numerator} of {rate.denominator})
      </span>
    </span>
  );
}
