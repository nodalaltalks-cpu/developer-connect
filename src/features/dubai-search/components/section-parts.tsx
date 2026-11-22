import Link from "next/link";
import { COMMUNITIES, communityLabel, type Community } from "../lib/communities.ts";
import { type FaqItem } from "../lib/content.ts";
import { intentsFor, intentLabel, pagePath } from "../lib/intents.ts";

export const SECTION_PATH = "/dubai-property-search";
export const COMPARE_PATH = "/dubai-property-search/compare";

export function Faq({ items, heading = "Common questions" }: { items: readonly FaqItem[]; heading?: string }) {
  return (
    <section aria-labelledby="dps-faq" className="mt-14">
      <h2 id="dps-faq" className="font-serif text-2xl font-medium text-foreground sm:text-3xl">
        {heading}
      </h2>
      <dl className="mt-5 divide-y divide-border border-y border-border">
        {items.map((f) => (
          <div key={f.question} className="py-5">
            <dt className="text-base font-semibold text-foreground">{f.question}</dt>
            <dd className="mt-2 text-sm leading-7 text-foreground/80">{f.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CommunityGrid({ heading = "Search by area", exclude, all = false }: { heading?: string; exclude?: string; all?: boolean }) {
  const sorted = [...COMMUNITIES].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section aria-labelledby="dps-areas" className="mt-14">
      <h2 id="dps-areas" className="font-serif text-2xl font-medium text-foreground sm:text-3xl">
        {heading}
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMMUNITIES.filter((c) => c.popular && c.id !== exclude).map((c) => (
          <li key={c.id}>
            <Link href={pagePath(c.id)} className="flex min-h-14 flex-col justify-center rounded-xl border border-border bg-white px-4 py-3 hover:border-accent">
              <span className="text-sm font-semibold text-foreground">{communityLabel(c)}</span>
              <span className="text-xs text-foreground/70">Buy or rent, compared across portals</span>
            </Link>
          </li>
        ))}
      </ul>
      {all && (
        <>
          <h3 className="mt-10 text-sm font-semibold uppercase tracking-[0.18em] text-brass-700">All Dubai areas, A to Z</h3>
          <ul className="mt-3 columns-2 gap-6 sm:columns-3 lg:columns-4">
            {sorted.map((c) => (
              <li key={c.id} className="break-inside-avoid">
                <Link href={pagePath(c.id)} className="inline-flex min-h-11 items-center text-sm text-accent-hover underline-offset-4 hover:underline">
                  {communityLabel(c)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function IntentLinks({ community, current }: { community: Community; current?: string }) {
  const all = intentsFor(community);
  return (
    <section aria-labelledby="dps-intents" className="mt-14">
      <h2 id="dps-intents" className="font-serif text-2xl font-medium text-foreground sm:text-3xl">
        More searches in {community.name}
      </h2>
      <div className="mt-5 grid gap-8 sm:grid-cols-2">
        {(["buy", "rent"] as const).map((purpose) => (
          <div key={purpose}>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-brass-700">{purpose === "buy" ? "To buy" : "To rent"}</h3>
            <ul className="mt-3 space-y-1">
              {all
                .filter((i) => i.purpose === purpose)
                .map((i) => (
                  <li key={i.slug}>
                    {i.slug === current ? (
                      <span className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground">{intentLabel(i)}</span>
                    ) : (
                      <Link href={pagePath(community.id, i.slug)} className="inline-flex min-h-11 items-center text-sm text-accent-hover underline-offset-4 hover:underline">
                        {intentLabel(i)}
                      </Link>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CompareCta() {
  return (
    <section aria-labelledby="dps-compare" className="mt-14 rounded-2xl border border-border bg-white p-6 sm:p-8">
      <h2 id="dps-compare" className="font-serif text-2xl font-medium text-foreground">
        Found the same flat on more than one website?
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-foreground/80">
        Add the listings you found and we will tell you whether they look like the same property, show the price gap side by side, and remind you what to confirm before you call anyone. Your list stays in your browser.
      </p>
      <Link href={COMPARE_PATH} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-lg bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-700">
        Compare listings →
      </Link>
    </section>
  );
}

export function GuideLinks() {
  return (
    <section aria-labelledby="dps-guides" className="mt-14">
      <h2 id="dps-guides" className="font-serif text-2xl font-medium text-foreground sm:text-3xl">
        Before you buy or rent
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        <li>
          <Link href="/guides/buying-property-in-dubai-from-india" className="block rounded-xl border border-border bg-white p-4 hover:border-accent">
            <span className="text-sm font-semibold text-foreground">Buying property in Dubai from India</span>
            <span className="mt-1 block text-xs text-foreground/70">Steps, costs and checks, in order.</span>
          </Link>
        </li>
        <li>
          <Link href="/guides/dubai-off-plan-property-guide" className="block rounded-xl border border-border bg-white p-4 hover:border-accent">
            <span className="text-sm font-semibold text-foreground">Dubai off-plan property guide</span>
            <span className="mt-1 block text-xs text-foreground/70">What to check before paying for a home that is not built yet.</span>
          </Link>
        </li>
        <li>
          <Link href="/ask" className="block rounded-xl border border-border bg-white p-4 hover:border-accent">
            <span className="text-sm font-semibold text-foreground">Ask Developer Connects</span>
            <span className="mt-1 block text-xs text-foreground/70">Property questions answered from our guides, with sources.</span>
          </Link>
        </li>
        <li>
          <Link href="/tools/home-loan-emi-calculator" className="block rounded-xl border border-border bg-white p-4 hover:border-accent">
            <span className="text-sm font-semibold text-foreground">Home loan EMI calculator</span>
            <span className="mt-1 block text-xs text-foreground/70">Monthly instalment in rupees or dirhams.</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
