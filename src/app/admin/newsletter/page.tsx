import Link from "next/link";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";

export const metadata = {
  title: "Newsletter Subscribers | Developer Connects",
  robots: { index: false, follow: false },
};

/** Founder-only newsletter subscriber list (Part 29) — real-time via a fresh database read on every load, same as the rest of admin. */
export default async function AdminNewsletterPage() {
  const engagement = createEngagementRepositories();
  const [subscribers, activeCount] = await Promise.all([
    engagement.newsletter.list(500),
    engagement.newsletter.countActive(),
  ]);

  return (
    <div>
      <SectionHeading
        title="Newsletter Subscribers"
        description={`${activeCount} currently subscribed.`}
      />

      {subscribers.length === 0 ? (
        <EmptyState
          title="No subscribers yet"
          description="A subscriber will appear here the moment someone signs up for the newsletter."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {subscribers.map((subscriber) => (
            <li key={subscriber.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <a href={`mailto:${subscriber.email}`} className="font-medium text-accent-hover hover:underline">
                  {subscriber.email}
                </a>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {subscriber.createdAt.toLocaleString()}
                  {subscriber.source && ` · via ${subscriber.source}`}
                  {subscriber.userId && (
                    <>
                      {" · "}
                      <Link href={`/admin/users/${subscriber.userId}`} className="text-accent-hover hover:underline">
                        View profile
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  subscriber.status === "SUBSCRIBED"
                    ? "bg-trust-soft text-trust"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {subscriber.status === "SUBSCRIBED" ? "Subscribed" : "Unsubscribed"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
