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
                  Search for a real-estate developer online and you&apos;ll mostly find brokers —
                  pages built to capture your phone number, not to show you the developer&apos;s
                  own website. It&apos;s hard to tell which result is actually the developer, and
                  which is someone else using their name to generate leads.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">What we do</h2>
                <p className="mt-2 text-muted-foreground">
                  Developer Connects is a directory of real-estate developers with one job: help
                  you find a developer&apos;s genuine official website and go straight to it. No
                  broker forms, no lead capture, no detour.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">How verification works</h2>
                <p className="mt-2 text-muted-foreground">
                  Before a developer appears in our directory, we check that the website we&apos;re
                  pointing you to is genuinely theirs — matching branding, corporate identity, and
                  other public signals against the company. A developer is only marked
                  &ldquo;verified&rdquo; once this review is complete, and every verified listing
                  shows when it was verified.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">What we don&apos;t do</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>We are not a broker, and we don&apos;t act as one.</li>
                  <li>We don&apos;t sell properties or take a commission on anything.</li>
                  <li>We don&apos;t collect your phone number to pass on to anyone.</li>
                  <li>We don&apos;t rank developers by who pays us — verification is the only gate.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold">Transparency</h2>
                <p className="mt-2 text-muted-foreground">
                  If something on a developer&apos;s listing looks wrong, you can{" "}
                  <a href="/contact" className="text-accent-hover hover:underline">
                    report it
                  </a>{" "}
                  directly from that developer&apos;s page, and we&apos;ll review it. We&apos;re
                  starting in Mumbai and the wider MMR region, and expect to add more cities and
                  markets over time.
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
