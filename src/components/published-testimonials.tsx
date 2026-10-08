import { Container } from "@/components/ui/container";
import { createPostgresTestimonialRepository } from "@/lib/testimonials/postgres-repository";
import { getPublishedTestimonials } from "@/lib/testimonials/service";

/**
 * Client words, shown ONLY when real ones exist. With none published this renders nothing at all: no placeholder, no empty
 * heading, no "coming soon". What appears here has passed every gate in lib/testimonials: written by the person, permission to
 * publish given, approved and published by the Founder. It is deliberately not marked up as Review structured data.
 */
export async function PublishedTestimonials() {
  const items = await getPublishedTestimonials(createPostgresTestimonialRepository(), 3).catch(() => []);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="testimonials-heading" className="py-14 sm:py-20">
      <Container>
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Client feedback</p>
          <h2 id="testimonials-heading" className="mt-3 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            What clients have shared
          </h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {items.map((t) => (
              <li key={t.id}>
                <figure className="flex h-full flex-col rounded-2xl border border-border p-6">
                  {/* A paraphrase is never put inside quotation marks; only a client's unaltered words are. */}
                  {t.paraphrased ? (
                    <p className="flex-1 text-base leading-7 text-foreground/90">{t.text}</p>
                  ) : (
                    <blockquote className="flex-1 text-base leading-7 text-foreground/90">&ldquo;{t.text}&rdquo;</blockquote>
                  )}
                  <figcaption className="mt-5 text-sm">
                    <span className="font-semibold text-foreground">{t.name}</span>
                    {t.attribution && <span className="block text-muted-foreground">{t.attribution}</span>}
                    {t.place && <span className="block text-muted-foreground">{t.place}</span>}
                    {t.paraphrased && <span className="mt-1 block text-xs text-muted-foreground">Summarised from the client&apos;s feedback.</span>}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
