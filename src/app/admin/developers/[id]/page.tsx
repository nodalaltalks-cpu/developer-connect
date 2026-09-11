import Link from "next/link";
import { notFound } from "next/navigation";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
import { CandidateStatusBadge } from "@/components/admin/candidate-status-badge";
import { buttonClassName } from "@/components/ui/button";

export default async function AdminDeveloperDetailPage({
  params,
}: PageProps<"/admin/developers/[id]">) {
  const { id } = await params;
  const repos = createPostgresRepositories();

  const developer = await repos.developers.getById(id);
  if (!developer) notFound();

  const candidates = await repos.candidates.listByDeveloper(id);
  candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const verifiedCandidate = candidates.find((c) => c.verificationStatus === "VERIFIED") ?? null;
  const activeCandidate = verifiedCandidate ?? candidates[0] ?? null;
  // A decision has been made once the active candidate has left its
  // starting DISCOVERED state — VERIFIED and REJECTED both count as
  // "reviewed," they just differ in outcome.
  const reviewed =
    activeCandidate !== null &&
    activeCandidate.verificationStatus !== "DISCOVERED" &&
    activeCandidate.verificationStatus !== "PENDING_VERIFICATION";
  const published = verifiedCandidate !== null && developer.status === "ACTIVE";

  const steps = [
    { label: "Developer created", done: true },
    { label: "Website added", done: candidates.length > 0 },
    { label: "Founder review", done: reviewed },
    { label: "Published", done: published },
  ];

  const banner =
    candidates.length === 0
      ? { tone: "text-muted-foreground", label: "No official website yet — add one to begin review." }
      : published
        ? { tone: "text-accent-hover", label: "Published — visible in public search." }
        : activeCandidate?.verificationStatus === "REJECTED"
          ? {
              tone: "text-red-700",
              label: "Review required before publishing — the current website was rejected.",
            }
          : { tone: "text-accent-hover", label: "Everything is ready for your review." };

  return (
    <div>
      <SectionHeading
        title={developer.displayName}
        description={`${developer.legalName} · ${developer.city}, ${developer.state} · ${developer.status}`}
      />

      <ol className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                step.done
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-background text-muted-foreground"
              }`}
              aria-hidden="true"
            >
              {step.done ? "✓" : i + 1}
            </span>
            <span className={step.done ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
            {i < steps.length - 1 && <span className="mx-1 text-border">→</span>}
          </li>
        ))}
      </ol>

      <p className={`mb-6 text-sm font-medium ${banner.tone}`}>
        {banner.label}
        {activeCandidate && !published && (
          <>
            {" "}
            <Link href={`/admin/verification/${activeCandidate.id}`} className="underline hover:no-underline">
              Review now →
            </Link>
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
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
    </div>
  );
}
