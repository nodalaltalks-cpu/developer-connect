import Link from "next/link";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { EngagementStatusSelect } from "@/components/admin/engagement-status-select";
import { createEngagementRepositories } from "@/lib/engagement/db/postgres-repository";
import { updateContactSubmissionStatusAction } from "@/app/admin/_actions/engagement-actions";
import type { ContactStatus } from "@/lib/engagement/types";

export const metadata = {
  title: "Contact Submissions | Developer Connects",
  robots: { index: false, follow: false },
};

const STATUS_OPTIONS: readonly ContactStatus[] = ["NEW", "READ", "RESPONDED", "CLOSED"];

const REASON_LABELS: Record<string, string> = {
  GENERAL_QUESTION: "General question",
  REPORT_INACCURATE_INFO: "Report inaccurate information",
  DEVELOPER_LISTING: "Developer listing",
  PARTNERSHIP: "Partnership",
  OTHER: "Other",
};

/** Founder-only Contact Us submissions (Part 27) — real-time via a fresh database read on every load, same as the rest of admin. */
export default async function AdminContactPage() {
  const engagement = createEngagementRepositories();
  const submissions = await engagement.contact.list(200);

  return (
    <div>
      <SectionHeading
        title="Contact Submissions"
        description="Messages sent through the public Contact Us form."
      />

      {submissions.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="A message will appear here the moment someone submits the Contact Us form."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {submissions.map((submission) => (
            <li key={submission.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {submission.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {REASON_LABELS[submission.reason] ?? submission.reason}
                  </span>
                </p>
                <p className="mt-1 text-foreground">{submission.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <a href={`mailto:${submission.email}`} className="text-accent-hover hover:underline">
                    {submission.email}
                  </a>
                  {" · "}
                  {submission.createdAt.toLocaleString()}
                  {submission.userId && (
                    <>
                      {" · "}
                      <Link href={`/admin/users/${submission.userId}`} className="text-accent-hover hover:underline">
                        View profile
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <EngagementStatusSelect
                id={submission.id}
                status={submission.status}
                options={STATUS_OPTIONS}
                action={updateContactSubmissionStatusAction}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
