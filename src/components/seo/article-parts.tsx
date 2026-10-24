import Link from "next/link";
import { AdvisorTrigger } from "@/components/advisor/advisor";
import { FOUNDER } from "@/lib/founder";
import type { OfficialSource } from "@/lib/seo/sources";
import type { Block } from "@/lib/seo/types";

/** The pieces shared by the guide pages and the city consultant pages. All server-rendered; only the advisor button is interactive. */

export function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <div className="mt-8">
      {blocks.map((block, i) => {
        switch (block.t) {
          case "h2":
            return (
              <h2 key={i} className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-8 text-lg font-semibold text-foreground">
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="mt-4 text-base leading-7 text-foreground/85">
                {block.text}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="mt-4 list-disc space-y-2 pl-5 text-base leading-7 text-foreground/85 marker:text-brass-700">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="mt-4 list-decimal space-y-2 pl-5 text-base leading-7 text-foreground/85 marker:font-semibold marker:text-brass-700">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            );
          case "note":
            return (
              <aside key={i} className="mt-6 border-l-2 border-gold pl-4">
                <p className="text-sm font-semibold text-foreground">{block.title}</p>
                <p className="mt-1 text-sm leading-6 text-foreground/80">{block.text}</p>
              </aside>
            );
        }
      })}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={item.name} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link href={item.href} className="inline-flex min-h-11 items-center hover:text-accent-hover hover:underline">
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Byline({ updated }: { updated: string }) {
  const label = new Date(`${updated}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      By <Link href="/about" className="font-medium text-foreground hover:underline">{FOUNDER.name}</Link>, Founder · Facts checked {label}
    </p>
  );
}

/** Collapsed by default so a long FAQ reads as a short list; the answers stay in the HTML, so crawlers and the FAQPage schema still see them. */
export function FaqList({ items }: { items: readonly { question: string; answer: string }[] }) {
  return (
    <div className="mt-4 divide-y divide-border border-y border-border">
      {items.map((item) => (
        <details key={item.question} className="group py-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-2 font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <span aria-hidden="true" className="shrink-0 text-lg text-brass-700 transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="pb-4 text-sm leading-6 text-foreground/80">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

/** A quiet two-column list of links or plain names. Past `limit` the rest sit behind "Show all", still in the HTML. */
export function AreaList({ items, limit = 8 }: { items: readonly { name: string; href?: string }[]; limit?: number }) {
  const render = (item: { name: string; href?: string }) => (
    <li key={item.name}>
      {item.href ? (
        <Link href={item.href} className="inline-flex min-h-10 items-center text-accent-hover underline-offset-4 hover:underline">
          {item.name}
          <span aria-hidden="true" className="ml-1 text-brass-700">→</span>
        </Link>
      ) : (
        <span className="inline-flex min-h-10 items-center text-foreground/80">{item.name}</span>
      )}
    </li>
  );
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const cols = "grid grid-cols-1 gap-x-6 sm:grid-cols-2";
  return (
    <>
      <ul className={`mt-2 ${cols}`}>{shown.map(render)}</ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center text-sm font-medium text-accent-hover marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show all {items.length}</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className={cols}>{rest.map(render)}</ul>
        </details>
      )}
    </>
  );
}

/** The regulators a buyer should check against, linked to their own sites. Opens in the same tab; no tracking, no affiliate. */
export function OfficialSources({ sources }: { sources: readonly OfficialSource[] }) {
  if (sources.length === 0) return null;
  return (
    <section aria-label="Official sources" className="mt-12">
      <h2 className="text-lg font-semibold text-foreground">Official sources</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Check these yourself. They are the regulators' own sites, not ours.</p>
      <ul className="mt-3 space-y-3">
        {sources.map((source) => (
          <li key={source.url} className="text-sm leading-6">
            <a href={source.url} rel="noopener" className="font-medium text-accent-hover underline-offset-4 hover:underline">{source.name}</a>
            <span className="block text-muted-foreground">{source.use}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdviceCta({ heading = "Want a second opinion on your shortlist?" }: { heading?: string }) {
  return (
    <section aria-label="Talk to an advisor" className="mt-14 rounded-xl bg-ink p-6 text-pearl sm:p-8">
      <h2 className="font-serif text-2xl font-medium text-white">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-pearl">Message Ambish with your budget and area. You get a short list with prices, payment plans and possession dates side by side. No pressure to book.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <AdvisorTrigger className="w-full sm:w-auto">Talk to an Advisor</AdvisorTrigger>
        <Link
          href="/enquire"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-sm border border-white/60 px-7 text-sm font-semibold text-white hover:bg-white/10 sm:w-auto"
        >
          Tap your requirements
        </Link>
      </div>
    </section>
  );
}

export const GENERAL_INFO_NOTE =
  "This page is general information, not legal, tax or financial advice. Rates, thresholds and rules change, so confirm them with the relevant authority or a qualified professional before you decide.";
