import { Container } from "@/components/ui/container";

export default function DeveloperPageLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border">
        <Container className="flex h-16 items-center">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        </Container>
      </div>

      <main className="flex-1">
        <Container className="py-12 sm:py-20">
          <div className="mx-auto max-w-xl space-y-4" aria-hidden="true">
            <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
            <div className="h-9 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-40 animate-pulse rounded-lg bg-muted" />
          </div>
        </Container>
      </main>
    </div>
  );
}
