import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { VerifiedBadge } from "@/components/verified-badge";
import { VisitOfficialWebsiteButton } from "@/components/visit-official-website-button";
import { DeveloperPageViewTracker } from "@/components/developer-page-view-tracker";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { getPublicDeveloperBySlug } from "@/lib/developer-connect/search-service";

async function loadDeveloper(slug: string) {
  const repos = createPostgresRepositories();
  return getPublicDeveloperBySlug(repos, slug);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export async function generateMetadata({
  params,
}: PageProps<"/developers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const developer = await loadDeveloper(slug);

  if (!developer) {
    return { title: "Developer not found | Developer Connect" };
  }

  const title = `${developer.displayName} — Official Website | Developer Connect`;
  const description = developer.officialWebsite
    ? `Go directly to ${developer.displayName}'s verified official website — no brokers, no forms. Verified by Developer Connect.`
    : `${developer.displayName} on Developer Connect. Official website verification is in progress.`;

  return {
    title,
    description,
    alternates: { canonical: `/developers/${developer.slug}` },
  };
}

export default async function DeveloperPage({
  params,
  searchParams,
}: PageProps<"/developers/[slug]">) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const referrerQuery =
    typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : undefined;

  const developer = await loadDeveloper(slug);
  if (!developer) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col">
      <DeveloperPageViewTracker developerId={developer.id} referrerQuery={referrerQuery} />

      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-20">
          <div className="mx-auto max-w-xl">
            {developer.officialWebsite && <VerifiedBadge full />}

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {developer.displayName}
            </h1>

            <p className="mt-2 text-muted-foreground">
              {developer.city}, {developer.state}
              {developer.headquartersLocation ? ` · ${developer.headquartersLocation}` : ""}
            </p>

            {developer.officialWebsite ? (
              <div className="mt-8 rounded-lg border border-border bg-muted p-6">
                <p className="text-sm text-muted-foreground">You&apos;ll go to</p>
                <p className="mt-1 break-all font-mono text-lg text-foreground">
                  {developer.officialWebsite.canonicalDomain}
                </p>
                <div className="mt-5">
                  <VisitOfficialWebsiteButton
                    developerId={developer.id}
                    url={developer.officialWebsite.url}
                    domain={developer.officialWebsite.canonicalDomain}
                  />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Verified {formatDate(developer.officialWebsite.verifiedAt)}
                </p>
              </div>
            ) : (
              <div className="mt-8 rounded-lg border border-border bg-muted p-6">
                <p className="font-medium text-foreground">Official website not yet verified.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Developer Connect hasn&apos;t confirmed {developer.displayName}&apos;s official
                  website yet. Check back soon.
                </p>
              </div>
            )}
          </div>
        </Container>
      </main>

      <footer className="border-t border-border">
        <Container className="flex h-14 items-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Developer Connect
        </Container>
      </footer>
    </div>
  );
}
