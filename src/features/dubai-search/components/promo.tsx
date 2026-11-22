import Link from "next/link";
import { dubaiSearchEnabled, DUBAI_SEARCH_PATH } from "../flag.ts";
import { TrackedLink } from "./tracked-link.tsx";

/** The one homepage section for the experiment. Renders nothing unless the feature flag is on. */
export function DubaiSearchPromo({ force = false }: { force?: boolean }) {
  if (!force && !dubaiSearchEnabled()) return null;
  return (
    <section aria-labelledby="dubai-search-promo" className="border-t border-border bg-white">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
              New <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] tracking-wide text-white">EXPERIMENT</span>
            </p>
            <h2 id="dubai-search-promo" className="mt-3 text-balance font-serif text-2xl font-medium leading-tight text-foreground sm:text-3xl">
              Searching for property in Dubai?
            </h2>
            <p className="mt-3 text-base leading-7 text-foreground/75">Discover and compare property advertisements across multiple real estate platforms, all from one search.</p>
          </div>
          <TrackedLink
            href={DUBAI_SEARCH_PATH}
            event="home_section_click"
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-lg bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-700 sm:w-auto"
          >
            Search Dubai Properties →
          </TrackedLink>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Free for everyone. Early version with demonstration data. <Link href={DUBAI_SEARCH_PATH} className="underline">Try it</Link>.
        </p>
      </div>
    </section>
  );
}
