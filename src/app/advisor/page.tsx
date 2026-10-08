import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ADVISOR_CONTACT, callHref, mailtoHref, whatsappHref } from "@/lib/advisor-contact";
import { FOUNDER } from "@/lib/founder";

export const metadata: Metadata = {
  title: "Talk to an Advisor | Developer Connects",
  description: "Speak directly with Ambish Singh about property in Mumbai, Dubai and across India and the UAE. WhatsApp, email or phone. No form.",
  alternates: { canonical: "/advisor" },
};

const ROW =
  "flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * TALK TO AN ADVISOR. There is deliberately no form here: the visitor already knows how to reach a person, and typing a phone number
 * and an email again is exactly the friction this page removes. Each action opens WhatsApp, the mail app or the dialler with the
 * message already written. The general enquiry form (business, partnership, media) lives on /contact.
 */
export default function AdvisorPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-14 sm:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Talk to an Advisor</p>
            <h1 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-tight text-foreground sm:text-5xl">Speak with Ambish.</h1>
            <p className="mt-4 text-base leading-7 text-foreground/80">
              {FOUNDER.experience.charAt(0).toUpperCase() + FOUNDER.experience.slice(1)}. Message or call directly, and say as much or as little as you like.
            </p>

            <div className="mt-10 space-y-8">
              {(["india", "uae"] as const).map((region) => {
                const contact = ADVISOR_CONTACT[region];
                return (
                  <section key={region} aria-label={contact.label}>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {contact.label} <span className="font-normal normal-case tracking-normal">· {contact.display}</span>
                    </h2>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <a href={whatsappHref({ region })} target="_blank" rel="noopener noreferrer" data-cta="advisor_whatsapp" className={`${ROW} border-accent bg-accent text-accent-foreground hover:bg-accent-hover`}>
                        <span className="font-medium">WhatsApp</span>
                        <span aria-hidden="true">↗</span>
                      </a>
                      <a href={callHref(region)} data-cta="advisor_call" className={ROW}>
                        <span className="font-medium">Call</span>
                        <span aria-hidden="true" className="text-muted-foreground">→</span>
                      </a>
                    </div>
                  </section>
                );
              })}

              <section aria-label="Email">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Email</h2>
                <a href={mailtoHref({ region: "uae" })} data-cta="advisor_email" className={`${ROW} mt-3`}>
                  <span className="min-w-0 truncate font-medium text-foreground">{ADVISOR_CONTACT.email}</span>
                  <span aria-hidden="true" className="text-muted-foreground">→</span>
                </a>
              </section>
            </div>

            <p className="mt-10 text-sm text-muted-foreground">
              Business, partnership, media or developer enquiries?{" "}
              <Link href="/contact" className="font-medium text-accent-hover underline">
                Use the contact form
              </Link>
              .
            </p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
