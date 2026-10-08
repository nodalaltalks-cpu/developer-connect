import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "About Us | Developer Connects",
  description:
    "Developer Connects is a property advisory platform for buyers in Mumbai, Dubai and across India and the UAE: clear information, expert guidance, and a calmer way to buy.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              About Developer Connects
            </h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              We are building a better way to buy property in Mumbai, Dubai and across India and the UAE.
            </p>

            <div className="mt-8 space-y-8 text-foreground">
              <section>
                <h2 className="text-lg font-semibold">Why we exist</h2>
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
                <h2 className="text-lg font-semibold">Part of NoDalalTalks</h2>
                <p className="mt-2 text-muted-foreground">
                  Developer Connects is part of the NoDalalTalks ecosystem, which focuses on building simple,
                  trustworthy tools for people to research real estate directly.
                </p>
              </section>
            </div>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
