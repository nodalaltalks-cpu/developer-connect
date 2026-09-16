import Link from "next/link";
import { SectionHeading } from "@/components/admin/empty-state";
import { ContactSubmissionsList } from "@/components/admin/contact-submissions-list";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";

export const metadata = {
  title: "Contact Submissions | Developer Connects",
  robots: { index: false, follow: false },
};

/**
 * Founder-only Contact Us case management — real-time via a fresh
 * database read on every load, same as the rest of admin. Only ACTIVE
 * (non-deleted) submissions ever appear here; see /admin/contact/trash
 * for soft-deleted ones (Part 12).
 */
export default async function AdminContactPage() {
  const engagement = createEngagementRepositories();
  const submissions = await engagement.contact.list(200);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          title="Contact Submissions"
          description="Messages sent through the public Contact Us form."
        />
        <Link href="/admin/contact/trash" className="mt-1 shrink-0 text-sm text-accent-hover hover:underline">
          Trash
        </Link>
      </div>

      <ContactSubmissionsList initialSubmissions={submissions} />
    </div>
  );
}
