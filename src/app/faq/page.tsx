import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

export const metadata: Metadata = {
  title: "FAQ | Developer Connects",
  description: "Answers to common questions about how Developer Connects works.",
  alternates: { canonical: "/faq" },
};

const FAQS: { question: string; answer: string }[] = [
  {
    question: "What is Developer Connects?",
    answer:
      "A directory of real-estate developers that helps you find a developer's genuine official website and continue your research directly with the source. We also offer optional property assistance.",
  },
  {
    question: "Is Developer Connects the developer, or a party to my purchase?",
    answer:
      "No. Developer Connects is not the developer of any project and is not a party to your agreement with a developer. We help you find the developer's own website, and we offer optional property assistance. Developer Connects may receive payment from developers or others in connection with property transactions; this has no effect on whether a developer's website is verified.",
  },
  {
    question: "How do you verify developers?",
    answer:
      "Developer Connects reviews a developer and its website and approves the website when it is identified as the developer’s official website. Only websites approved through this process are shown as verified. Verification does not confirm the developer’s legal status, licences, regulatory approvals, domain ownership, or the quality of the developer or its projects.",
  },
  {
    question: "What does “official website verified” mean?",
    answer:
      "It means Developer Connects approved the linked website as the developer’s official website. Every verified listing shows the date it was verified. It does not confirm the developer’s legal status, licences, regulatory approvals, domain ownership, or the quality of the developer or its projects.",
  },
  {
    question: "Does Developer Connects sell properties itself?",
    answer: "No. Properties are sold by the developers themselves. We link to developers' own websites and offer optional property assistance.",
  },
  {
    question: "Why do you ask for my WhatsApp number or phone?",
    answer:
      "You can search and browse developer pages freely. When you continue to a developer's official website, we ask for your WhatsApp number or phone so our property team can help with your enquiry. The developer does not require it — you are sharing it with Developer Connects, and you choose whether we contact you by WhatsApp or phone call.",
  },
  {
    question: "How do I visit the developer's official website?",
    answer:
      "Open a developer's page and use the “Visit official website” button. After you share your contact details for property assistance, their real site opens in a new tab.",
  },
  {
    question: "What if I find incorrect information?",
    answer:
      "Use “Report inaccurate information” on that developer's page to tell us what's wrong. We review every report.",
  },
  {
    question: "How can a developer be listed?",
    answer:
      "We're onboarding developers directly. Reach out via Contact Us if you represent a developer and want to be listed.",
  },
  {
    question: "Which locations does Developer Connects cover?",
    answer:
      "Covering verified developers across India and the UAE, including Mumbai, Bangalore, Hyderabad, Pune, Gurugram, Thane, Navi Mumbai, Dubai and Abu Dhabi.",
  },
  {
    question: "Can I buy property directly from the developer without a broker?",
    answer:
      "Yes. Developers sell new and off-plan homes through their own sales teams. Find the developer on Developer Connects, open its verified official website, and contact the developer through the details published there. You can also ask Developer Connects for property assistance. Our buy-direct guide walks through every step.",
  },
  {
    question: "How do I avoid fake developer websites?",
    answer:
      "Don't rely on search ads or links sent to you. Each developer on Developer Connects links to the website we have verified as its official one. Also check the project with the real estate regulator for its location before you pay anything.",
  },
];

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default function FaqPage() {
  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqStructuredData) }}
      />
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Frequently asked questions
            </h1>

            <dl className="mt-8 divide-y divide-border border-t border-border">
              {FAQS.map((faq) => (
                <div key={faq.question} className="py-5">
                  <dt className="font-medium text-foreground">{faq.question}</dt>
                  <dd className="mt-1.5 text-sm text-muted-foreground">{faq.answer}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-sm">
              <Link href="/buy-direct-from-developer" className="text-accent-hover hover:underline">
                Read the guide: how to buy property directly from the developer →
              </Link>
            </p>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
