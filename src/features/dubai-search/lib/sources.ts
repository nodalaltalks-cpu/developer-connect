import type { SourceId, SourceInfo } from "./types.ts";

/** Sources that exist in this build. The sample ones are made up: they stand in for real portals so the whole flow can be tried. */
export const SOURCES: readonly SourceInfo[] = [
  { id: "sample-portal-a", name: "Sample Portal A", kind: "demo", description: "Made-up demonstration source." },
  { id: "sample-portal-b", name: "Sample Portal B", kind: "demo", description: "Made-up demonstration source." },
  { id: "sample-portal-c", name: "Sample Portal C", kind: "demo", description: "Made-up demonstration source." },
  { id: "sample-agency", name: "Sample Agency Site", kind: "demo", description: "Made-up demonstration source." },
  { id: "user-url", name: "Links you added", kind: "user", description: "Advertisements you added yourself. Stored only in this browser." },
  { id: "user-csv", name: "Your CSV import", kind: "user", description: "Listings you imported from a file you are allowed to use. Stored only in this browser." },
];

export function sourceName(id: SourceId, label?: string): string {
  return label ?? SOURCES.find((s) => s.id === id)?.name ?? id;
}

/**
 * Real websites considered for the future. NONE is integrated or tested in this build, and the page says so. Their terms were not
 * reviewed in full: before any automated collection, read each site's own terms and ask for permission or a feed.
 */
export interface PlannedSource {
  name: string;
  status: "not integrated";
  note: string;
}

export const PLANNED_SOURCES: readonly PlannedSource[] = [
  { name: "Bayut", status: "not integrated", note: "No free public listing feed found. Agencies use partner access. Automated collection needs the portal's permission; its terms were not reviewed here." },
  { name: "Property Finder", status: "not integrated", note: "API access is covered by separate API Access Terms for its customers. No free public feed found." },
  { name: "dubizzle", status: "not integrated", note: "No free public listing feed or API policy found." },
  { name: "Houza and PropSearch", status: "not integrated", note: "Not investigated beyond noting that no free feed was found." },
  { name: "Agency and developer websites", status: "not integrated", note: "The realistic route: a feed or CSV an agency chooses to share. The CSV import in this build is the place to test it." },
  { name: "Dubai Land Department open data (Dubai Pulse)", status: "not integrated", note: "Official transaction data, free to register for. It describes past sales, not advertisements, so it could later support price context. Licence terms not reviewed here." },
];
