import { LiveRefresh } from "@/components/live-refresh";
import Link from "next/link";
import { EmptyState, SectionHeading } from "@/components/admin/empty-state";
import { listEnquiries } from "@/lib/social/db/postgres-social";
import { describeAnswers } from "@/lib/social/enquiry-options";
import { formatDateTimeWithDay } from "@/lib/leads/format";

export const metadata = { title: "Enquiries | Developer Connects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Every submission of the tap-to-select enquiry form, newest first, with every answer the visitor tapped and the lead it created. */
export default async function EnquiriesPage() {
  const rows = await listEnquiries(100).catch(() => null);
  return (
    <div>
      <LiveRefresh />
      <SectionHeading title="Enquiries" description="Each one came from the tap-to-select enquiry form (developerconnects.com/enquire). It is already a lead in Leads; here you see everything the person tapped." />
      <p className="mb-4 text-sm text-muted-foreground">
        Form address to put in every bio: <span className="font-medium text-foreground">developerconnects.com/enquire</span> · links page: <span className="font-medium text-foreground">developerconnects.com/links</span>
      </p>
      {rows === null ? (
        <EmptyState title="Could not load enquiries" description="The database did not answer. Reload in a moment." />
      ) : rows.length === 0 ? (
        <EmptyState title="No enquiries yet" description="They appear here the moment someone submits the form." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-foreground">{row.name ?? "No name given"}</p>
                  <p className="text-sm text-foreground">{row.phoneE164 ?? "Number erased"}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{formatDateTimeWithDay(row.createdAt)}</p>
                  <p>{row.utmSource ? `Source: ${row.utmSource}` : row.howFound ? `Said: ${row.howFound.toLowerCase()}` : "Source unknown"}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {describeAnswers(row.answers).map((line) => (
                  <div key={line.question} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{line.question}:</dt>
                    <dd className="font-medium text-foreground">{line.answer}</dd>
                  </div>
                ))}
              </dl>
              <Link href={`/admin/leads/${row.leadId}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
                Open the lead →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
