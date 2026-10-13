"use client";

import type { RefObject } from "react";
import { useCountUp } from "@/components/stat-counter";
import { Container } from "@/components/ui/container";
import { FOUNDER, type FounderStat } from "@/lib/founder";

/**
 * The proof band: the founder's three headline figures on night ink, directly under the hero. The real numbers are in the page HTML
 * (so search engines, link previews and slow phones see them, never "0"); a visitor who has not scrolled to them yet sees them roll up,
 * once, and only if their device allows motion. The footnote says exactly whose figures these are.
 */

function Figure({ stat }: { stat: FounderStat }) {
  const { ref, display } = useCountUp(stat.value);
  return (
    <div ref={ref as RefObject<HTMLDivElement>} className="border-t border-white/10 pt-6 first:border-t-0 first:pt-0 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0 sm:first:border-l-0 sm:first:pl-0">
      <p className="whitespace-nowrap font-serif text-[clamp(2.75rem,1.6rem+3.6vw,4rem)] font-medium leading-none tracking-[-0.02em] text-brass-300 [font-variant-numeric:tabular-nums]">
        {stat.prefix}
        {display.toLocaleString("en-IN")}
        {/* The "+" is set in the sans at a heavier weight: a serif plus is a hairline at display size and reads as missing. */}
        {stat.suffix?.replace(/\+$/, "")}
        {stat.suffix?.endsWith("+") && (
          <span className="ml-1 inline-block -translate-y-[0.08em] align-baseline font-sans text-[0.72em] font-semibold">+</span>
        )}
      </p>
      <p className="mt-3 max-w-[16rem] text-sm leading-6 text-pearl">{stat.label}</p>
      {stat.note && (
        <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brass-300">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brass-300" />
          {stat.note}
        </p>
      )}
    </div>
  );
}

export function ProofBand() {
  return (
    <section aria-labelledby="proof-heading" className="dc-grain bg-ink text-pearl">
      <div aria-hidden="true" className="h-px bg-gold/70" />
      <Container className="relative z-10 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p id="proof-heading" className="text-xs font-semibold uppercase tracking-[0.24em] text-brass-300">
            In numbers
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {FOUNDER.stats.map((stat) => (
              <Figure key={stat.label} stat={stat} />
            ))}
          </div>
          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-mist">Ambish Singh, career to date</p>
        </div>
      </Container>
    </section>
  );
}
