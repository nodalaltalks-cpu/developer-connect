import { test } from "node:test";
import assert from "node:assert/strict";
import { directoryCityForGuide, spreadOffset } from "../guide-developers.ts";
import { GUIDES } from "../guides.ts";

const g = (slug: string, market: "mumbai" | "dubai" | "both", area?: string) => ({ slug, market, area });

test("neighbourhood guides map to the directory city they sit in", () => {
  assert.deepEqual(directoryCityForGuide(g("buying-property-in-bandra", "mumbai", "Bandra")), { country: "India", city: "Mumbai" });
  assert.deepEqual(directoryCityForGuide(g("buying-property-in-kharghar", "mumbai", "Kharghar")), { country: "India", city: "Navi Mumbai" });
  assert.deepEqual(directoryCityForGuide(g("buying-property-in-majiwada-thane", "mumbai", "Majiwada")), { country: "India", city: "Thane" });
  assert.deepEqual(directoryCityForGuide(g("buying-property-in-business-bay-dubai", "dubai", "Business Bay")), { country: "United Arab Emirates", city: "Dubai" });
});

test("areas outside any approved city, and non-area guides, get no block", () => {
  assert.equal(directoryCityForGuide(g("buying-property-in-mira-road", "mumbai", "Mira Road")), null);
  assert.equal(directoryCityForGuide(g("buying-property-in-vasai", "mumbai", "Vasai")), null);
  assert.equal(directoryCityForGuide(g("how-to-buy-a-flat-in-mumbai", "mumbai")), null);
  assert.equal(directoryCityForGuide(g("some-guide", "both", "X")), null);
});

test("every real guide maps to either null or one of the approved cities", () => {
  const allowed = new Set(["Mumbai", "Navi Mumbai", "Thane", "Dubai"]);
  for (const guide of GUIDES) {
    const result = directoryCityForGuide(guide);
    if (result) assert.ok(allowed.has(result.city), `${guide.slug} -> ${result.city}`);
  }
});

test("spreadOffset is stable, in range, and differs between guides", () => {
  assert.equal(spreadOffset("a", 5, 10), 0);
  const total = 200;
  const seen = new Set<number>();
  for (const seed of ["bandra", "worli", "malad", "borivali", "chembur", "mulund"]) {
    const offset = spreadOffset(seed, total, 10);
    assert.ok(offset >= 0 && offset <= total - 10);
    assert.equal(offset, spreadOffset(seed, total, 10));
    seen.add(offset);
  }
  assert.ok(seen.size > 3);
});
