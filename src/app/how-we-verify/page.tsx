import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "How Developer Connects Verifies Official Developer Websites | Developer Connects",
  description:
    "What “official website verified” means on Developer Connects, what we review, what the verification date shows, and what verification does not cover.",
  alternates: { canonical: "/how-we-verify" },
};

const linkClassName = "text-accent-hover hover:underline";

export default function HowWeVerifyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              How Developer Connects Verifies Official Developer Websites
            </h1>
            <p className="mt-4 text-muted-foreground">
              This page explains what the &ldquo;Official website verified by Developer
              Connects&rdquo; status on a developer&apos;s page means, and what it does not mean.
            </p>

            <div className="mt-6 rounded-lg border border-border bg-muted p-5">
              <p className="text-sm font-medium text-foreground">Scope</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Developer Connects verifies the association between a developer profile and the
                specific official website URL shown on that profile. It is not a certification of
                the developer, its projects or its regulatory status.
              </p>
            </div>

            <div className="mt-10 space-y-8 text-foreground">
              <section>
                <h2 className="text-lg font-semibold">What &ldquo;verified official website&rdquo; means</h2>
                <p className="mt-2 text-muted-foreground">
                  Developer Connects has reviewed the developer and approved the specific website
                  URL stored on that developer&apos;s profile as the developer&apos;s official
                  website. The website shown, and the link to it, are the ones we approved.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">What the verification date shows</h2>
                <p className="mt-2 text-muted-foreground">
                  The &ldquo;Last verified&rdquo; date on a developer&apos;s page is the date the
                  current official website was approved by Developer Connects. It is not the date
                  the developer was founded, and it is not a date on which we re-checked the
                  website. If we have no recorded approval date for a profile, no date is shown.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">What we do</h2>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
                  <li>
                    We review a developer and its website, and approve the website we identify as
                    the developer&apos;s official website.
                  </li>
                  <li>
                    Approval is a decision made by a person at Developer Connects. It is not
                    granted automatically.
                  </li>
                  <li>
                    Only websites approved this way are shown as verified official websites, and
                    a developer has one verified official website at a time.
                  </li>
                  <li>
                    The same website is not shown as the verified official website of two
                    different developers at once.
                  </li>
                  <li>
                    A developer whose website has not been approved is shown as not yet verified,
                    with no verification claim.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold">What we do not verify</h2>
                <p className="mt-2 text-muted-foreground">
                  Verification does not by itself confirm or certify any of the following:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>the developer&apos;s legal status or company details</li>
                  <li>licences, RERA registration or other regulatory approvals</li>
                  <li>ownership of the website&apos;s domain</li>
                  <li>financial standing</li>
                  <li>the quality of the developer, its projects or its construction</li>
                  <li>investment returns</li>
                  <li>the developer&apos;s reputation</li>
                </ul>
                <p className="mt-2 text-muted-foreground">
                  If you are considering a purchase, check these things with the relevant
                  authorities and directly with the developer.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">If a website changes</h2>
                <p className="mt-2 text-muted-foreground">
                  If a different website is approved for a developer, it replaces the earlier one
                  and the verification date changes to the new approval. A website that is set
                  aside for re-review is not shown as verified until it is approved again.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">Reporting an inaccurate website</h2>
                <p className="mt-2 text-muted-foreground">
                  Every developer page has a &ldquo;Report inaccurate information&rdquo; button
                  where you can flag an incorrect official website, name or headquarters. You can
                  also{" "}
                  <Link href="/contact?reason=REPORT_INACCURATE_INFO" className={linkClassName}>
                    report inaccurate information
                  </Link>{" "}
                  from the contact page. We review the reports we receive.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold">See it on a developer&apos;s page</h2>
                <p className="mt-2 text-muted-foreground">
                  Each verified developer&apos;s page states its official website and the date it
                  was verified. You can{" "}
                  <Link href="/developers" className={linkClassName}>
                    browse all verified developers
                  </Link>
                  . For more about the service, see{" "}
                  <Link href="/about" className={linkClassName}>
                    About Developer Connects
                  </Link>{" "}
                  and the{" "}
                  <Link href="/faq" className={linkClassName}>
                    FAQ
                  </Link>
                  .
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
