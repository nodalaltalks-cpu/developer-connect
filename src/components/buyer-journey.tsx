import { Container } from "@/components/ui/container";

/**
 * The buyer journey as the product actually works: RESEARCH → SHORTLIST → CONNECT → DECIDE. Pure and server-rendered.
 * Every line describes something the site really does (no invented statistics, testimonials, logos or guarantees),
 * and nothing here makes a claim about independence, fees or licensing - the approved commercial disclosure lives on
 * the gate, About, FAQ and Disclaimer pages.
 */

const STEPS = [
  { n: "01", title: "Research", body: "Explore leading developers across Mumbai, Dubai and the rest of India and the UAE, side by side." },
  { n: "02", title: "Shortlist", body: "Compare the developers that fit where, and what, you are looking for." },
  { n: "03", title: "Connect", body: "Tell us what you need. A Developer Connects property specialist gets in touch - only because you asked." },
  { n: "04", title: "Decide", body: "Take your time. You choose whether, and when, to take the next step." },
] as const;

export function BuyerJourney() {
  return (
    <section aria-labelledby="journey-heading" className="border-y border-border bg-muted/40">
      <Container className="py-10 sm:py-14">
        <h2 id="journey-heading" className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          How it works
        </h2>
        <ol className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n} className="border-t border-border pt-4">
              <span className="text-xs font-medium tabular-nums text-muted-foreground">{step.n}</span>
              <p className="mt-1 text-base font-semibold text-foreground">{step.title}</p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
