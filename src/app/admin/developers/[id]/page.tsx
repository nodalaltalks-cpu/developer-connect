import Link from "next/link";
import { notFound } from "next/navigation";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { SectionHeading, EmptyState } from "@/components/admin/empty-state";
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

  return (
    <div>
      <SectionHeading
        title={developer.displayName}
        description={`${developer.legalName} · ${developer.city}, ${developer.state} · ${developer.status}`}
      />

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
                <span className="text-sm text-muted-foreground">{candidate.verificationStatus}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
