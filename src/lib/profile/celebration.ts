import type { ProfileCompletion } from "./types.ts";

export interface CelebrationResult {
  show: boolean;
  /** The first section that genuinely went incomplete -> complete in this save, or null if `show` is false. */
  sectionTitle: string | null;
  /** The new overall percentage, or null if `show` is false. */
  percentage: number | null;
}

const NO_CELEBRATION: CelebrationResult = { show: false, sectionTitle: null, percentage: null };

/**
 * The one decision behind the celebration overlay (Part 7/8 of the
 * profile-UX task): compare the section-completion state from BEFORE a
 * save to the state AFTER it, and say whether this was a genuine
 * incomplete -> complete transition worth celebrating.
 *
 * Deliberately a plain, pure function — no DOM, no timers, no React —
 * so it's unit-testable on its own and so the actual UI component
 * (completion-celebration.tsx) only ever renders what this function
 * already decided, never re-derives the decision itself. Both of its
 * conditions must hold, matching the task's explicit "do NOT trigger"
 * list:
 *
 *  - At least one section's `complete` flag flipped false -> true.
 *    A section that was ALREADY complete before this save (re-saving an
 *    already-complete section, or a page simply re-rendering with the
 *    same data on reload/hydration — this function is never even called
 *    then, only from a real save's result) can never appear here.
 *  - The overall percentage genuinely increased. Guards the edge case
 *    where a save completes one section while simultaneously clearing a
 *    value elsewhere, netting no real overall progress — the task's own
 *    "do NOT trigger if the percentage has not actually increased" rule.
 */
export function shouldCelebrate(before: ProfileCompletion, after: ProfileCompletion): CelebrationResult {
  if (before.percentage === null || after.percentage === null) return NO_CELEBRATION;
  if (after.percentage <= before.percentage) return NO_CELEBRATION;

  const newlyCompleted = after.sections.find((section) => {
    if (!section.complete) return false;
    const beforeSection = before.sections.find((s) => s.sectionId === section.sectionId);
    return Boolean(beforeSection) && !beforeSection!.complete;
  });
  if (!newlyCompleted) return NO_CELEBRATION;

  return { show: true, sectionTitle: newlyCompleted.title, percentage: after.percentage };
}
