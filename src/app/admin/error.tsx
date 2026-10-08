"use client";

/**
 * Error boundary for this area. A failed read shows a plain message and a retry button - never the technical error
 * (the real one still reaches the server logs). Inside the area's layout, so the navigation stays usable.
 * No loading.tsx here on purpose: a loading boundary above dynamic routes made Next.js prefetch them and produced
 * duplicate staged/live DOM on these pages (see the note in (marketing)/error.tsx).
 */
export default function AreaError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-border p-6 text-center">
      <p className="text-base font-medium text-foreground">This page could not be loaded.</p>
      <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again. Nothing was lost.</p>
      <button type="button" onClick={() => reset()} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-6 text-base font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Try again
      </button>
    </div>
  );
}
