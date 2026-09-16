import Link from "next/link";
import { SectionHeading } from "@/components/admin/empty-state";
import { TrashGate } from "@/components/admin/trash-gate";
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
 *
 * Trash's actual contents are NOT fetched here — TrashGate defers that
 * fetch behind a fresh Founder reverification (see unlockTrashAction),
 * so being a Founder is necessary to reach this page but not sufficient
 * to see what's in Trash.
 */
export default async function AdminContactTrashPage() {
  await requireFounder();

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          title="Trash"
          description="Requests moved to Trash from Contact Submissions. Nothing here is public — Founder-only, and protected behind a fresh identity check."
        />
        <Link href="/admin/contact" className="mt-1 shrink-0 text-sm text-accent-hover hover:underline">
          Back to Contact
        </Link>
      </div>

      <div className="mt-6">
        <TrashGate />
      </div>
    </div>
  );
}
