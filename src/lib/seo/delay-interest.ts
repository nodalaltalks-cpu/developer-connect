/**
 * Possession-delay interest: what a buyer may be owed when a home is handed over after the date in the agreement for sale.
 *
 * Under India's Real Estate (Regulation and Development) Act, 2016, a buyer who stays in the project is entitled to interest on the
 * amount paid for the period of delay, at a rate set by the state's own RERA rules. This module only does the arithmetic: simple
 * interest on the amount paid, for each day between the date in the agreement and the handover date. The RATE is always supplied
 * by the buyer (it is set by state rules and changes), never assumed here.
 */

export interface DelayInput {
  /** Total paid to the developer so far, in rupees. */
  amountPaid: number;
  /** The possession date written in the agreement, as YYYY-MM-DD. */
  promisedDate: string;
  /** The actual handover date, or today's date while the flat is still not handed over, as YYYY-MM-DD. */
  untilDate: string;
  /** Interest rate per year, as a percentage (for example 10 for 10%). */
  annualRatePercent: number;
}

export interface DelayResult {
  valid: boolean;
  /** Why the input could not be used. Empty when valid. */
  reason: string;
  delayDays: number;
  /** The delay as whole calendar months plus the remaining days. */
  months: number;
  days: number;
  interest: number;
  perMonth: number;
  perDay: number;
}

const DAY_MS = 86_400_000;

function parseYmd(value: string): { y: number; m: number; d: number; ms: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d, ms };
}

/** The date `months` calendar months after `from`, keeping the day of the month or the last day of a shorter month. */
function addMonthsMs(from: { y: number; m: number; d: number }, months: number): number {
  const total = from.m - 1 + months;
  const year = from.y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(from.d, lastDay));
}

const none = (reason: string): DelayResult => ({ valid: false, reason, delayDays: 0, months: 0, days: 0, interest: 0, perMonth: 0, perDay: 0 });

export function delayInterest(input: DelayInput): DelayResult {
  if (!Number.isFinite(input.amountPaid) || input.amountPaid <= 0) return none("Enter the amount you have paid to the developer.");
  if (!Number.isFinite(input.annualRatePercent) || input.annualRatePercent <= 0) return none("Enter the interest rate that applies in your state.");
  const promised = parseYmd(input.promisedDate);
  if (!promised) return none("Enter the possession date written in your agreement.");
  const until = parseYmd(input.untilDate);
  if (!until) return none("Enter the handover date, or today's date if you have not received possession.");

  const yearly = (input.amountPaid * input.annualRatePercent) / 100;
  const perDay = yearly / 365;
  const perMonth = yearly / 12;

  if (until.ms <= promised.ms) return { valid: true, reason: "", delayDays: 0, months: 0, days: 0, interest: 0, perMonth, perDay };

  const delayDays = Math.round((until.ms - promised.ms) / DAY_MS);
  let months = (until.y - promised.y) * 12 + (until.m - promised.m);
  if (until.d < promised.d) months -= 1;
  months = Math.max(0, months);
  let anchor = addMonthsMs(promised, months);
  if (anchor > until.ms) {
    months -= 1;
    anchor = addMonthsMs(promised, months);
  }
  const days = Math.round((until.ms - anchor) / DAY_MS);
  return { valid: true, reason: "", delayDays, months, days, interest: perDay * delayDays, perMonth, perDay };
}
