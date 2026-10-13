import Link from "next/link";
import { AdvisorTrigger } from "@/components/advisor/advisor";
import { FOUNDER } from "@/lib/founder";
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
              <aside key={i} className="mt-6 rounded-xl border border-border border-l-4 border-l-gold bg-white p-5">
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

export function FaqList({ items }: { items: readonly { question: string; answer: string }[] }) {
  return (
    <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-white">
      {items.map((item) => (
        <div key={item.question} className="p-5">
          <dt className="font-semibold text-foreground">{item.question}</dt>
          <dd className="mt-2 text-sm leading-6 text-foreground/80">{item.answer}</dd>
        </div>
      ))}
    </dl>
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
