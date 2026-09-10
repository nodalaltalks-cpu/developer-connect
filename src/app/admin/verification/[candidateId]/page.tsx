import Link from "next/link";
import { notFound } from "next/navigation";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { SectionHeading } from "@/components/admin/empty-state";
import { CandidateStatusBadge } from "@/components/admin/candidate-status-badge";
import { VerificationActionForm } from "@/components/admin/verification-action-form";
import { EvidenceIntakeForm } from "@/components/admin/evidence-intake-form";
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

  const [developer, evidenceList, history, siblingCandidates] = await Promise.all([
    repos.developers.getById(candidate.developerId),
    repos.evidence.listByCandidate(candidateId),
    repos.events.listByCandidate(candidateId),
    repos.candidates.listByDeveloper(candidate.developerId),
  ]);

  const otherCandidates = siblingCandidates
    .filter((c) => c.id !== candidate.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="max-w-3xl">
      <SectionHeading
        title={developer?.displayName ?? "Unknown developer"}
        description={`${candidate.canonicalDomain} · discovered via ${candidate.discoverySource}`}
      />

      {developer && (
        <div className="mb-4 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Developer</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Display name</dt>
              <dd className="text-right text-foreground">{developer.displayName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Legal name</dt>
              <dd className="text-right text-foreground">{developer.legalName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Geography</dt>
              <dd className="text-right text-foreground">
                {developer.city}, {developer.state}
                {developer.headquartersLocation ? ` · ${developer.headquartersLocation}` : ""}
              </dd>
            </div>
          </dl>
          <Link
            href={`/admin/developers/${developer.id}`}
            className="mt-2 inline-block text-sm text-accent-hover hover:underline"
          >
            View full developer record →
          </Link>
        </div>
      )}

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
              <dd className="text-foreground">
                <CandidateStatusBadge status={candidate.verificationStatus} />
              </dd>
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
            {candidate.reviewedBy && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Reviewed by</dt>
                <dd className="text-right text-foreground">{candidate.reviewedBy}</dd>
              </div>
            )}
            {candidate.reviewedAt && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Reviewed at</dt>
                <dd className="text-right text-foreground">{candidate.reviewedAt.toLocaleString()}</dd>
              </div>
            )}
            {candidate.rejectionReason && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Rejection reason</dt>
                <dd className="text-right text-foreground">{candidate.rejectionReason}</dd>
              </div>
            )}
          </dl>
        </div>

        <details className="rounded-lg border border-border p-4" open>
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Evidence ({evidenceList.length})
          </summary>
          {evidenceList.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No evidence recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {evidenceList.map((item) => (
                <li key={item.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <p className="font-medium text-foreground">{item.evidenceType.replace(/_/g, " ")}</p>
                  <p className="text-muted-foreground">{item.detail}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-hover hover:underline"
                      >
                        Source ↗
                      </a>
                    ) : (
                      <span />
                    )}
                    <span>{item.capturedAt.toLocaleDateString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <EvidenceIntakeForm candidateId={candidate.id} />
          </div>
        </details>
      </div>

      {otherCandidates.length > 0 && (
        <details className="mt-4 rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Other candidates for this developer ({otherCandidates.length})
          </summary>
          <ul className="mt-2 space-y-2 text-sm">
            {otherCandidates.map((c) => (
              <li key={c.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                <Link href={`/admin/verification/${c.id}`} className="font-medium text-accent-hover hover:underline">
                  {c.canonicalDomain}
                </Link>
                <p className="text-muted-foreground">
                  {c.verificationStatus} · {c.discoverySource}
                  {c.reviewedAt ? ` · reviewed ${c.reviewedAt.toLocaleDateString()}` : ""}
                  {c.rejectionReason ? ` · ${c.rejectionReason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

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
