import { Container } from "@/components/ui/container";

/**
 * How it works, as the product actually works: RESEARCH on your own, UNDERSTAND the market, then TALK to a person when you are ready.
 * Server-rendered. Every line describes something the site really does (no invented statistics, testimonials, logos or guarantees),
 * and nothing here makes a claim about independence, fees or licensing - the approved commercial disclosure lives on the
 * About, FAQ and Disclaimer pages.
 */

const STEPS = [
  { n: "01", title: "Research privately", body: "Explore leading developers in Mumbai and Dubai at your own pace. You are never asked for a phone number to read." },
  { n: "02", title: "Understand the market", body: "Read the guides, compare the questions that matter, and see what to ask before you pay anything." },
  { n: "03", title: "Talk to a person", body: "When you want human help, message or call Ambish directly. You choose if, and when." },
] as const;

export function BuyerJourney() {
  return (
    <section aria-labelledby="journey-heading" className="border-y border-border bg-muted/50">
      <Container className="py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">How it works</p>
          <h2 id="journey-heading" className="mt-3 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            Three steps, in your order
          </h2>
          <ol className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="border-t border-border pt-4">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{step.n}</span>
                <p className="mt-1 text-lg font-semibold text-foreground">{step.title}</p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
