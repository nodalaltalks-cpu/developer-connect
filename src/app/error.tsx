"use client";

import { Container } from "@/components/ui/container";
import { buttonClassName } from "@/components/ui/button";

/**
 * Root error boundary. Catches a failed homepage data fetch (e.g. the
 * verified-developer directory query) without ever surfacing the
 * underlying technical error to a visitor — the real error is still
 * available to Next.js's own server-side logging via the `error` prop,
 * just never rendered here.
 */
export default function HomeError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Container className="py-20 text-center">
        <div className="mx-auto max-w-md">
          <p className="text-lg font-medium text-foreground">
            We couldn&apos;t load the developer directory.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Please try again.</p>
          <button onClick={() => reset()} className={buttonClassName("primary", "mt-6")}>
            Try again
          </button>
        </div>
      </Container>
    </div>
  );
}
