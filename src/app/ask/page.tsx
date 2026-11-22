import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb, GENERAL_INFO_NOTE } from "@/components/seo/article-parts";
import { AskChat } from "@/components/ask/ask-chat";
import { SHARE_IMAGES } from "@/lib/share-image";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

const PATH = "/ask";
const TITLE = "Ask Developer Connects: Property Questions for India and Dubai";
const DESCRIPTION =
  "Ask how buying a home works in Mumbai, India or Dubai. Every answer comes from our own guides and shows the passage it is based on, and when we do not know, it says so.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

export default function AskPage() {
  const schema = [breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Ask Developer Connects", path: PATH }])];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-3xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Ask Developer Connects" }]} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-brass-700">Property questions answered</p>
            <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.015em] text-foreground sm:text-5xl">Ask Developer Connects</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              A research assistant for buyers in Mumbai, India and Dubai. It answers only from our own guides, shows you the exact passage behind every answer, and tells you when it does not know.
            </p>

            <AskChat />

            <div className="mt-14 grid gap-8 sm:grid-cols-3">
              <div>
                <h2 className="font-serif text-xl font-medium text-foreground">Sourced</h2>
                <p className="mt-2 text-sm leading-6 text-foreground/80">Each answer points to the guide and the words it came from, with the date the facts were last checked, so you can read the source yourself.</p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-medium text-foreground">Honest about limits</h2>
                <p className="mt-2 text-sm leading-6 text-foreground/80">It does not guess. If our guides do not cover a question, it says so instead of making something up, and it will not rank developers or predict prices.</p>
              </div>
              <div>
                <h2 className="font-serif text-xl font-medium text-foreground">India and Dubai, kept apart</h2>
                <p className="mt-2 text-sm leading-6 text-foreground/80">Different regulators, different rules, different currencies. It never mixes them up.</p>
              </div>
            </div>

            <AdviceCta heading="Want a person to look at your situation?" />
            <p className="mt-10 text-xs leading-5 text-muted-foreground">{GENERAL_INFO_NOTE}</p>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
