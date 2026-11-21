import type { Guide } from "./types.ts";

/**
 * Which directory city a neighbourhood guide's "developers in this city" block draws from.
 *
 * Only guides whose area truly sits inside an approved directory city get a block: Mira Road and Vasai are in the Mumbai
 * region but are not Mumbai (or any approved city), so they get none rather than a misleading list.
 */
const NAVI_MUMBAI_AREAS = ["kharghar", "vashi", "ulwe"];
const THANE_AREAS = ["thane"];
const NOT_AN_APPROVED_CITY = ["mira-road", "vasai"];

export interface GuideCity {
  country: string;
  city: string;
}

export function directoryCityForGuide(guide: Pick<Guide, "slug" | "area" | "market">): GuideCity | null {
  if (!guide.area) return null;
  if (guide.market === "dubai") return { country: "United Arab Emirates", city: "Dubai" };
  if (guide.market !== "mumbai") return null;
  const slug = guide.slug;
  if (NOT_AN_APPROVED_CITY.some((a) => slug.includes(a))) return null;
  if (NAVI_MUMBAI_AREAS.some((a) => slug.includes(a))) return { country: "India", city: "Navi Mumbai" };
  if (THANE_AREAS.some((a) => slug.includes(a))) return { country: "India", city: "Thane" };
  return { country: "India", city: "Mumbai" };
}

/** A stable offset into a city's alphabetical list, so different guides link to different developers instead of all linking to the same first few. */
export function spreadOffset(seed: string, total: number, size: number): number {
  const room = Math.max(0, total - size);
  if (room === 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % (room + 1);
}
