import type { Listing } from "./types.ts";
import { sourceName } from "./sources.ts";

/**
 * What we can honestly say about an advertisement. Every indicator says exactly what was checked. There is no "verified" state here:
 * nothing in this build can check a permit, ownership or availability, so those say "not checked".
 */
export interface TrustIndicator {
  key: "source" | "freshness" | "permit" | "madmoun" | "availability" | "price-gap";
  label: string;
  state: "info" | "unknown";
  explain: string;
}

export function ageLabel(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function trustIndicators(listing: Listing, now: Date): TrustIndicator[] {
  const list: TrustIndicator[] = [];
  list.push({
    key: "source",
    label: `Advertised on ${sourceName(listing.source, listing.sourceLabel)}`,
    state: "info",
    explain: listing.isDemo
      ? "This is made-up demonstration data. There is no real advertisement behind it."
      : "This advertisement belongs to the source named. Developer Connects does not own, sell or represent it.",
  });
  list.push({
    key: "freshness",
    label: `Last recorded ${ageLabel(listing.lastCheckedAt, now)}`,
    state: "info",
    explain: "This is when we last recorded the advertisement. It does not confirm the property is still available or the price unchanged.",
  });
  list.push({
    key: "permit",
    label: listing.permitNumber ? "Permit number shown by the advertiser (not checked by us)" : "No permit number shown",
    state: listing.permitNumber ? "info" : "unknown",
    explain: listing.permitNumber
      ? `The advertiser printed permit number ${listing.permitNumber}. We have not checked it with the Dubai authorities. A valid permit does not guarantee the property is available, that the seller owns it, or that its title is clear.`
      : "No advertising permit number was provided with this advertisement. Ask the advertiser for it.",
  });
  list.push({
    key: "madmoun",
    label: "Madmoun QR: not checked",
    state: "unknown",
    explain: "Madmoun QR verification is not available through a free, permitted route in this build. If the advertiser shows a Madmoun QR code, check it on the official service yourself.",
  });
  list.push({
    key: "availability",
    label: listing.availabilityNote ? `Advertiser says: ${listing.availabilityNote.replace(/^Advertiser says\s*/i, "")}` : "Availability: not confirmed",
    state: listing.availabilityNote ? "info" : "unknown",
    explain: "Availability is whatever the advertiser states. We have not confirmed it. Ask the advertiser before you plan a visit.",
  });
  return list;
}
