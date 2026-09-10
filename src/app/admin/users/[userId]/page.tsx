import { notFound } from "next/navigation";
import { getClerkUser } from "@/lib/admin-analytics/clerk-users";
import { getUserActivityTimeline } from "@/lib/admin-analytics/queries";
import { createPostgresProfileRepository } from "@/lib/profile/db/postgres-repository";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";
import { calculateProfileCompletion } from "@/lib/profile/completion";
import { PROFILE_FIELD_CONFIG } from "@/lib/profile/field-config";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { ProfileCompletionSummary } from "@/components/profile-completion-summary";

function timeAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Founder-only individual user intelligence (Part 24). Every number here
 * reads from the exact same functions the user's own /profile page and
 * the public/admin analytics layer already use — calculateProfileCompletion
 * for completion, getUserActivityTimeline for a real (never fabricated)
 * read of this user's own analytics_events rows, and the same
 * notifications table the bell reads. Nothing here is a second,
 * competing calculation.
 */
export default async function AdminUserDetailPage({
  params,
}: PageProps<"/admin/users/[userId]">) {
  const { userId } = await params;

  const clerkUser = await getClerkUser(userId);
  if (!clerkUser) notFound();

  const profileRepo = createPostgresProfileRepository();
  const notificationRepo = createPostgresNotificationRepository();

  const [profile, activity, notifications] = await Promise.all([
    profileRepo.getByUserId(userId),
    getUserActivityTimeline(userId),
    notificationRepo.listForUser(userId, 30),
  ]);

  const completion = calculateProfileCompletion(profile?.data ?? {});
  const missingSections = completion.sections.filter((s) => !s.complete);

  return (
    <div className="max-w-3xl">
      <SectionHeading
        title={clerkUser.displayName}
        description={clerkUser.primaryEmail ?? undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Identity</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Joined</dt>
              <dd className="text-right text-foreground">{timeAgo(clerkUser.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd className="text-right text-foreground">
                {clerkUser.lastSignInAt ? timeAgo(clerkUser.lastSignInAt) : "Never"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Last activity</dt>
              <dd className="text-right text-foreground">
                {activity[0] ? timeAgo(activity[0].occurredAt) : "No recorded activity"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Has a profile</dt>
              <dd className="text-right text-foreground">{profile ? "Yes" : "Not started"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Total received</dt>
              <dd className="text-right text-foreground">{notifications.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Unread</dt>
              <dd className="text-right text-foreground">
                {notifications.filter((n) => !n.read).length}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <h2 className="mt-8 text-base font-semibold text-foreground">Profile completion</h2>
      {PROFILE_FIELD_CONFIG.length === 0 || !profile ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {!profile
            ? "This user hasn't started their profile yet."
            : "No profile fields are configured yet."}
        </p>
      ) : (
        <div className="mt-3 rounded-lg border border-border bg-muted p-6">
          <ProfileCompletionSummary completion={completion} />
        </div>
      )}

      {profile && missingSections.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-foreground">What&apos;s left</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The exact same sections this user sees as incomplete on their own profile page.
          </p>
          <ul className="mt-2 space-y-1">
            {missingSections.map((section) => (
              <li key={section.sectionId} className="text-sm text-foreground">
                {section.title}{" "}
                <span className="text-muted-foreground">
                  ({section.completedFields}/{section.totalFields})
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 text-base font-semibold text-foreground">Activity timeline</h2>
      {activity.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No activity yet"
            description="This user hasn't triggered any recorded events (search, page views, profile activity) yet."
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2 rounded-lg border border-border p-4 text-sm">
          {activity.map((event, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-4 border-t border-border pt-2 first:border-t-0 first:pt-0"
            >
              <span className="text-foreground">{event.detail ?? event.eventName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(event.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-base font-semibold text-foreground">Notification history</h2>
      {notifications.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No notifications sent"
            description="Developer Connect hasn't generated any notifications for this user yet."
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2 rounded-lg border border-border p-4 text-sm">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className="border-t border-border pt-2 first:border-t-0 first:pt-0"
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-medium text-foreground">{notification.title}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(notification.createdAt)}
                </span>
              </div>
              <p className="text-muted-foreground">{notification.body}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {notification.read ? "Read" : "Unread"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
