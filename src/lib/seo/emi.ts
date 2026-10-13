/**
 * Home loan arithmetic for the EMI calculator: the standard reducing-balance formula, monthly compounding. Pure functions, so the
 * page, the tests and any future tool use the same maths. Currency is a label only: one calculation is always in ONE currency.
 */

export type LoanCurrency = "INR" | "AED";

export interface EmiResult {
  emi: number;
  totalInterest: number;
  totalPayable: number;
}

function monthlyRate(annualRatePercent: number): number {
  return annualRatePercent / 12 / 100;
}

/** Monthly instalment for a loan of `principal` at `annualRatePercent` over `years`. Zero or invalid input gives zeros. */
export function emiFor(principal: number, annualRatePercent: number, years: number): EmiResult {
  const n = Math.round(years * 12);
  if (!(principal > 0) || !(n > 0) || !(annualRatePercent >= 0)) return { emi: 0, totalInterest: 0, totalPayable: 0 };
  const r = monthlyRate(annualRatePercent);
  const emi = r === 0 ? principal / n : (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  const totalPayable = emi * n;
  return { emi, totalInterest: totalPayable - principal, totalPayable };
}

/** The largest loan a monthly instalment of `emi` repays at `annualRatePercent` over `years`. */
export function loanForEmi(emi: number, annualRatePercent: number, years: number): number {
  const n = Math.round(years * 12);
  if (!(emi > 0) || !(n > 0) || !(annualRatePercent >= 0)) return 0;
  const r = monthlyRate(annualRatePercent);
  return r === 0 ? emi * n : (emi * ((1 + r) ** n - 1)) / (r * (1 + r) ** n);
}

export function formatMoney(amount: number, currency: LoanCurrency): string {
  const rounded = Math.round(amount);
  return currency === "INR" ? `₹${rounded.toLocaleString("en-IN")}` : `AED ${rounded.toLocaleString("en-US")}`;
}
