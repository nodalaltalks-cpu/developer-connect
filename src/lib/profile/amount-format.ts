/**
 * Parsing/formatting for the Budget section's manually-typed amounts
 * (Part 1 of the profile-UX task) — the single source of truth for
 * turning "1.2 Cr" / "75 Lakh" / "5000000" into a plain rupee number, and
 * back into a short display string. `budgetRange` itself keeps storing
 * plain numbers (`{ min?: number; max?: number }`, see
 * profile-field-input.tsx) — this module never changes that shape, it
 * only sits between the number and whatever a person actually types.
 */

const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

const AMOUNT_PATTERN = /^\s*₹?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(cr|crore|crores|l|lac|lacs|lakh|lakhs)?\s*$/i;

/**
 * Parses a natural Indian amount string into a plain rupee number, or
 * `null` when the text isn't (yet, or ever) a valid amount — never NaN,
 * never a negative or zero number, so a caller can treat `null` as "don't
 * save this" without any further validation of its own. Accepts:
 *  - a bare number: "5000000", "50,00,000"
 *  - Lakh: "50 Lakh", "75L", "12.5 lac"
 *  - Crore: "1 Cr", "1.2 Cr", "2.5 Crore"
 * Whitespace and an optional leading "₹" are ignored; the unit is
 * case-insensitive.
 */
export function parseIndianAmount(raw: string): number | null {
  const match = AMOUNT_PATTERN.exec(raw);
  if (!match) return null;

  const numeric = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const unit = match[2]?.toLowerCase();
  const multiplier = unit === undefined ? 1 : unit.startsWith("cr") ? CRORE : LAKH;

  const value = Math.round(numeric * multiplier);
  return value > 0 ? value : null;
}

/** Strips a trailing ".00" or trailing zeros after the decimal point — "1.20" -> "1.2", "1.00" -> "1". */
function trimTrailingZeros(fixed: string): string {
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

/**
 * Formats a plain rupee number as a short Indian-style amount for the
 * live "= …" preview shown under the input — the inverse of
 * `parseIndianAmount`, but never guaranteed to round-trip character for
 * character (e.g. both "1.20 Cr" and "1.2 Cr" format the same way back).
 */
export function formatIndianAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= CRORE) return `${trimTrailingZeros((value / CRORE).toFixed(2))} Cr`;
  if (value >= LAKH) return `${trimTrailingZeros((value / LAKH).toFixed(2))} Lakh`;
  return value.toLocaleString("en-IN");
}
