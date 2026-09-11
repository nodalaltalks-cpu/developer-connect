import { Container } from "@/components/ui/container";
import { SearchBox } from "@/components/search-box";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DeveloperCard } from "@/components/developer-card";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { listVerifiedDevelopers } from "@/lib/developer-connect/search-service";

export default async function Home() {
  const repos = createPostgresRepositories();
  const developers = await listVerifiedDevelopers(repos);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Find the developer. Go directly to the source.
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Verified developer websites. Skip the broker search.
            </p>

            <div className="mt-8">
              <SearchBox />
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-5xl sm:mt-16">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Verified developers
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every developer listed here has an official website verified by Developer
              Connect.
            </p>

            {developers.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
                <p className="font-medium text-foreground">No verified developers yet.</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Developer Connect is starting in Mumbai and adding verified developers over
                  time.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {developers.map((developer) => (
                  <DeveloperCard key={developer.id} developer={developer} />
                ))}
              </div>
            )}
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
