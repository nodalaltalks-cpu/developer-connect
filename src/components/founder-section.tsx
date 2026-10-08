"use client";

import { useEffect, useState } from "react";
import { useHeroMarket } from "@/components/hero-market";
import { FOUNDER, FOUNDER_STORIES, pickFounderStory, type FounderStory } from "@/lib/founder";

/**
 * The founder, briefly and plainly: who, what experience, how to reach them. Only what lib/founder.ts contains is shown; a claim
 * that has not been substantiated is simply absent. There is no portrait because none has been supplied (a monogram is not a photo,
 * and we do not use stock images of a real person).
 *
 * The short story rotates between APPROVED entries by visit number (kept in the visitor's own browser). It is never rewritten.
 */

const VISIT_KEY = "dc_visit_count";

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
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">The person you will speak to</p>
          <h2 id="founder-heading" className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
            {story.title}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/85">{story.body}</p>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {FOUNDER.facts.map((fact) => (
              <li key={fact} className="py-3 text-base leading-7 text-foreground">
                {fact}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{FOUNDER.context}</p>
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
