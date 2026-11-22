import type { Community } from "../lib/communities.ts";
import { communityLabel } from "../lib/communities.ts";
import { agentQuestions, compareDetails } from "../lib/content.ts";
import { intentLabel } from "../lib/intents.ts";
import type { Kind, Purpose } from "../lib/portals.ts";

const bedroomText = (b: number | null) => (b === null ? "Any" : b === 0 ? "Studio" : `${b} bedroom${b === 1 ? "" : "s"}`);

/**
 * The basic details to read off every advertisement, shown with the search. It states no prices or statistics: it tells the buyer what
 * to compare and what to ask, so the same flat can be judged fairly across websites.
 */
export function SearchBasics({ community, purpose, kind, bedrooms }: { community: Community; purpose: Purpose; kind: Kind; bedrooms: number | null }) {
  const label = intentLabel({ purpose, kind, bedrooms: kind === "apartments" ? bedrooms : null });
  const rows = compareDetails({ purpose, kind, bedrooms });
  const questions = agentQuestions({ purpose });
  return (
    <section aria-label="Basic details for your search" className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-foreground">Basic details for your search</h3>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-neutral-500">Looking for</dt>
          <dd className="font-medium text-foreground">{label}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-neutral-500">Area</dt>
          <dd className="font-medium text-foreground">{communityLabel(community)}</dd>
        </div>
        {kind === "apartments" && (
          <div className="flex gap-2">
            <dt className="text-neutral-500">Bedrooms</dt>
            <dd className="font-medium text-foreground">{bedroomText(bedrooms)}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-neutral-500">Prices quoted</dt>
          <dd className="font-medium text-foreground">{purpose === "buy" ? "Total in AED" : "Per year in AED"}</dd>
        </div>
      </dl>
      {community.about && <p className="mt-3 text-sm leading-6 text-foreground/80">{community.about}</p>}

      <h4 className="mt-5 text-sm font-semibold text-foreground">Compare these details on every website</h4>
      <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
        {rows.map((r) => (
          <li key={r.label} className="py-2.5 text-sm sm:grid sm:grid-cols-[13rem_1fr] sm:gap-4">
            <span className="font-medium text-foreground">{r.label}</span>
            <span className="block text-foreground/75">{r.why}</span>
          </li>
        ))}
      </ul>

      <h4 className="mt-5 text-sm font-semibold text-foreground">Ask the agent</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-5 text-neutral-500">We show no prices or averages here: figures belong to each website and change daily. Read the numbers on the advertisement and confirm them with the advertiser.</p>
    </section>
  );
}
