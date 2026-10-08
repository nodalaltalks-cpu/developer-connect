import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { ADVISOR_CONTACT } from "@/lib/advisor-contact";

export const metadata: Metadata = {
  title: "Contact Us | Developer Connects",
  description: "Get in touch with Developer Connects — questions, listings, partnerships, or a correction.",
  alternates: { canonical: "/contact" },
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const resolvedSearchParams = await searchParams;
  const initialReason = firstValue(resolvedSearchParams.reason);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-xl">
            <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">Contact us</h1>
            <p className="mt-3 text-muted-foreground">
              For business, partnership, developer, media and general enquiries. Looking for property guidance?{" "}
              <Link href="/advisor" className="font-medium text-accent-hover underline">
                Talk to an Advisor
              </Link>{" "}
              directly instead: no form needed.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Or email{" "}
              <a href={`mailto:${ADVISOR_CONTACT.email}`} className="font-medium text-accent-hover underline">
                {ADVISOR_CONTACT.email}
              </a>
              .
            </p>

            <h2 className="mt-14 border-t border-border pt-8 text-lg font-semibold tracking-tight text-foreground">Send us a message</h2>
            <div className="mt-5">
              <ContactForm initialReason={initialReason} />
            </div>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
