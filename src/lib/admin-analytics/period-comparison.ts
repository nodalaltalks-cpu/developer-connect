/**
 * Reusable current-vs-previous-period comparison. The one rule this
 * exists to enforce: never show a percentage change computed from a
 * sample too small to mean anything — "insufficient data" is a first-
 * class result, not an afterthought.
 *
 * MIN_SAMPLE_FOR_COMPARISON is a stated, documented, deliberately
 * conservative threshold (not derived from any statistical test) — the
 * combined count across both periods must reach this before a change is
 * shown at all. Adjust here only; every caller reads this one constant.
 */
export const MIN_SAMPLE_FOR_COMPARISON = 10;

export interface PeriodComparison {
  currentValue: number;
  previousValue: number;
  absoluteChange: number;
  /** null when previousValue is 0 — "% change from zero" is undefined, not infinite. */
  percentChange: number | null;
  /** false when currentValue + previousValue < MIN_SAMPLE_FOR_COMPARISON. */
  sufficientData: boolean;
}

export function comparePeriods(currentValue: number, previousValue: number): PeriodComparison {
  const absoluteChange = currentValue - previousValue;
  const percentChange =
    previousValue > 0 ? Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10 : null;

  return {
    currentValue,
    previousValue,
    absoluteChange,
    percentChange,
    sufficientData: currentValue + previousValue >= MIN_SAMPLE_FOR_COMPARISON,
  };
}
