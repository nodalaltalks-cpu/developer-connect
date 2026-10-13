import { Container } from "@/components/ui/container";

/**
 * How it works, as the work actually goes: a BRIEF, a SHORTLIST, a VISIT, then the BOOKING. Each step says what the buyer gets, so the
 * uncertainty about "what happens if I message?" is gone before anyone does. Server-rendered. Nothing here is a statistic, a
 * guarantee or a claim about independence; the commission policy lives in the fees block and on the legal pages.
 */

const STEPS = [
  { n: "01", title: "Your brief", body: "Tell Ambish your budget, the areas, the size and the timeline. Tap it in a minute, or message him directly." },
  { n: "02", title: "A short list", body: "You get only the projects that fit, with prices, payment plans and possession dates side by side." },
  { n: "03", title: "Visit and check", body: "Site visits are planned around your day, with the questions to ask and the registration to check at each project." },
  { n: "04", title: "Booking and paperwork", body: "When you decide, you are helped through the booking and the paperwork, with every cost explained first." },
] as const;

export function BuyerJourney() {
  return (
    <section aria-labelledby="journey-heading" className="defer-section border-y border-border bg-muted">
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">How it works</p>
          <h2 id="journey-heading" className="mt-3 max-w-2xl text-balance font-serif text-[clamp(1.875rem,1.4rem+2.2vw,3rem)] font-medium leading-[1.1] tracking-[-0.015em] text-foreground">
            From brief to keys, in four steps.
          </h2>
          <ol className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.n} className="border-t border-gold pt-4">
                <span className="font-serif text-3xl font-medium tabular-nums text-brass-700">{step.n}</span>
                <p className="mt-2 text-lg font-semibold text-foreground">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-foreground/75">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
