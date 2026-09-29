import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "FAQ | Developer Connects",
  description: "Answers to common questions about how Developer Connects works.",
  alternates: { canonical: "/faq" },
};

const FAQS: { question: string; answer: string }[] = [
  {
    question: "What is Developer Connects?",
    answer:
      "A directory of real-estate developers that helps you find a developer's genuine official website and go straight to it — no brokers, no lead forms.",
  },
  {
    question: "Is Developer Connects a broker?",
    answer:
      "No. We don't sell properties, negotiate on anyone's behalf, or take a commission. We only help you find the developer's own website.",
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
    question: "Does Developer Connects sell properties?",
    answer: "No. We don't sell, list for sale, or broker any property. We link to developers' own websites.",
  },
  {
    question: "Do I need to provide my phone number?",
    answer:
      "No. You can search and visit a developer's official website without giving us your phone number.",
  },
  {
    question: "How do I visit the developer's official website?",
    answer:
      "Open a developer's page and use the “Visit official website” button — it opens their real site directly in a new tab.",
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
    answer: "Covering verified developers across India and the UAE, including Mumbai and Dubai.",
  },
];

export default function FaqPage() {
  return (
    <div className="flex flex-1 flex-col">
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
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
