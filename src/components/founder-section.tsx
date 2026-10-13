"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useHeroMarket } from "@/components/hero-market";
import { FOUNDER, FOUNDER_STORIES, pickFounderStory, type FounderStory } from "@/lib/founder";

/**
 * The founder, built for credibility: who, in his own words, with the qualification and the supporting facts. The headline figures
 * (the Rs 300 Cr+ and the rest) live in the proof band, which sits directly under the hero, so they are shown once, large, with the
 * footnote that says whose figures they are.
 * Only what lib/founder.ts contains is shown; a claim that has not been supplied by the founder is simply absent.
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
    <section aria-labelledby="founder-heading" className="defer-section mx-auto max-w-5xl">
      <div className="grid gap-8 rounded-xl border border-border bg-white px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[auto_1fr] lg:gap-14">
        <div className="flex items-center gap-5 lg:w-64 lg:flex-col lg:items-start lg:gap-5">
          <Image
            src="/founder/ambish-singh.jpg"
            alt="Ambish Singh, Founder of Developer Connects"
            width={960}
            height={1200}
            sizes="(min-width: 1024px) 256px, 112px"
            quality={92}
            className="w-28 shrink-0 rounded-xl border border-border object-cover lg:w-full"
          />
          <div>
            <p className="font-serif text-xl font-medium text-foreground">{FOUNDER.name}</p>
            <p className="text-sm text-muted-foreground">{FOUNDER.role}</p>
            <p className="mt-2 inline-block rounded-sm bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-hover">{FOUNDER.education}</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">The person you will speak to</p>
          <h2 id="founder-heading" className="mt-2 text-balance font-serif text-[clamp(1.875rem,1.4rem+2.2vw,3rem)] font-medium leading-[1.1] tracking-[-0.015em] text-foreground">
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
