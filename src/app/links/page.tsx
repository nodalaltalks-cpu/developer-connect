import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
    <div className="dc-grain min-h-dvh bg-ink text-pearl">
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 py-10">
      <Image src="/founder/ambish-singh-avatar.jpg" alt="Ambish Singh" width={96} height={96} priority className="size-24 rounded-full border-2 border-brass-300/70 object-cover" />
      <h1 className="mt-5 text-center font-serif text-3xl font-medium tracking-tight text-white">Developer Connects</h1>
      <p className="mt-1 text-center text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">Mumbai &middot; Dubai</p>
      <p className="mt-3 text-center text-sm leading-6 text-pearl">Know before you buy. Tap what you are looking for and Ambish will call you back.</p>

      <Link
        href="/enquire?utm_source=links&utm_medium=bio"
        className="mt-8 flex min-h-14 w-full items-center justify-center rounded-sm bg-gold px-5 text-center text-base font-bold text-ink hover:bg-brass-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Tap your requirements: takes 60 seconds
      </Link>

      <ul className="mt-4 w-full space-y-3">
        {links.map((link) => (
          <li key={link.key}>
            <TrackedLink
              linkKey={link.key}
              href={link.url!}
              className={`flex min-h-14 w-full flex-col items-center justify-center rounded-sm border px-5 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${link.key === "whatsapp" ? "border-whatsapp bg-whatsapp text-white hover:bg-whatsapp-hover" : "border-white/25 bg-white/5 text-white hover:bg-white/10"}`}
            >
              <span className="text-base font-semibold">{link.label}</span>
              <span className={`text-xs ${link.key === "whatsapp" ? "text-white" : "text-pearl"}`}>{link.description}</span>
            </TrackedLink>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-xs text-pearl">
        Business enquiries: <a href={`mailto:${BUSINESS_EMAIL}`} className="font-medium text-brass-300 hover:underline">{BUSINESS_EMAIL}</a>
      </p>
    </main>
    </div>
  );
}
