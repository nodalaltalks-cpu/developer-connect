import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AdviceCta, Breadcrumb } from "@/components/seo/article-parts";
import { SHARE_IMAGES } from "@/lib/share-image";
import { CONSULTANT_PAGES, CONSULTANT_PATH, consultantPath } from "@/lib/seo/consultant-pages";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";

const TITLE = "Property Consultant in Mumbai, Thane and Dubai | Developer Connects";
const DESCRIPTION =
  "Developer Connects is a property research and advisory firm led by Ambish Singh, for buyers in Mumbai, Thane and Dubai. 0% commission on new launches.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CONSULTANT_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CONSULTANT_PATH, siteName: "Developer Connects", images: SHARE_IMAGES, type: "website" },
  twitter: { card: "summary_large_image", images: SHARE_IMAGES, title: TITLE, description: DESCRIPTION },
};

export default function ConsultantIndexPage() {
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Property consultant", path: CONSULTANT_PATH },
    ]),
  ];
  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-3xl">
            <Breadcrumb items={[{ name: "Home", href: "/" }, { name: "Property consultant" }]} />
            <h1 className="mt-4 text-balance font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">Property consultant for Mumbai and Dubai</h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Developer Connects helps buyers research before they commit: a short list that fits your brief, the regulator checks explained, and someone beside you on the site visit. Led by Ambish Singh, with 0% commission charged on new launches.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {CONSULTANT_PAGES.filter((page) => page.inHub !== false).map((page) => (
                <li key={page.slug}>
                  <Link href={consultantPath(page)} className="block h-full rounded-xl border border-border bg-white p-6 hover:border-gold">
                    <span className="font-serif text-2xl font-medium text-foreground">{page.name}</span>
                    <span className="mt-2 block text-sm leading-6 text-muted-foreground">{page.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <AdviceCta heading="Not sure where to start?" />
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
