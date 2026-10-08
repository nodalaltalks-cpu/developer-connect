import Link from "next/link";
import { Container } from "@/components/ui/container";
import type { PublicTestimonial } from "@/lib/testimonials/model";
import { createPostgresTestimonialRepository } from "@/lib/testimonials/postgres-repository";
import { getPublishedTestimonials } from "@/lib/testimonials/service";

/**
 * Client feedback, shown ONLY when real, approved feedback exists. With none published this renders nothing at all: no placeholder, no
 * empty heading, no "coming soon". What appears has passed every gate in lib/testimonials: the client's own feedback, permission to
 * publish, approved and published by the Founder. It is deliberately not marked up as Review structured data, and a paraphrase is never
 * placed in quotation marks.
 */

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export function TestimonialCard({ t }: { t: PublicTestimonial }) {
  return (
    <figure className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-background p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgba(16,24,40,0.18)]">
      <span aria-hidden="true" className="absolute inset-x-7 top-0 h-0.5 bg-gold" />
      <svg aria-hidden="true" viewBox="0 0 32 24" className="h-6 w-8 text-gold/70" fill="currentColor">
        <path d="M0 24V14.4C0 6.2 4.4 1.2 11.6 0l1.2 3.6C8.8 5 6.8 7.6 6.4 11.2H12V24H0Zm19.2 0V14.4C19.2 6.2 23.6 1.2 30.8 0L32 3.6c-4 1.4-6 4-6.4 7.6H31.2V24H19.2Z" />
      </svg>
      {/* A paraphrase is never put inside quotation marks; only a client's unaltered words are. */}
      {t.paraphrased ? (
        <p className="mt-4 flex-1 font-serif text-lg leading-8 text-foreground">{t.text}</p>
      ) : (
        <blockquote className="mt-4 flex-1 font-serif text-lg leading-8 text-foreground">&ldquo;{t.text}&rdquo;</blockquote>
      )}
      <figcaption className="mt-7 flex items-center gap-3 border-t border-border pt-5">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold tracking-wide text-accent-foreground">
          {initials(t.name)}
        </span>
        <span className="min-w-0 flex-1 text-sm leading-5">
          <span className="block truncate font-semibold text-foreground">{t.name}</span>
          <span className="block truncate text-muted-foreground">{[t.place, t.attribution && t.attribution !== "NRI" ? t.attribution : null].filter(Boolean).join(" · ")}</span>
        </span>
        {t.attribution === "NRI" && <span className="shrink-0 rounded-full border border-gold/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">NRI</span>}
      </figcaption>
      {t.paraphrased && <p className="mt-3 text-xs text-muted-foreground">Summarised from the client&apos;s feedback.</p>}
    </figure>
  );
}

const HOME_COUNT = 6;

export async function PublishedTestimonials() {
  const items = await getPublishedTestimonials(createPostgresTestimonialRepository(), 40).catch(() => []);
  if (items.length === 0) return null;
  const shown = items.slice(0, HOME_COUNT);
  return (
    <section aria-labelledby="testimonials-heading" className="border-y border-border bg-muted/50 py-16 sm:py-24">
      <Container>
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Client feedback</p>
              <h2 id="testimonials-heading" className="mt-3 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                What clients have shared
              </h2>
            </div>
            {items.length > shown.length && (
              <Link href="/testimonials" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover hover:underline">
                Read all client feedback →
              </Link>
            )}
          </div>
          {/* Phones: swipe through full-width cards. From md up: a three-column grid. */}
          <ul className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0" aria-label="Client feedback">
            {shown.map((t) => (
              <li key={t.id} className="w-[85%] shrink-0 snap-center sm:w-[60%] md:w-auto md:shrink">
                <TestimonialCard t={t} />
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
