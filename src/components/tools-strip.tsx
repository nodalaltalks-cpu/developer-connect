import Link from "next/link";
import { Container } from "@/components/ui/container";
import { DELAY_TOOL_PATH, EMI_TOOL_PATH } from "@/lib/seo/tools";

/**
 * "Check your numbers": free calculators, one tap from the front door. The first card is the one a buyer in a late project needs most,
 * so it leads. On a phone the cards stack full width and every card is a single large tap target (the whole card is the link).
 */
const TOOLS = [
  {
    href: DELAY_TOOL_PATH,
    kicker: "Flat delayed?",
    title: "Possession delay interest calculator",
    body: "Enter what you paid, the date in your agreement and your state's rate. See the interest owed for the delay, per month and per day.",
    cta: "Calculate my delay interest",
  },
  {
    href: EMI_TOOL_PATH,
    kicker: "Planning a loan?",
    title: "Home loan EMI calculator",
    body: "Your monthly instalment and the total interest over the life of the loan, for rupees or dirhams.",
    cta: "Calculate my EMI",
  },
  {
    href: "/ask",
    kicker: "Not sure what to ask?",
    title: "Ask Developer Connects",
    body: "Plain answers on buying in Mumbai and Dubai, taken only from our own guides, with the source shown.",
    cta: "Ask a question",
  },
] as const;

export function ToolsStrip() {
  return (
    <section aria-labelledby="tools-heading" className="border-t border-border bg-white/40">
      <Container className="py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Free tools</p>
          <h2 id="tools-heading" className="mt-3 max-w-2xl text-balance font-serif text-[clamp(1.75rem,1.4rem+2vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.015em] text-foreground">
            Check your numbers before you decide.
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool, index) => (
              <li key={tool.href} className={index === 0 ? "sm:col-span-2 lg:col-span-1" : undefined}>
                <Link
                  href={tool.href}
                  className="group flex h-full min-h-44 flex-col rounded-xl border border-border bg-white p-5 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:p-6"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-700">{tool.kicker}</span>
                  <span className="mt-2 font-serif text-xl font-medium leading-snug text-foreground group-hover:text-accent-hover">{tool.title}</span>
                  <span className="mt-2 text-sm leading-6 text-foreground/75">{tool.body}</span>
                  <span className="mt-auto inline-flex min-h-11 items-center pt-4 text-sm font-semibold text-accent-hover">{tool.cta} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
