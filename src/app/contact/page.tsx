import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ContactForm } from "@/components/contact-form";

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
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Contact Us</h1>
            <p className="mt-3 text-muted-foreground">
              Questions, a developer listing, a partnership idea, or something that needs fixing — tell us below
              and a real person will read it.
            </p>

            <div className="mt-8">
              <ContactForm initialReason={initialReason} />
            </div>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
