import Link from "next/link";
import { Container } from "@/components/ui/container";
import { COMMISSION_POLICY, CREDENTIALS_LINE } from "@/lib/leads/gate/gate-copy";

/**
 * Fees, stated plainly before anyone is asked for anything: the one commission policy sentence (the same words as the Privacy Policy,
 * Disclaimer and FAQ), shown as two simple cards, and who Developer Connects is. It says nothing about where the firm's income comes from.
 */
export function FeeTransparency() {
  return (
    <section aria-labelledby="fees-heading" className="defer-section">
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Our fees</p>
          <h2 id="fees-heading" className="mt-3 max-w-2xl text-balance font-serif text-[clamp(1.875rem,1.4rem+2.2vw,3rem)] font-medium leading-[1.1] tracking-[-0.015em] text-foreground">
            No surprises in our fees.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-white p-6 sm:p-8">
              <p className="text-sm font-semibold text-foreground">New launches (primary sales)</p>
              <p className="mt-3 font-serif text-6xl font-medium leading-none tracking-[-0.02em] text-accent">0%</p>
              <p className="mt-3 text-base leading-7 text-foreground/80">commission charged to you.</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-6 sm:p-8">
              <p className="text-sm font-semibold text-foreground">Resale and rental</p>
              <p className="mt-3 font-serif text-4xl font-medium leading-tight tracking-[-0.02em] text-accent sm:text-5xl">Market standard</p>
              <p className="mt-3 text-base leading-7 text-foreground/80">Commission on secondary and rental deals is as per market standards.</p>
            </div>
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-6 text-muted-foreground">{COMMISSION_POLICY}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{CREDENTIALS_LINE}</p>
          <Link href="/disclaimer" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover underline-offset-4 hover:underline">
            Read the full terms
          </Link>
        </div>
      </Container>
    </section>
  );
}
