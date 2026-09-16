import Link from "next/link";
import { SectionHeading } from "@/components/admin/empty-state";
import { ContactTrashList } from "@/components/admin/contact-trash-list";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import { requireFounder } from "@/lib/auth";

export const metadata = {
  title: "Contact Trash | Developer Connects",
  robots: { index: false, follow: false },
};

/**
 * Founder-only. /admin/layout.tsx already calls requireFounder() for
 * every /admin/* route, but this page calls it again directly (Part 14:
 * "do not rely only on hiding the UI... server-side authorization is
 * mandatory") — belt-and-braces, exactly like requireFounderForAction
 * being called first in every mutating Server Action regardless of
 * which page happens to render the button that triggers it.
 */
export default async function AdminContactTrashPage() {
  await requireFounder();

  const engagement = createEngagementRepositories();
  const trashed = await engagement.contact.listTrash(200);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          title="Contact · Trash"
          description="Requests moved to Trash from Contact Submissions. Nothing here is public — Founder-only."
        />
        <Link href="/admin/contact" className="mt-1 shrink-0 text-sm text-accent-hover hover:underline">
          Back to Contact
        </Link>
      </div>

      <ContactTrashList initialSubmissions={trashed} />
    </div>
  );
}
