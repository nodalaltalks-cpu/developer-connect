import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Container } from "@/components/ui/container";
import { LEGAL_CONFIG } from "@/lib/legal-config";

/**
 * Shared shell for all four legal pages — same light/white/soft-grey
 * design system as the rest of the product (Part 46), a single "Last
 * updated" line sourced from LEGAL_CONFIG (Part 35: one place to change,
 * not four), and a readable measure (max-w-2xl) with generous heading
 * spacing for comfortable mobile reading (Part 45).
 */
export function LegalPageLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: {LEGAL_CONFIG.lastUpdated}</p>
            {intro && <p className="mt-4 text-muted-foreground">{intro}</p>}

            <div className="legal-prose mt-8 space-y-8 text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-2 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_li]:leading-relaxed [&_li]:text-muted-foreground [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
              {children}
            </div>

            <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
              This page is a production-quality draft, not a substitute for advice from a qualified lawyer
              familiar with {LEGAL_CONFIG.productName}&apos;s actual legal entity, operating locations, data
              flows, and business model. Questions about this policy can be sent to{" "}
              <a href={`mailto:${LEGAL_CONFIG.privacyEmail}`} className="text-accent-hover hover:underline">
                {LEGAL_CONFIG.privacyEmail}
              </a>
              .
            </p>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}

/** A single policy section — consistent heading style everywhere, no per-page one-off markup. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
