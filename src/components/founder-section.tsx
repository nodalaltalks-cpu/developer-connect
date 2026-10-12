"use client";

import { useEffect, useState } from "react";
import { useHeroMarket } from "@/components/hero-market";
import { useCountUp } from "@/components/stat-counter";
import { FOUNDER, FOUNDER_STORIES, pickFounderStory, type FounderStat, type FounderStory } from "@/lib/founder";

/**
 * The founder, built for credibility: the headline numbers large and rolling up, then the supporting facts and qualification.
 * Only what lib/founder.ts contains is shown; a claim that has not been supplied by the founder is simply absent. There is no portrait because none has been supplied (a monogram is not a photo,
 * and we do not use stock images of a real person).
 *
 * The short story rotates between APPROVED entries by visit number (kept in the visitor's own browser). It is never rewritten.
 */

const VISIT_KEY = "dc_visit_count";

/** One headline number: bold, rolling up once when it scrolls into view, landing on exactly the stated value. */
function FounderStatTile({ stat }: { stat: FounderStat }) {
  const { ref, display } = useCountUp(stat.value);
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className="rounded-2xl border border-border bg-background px-4 py-5 shadow-sm">
      <p className="font-serif text-4xl font-extrabold leading-none tracking-tight text-foreground sm:text-5xl">
        {stat.prefix}
        {display.toLocaleString("en-IN")}
        <span>{stat.suffix}</span>
      </p>
      <p className="mt-2 text-sm font-medium leading-5 text-foreground/80">{stat.label}</p>
      {stat.note && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-red-600" />
          {stat.note}
        </p>
      )}
    </div>
  );
}

export function FounderSection() {
  const { market } = useHeroMarket();
  const [visit, setVisit] = useState(0);

  useEffect(() => {
    try {
      const next = Number(window.localStorage.getItem(VISIT_KEY) ?? "0") + 1;
      window.localStorage.setItem(VISIT_KEY, String(next));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- visit counter lives in the browser only
      setVisit(next);
    } catch {
      // storage blocked: the first approved story is shown
    }
  }, []);

  const story: FounderStory = pickFounderStory(market, visit, FOUNDER_STORIES);

  return (
    <section aria-labelledby="founder-heading" className="mx-auto max-w-5xl">
      <div className="grid gap-8 rounded-3xl bg-muted px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[auto_1fr] lg:gap-14">
        <div className="flex items-center gap-4 lg:flex-col lg:items-start">
          <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-accent font-serif text-2xl text-accent-foreground">
            AS
          </span>
          <div>
            <p className="font-serif text-xl font-medium text-foreground">{FOUNDER.name}</p>
            <p className="text-sm text-muted-foreground">{FOUNDER.role}</p>
            <p className="mt-2 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-hover">{FOUNDER.education}</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">The person you will speak to</p>
          <h2 id="founder-heading" className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
            {story.title}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/85">{story.body}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Experience in numbers">
            {FOUNDER.stats.map((stat) => (
              <FounderStatTile key={stat.label} stat={stat} />
            ))}
          </div>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {FOUNDER.facts.map((fact) => (
              <li key={fact} className="py-3 text-base leading-7 text-foreground">
                {fact}
              </li>
            ))}
          </ul>
          <a
            href={FOUNDER.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-cta="advisor_linkedin"
            className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-hover hover:underline"
          >
            {FOUNDER.name} on LinkedIn <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
