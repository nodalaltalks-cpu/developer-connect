import { Container } from "@/components/ui/container";
import { SearchBox } from "@/components/search-box";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 items-start sm:items-center">
        <Container className="py-12 sm:py-20">
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

            <p className="mt-6 text-sm text-muted-foreground">
              Every developer shown here has had its official website manually
              verified by Developer Connect — starting in Mumbai.
            </p>
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
