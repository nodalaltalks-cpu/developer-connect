/**
 * Single source of truth for turning a (numerator, denominator) pair into
 * something a founder can actually interpret — every rate/CTR/conversion/
 * mobile-share number in the dashboard goes through this, so none of them
 * can silently disagree on what "N/A" or a percentage means.
 *
 * The rule: never show a bare percentage. Always keep the underlying
 * counts attached, so "50%" can never be mistaken for a meaningful rate
 * when it's actually 1-of-2.
 */
export interface RateMetric {
  numerator: number;
  denominator: number;
  /** null when denominator is 0 — there is nothing to compute a rate from. */
  percent: number | null;
}

export function computeRate(numerator: number, denominator: number): RateMetric {
  return {
    numerator,
    denominator,
    percent: denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null,
  };
}

/** "N/A", or "50% (1 of 2)" — the display format every rate in the dashboard uses. */
export function formatRate(rate: RateMetric): string {
  if (rate.denominator === 0) return "N/A";
  return `${rate.percent}% (${rate.numerator} of ${rate.denominator})`;
}
