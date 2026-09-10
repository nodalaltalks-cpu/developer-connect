import type { NotificationRepository } from "./repository.ts";
import type { ProfileCompletion } from "../profile/types.ts";
import { PROFILE_SECTIONS } from "../profile/field-config.ts";

/**
 * The ONE place profile-completion notification copy is written (Part 14's
 * explicit requirement) — nothing else in the app should construct this
 * text itself.
 *
 * Deliberately sparse, not spam: only nudges once completion is
 * meaningfully underway (>=50%) and not yet finished (<100%), and never
 * creates a second notification while an earlier one is still unread
 * (see hasUnreadOfType) — reading or dismissing the existing one is what
 * allows the next one to be generated, on the next real change.
 *
 * Respects the user's own Notification Settings toggle
 * (notifyProfileCompletionTips) — if they've turned it off, nothing is
 * generated at all.
 */
export async function maybeNotifyProfileCompletion(
  repo: NotificationRepository,
  userId: string,
  completion: ProfileCompletion,
  profileData: Record<string, unknown>,
): Promise<void> {
  if (profileData.notifyProfileCompletionTips === false) return;
  if (completion.percentage === null) return;
  if (completion.percentage < 50 || completion.percentage >= 100) return;

  const alreadyPending = await repo.hasUnreadOfType(userId, "PROFILE_COMPLETION");
  if (alreadyPending) return;

  const nextSection = firstIncompleteSection(completion);
  if (!nextSection) return;

  const remaining = completion.missingFieldKeys.length;

  await repo.create({
    userId,
    type: "PROFILE_COMPLETION",
    title: "Make your profile more useful",
    body:
      remaining === 1
        ? `You're one step away — add ${nextSection.title} to finish up.`
        : `You're ${completion.percentage}% done. Add ${nextSection.title} to tell us more about what you're looking for.`,
    // Deep-links straight to the specific incomplete section, not just the
    // page — the profile page reads this ?section param and opens/scrolls
    // to it (see profile-editor.tsx).
    targetRoute: `/profile?section=${nextSection.id}`,
  });
}

function firstIncompleteSection(
  completion: ProfileCompletion,
): { id: string; title: string } | null {
  const incomplete = PROFILE_SECTIONS.find((section) => {
    const status = completion.sections.find((s) => s.sectionId === section.id);
    return status && !status.complete;
  });
  return incomplete ? { id: incomplete.id, title: incomplete.title } : null;
}
