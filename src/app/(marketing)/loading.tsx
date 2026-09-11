import { Container } from "@/components/ui/container";

/**
 * Scoped to the (marketing) route group — deliberately NOT at the app
 * root. A root-level loading.js becomes the nearest loading boundary for
 * every route without one of its own, and per Next.js's prefetch rules a
 * dynamic route is normally skipped for full-route <Link> prefetching
 * unless it has such a boundary. Previously this file lived at
 * src/app/loading.tsx, which made every dynamic /admin/* route eligible
 * for full prefetching via the admin sidebar's own links — the actual
 * root cause of a real bug where /admin/developers/new and
 * /admin/developers each rendered two copies of their content (a
 * prefetched/staged copy plus the live one). Keep this boundary scoped to
 * the homepage only; do not move it back to the app root.
 */
export default function HomeLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border">
        <Container className="flex h-16 items-center">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        </Container>
      </div>

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl space-y-4" aria-hidden="true">
            <div className="h-9 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-14 animate-pulse rounded-lg bg-muted" />
          </div>

          <div className="mx-auto mt-12 max-w-5xl sm:mt-16">
            <span className="sr-only">Loading verified developers…</span>
            <div aria-hidden="true" className="h-7 w-48 animate-pulse rounded bg-muted" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-56 animate-pulse rounded-lg border border-border bg-muted" />
              ))}
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
}
