import { notFound } from "next/navigation";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { SectionHeading } from "@/components/admin/empty-state";
import { VerificationActionForm } from "@/components/admin/verification-action-form";
import {
  approveCandidateAction,
  rejectCandidateAction,
  requestMoreEvidenceAction,
  markNeedsReverificationAction,
  deactivateCandidateAction,
} from "@/app/admin/_actions/verification-actions";

export default async function AdminVerificationDetailPage({
  params,
}: PageProps<"/admin/verification/[candidateId]">) {
  const { candidateId } = await params;
  const repos = createPostgresRepositories();

  const candidate = await repos.candidates.getById(candidateId);
  if (!candidate) notFound();

  const [developer, evidenceList, history] = await Promise.all([
    repos.developers.getById(candidate.developerId),
    repos.evidence.listByCandidate(candidateId),
    repos.events.listByCandidate(candidateId),
  ]);

  return (
    <div className="max-w-3xl">
      <SectionHeading
        title={developer?.displayName ?? "Unknown developer"}
        description={`${candidate.canonicalDomain} · discovered via ${candidate.discoverySource}`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Candidate</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">URL</dt>
              <dd className="break-all text-right text-foreground">{candidate.url}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-foreground">{candidate.verificationStatus}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Confidence (triage only)</dt>
              <dd className="text-foreground">{candidate.confidenceScore}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Last checked</dt>
              <dd className="text-foreground">
                {candidate.lastCheckedAt ? candidate.lastCheckedAt.toLocaleDateString() : "Never"}
              </dd>
            </div>
            {candidate.rejectionReason && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Rejection reason</dt>
                <dd className="text-right text-foreground">{candidate.rejectionReason}</dd>
              </div>
            )}
          </dl>
        </div>

        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Evidence ({evidenceList.length})
          </summary>
          {evidenceList.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No evidence recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {evidenceList.map((item) => (
                <li key={item.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <p className="font-medium text-foreground">{item.evidenceType}</p>
                  <p className="text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>

      <details className="mt-4 rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Verification history ({history.length})
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {history.map((event) => (
            <li key={event.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
              <p className="text-foreground">
                {event.previousStatus ?? "—"} → <span className="font-medium">{event.newStatus}</span>
              </p>
              <p className="text-muted-foreground">
                {event.reason} · {event.actorType} · {event.createdAt.toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </details>

      <h2 className="mt-6 text-sm font-semibold text-foreground">Decision</h2>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <VerificationActionForm
          label="Approve"
          variant="primary"
          action={approveCandidateAction}
          candidateId={candidate.id}
          reasonPlaceholder="Why is this the official site?"
        />
        <VerificationActionForm
          label="Reject"
          variant="secondary"
          action={rejectCandidateAction}
          candidateId={candidate.id}
          reasonPlaceholder="Why isn't this official?"
        />
        <VerificationActionForm
          label="Request more evidence"
          variant="secondary"
          action={requestMoreEvidenceAction}
          candidateId={candidate.id}
          reasonPlaceholder="What's missing?"
        />
        <VerificationActionForm
          label="Mark for re-verification"
          variant="secondary"
          action={markNeedsReverificationAction}
          candidateId={candidate.id}
          reasonPlaceholder="Why does this need another look?"
        />
        <VerificationActionForm
          label="Deactivate"
          variant="secondary"
          action={deactivateCandidateAction}
          candidateId={candidate.id}
          reasonPlaceholder="Why deactivate this candidate?"
        />
      </div>
    </div>
  );
}
