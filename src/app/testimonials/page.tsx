import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdvisorTrigger } from "@/components/advisor/advisor";
import { TestimonialCard } from "@/components/published-testimonials";
import { createPostgresTestimonialRepository } from "@/lib/testimonials/postgres-repository";
import { getPublishedTestimonials } from "@/lib/testimonials/service";

export const metadata: Metadata = {
  title: "Client Feedback | Developer Connects",
  description: "What buyers in Mumbai and abroad have shared about researching property with Developer Connects.",
  alternates: { canonical: "/testimonials" },
};
export const dynamic = "force-dynamic";

/** Every published piece of client feedback. With none published the page does not exist (404), so there is never an empty shell. */
export default async function TestimonialsPage() {
  const items = await getPublishedTestimonials(createPostgresTestimonialRepository(), 100);
  if (items.length === 0) notFound();
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-14 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Client feedback</p>
            <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">What clients have shared</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/80">Feedback from buyers in Mumbai and abroad, in their own words.</p>
            <ul className="mt-10 grid gap-6 md:grid-cols-2">
              {items.map((t) => (
                <li key={t.id}>
                  <TestimonialCard t={t} />
                </li>
              ))}
            </ul>
            <div className="mt-14 text-center">
              <p className="font-serif text-2xl text-foreground">Have a property in mind?</p>
              <div className="mt-5 flex justify-center">
                <AdvisorTrigger tone="navy">Talk to an Advisor</AdvisorTrigger>
              </div>
            </div>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
