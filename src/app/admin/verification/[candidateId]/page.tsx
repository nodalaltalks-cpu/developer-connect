import { notFound } from "next/navigation";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { SectionHeading } from "@/components/admin/empty-state";
import { CandidateReviewPanel } from "@/components/admin/candidate-review-panel";

/**
 * The founder's single decision screen: developer + proposed official
 * website first, one obvious final action (Approve & Publish) at the
 * end, and the full verification history below it. The actual review
 * content is CandidateReviewPanel — the same component the inline
 * accordion on /admin/verification renders — so this route and the
 * queue's expandable rows never drift apart. This page remains a valid,
 * working direct/deep link; it's just no longer the only way to review.
 */
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

      <CandidateReviewPanel initialData={{ candidate, developer, evidenceList, history, otherCandidates }} />
    </div>
  );
}
