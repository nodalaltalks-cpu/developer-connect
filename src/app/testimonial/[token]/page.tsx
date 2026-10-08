import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/logo";
import { TestimonialForm } from "@/components/testimonial-form";
import { createPostgresTestimonialRepository } from "@/lib/testimonials/postgres-repository";
import { lookupRequest } from "@/lib/testimonials/service";

/**
 * The private link a buyer receives. Never indexed, never cached, and the address (which carries the secret) is never sent on
 * to another site as a referrer. An unusable link says so in one neutral sentence and reveals nothing about why.
 */
export const metadata: Metadata = {
  title: "Share your experience | Developer Connects",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function TestimonialRequestPage({ params }: PageProps<"/testimonial/[token]">) {
  const { token } = await params;
  const request = await lookupRequest(createPostgresTestimonialRepository(), token);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <Container className="flex h-16 items-center">
          <Link href="/" className="inline-flex min-h-11 items-center">
            <Logo />
          </Link>
        </Container>
      </header>
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-xl">
            {request.open ? (
              <>
                <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">Share your experience</h1>
                <p className="mt-3 text-muted-foreground">A few honest words about working with Ambish at Developer Connects. It takes about two minutes.</p>
                <div className="mt-8">
                  <TestimonialForm token={token} defaultName={request.name} />
                </div>
              </>
            ) : (
              <div role="status">
                <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">This link is not available</h1>
                <p className="mt-3 text-muted-foreground">It may have expired or already been used.</p>
                <Link href="/" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
                  Go to Developer Connects →
                </Link>
              </div>
            )}
          </div>
        </Container>
      </main>
    </div>
  );
}
