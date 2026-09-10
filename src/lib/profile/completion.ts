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

function isFieldFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
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
