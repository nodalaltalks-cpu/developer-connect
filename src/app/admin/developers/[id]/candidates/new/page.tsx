import { notFound } from "next/navigation";
import Link from "next/link";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { SectionHeading } from "@/components/admin/empty-state";
import { CandidateIntakeForm } from "@/components/admin/candidate-intake-form";

export default async function AdminNewCandidatePage({
  params,
}: PageProps<"/admin/developers/[id]/candidates/new">) {
  const { id } = await params;
  const repos = createPostgresRepositories();

  const developer = await repos.developers.getById(id);
  if (!developer) notFound();

  return (
    <div className="max-w-xl">
      <p className="mb-2 text-sm">
        <Link href={`/admin/developers/${developer.id}`} className="text-muted-foreground hover:underline">
          ← {developer.displayName}
        </Link>
      </p>
      <SectionHeading
        title={`Add a website candidate for ${developer.displayName}`}
        description="This submits a claim that a URL is this developer's official site. It does not verify anything — a candidate only becomes visible to the public after a founder explicitly approves it on the verification screen."
      />
      <CandidateIntakeForm developerId={developer.id} />
    </div>
  );
}
