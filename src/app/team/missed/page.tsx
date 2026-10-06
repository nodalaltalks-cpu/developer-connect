import Link from "next/link";
import { requireEmployee } from "@/lib/team/session";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { MissedCard } from "@/components/leads/missed-card";
import { TeamCallButton } from "@/components/team/team-call-button";
import { createPostgresLeadRepositories } from "@/lib/leads/db/postgres-repository";
import { getMissedFollowUps } from "@/lib/leads/follow-up-reads";
import { createLeadNotifier } from "@/lib/leads/lead-notifier";
import { createPostgresNotificationRepository } from "@/lib/notifications/db/postgres-repository";

export const metadata = {
  title: "Missed follow-ups | Developer Connects",
  robots: { index: false, follow: false },
};

// Private, live data: never cached or prerendered.
export const dynamic = "force-dynamic";

export default async function TeamMissedPage() {
  // The scope (my own) comes from the verified session — never from the URL.
  const { actor } = await requireEmployee();
  const now = new Date();
  const items = await getMissedFollowUps(createPostgresLeadRepositories(), actor, {}, now, createLeadNotifier(createPostgresNotificationRepository()));

  return (
    <div>
      <SectionHeading title="Missed follow-ups" description="Follow-ups whose time passed. Resolve each one: complete it, reschedule it, cancel it with a reason, or return the lead." />
      {items.length === 0 ? (
        <EmptyState title="Nothing overdue" description="You have no missed follow-ups. Your leads are open." />
      ) : (
        <>
          <p role="status" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {items.length === 1 ? "1 follow-up is overdue." : `${items.length} follow-ups are overdue.`} Other leads are closed until you resolve {items.length === 1 ? "it" : "them"}.
          </p>
          <ul className="grid gap-3">
            {items.map((item) => (
              <MissedCard key={item.followUp.id} item={item} href={`/team/leads/${item.lead.id}`} callSlot={<TeamCallButton compact leadId={item.lead.id} phoneE164={item.lead.phoneE164} />} />
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 text-sm">
        <Link href="/team" className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
          ← My Leads
        </Link>
      </p>
    </div>
  );
}
