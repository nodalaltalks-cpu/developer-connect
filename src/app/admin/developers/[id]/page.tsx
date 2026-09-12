import Link from "next/link";
import { notFound } from "next/navigation";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { EmptyState } from "@/components/admin/empty-state";
import { CandidateStatusBadge } from "@/components/admin/candidate-status-badge";
import { DeveloperDetailHeader } from "@/components/admin/developer-detail-header";
import { buttonClassName } from "@/components/ui/button";
import type { VerificationStatus, DeveloperEditEventType } from "@/lib/developer-connect/types";

type HistoryEntry =
  | {
      type: "EDIT";
      createdAt: Date;
      actorType: string;
      actorId: string;
      eventType: DeveloperEditEventType;
      fieldName: string | null;
      previousValue: string | null;
      newValue: string | null;
    }
  | {
      type: "VERIFICATION";
      createdAt: Date;
      actorType: string;
      actorId: string;
      previousStatus: VerificationStatus | null;
      newStatus: VerificationStatus;
      reason: string;
      candidateDomain: string;
    };

/** A verification-status transition landing on VERIFIED reads as "Published" — matches the existing "Approve & Publish" terminology used everywhere else in this admin UI, rather than introducing a new synonym. */
function verificationActionLabel(entry: Extract<HistoryEntry, { type: "VERIFICATION" }>): string {
  if (entry.newStatus === "VERIFIED") return "Published";
  if (entry.newStatus === "REJECTED") return "Rejected";
  if (entry.newStatus === "INACTIVE") return "Deactivated";
  if (entry.newStatus === "NEEDS_REVERIFICATION") return "Flagged for re-verification";
  if (entry.newStatus === "PENDING_VERIFICATION") return "Queued for review";
  return "Discovered";
}

export default async function AdminDeveloperDetailPage({
  params,
}: PageProps<"/admin/developers/[id]">) {
  const { id } = await params;
  const repos = createPostgresRepositories();

  const developer = await repos.developers.getById(id);
  if (!developer) notFound();

  const [candidates, editEvents] = await Promise.all([
    repos.candidates.listByDeveloper(id),
    repos.developerEditEvents.listByDeveloper(id),
  ]);
  candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const verificationEventLists = await Promise.all(candidates.map((c) => repos.events.listByCandidate(c.id)));
  const history: HistoryEntry[] = [
    ...editEvents.map(
      (e): HistoryEntry => ({
        type: "EDIT",
        createdAt: e.createdAt,
        actorType: e.actorType,
        actorId: e.actorId,
        eventType: e.eventType,
        fieldName: e.fieldName,
        previousValue: e.previousValue,
        newValue: e.newValue,
      }),
    ),
    ...candidates.flatMap((candidate, i) =>
      verificationEventLists[i].map(
        (e): HistoryEntry => ({
          type: "VERIFICATION",
          createdAt: e.createdAt,
          actorType: e.actorType,
          actorId: e.actorId,
          previousStatus: e.previousStatus,
          newStatus: e.newStatus,
          reason: e.reason,
          candidateDomain: candidate.canonicalDomain,
        }),
      ),
    ),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div>
      <DeveloperDetailHeader developer={developer} candidates={candidates} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Website candidates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every candidate ever submitted for this developer — rejected and superseded ones stay
            here for the record, they&apos;re never deleted.
          </p>
        </div>
        <Link href={`/admin/developers/${developer.id}/candidates/new`} className={buttonClassName("primary")}>
          Add website candidate
        </Link>
      </div>

      {candidates.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No website candidates yet"
            description="No official-website candidate has been submitted for this developer."
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <Link
                href={`/admin/verification/${candidate.id}`}
                className="flex min-h-11 items-center justify-between gap-4 px-4 py-3 hover:bg-muted"
              >
                <div>
                  <p className="font-medium text-foreground">{candidate.canonicalDomain}</p>
                  <p className="text-xs text-muted-foreground">
                    {candidate.discoverySource} · confidence {candidate.confidenceScore}
                  </p>
                </div>
                <CandidateStatusBadge status={candidate.verificationStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-6 rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          History ({history.length})
        </summary>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {history.map((entry, i) => (
              <li key={i} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <p className="text-xs text-muted-foreground">
                  {entry.createdAt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                  {" • "}
                  {entry.createdAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {entry.actorType === "FOUNDER" ? "Founder" : entry.actorType}
                </p>
                {entry.type === "EDIT" ? (
                  entry.eventType === "FIELD_CHANGE" ? (
                    <p className="mt-1 text-foreground">
                      Changed <span className="font-medium">{entry.fieldName}</span>:{" "}
                      <span className="text-muted-foreground">{entry.previousValue || "—"}</span>
                      {" → "}
                      <span className="font-medium">{entry.newValue || "—"}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-foreground">
                      <span className="font-medium">
                        {entry.eventType === "REPUBLISHED" ? "Republished" : "Discarded unpublished changes"}
                      </span>
                    </p>
                  )
                ) : (
                  <p className="mt-1 text-foreground">
                    <span className="font-medium">{verificationActionLabel(entry)}</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{entry.candidateDomain}</span>
                    {" — "}
                    <span className="text-muted-foreground">{entry.reason}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
