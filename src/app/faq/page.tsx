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
      "A property advisory platform for buyers in Mumbai, Dubai and across India and the UAE. We help you compare leading developers and projects, understand the price and the terms, and speak to a property specialist when you choose to.",
  },
  {
    question: "Is Developer Connects the developer, or a party to my purchase?",
    answer:
      "No. Developer Connects is not the developer of any project and is not a party to your agreement with a developer. We help buyers research developers and connect with them through our advisory team. Developer Connects may receive payment from developers or others in connection with property transactions; this has no effect on how we present any developer.",
  },
  {
    question: "Does Developer Connects sell properties itself?",
    answer: "No. Properties are sold by the developers themselves. We offer optional property advisory to help you research and decide.",
  },
  {
    question: "Why do you ask for my WhatsApp number or phone?",
    answer:
      "You can search and browse developer pages freely. When you ask to connect with a developer, we ask for your WhatsApp number or phone so our advisory team can help with your enquiry. The developer does not require it — you are sharing it with Developer Connects, and you choose whether we contact you by WhatsApp or phone call.",
  },
  {
    question: "How do I get in touch with a developer?",
    answer:
      "Open a developer's page and use the “Connect with” button. You share your WhatsApp number or phone with Developer Connects, and our advisory team contacts you to help connect you with the developer. Developer Connects does not send you to the developer's website.",
  },
  {
    question: "Can I buy from Mumbai or Dubai if I live somewhere else?",
    answer:
      "Yes. Many of our buyers are non-resident Indians and overseas investors. Our advisory team can walk you through projects, payment plans and timelines over WhatsApp or a call, so you can research and shortlist before you ever travel.",
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
      "Developers across India and the UAE, including Mumbai, Bangalore, Hyderabad, Pune, Gurugram, Thane, Navi Mumbai, Dubai and Abu Dhabi.",
  },
  {
    question: "What should I check before I buy a property?",
    answer:
      "Developers sell new and off-plan homes through their own sales teams. Before you pay anything, make sure you are dealing with the genuine developer, check the project with the real estate regulator for its location, and get prices and terms in writing. You can request a connection from a developer's page, and our advisory team will help with your enquiry. Our research guide walks through every step.",
  },
  {
    question: "How do I avoid fake developer websites?",
    answer:
      "Don't rely on search ads or links sent to you. Reach developers through a channel you trust, such as our advisory team, and check the project with the real estate regulator for its location before you pay anything.",
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
                Read the guide: how to research a developer before you buy →
              </Link>
            </p>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
