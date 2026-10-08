import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdvisorTrigger } from "@/components/advisor/advisor";
import { FounderSection } from "@/components/founder-section";
import { FOUNDER } from "@/lib/founder";

export const metadata: Metadata = {
  title: "About Us | Developer Connects",
  description:
    "Developer Connects is a property advisory platform for buyers in Mumbai, Dubai and across India and the UAE: clear information, expert guidance, and a calmer way to buy.",
  alternates: { canonical: "/about" },
};

/**
 * Person + AboutPage structured data, describing only what the page states and what lib/founder.ts substantiates: a name, a role, the
 * company and the founder's own public LinkedIn profile. No credentials, ratings or reviews are asserted.
 */
const aboutStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "AboutPage", "@id": "https://developerconnects.com/about#page", url: "https://developerconnects.com/about", name: "About Developer Connects", about: { "@id": "https://developerconnects.com/#organization" } },
    { "@type": "Organization", "@id": "https://developerconnects.com/#organization", name: "Developer Connects", url: "https://developerconnects.com", founder: { "@id": "https://developerconnects.com/about#founder" } },
    { "@type": "Person", "@id": "https://developerconnects.com/about#founder", name: FOUNDER.name, jobTitle: "Founder", worksFor: { "@id": "https://developerconnects.com/#organization" }, sameAs: [FOUNDER.linkedinUrl] },
  ],
};

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutStructuredData) }} />
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
              About Developer Connects
            </h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              We are building a better way to buy property in Mumbai, Dubai and across India and the UAE.
            </p>

            <div className="mt-8 space-y-8 text-foreground">
              <section>
                <h2 className="text-lg font-semibold">The problem, and why we exist</h2>
                <p className="mt-2 text-muted-foreground">
                  Buying a home is the largest decision most families make, yet the process is still scattered,
                  rushed and hard to read. Prices are unclear, information sits across many websites, and it is
                  rarely obvious who is genuinely helping you. Developer Connects exists to replace that noise with
                  clarity.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">What we do</h2>
                <p className="mt-2 text-muted-foreground">
                  Developer Connects is a property advisory platform. We help you compare leading developers and
                  projects, understand the location, the price and the terms, and talk to a property specialist
                  when you choose to. When you ask to connect with a developer, you share your WhatsApp number or
                  phone with Developer Connects so our advisory team can help based on your requirement.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">How property advisory works</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    Developer Connects is not the developer, and the developer does not require your phone number
                    through this flow.
                  </li>
                  <li>
                    The details you share are given to Developer Connects, to help with your property enquiry
                    through the contact method you choose.
                  </li>
                  <li>
                    Developer Connects may receive payment from developers or others in connection with property
                    transactions. This has no effect on how we present any developer.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold">Transparency</h2>
                <p className="mt-2 text-muted-foreground">
                  If something on a developer&apos;s page looks wrong, you can{" "}
                  <a href="/contact" className="text-accent-hover hover:underline">
                    report it
                  </a>{" "}
                  directly from that developer&apos;s page, and we&apos;ll review it. We cover developers across
                  India and the UAE, including Mumbai and Dubai. Always confirm prices, approvals and terms with
                  the developer and the regulator before you pay anything.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">Talk to someone</h2>
                <p className="mt-2 text-muted-foreground">When you want human help, message or call Ambish directly. No form.</p>
                <div className="mt-4">
                  <AdvisorTrigger tone="navy">Talk to an Advisor</AdvisorTrigger>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold">Part of NoDalalTalks</h2>
                <p className="mt-2 text-muted-foreground">
                  Developer Connects is part of the NoDalalTalks ecosystem, which focuses on building simple,
                  trustworthy tools for people to research real estate directly.
                </p>
              </section>
            </div>
          </div>
        </Container>
        <Container className="pb-16 sm:pb-24">
          <FounderSection />
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
