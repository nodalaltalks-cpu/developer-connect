import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { TrackedLink } from "@/components/social/tracked-link";
import { BUSINESS_EMAIL, SOCIAL_LINKS } from "@/lib/social/links";

export const metadata: Metadata = {
  title: "Developer Connects | Links",
  description: "Developer Connects on Instagram, Facebook, LinkedIn and WhatsApp, and a one-minute tap-to-select enquiry form.",
  alternates: { canonical: "/links" },
};

/**
 * The one address for every bio (Instagram, Facebook, LinkedIn): the enquiry form first, then each social account and WhatsApp as
 * its own link. Every tap is counted so the Founder can see which platform sends people who act. A link whose account does not exist
 * yet is not shown.
 */
export default function LinksPage() {
  const links = SOCIAL_LINKS.filter((l) => l.url);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 py-10">
      <Logo />
      <h1 className="mt-6 text-center font-serif text-3xl font-medium tracking-tight text-foreground">Developer Connects</h1>
      <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">Property advisory for Mumbai and Dubai. Tap what you are looking for and we will call you back.</p>

      <Link
        href="/enquire?utm_source=links&utm_medium=bio"
        className="mt-8 flex min-h-14 w-full items-center justify-center rounded-xl bg-accent px-5 text-center text-base font-bold text-accent-foreground shadow-md hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Tap your requirements: takes 60 seconds
      </Link>

      <ul className="mt-4 w-full space-y-3">
        {links.map((link) => (
          <li key={link.key}>
            <TrackedLink
              linkKey={link.key}
              href={link.url!}
              className={`flex min-h-14 w-full flex-col items-center justify-center rounded-xl border px-5 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${link.key === "whatsapp" ? "border-green-600 bg-green-600 text-white hover:bg-green-700" : "border-border bg-background text-foreground hover:bg-muted"}`}
            >
              <span className="text-base font-semibold">{link.label}</span>
              <span className={`text-xs ${link.key === "whatsapp" ? "text-white/90" : "text-muted-foreground"}`}>{link.description}</span>
            </TrackedLink>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Business enquiries: <a href={`mailto:${BUSINESS_EMAIL}`} className="font-medium text-accent-hover hover:underline">{BUSINESS_EMAIL}</a>
      </p>
    </main>
  );
}
