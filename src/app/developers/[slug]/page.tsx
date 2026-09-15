import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { VerifiedBadge } from "@/components/verified-badge";
import { OfficialWebsiteVerifiedBadge } from "@/components/official-website-verified-badge";
import { VisitOfficialWebsiteButton } from "@/components/visit-official-website-button";
import { ExternalDomainLink } from "@/components/external-domain-link";
import { DeveloperPageViewTracker } from "@/components/developer-page-view-tracker";
import { ShareDeveloper } from "@/components/share-developer";
import { ReportInaccurateInfo } from "@/components/report-inaccurate-info";
import { SiteFooter } from "@/components/site-footer";
import { LoginConversionPrompt } from "@/components/login-conversion-prompt";
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
    return { title: "Developer not found | Developer Connects" };
  }

  const title = `${developer.displayName} — Official Website | Developer Connects`;
  const description = developer.officialWebsite
    ? `Go directly to ${developer.displayName}'s verified official website — no brokers, no forms. Verified by Developer Connects.`
    : `${developer.displayName} on Developer Connects. Official website verification is in progress.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
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

  const { userId } = await auth();

  return (
    <div className="flex flex-1 flex-col">
      <DeveloperPageViewTracker developerId={developer.id} referrerQuery={referrerQuery} />

      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-20">
          <div className="mx-auto max-w-xl">
            {developer.officialWebsite && (
              <div className="mb-2">
                <VerifiedBadge />
              </div>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {developer.displayName}
            </h1>

            <p className="mt-2 text-muted-foreground">
              {developer.city}, {developer.state}
            </p>

            {developer.headquartersLocation && (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Head office
                </p>
                <p className="mt-0.5 text-sm text-foreground">{developer.headquartersLocation}</p>
              </div>
            )}

            {developer.officialWebsite && (
              <div className="mt-4">
                <OfficialWebsiteVerifiedBadge full />
              </div>
            )}

            {developer.officialWebsite ? (
              <div className="mt-6 rounded-lg border border-border bg-muted p-6">
                <p className="text-sm text-muted-foreground">You&apos;ll go to</p>
                <ExternalDomainLink
                  url={developer.officialWebsite.url}
                  domain={developer.officialWebsite.canonicalDomain}
                  className="mt-1 font-mono text-lg"
                />
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
                  Developer Connects hasn&apos;t confirmed {developer.displayName}&apos;s official
                  website yet. Check back soon.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ShareDeveloper developerId={developer.id} developerName={developer.displayName} />
              <ReportInaccurateInfo developerId={developer.id} developerName={developer.displayName} />
            </div>

            {developer.legalName !== developer.displayName && (
              <p className="mt-6 text-xs text-muted-foreground">
                Registered as {developer.legalName}
              </p>
            )}
          </div>
        </Container>
      </main>

      <SiteFooter />
      {!userId && <LoginConversionPrompt />}
    </div>
  );
}
