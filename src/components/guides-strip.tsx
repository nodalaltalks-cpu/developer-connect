import Link from "next/link";
import { Container } from "@/components/ui/container";
import { getGuide, guidePath, GUIDES_PATH } from "@/lib/seo/guides";

/** "Read before you buy": the guides buyers search for, linked from the home page so they are one click from the front door. */
const FEATURED = [
  "how-to-buy-a-flat-in-mumbai",
  "buying-property-in-dubai-from-india",
  "hidden-costs-of-buying-property-in-mumbai",
  "check-a-project-on-maharera",
  "how-to-choose-a-property-consultant",
  "dubai-off-plan-property-guide",
] as const;

export function GuidesStrip() {
  const guides = FEATURED.map((slug) => getGuide(slug)).filter((g) => g !== undefined);
  return (
    <section aria-labelledby="guides-heading" className="defer-section border-t border-border">
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Read before you buy</p>
          <h2 id="guides-heading" className="mt-3 max-w-2xl text-balance font-serif text-[clamp(1.875rem,1.4rem+2.2vw,3rem)] font-medium leading-[1.1] tracking-[-0.015em] text-foreground">
            The questions every buyer asks, answered plainly.
          </h2>
          <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((guide) => (
              <li key={guide.slug} className="border-t border-gold pt-4">
                <Link href={guidePath(guide)} className="block">
                  <span className="font-serif text-xl font-medium text-foreground hover:text-accent-hover">{guide.title}</span>
                  <span className="mt-2 block text-sm leading-6 text-foreground/75">{guide.summary.split(". ")[0]}.</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={GUIDES_PATH} className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover underline-offset-4 hover:underline">
            All buying guides →
          </Link>
        </div>
      </Container>
    </section>
  );
}
