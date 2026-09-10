import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 items-center">
        <Container className="py-20">
          <div className="mx-auto max-w-md text-center">
            <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
            <p className="mt-2 text-muted-foreground">
              That page doesn&apos;t exist.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              ← Back to search
            </Link>
          </div>
        </Container>
      </main>
    </div>
  );
}
