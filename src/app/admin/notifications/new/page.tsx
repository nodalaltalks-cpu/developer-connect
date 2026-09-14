import Link from "next/link";
import { getClerkUser } from "@/lib/admin-analytics/clerk-users";
import { SectionHeading } from "@/components/admin/empty-state";
import { NotificationComposer } from "@/components/admin/notification-composer";

export default async function AdminNewNotificationPage({
  searchParams,
}: PageProps<"/admin/notifications/new">) {
  const resolvedSearchParams = await searchParams;
  const userId = typeof resolvedSearchParams.userId === "string" ? resolvedSearchParams.userId : undefined;

  const preselectedUser = userId ? await getClerkUser(userId) : null;

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/admin/notifications" className="text-muted-foreground hover:underline">
          ← Notifications
        </Link>
      </p>
      <SectionHeading
        title={preselectedUser ? `Send notification to ${preselectedUser.displayName}` : "Create notification"}
        description="Send a targeted in-app message to help users complete their Developer Connects profile."
      />
      <NotificationComposer
        preselectedUser={
          preselectedUser ? { userId: preselectedUser.id, displayName: preselectedUser.displayName } : null
        }
      />
    </div>
  );
}
