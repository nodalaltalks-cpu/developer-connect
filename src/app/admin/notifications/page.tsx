import Link from "next/link";
import { listFounderNotificationHistoryAction } from "@/app/admin/_actions/notification-actions";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { buttonClassName } from "@/components/ui/button";

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
 * Founder-only notification history (Part 16 of the spec). Shows real,
 * individually-sent notification rows — the existing model has no
 * concept of a "campaign" grouping several recipients under one send, so
 * this deliberately does not fabricate one; each row is one real
 * notification a real user received.
 */
export default async function AdminNotificationsPage() {
  const history = await listFounderNotificationHistoryAction(100);

  return (
    <div>
      <SectionHeading
        title="Notifications"
        description="Send a targeted in-app message to help users complete their Developer Connects profile."
      />

      <Link href="/admin/notifications/new" className={buttonClassName("primary")}>
        Create notification
      </Link>

      <h2 className="mt-8 text-base font-semibold text-foreground">Sent</h2>
      {history.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Nothing sent yet"
            description="Notifications you send will show up here, one row per recipient."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {history.map((notification) => (
            <li key={notification.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{notification.title}</p>
                <p className="truncate text-sm text-muted-foreground">{notification.body}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>{timeAgo(notification.createdAt)}</p>
                <p>{notification.read ? "Read" : "Unread"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
