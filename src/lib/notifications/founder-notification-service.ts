import type { NotificationRepository } from "./repository.ts";
import type { Notification } from "./types.ts";
import type { ProfileRepository } from "../profile/repository.ts";
import type { ProfileCompletion } from "../profile/types.ts";
import { calculateProfileCompletion } from "../profile/completion.ts";
import { PROFILE_SECTIONS } from "../profile/field-config.ts";
import { listAllClerkUsers, getClerkUser, type ClerkUserSummary } from "../admin-analytics/clerk-users.ts";

/**
 * Founder-controlled manual in-app notifications (Phase 4B). Deliberately
 * NOT automated — every send here is one explicit founder action, never a
 * cron job, campaign scheduler, or AI-generated message (see Part 14 of
 * the spec this was built from).
 *
 * Reuses, never duplicates:
 *  - calculateProfileCompletion() — the one completion calculation.
 *  - PROFILE_SECTIONS — the one section list.
 *  - the existing `notifications` table/model (type: "FOUNDER_MESSAGE").
 *  - listAllClerkUsers()/getClerkUser() — the one Clerk read path.
 */

export type FounderAudience =
  | { kind: "ALL" }
  | { kind: "INCOMPLETE" }
  | { kind: "BELOW_PERCENT"; percent: number }
  | { kind: "MISSING_SECTION"; sectionId: string }
  | { kind: "INDIVIDUAL"; userId: string };

export interface ResolvedRecipient {
  userId: string;
  displayName: string;
  firstName: string | null;
  completion: ProfileCompletion;
}

function firstNameOf(user: ClerkUserSummary): string | null {
  const [first] = user.displayName.trim().split(/\s+/);
  // displayName falls back to email or the raw id when Clerk has no real
  // name — neither is a "first name" worth greeting someone with.
  if (!first || first.includes("@") || first === user.id) return null;
  return first;
}

/**
 * Every step here reads real data only — no invented users, no guessed
 * completion. Returns [] (never throws) for an audience that genuinely
 * matches nobody, so the caller can show "No users match this audience."
 */
export async function resolveFounderAudience(
  profileRepo: ProfileRepository,
  audience: FounderAudience,
): Promise<ResolvedRecipient[]> {
  if (audience.kind === "INDIVIDUAL") {
    const clerkUser = await getClerkUser(audience.userId);
    if (!clerkUser) return [];
    const profile = await profileRepo.getByUserId(audience.userId);
    return [
      {
        userId: clerkUser.id,
        displayName: clerkUser.displayName,
        firstName: firstNameOf(clerkUser),
        completion: calculateProfileCompletion(profile?.data ?? {}),
      },
    ];
  }

  const allUsers = await listAllClerkUsers();
  const profiles = await profileRepo.getManyByUserIds(allUsers.map((u) => u.id));
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

  const resolved: ResolvedRecipient[] = allUsers.map((user) => ({
    userId: user.id,
    displayName: user.displayName,
    firstName: firstNameOf(user),
    completion: calculateProfileCompletion(profileByUserId.get(user.id)?.data ?? {}),
  }));

  switch (audience.kind) {
    case "ALL":
      return resolved;
    case "INCOMPLETE":
      return resolved.filter((r) => r.completion.percentage !== null && r.completion.percentage < 100);
    case "BELOW_PERCENT":
      return resolved.filter(
        (r) => r.completion.percentage !== null && r.completion.percentage < audience.percent,
      );
    case "MISSING_SECTION":
      return resolved.filter((r) => {
        const section = r.completion.sections.find((s) => s.sectionId === audience.sectionId);
        return section ? !section.complete : false;
      });
    default:
      return [];
  }
}

/** First incomplete section for one recipient, in the existing PROFILE_SECTIONS order — same rule profile-completion-notifier.ts already uses. */
function firstIncompleteSectionFor(completion: ProfileCompletion): { id: string; title: string } | null {
  const incomplete = PROFILE_SECTIONS.find((section) => {
    const status = completion.sections.find((s) => s.sectionId === section.id);
    return status && !status.complete;
  });
  return incomplete ? { id: incomplete.id, title: incomplete.title } : null;
}

export interface ComposedMessage {
  title: string;
  body: string;
  targetRoute: string | null;
}

export type FounderMessageInput =
  | { purpose: "COMPLETE_PROFILE" }
  | { purpose: "COMPLETE_SECTION"; sectionId: string }
  | { purpose: "GENERAL"; title: string; body: string };

/**
 * The ONE place founder-notification copy is composed — mirrors the rule
 * already established for profile-completion-notifier.ts. For the two
 * profile-related purposes, the percentage and section named are always
 * this specific recipient's real, current data — a founder cannot type a
 * percentage that turns out wrong for half the audience.
 */
export function composeFounderMessage(
  recipient: ResolvedRecipient,
  input: FounderMessageInput,
): ComposedMessage | null {
  const greeting = recipient.firstName ? `${recipient.firstName}, ` : "";

  if (input.purpose === "GENERAL") {
    return { title: input.title, body: input.body, targetRoute: null };
  }

  if (input.purpose === "COMPLETE_SECTION") {
    const section = PROFILE_SECTIONS.find((s) => s.id === input.sectionId);
    if (!section) return null;
    const why = section.whyItMatters ? ` ${section.whyItMatters}` : "";
    return {
      title: "Complete your profile",
      body: `${greeting}add your ${section.title.toLowerCase()} —${why}`,
      targetRoute: `/profile?section=${section.id}`,
    };
  }

  // COMPLETE_PROFILE: nudge toward this recipient's own first incomplete
  // section — exactly what profile-completion-notifier.ts already does,
  // just founder-triggered instead of threshold-triggered.
  if (recipient.completion.percentage === null) return null;
  const nextSection = firstIncompleteSectionFor(recipient.completion);
  if (!nextSection) return null;

  return {
    title: "Complete your profile",
    body: `${greeting}you're ${recipient.completion.percentage}% through your profile. Add your ${nextSection.title.toLowerCase()} to make your experience more relevant.`,
    targetRoute: `/profile?section=${nextSection.id}`,
  };
}

export interface SendFounderNotificationResult {
  recipientCount: number;
  sentCount: number;
  skippedDuplicateCount: number;
  notifications: Notification[];
}

/**
 * Sends to every resolved recipient, skipping anyone who already has an
 * unread notification pointing at the exact same destination (Part 9's
 * duplicate/spam protection — deterministic: same user + same
 * targetRoute + still unread). A GENERAL message has no targetRoute, so
 * that check is skipped for it and it always sends.
 */
export async function sendFounderNotification(
  notificationRepo: NotificationRepository,
  recipients: ResolvedRecipient[],
  input: FounderMessageInput,
): Promise<SendFounderNotificationResult> {
  const created: Notification[] = [];
  let skipped = 0;

  for (const recipient of recipients) {
    const message = composeFounderMessage(recipient, input);
    if (!message) continue;

    if (message.targetRoute) {
      const existing = await notificationRepo.findUnreadByTarget(recipient.userId, message.targetRoute);
      if (existing) {
        skipped += 1;
        continue;
      }
    }

    const notification = await notificationRepo.create({
      userId: recipient.userId,
      type: "FOUNDER_MESSAGE",
      title: message.title,
      body: message.body,
      targetRoute: message.targetRoute,
    });
    created.push(notification);
  }

  return {
    recipientCount: recipients.length,
    sentCount: created.length,
    skippedDuplicateCount: skipped,
    notifications: created,
  };
}
