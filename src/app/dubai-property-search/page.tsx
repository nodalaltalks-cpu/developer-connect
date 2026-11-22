import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DubaiSearchApp } from "@/features/dubai-search/components/dubai-search-app";
import { dubaiSearchEnabled } from "@/features/dubai-search/flag";

/**
 * Dubai Property Search (experiment). Removable in one step: see docs/dubai-property-search.md. It answers 404 unless
 * DUBAI_SEARCH_ENABLED=true, and while it is an experiment it is kept out of search engines.
 */
export const metadata: Metadata = {
  title: "Dubai Property Search (experiment)",
  description: "Search once, compare the same Dubai property across sources, then open the original advertisement. Free for everyone.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/dubai-property-search" },
};

export default function DubaiPropertySearchPage() {
  if (!dubaiSearchEnabled()) notFound();
  return <DubaiSearchApp />;
}
