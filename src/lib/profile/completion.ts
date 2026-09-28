import { PROFILE_FIELD_CONFIG, PROFILE_SECTIONS } from "./field-config.ts";
import type {
  CompletionBand,
  ProfileCompletion,
  ProfileFieldConfig,
  ProfileSectionCompletion,
} from "./types.ts";

function bandFor(percentage: number): CompletionBand {
  if (percentage >= 100) return "FULLY_COMPLETED";
  if (percentage >= 76) return "ALMOST_COMPLETE";
  if (percentage >= 51) return "MORE_COMPLETE";
  if (percentage >= 26) return "PARTIALLY_COMPLETED";
  return "VERY_EARLY";
}

/**
 * Whether a stored field value represents a real, deliberate answer.
 *
 * BUG THIS FIXES: the previous version's final fallback (`return true`)
 * treated ANY non-null, non-string, non-array value as "filled" —
 * including a plain object with every property empty. `budgetRange`
 * (type "range") is stored as `{ min?: number; max?: number }`; a user
 * who opened the Budget section, typed into a field, then cleared it
 * again ends up with `budgetRange: {}` (JSON serialization drops
 * `undefined`-valued keys) — an object, not null/undefined, so the old
 * code counted it as filled and the section showed "Complete" while
 * genuinely empty. Recursing into a plain object's own values (applying
 * these exact same rules to each) fixes this generically for `range` and
 * any future object-shaped field, without hardcoding a rule for
 * "budgetRange" specifically: `{}` -> no values -> not filled; `{min: 5000000}`
 * -> one real value -> filled.
 *
 * A `boolean` (e.g. a notification-preference toggle) still counts as
 * filled even when `false` — that is a real, deliberately saved choice,
 * not an empty field, unlike an empty range object. `NaN` never counts as
 * filled (defensive: nothing in this app's inputs should produce it, but
 * a numeric field must never appear "complete" from a parsing failure).
 */
function isFieldFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.values(value).some(isFieldFilled);
  return true;
}

function sectionsFor(
  data: Record<string, unknown>,
  config: ProfileFieldConfig[],
  sections: { id: string; title: string }[],
): ProfileSectionCompletion[] {
  return sections.map((section) => {
    const fields = config.filter((field) => field.section === section.id);
    const completedFields = fields.filter((field) => isFieldFilled(data[field.key])).length;
    return {
      sectionId: section.id,
      title: section.title,
      totalFields: fields.length,
      completedFields,
      percentage: fields.length > 0 ? Math.round((completedFields / fields.length) * 100) : null,
      complete: fields.length > 0 && completedFields === fields.length,
    };
  });
}

/**
 * The pure algorithm, parameterized by field config (and, for the
 * per-section breakdown, section list) so it's testable without touching
 * (or faking) the real product field list. Exported only for that reason
 * — `calculateProfileCompletion` below, which always uses the real
 * PROFILE_FIELD_CONFIG/PROFILE_SECTIONS, is what the rest of the app calls.
 */
export function calculateCompletionFromConfig(
  data: Record<string, unknown>,
  config: ProfileFieldConfig[],
  sections: { id: string; title: string }[] = [],
): ProfileCompletion {
  if (config.length === 0) {
    return {
      percentage: null,
      band: null,
      completedFieldKeys: [],
      missingFieldKeys: [],
      sections: [],
    };
  }

  const totalWeight = config.reduce((sum, field) => sum + field.weight, 0);
  const completed = config.filter((field) => isFieldFilled(data[field.key]));
  const missing = config.filter((field) => !isFieldFilled(data[field.key]));
  const completedWeight = completed.reduce((sum, field) => sum + field.weight, 0);

  const percentage = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;

  return {
    percentage,
    band: bandFor(percentage),
    completedFieldKeys: completed.map((field) => field.key),
    missingFieldKeys: missing.map((field) => field.key),
    sections: sectionsFor(data, config, sections),
  };
}

/**
 * Deterministic, weight-aware completion using the real, single source of
 * truth (PROFILE_FIELD_CONFIG / PROFILE_SECTIONS). Always derived on read
 * from `data` + config — never stored or cached — so the displayed
 * percentage (and section breakdown) can never disagree with the
 * underlying profile state; there is nothing to go stale, and the
 * Founder dashboard reads this exact same function, never a second
 * competing calculation.
 *
 * Returns `percentage: null` when no fields are configured yet, rather
 * than fabricating 0% or 100% for a profile that has nothing to complete.
 */
export function calculateProfileCompletion(data: Record<string, unknown>): ProfileCompletion {
  return calculateCompletionFromConfig(data, PROFILE_FIELD_CONFIG, PROFILE_SECTIONS);
}
