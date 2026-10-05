import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "About Us | Developer Connects",
  description:
    "Why Developer Connects exists, how verification works, and what we deliberately don't do.",
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

            <div className="mt-8 space-y-8 text-foreground">
              <section>
                <h2 className="text-lg font-semibold">The problem</h2>
                <p className="mt-2 text-muted-foreground">
                  Real-estate research is scattered across many different websites and listings,
                  and it&apos;s not always obvious which result actually belongs to the developer
                  themselves. Developer Connects is built to make that first step simpler.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">What we do</h2>
                <p className="mt-2 text-muted-foreground">
                  Developer Connects is a directory of real-estate developers that helps you find a
                  developer&apos;s genuine official website and continue your research directly with
                  the source. We also offer optional property assistance: when you continue to a
                  developer&apos;s website, you can share your WhatsApp number or phone so our
                  property team can help with your enquiry.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">How verification works</h2>
                <p className="mt-2 text-muted-foreground">
                  We review developer websites and approve the website we identify as the
                  developer&rsquo;s official website. Every verified listing shows the date it was
                  verified by Developer Connects.{" "}
                  <a href="/how-we-verify" className="text-accent-hover hover:underline">
                    How Developer Connects verifies official websites
                  </a>
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">How property assistance works</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    Developer Connects is not the developer, and the developer does not require your
                    phone number to view its website.
                  </li>
                  <li>
                    The details you share are given to Developer Connects, to help with your property
                    enquiry through the contact method you choose.
                  </li>
                  <li>
                    Developer Connects may receive payment from developers or others in connection with
                    property transactions. This has no effect on whether a developer&apos;s website is
                    verified.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold">Transparency</h2>
                <p className="mt-2 text-muted-foreground">
                  If something on a developer&apos;s listing looks wrong, you can{" "}
                  <a href="/contact" className="text-accent-hover hover:underline">
                    report it
                  </a>{" "}
                  directly from that developer&apos;s page, and we&apos;ll review it. Covering
                  verified developers across India and the UAE, including Mumbai and Dubai.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">Part of NoDalalTalks</h2>
                <p className="mt-2 text-muted-foreground">
                  Developer Connects is part of the NoDalalTalks ecosystem, which focuses on
                  building simple, trustworthy tools for people to research real estate directly.
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
