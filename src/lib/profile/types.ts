/**
 * A user's profile. Deliberately field-agnostic — `data` is whatever keys
 * PROFILE_FIELD_CONFIG (see field-config.ts) currently defines. There is
 * no historical field list to encode here; see field-config.ts for why.
 */
export interface Profile {
  /** Clerk user id — the identity provider's id, not a row this project owns. */
  userId: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type ProfileFieldType =
  | "text"
  | "date"
  | "select"
  | "multiselect"
  | "boolean"
  | "range"
  | "location-multiselect";

export interface ProfileFieldOption {
  value: string;
  label: string;
  description?: string;
}

export interface ProfileFieldConfig {
  key: string;
  label: string;
  /** Relative contribution to completion. Weights need not sum to 100 — completion is weight / totalWeight. Uniform (1) across every field today — deliberately, not arbitrarily differentiated. */
  weight: number;
  /** Which ProfileSection (see PROFILE_SECTIONS) this field belongs to. */
  section: string;
  type: ProfileFieldType;
  options?: ProfileFieldOption[];
  placeholder?: string;
  helperText?: string;
  /** Shown once per section, not per field, when set on that section's first field. */
  privacyNote?: string;
}

export interface ProfileSection {
  id: string;
  title: string;
  helperText?: string;
  /**
   * One honest sentence on why this section is useful to the user
   * themselves — never a promise the product doesn't keep (e.g. never
   * "better recommendations" unless a recommendation engine exists).
   * Shown on the profile page next to the section; this is the single
   * source of truth for that copy, same as everything else here.
   */
  whyItMatters?: string;
}

export type CompletionBand =
  | "VERY_EARLY"
  | "PARTIALLY_COMPLETED"
  | "MORE_COMPLETE"
  | "ALMOST_COMPLETE"
  | "FULLY_COMPLETED";

export interface ProfileSectionCompletion {
  sectionId: string;
  title: string;
  totalFields: number;
  completedFields: number;
  /** null when the section has no configured fields (should not happen for a real section, but kept honest). */
  percentage: number | null;
  complete: boolean;
}

export interface ProfileCompletion {
  /** null when PROFILE_FIELD_CONFIG is empty — genuinely undefined, never fabricated as 0 or 100. */
  percentage: number | null;
  band: CompletionBand | null;
  completedFieldKeys: string[];
  missingFieldKeys: string[];
  /** Same source data as the fields above, just grouped by section — one calculation, never a second competing one. */
  sections: ProfileSectionCompletion[];
}
