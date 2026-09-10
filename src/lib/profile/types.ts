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

export interface ProfileFieldConfig {
  key: string;
  label: string;
  /** Relative contribution to completion. Weights need not sum to 100 — completion is weight / totalWeight. */
  weight: number;
}

export type CompletionBand =
  | "VERY_EARLY"
  | "PARTIALLY_COMPLETED"
  | "MORE_COMPLETE"
  | "ALMOST_COMPLETE"
  | "FULLY_COMPLETED";

export interface ProfileCompletion {
  /** null when PROFILE_FIELD_CONFIG is empty — genuinely undefined, never fabricated as 0 or 100. */
  percentage: number | null;
  band: CompletionBand | null;
  completedFieldKeys: string[];
  missingFieldKeys: string[];
}
