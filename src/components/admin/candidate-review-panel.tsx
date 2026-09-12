"use client";

import { useState } from "react";
import Link from "next/link";
import { CandidateStatusBadge } from "@/components/admin/candidate-status-badge";
import { VerificationActionForm } from "@/components/admin/verification-action-form";
import { ApprovePublishForm } from "@/components/admin/approve-publish-form";
import { DeveloperEditForm } from "@/components/admin/developer-edit-form";
import { EvidenceIntakeForm } from "@/components/admin/evidence-intake-form";
import {
  rejectCandidateAction,
  requestMoreEvidenceAction,
  markNeedsReverificationAction,
  deactivateCandidateAction,
} from "@/app/admin/_actions/verification-actions";
import type { CandidateReviewData } from "@/app/admin/_actions/verification-actions";
import type { Developer, WebsiteCandidate } from "@/lib/developer-connect/types";

/**
 * The complete founder review workspace for one website candidate —
 * developer details + edit, official website info, the Approve &
 * Publish decision, secondary actions, verification history, sibling
 * candidates, and evidence. This is the SAME content that used to live
 * only on /admin/verification/[candidateId] — extracted here so both
 * that page and the inline accordion on /admin/verification render it
 * identically, from the same repositories/services, with no duplicated
 * business logic.
 *
 * Every save/approve/reject/etc. here updates local state directly from
 * the Server Action's own return value instead of calling
 * `router.refresh()` — that is what lets this panel live inside an
 * accordion row without collapsing itself, losing scroll position, or
 * forcing the whole queue to re-render. See developer-edit-form.tsx's
 * `onSaved` doc comment for the same reasoning applied there.
 */
export function CandidateReviewPanel({
  initialData,
  onCandidateUpdated,
  onDeveloperUpdated,
  hideQueueLink,
}: {
  initialData: CandidateReviewData;
  /**
   * Called after ANY successful status-changing action — approve,
   * reject, request more evidence, mark for re-verification, or
   * deactivate — with the freshly-updated candidate. An ancestor (the
   * accordion list) uses this to decide whether the row should leave the
   * pending queue: approve, reject, and deactivate all move a candidate
   * out of the statuses the queue lists; "mark for re-verification"
   * deliberately does not, since NEEDS_REVERIFICATION is itself one of
   * those statuses.
   */
  onCandidateUpdated?: (candidate: WebsiteCandidate) => void;
  /** Called after a successful developer field save — lets an ancestor (the accordion row) keep its own collapsed summary (developer name) in sync without a page reload. */
  onDeveloperUpdated?: (developer: Developer) => void;
  /** Suppresses ApprovePublishForm's "Back to verification queue" link — pass true when this panel already lives inline inside that queue. */
  hideQueueLink?: boolean;
}) {
  const [candidate, setCandidate] = useState(initialData.candidate);
  const [developer, setDeveloper] = useState<Developer | null>(initialData.developer);

  function handleCandidateUpdate(updated: WebsiteCandidate) {
    setCandidate(updated);
    onCandidateUpdated?.(updated);
  }

  function handleDeveloperUpdate(updated: Developer) {
    setDeveloper(updated);
    onDeveloperUpdated?.(updated);
  }

  const readiness =
    candidate.verificationStatus === "VERIFIED"
      ? { tone: "text-accent-hover", label: "Published. This is the live official website." }
      : candidate.verificationStatus === "REJECTED"
        ? {
            tone: "text-red-700",
            label: 'Rejected. Use "Request more evidence" below to reopen it if you want to reconsider.',
          }
        : candidate.verificationStatus === "INACTIVE"
          ? { tone: "text-muted-foreground", label: "Deactivated. This candidate is no longer active." }
          : { tone: "text-accent-hover", label: "Review required before publishing." };

  return (
    <div>
      <p className={`mb-4 text-sm font-medium ${readiness.tone}`}>{readiness.label}</p>

      {developer && (
        <div className="mb-4">
          <DeveloperEditForm developer={developer} onSaved={handleDeveloperUpdate} />
        </div>
      )}

      <div className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Official website</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">URL</dt>
            <dd className="break-all text-right text-foreground">{candidate.url}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Discovery source</dt>
            <dd className="text-right text-foreground">{candidate.discoverySource}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Confidence score</dt>
            <dd className="text-right text-foreground">{candidate.confidenceScore}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-foreground">
              <CandidateStatusBadge status={candidate.verificationStatus} />
            </dd>
          </div>
          {candidate.verificationStatus === "DISCOVERED" && (
            <p className="text-right text-xs text-muted-foreground">Discovered — review required</p>
          )}
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

      <h2 className="mt-6 text-sm font-semibold text-foreground">Decision</h2>
      <div className="mt-2">
        <ApprovePublishForm candidateId={candidate.id} hideQueueLink={hideQueueLink} onApproved={handleCandidateUpdate} />
      </div>

      <details className="mt-4 rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          More actions (reject, request more evidence, re-verification, deactivate)
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <VerificationActionForm
            label="Reject"
            variant="secondary"
            action={rejectCandidateAction}
            candidateId={candidate.id}
            reasonPlaceholder="Why isn't this official?"
            onDone={handleCandidateUpdate}
          />
          <VerificationActionForm
            label="Request more evidence"
            variant="secondary"
            action={requestMoreEvidenceAction}
            candidateId={candidate.id}
            reasonPlaceholder="What's missing?"
            onDone={handleCandidateUpdate}
          />
          <VerificationActionForm
            label="Mark for re-verification"
            variant="secondary"
            action={markNeedsReverificationAction}
            candidateId={candidate.id}
            reasonPlaceholder="Why does this need another look?"
            onDone={handleCandidateUpdate}
          />
          <VerificationActionForm
            label="Deactivate"
            variant="secondary"
            action={deactivateCandidateAction}
            candidateId={candidate.id}
            reasonPlaceholder="Why deactivate this candidate?"
            onDone={handleCandidateUpdate}
          />
        </div>
      </details>

      <details className="mt-4 rounded-lg border border-border p-4" open>
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Verification history ({initialData.history.length})
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {initialData.history.map((event) => (
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

      {initialData.otherCandidates.length > 0 && (
        <details className="mt-4 rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Other candidates for this developer ({initialData.otherCandidates.length})
          </summary>
          <ul className="mt-2 space-y-2 text-sm">
            {initialData.otherCandidates.map((c) => (
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

      <EvidenceSection candidateId={candidate.id} initialEvidenceList={initialData.evidenceList} onCandidateUpdate={setCandidate} />
    </div>
  );
}

function EvidenceSection({
  candidateId,
  initialEvidenceList,
  onCandidateUpdate,
}: {
  candidateId: string;
  initialEvidenceList: CandidateReviewData["evidenceList"];
  onCandidateUpdate: (candidate: WebsiteCandidate) => void;
}) {
  const [evidenceList, setEvidenceList] = useState(initialEvidenceList);

  return (
    <details className="mt-4 rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Evidence ({evidenceList.length}){" "}
        <span className="font-normal text-muted-foreground">— optional, never required to publish</span>
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
        <EvidenceIntakeForm
          candidateId={candidateId}
          onAdded={(added, candidate) => {
            setEvidenceList((prev) => [...prev, ...added]);
            if (candidate) onCandidateUpdate(candidate);
          }}
        />
      </div>
    </details>
  );
}
