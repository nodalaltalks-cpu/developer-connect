import type { Listing, SourceId } from "./types.ts";

/**
 * SYNTHETIC DEMONSTRATION DATA: NOT LIVE PROPERTY INVENTORY. Every building, unit, price and permit number below is made up by a
 * seeded generator, so the same records appear every time. The URLs are placeholders that are never opened. Replace this with an
 * authorised feed to go live; nothing else depends on how it is made.
 */
export const DEMO_LABEL = "DEMO DATA — NOT LIVE PROPERTY INVENTORY";
export const DEMO_REFERENCE_TIME = "2026-11-20T09:00:00.000Z";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Building {
  name: string;
  community: string;
  floors: number;
  /** Typical price per square foot in AED, for sale. */
  psf: number;
  completion: "ready" | "off-plan";
}

const BUILDINGS: Building[] = [
  { name: "Aurora Residences (sample)", community: "Jumeirah Village Circle", floors: 14, psf: 1120, completion: "ready" },
  { name: "Palm Court Tower (sample)", community: "Jumeirah Village Circle", floors: 20, psf: 1240, completion: "ready" },
  { name: "Garden Heights (sample)", community: "Jumeirah Village Circle", floors: 9, psf: 980, completion: "ready" },
  { name: "Circle Square (sample)", community: "Jumeirah Village Circle", floors: 12, psf: 1060, completion: "ready" },
  { name: "Lakeview Gate (sample)", community: "Jumeirah Village Circle", floors: 16, psf: 1180, completion: "ready" },
  { name: "Horizon Vista (sample)", community: "Jumeirah Village Circle", floors: 22, psf: 1300, completion: "off-plan" },
  { name: "Marina Sample Residence", community: "Dubai Marina", floors: 30, psf: 1900, completion: "ready" },
  { name: "Downtown Sample Place", community: "Downtown Dubai", floors: 40, psf: 2600, completion: "ready" },
];

const LAYOUTS = [
  { beds: 0, area: [340, 420] },
  { beds: 1, area: [640, 820] },
  { beds: 2, area: [1050, 1320] },
  { beds: 3, area: [1500, 1800] },
] as const;

const SOURCE_IDS: SourceId[] = ["sample-portal-a", "sample-portal-b", "sample-portal-c", "sample-agency"];

function iso(base: string, minusDays: number, minusHours = 0): string {
  return new Date(new Date(base).getTime() - minusDays * 86_400_000 - minusHours * 3_600_000).toISOString();
}

/** Which made-up physical unit each record advertises. Used only by tests to check duplicate detection; the app never reads it. */
export const DEMO_UNIT_TRUTH: Record<string, string> = {};

function build(): Listing[] {
  const rand = rng(20261120);
  const out: Listing[] = [];
  let n = 0;
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];

  for (const b of BUILDINGS) {
    const physicalUnits = b.community === "Jumeirah Village Circle" ? 7 : 2;
    for (let u = 0; u < physicalUnits; u++) {
      const layout = LAYOUTS[(u + b.floors) % LAYOUTS.length];
      const area = Math.round(layout.area[0] + rand() * (layout.area[1] - layout.area[0]));
      const floor = 1 + Math.floor(rand() * b.floors);
      const unit = `${floor}${String(1 + Math.floor(rand() * 9)).padStart(2, "0")}`;
      const price = Math.round((area * b.psf * (0.94 + rand() * 0.12)) / 5000) * 5000;
      const rent = rand() < 0.2;
      const baths = layout.beds === 0 ? 1 : Math.min(layout.beds + (rand() < 0.4 ? 1 : 0), 4);
      const furnished = rand() < 0.35 ? true : rand() < 0.5 ? false : null;
      const adCount = rand() < 0.45 ? 1 : 2 + Math.floor(rand() * 3);
      const used = new Set<SourceId>();
      for (let k = 0; k < adCount; k++) {
        let source = pick(SOURCE_IDS);
        while (used.has(source)) source = pick(SOURCE_IDS);
        used.add(source);
        n++;
        DEMO_UNIT_TRUTH[`demo-${String(n).padStart(3, "0")}`] = `${b.name}#${u}`;
        const showUnit = rand() < 0.5;
        const showFloor = showUnit || rand() < 0.7;
        const askVariance = 1 + (rand() - 0.5) * 0.07;
        const areaVariance = 1 + (rand() - 0.5) * 0.012;
        const unitPrice = rent ? Math.round((price * 0.065) / 1000) * 1000 : price;
        out.push({
          id: `demo-${String(n).padStart(3, "0")}`,
          source,
          title: `${layout.beds === 0 ? "Studio" : `${layout.beds}-bedroom`} apartment in ${b.name}`,
          community: b.community,
          building: b.name,
          unit: showUnit ? unit : null,
          floor: showFloor ? floor : null,
          purpose: rent ? "rent" : "buy",
          propertyType: "apartment",
          bedrooms: layout.beds,
          bathrooms: baths,
          areaSqft: Math.round(area * areaVariance),
          priceAed: Math.round((unitPrice * askVariance) / 1000) * 1000,
          completion: b.completion,
          furnished,
          url: `https://example.invalid/demo/${source}/${n}`,
          permitNumber: rand() < 0.6 ? `DEMO-${100000 + Math.floor(rand() * 899999)}` : null,
          discoveredAt: iso(DEMO_REFERENCE_TIME, 5 + Math.floor(rand() * 40)),
          lastCheckedAt: iso(DEMO_REFERENCE_TIME, Math.floor(rand() * 9), Math.floor(rand() * 20)),
          availabilityNote: rand() < 0.25 ? "Advertiser says available" : null,
          isDemo: true,
        });
      }
    }
  }
  return out;
}

export const DEMO_LISTINGS: readonly Listing[] = build();
