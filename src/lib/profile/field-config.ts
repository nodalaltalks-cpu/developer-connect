import type { ProfileFieldConfig } from "./types.ts";

/**
 * THE SINGLE SOURCE OF TRUTH for which profile fields exist and how much
 * each contributes to the completion percentage. Every other piece of the
 * profile completion system (completion.ts, the profile page, and any
 * future founder-facing profile analytics) reads only this array — never
 * a hardcoded field list of its own.
 *
 * EMPTY ON PURPOSE. Phase 2D searched this repository (code, schema,
 * every project file) for a previously established profile field list
 * and found none. Per explicit instruction, no fields were invented to
 * fill this in.
 *
 * Four field ideas were discussed as prose UX rationale in the Phase 2A
 * blueprint (never implemented as a schema, never given exact keys/types)
 * — reported in the Phase 2D deliverable as:
 *   PROPOSED FIELD — NOT IMPLEMENTED: intent (buying / investing / researching)
 *   PROPOSED FIELD — NOT IMPLEMENTED: focusAreas (target locality/geography)
 *   PROPOSED FIELD — NOT IMPLEMENTED: priority (what matters most)
 *   PROPOSED FIELD — NOT IMPLEMENTED: decisionStage (exploring / shortlisting / ready)
 * None of them appear below. Adding a real field is a one-line addition
 * here — e.g. { key: "intent", label: "What are you here for?", weight: 1 }
 * — nothing else in the completion or analytics system needs to change.
 */
export const PROFILE_FIELD_CONFIG: ProfileFieldConfig[] = [];
