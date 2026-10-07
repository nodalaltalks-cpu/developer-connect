import Link from "next/link";
import { EmptyState } from "@/components/admin/empty-state";
import { formatDateTimeFull } from "@/lib/leads/format";
import type { UpcomingVisit } from "@/lib/leads/site-visit-service";

/** Open (scheduled or confirmed) site visits, soonest first. Pure and server-rendered; `basePath` is where each lead opens. */
export function OpenVisitsList({ visits, basePath }: { visits: UpcomingVisit[]; basePath: string }) {
  if (visits.length === 0) return <EmptyState title="No open site visits" description="Visits you schedule from a lead appear here until they are completed, cancelled or rescheduled." />;
  return (
    <ul className="space-y-2">
      {visits.map(({ visit, lead, projectName, awaitingOutcome }) => (
        <li key={visit.id}>
          <Link href={`${basePath}/${lead.id}`} className="block rounded-md border border-border p-3 hover:bg-muted">
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{lead.name ?? "Unnamed lead"}</span>
                <span className="block truncate text-xs text-muted-foreground">{projectName ?? "No project chosen"}</span>
              </span>
              <span className="shrink-0 text-right text-xs">
                <span className="block font-medium text-foreground">{formatDateTimeFull(visit.scheduledAt)}</span>
                <span className={awaitingOutcome ? "font-medium text-red-700" : "text-muted-foreground"}>{awaitingOutcome ? "Record what happened" : visit.status === "CONFIRMED" ? "Confirmed" : "Scheduled"}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
