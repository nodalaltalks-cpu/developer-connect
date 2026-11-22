import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DubaiSearchPromo } from "@/features/dubai-search/components/promo";
import { SiteHeader } from "@/components/site-header";
import { DubaiSearchMobileStrip } from "@/features/dubai-search/components/nav-link";
import { dubaiSearchEnabled } from "@/features/dubai-search/flag";

/** Review aid only: shows the real site header (with the new link) and the homepage section on their own, without loading the real homepage and its database. Removed with the rest of the experiment. */
export const metadata: Metadata = { title: "Dubai Property Search: homepage preview", robots: { index: false, follow: false } };

export default function PromoPreview() {
  if (!dubaiSearchEnabled()) notFound();
  return (
    <main className="min-h-dvh bg-white">
      <SiteHeader />
      <DubaiSearchMobileStrip />
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-neutral-500">(existing homepage sections appear above)</div>
      <DubaiSearchPromo />
    </main>
  );
}
