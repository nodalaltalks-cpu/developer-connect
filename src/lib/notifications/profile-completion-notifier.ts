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

  const nextSection = firstIncompleteSectionTitle(completion);
  if (!nextSection) return;

  await repo.create({
    userId,
    type: "PROFILE_COMPLETION",
    title: `Your profile is ${completion.percentage}% complete`,
    body: `Add ${nextSection} to make your research more relevant.`,
    targetRoute: "/profile",
  });
}

function firstIncompleteSectionTitle(completion: ProfileCompletion): string | null {
  const incomplete = PROFILE_SECTIONS.find((section) => {
    const status = completion.sections.find((s) => s.sectionId === section.id);
    return status && !status.complete;
  });
  return incomplete?.title ?? null;
}
