import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MARKET, HERO_CUTS, HERO_STILLS, MARKETS, cutFor, isMarket, marketFromParams } from "../hero-market.ts";
import { CTA_IDS } from "../behaviour/events.ts";

/** The homepage hero shows a city film: Dubai by default, Mumbai when the visitor (or the address) chooses it. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

test("default: a first-time visitor with nothing in the address sees Dubai", () => {
  assert.equal(DEFAULT_MARKET, "dubai");
  assert.equal(marketFromParams({}), null, "no signal means the provider falls back to the default");
  assert.deepEqual([...MARKETS], ["dubai", "mumbai"]);
});

test("address: ?market= and location filters pick the city; anything else says nothing", () => {
  assert.equal(marketFromParams({ market: "mumbai" }), "mumbai");
  assert.equal(marketFromParams({ market: "  DUBAI " }), "dubai");
  assert.equal(marketFromParams({ market: "paris" }), null, "an unknown market is ignored, never trusted");
  assert.equal(marketFromParams({ country: "India", city: "Mumbai" }), "mumbai");
  assert.equal(marketFromParams({ country: "India", city: "Navi Mumbai" }), "mumbai");
  assert.equal(marketFromParams({ country: "India", city: "Thane" }), "mumbai");
  assert.equal(marketFromParams({ country: "United Arab Emirates", city: "Dubai" }), "dubai");
  assert.equal(marketFromParams({ country: "United Arab Emirates" }), "dubai");
  assert.equal(marketFromParams({ country: "India", city: "Pune" }), null, "other Indian cities do not claim the Mumbai film");
  assert.equal(marketFromParams({ market: "dubai", city: "Mumbai" }), "dubai", "an explicit market wins over a filter");
  assert.ok(isMarket("dubai") && isMarket("mumbai") && !isMarket("x") && !isMarket(null));
});

test("assets: every film cut and still the player can request exists and is a sensible size", () => {
  const limits: Record<string, [number, number]> = { "tall-1080": [1, 10], "wide-720": [0.5, 4], "wide-1080": [1.5, 10], "wide-1440": [3, 14], "wide-2160": [6, 24] };
  for (const market of MARKETS) {
    for (const cut of HERO_CUTS) {
      const file = path.join(root, "public", "video", `${market}-${cut}.mp4`);
      assert.ok(existsSync(file), `${market}-${cut}.mp4 is missing`);
      const mb = statSync(file).size / 1048576;
      const [min, max] = limits[cut];
      assert.ok(mb > min && mb < max, `${market}-${cut}.mp4 is ${mb.toFixed(1)} MB`);
    }
    for (const still of HERO_STILLS) {
      const file = path.join(root, "public", "video", `${market}-${still}`);
      assert.ok(existsSync(file), `${market}-${still} is missing`);
      assert.ok(statSync(file).size < 900 * 1024, `${market}-${still} is too heavy for a first paint`);
    }
  }
  const player = read("src/components/hero-video.tsx");
  assert.match(player, /\/video\/\$\{market\}-\$\{cutFor\(/);
  assert.match(player, /-still-1920\.jpg/, "a still is painted with the page, so the skyline never waits for the film");
});

test("cuts: phones get the portrait cut, slow links the light cut, and only 4K screens on a fast link the 4K cut", () => {
  assert.equal(cutFor({ portrait: true, pixelWidth: 1170 }, { downlink: 10 }), "tall-1080");
  assert.equal(cutFor({ portrait: false, pixelWidth: 3840 }, { downlink: 0.6 }), "wide-720");
  assert.equal(cutFor({ portrait: false, pixelWidth: 3840 }, { downlink: 10 }), "wide-2160");
  assert.equal(cutFor({ portrait: false, pixelWidth: 3840 }, undefined), "wide-2160", "browsers without the API are treated as fast");
  assert.equal(cutFor({ portrait: false, pixelWidth: 3840 }, { downlink: 7 }), "wide-1440");
  assert.equal(cutFor({ portrait: false, pixelWidth: 3840 }, { downlink: 5 }), "wide-1080");
  assert.equal(cutFor({ portrait: false, pixelWidth: 2560 }, { downlink: 10 }), "wide-1440");
  assert.equal(cutFor({ portrait: false, pixelWidth: 1920 }, { downlink: 10 }), "wide-1080");
});

test("player: polite loading rules are all in place", () => {
  const player = read("src/components/hero-video.tsx");
  assert.match(player, /prefers-reduced-motion: reduce/);
  assert.match(player, /saveData/);
  assert.match(player, /slow-2g\|2g\|3g/);
  assert.match(player, /preload="none"/);
  assert.match(player, /muted/);
  assert.match(player, /playsInline/);
  assert.match(player, /aria-hidden="true"/);
  assert.match(player, /IntersectionObserver/);
  assert.match(player, /visibilitychange/);
  assert.match(player, /onPlaying=/, "a film is only shown once it is really playing, so the cross-fade never flashes black");
  assert.doesNotMatch(player, /requestIdleCallback/, "idle callbacks may never run in a background tab");
});

test("toggle: accessible, touch-sized, tracked, and remembers the choice only in the visitor's own browser", () => {
  const toggle = read("src/components/hero-market.tsx");
  assert.match(toggle, /role="radiogroup"/);
  assert.match(toggle, /role="radio"/);
  assert.match(toggle, /aria-checked=\{active\}/);
  assert.match(toggle, /min-h-11/);
  assert.match(toggle, /data-cta=\{m === "dubai" \? "hero_market_dubai" : "hero_market_mumbai"\}/);
  assert.match(toggle, /localStorage/);
  assert.match(toggle, /try \{/, "storage access is always guarded");
  for (const id of ["hero_market_dubai", "hero_market_mumbai"]) assert.ok((CTA_IDS as readonly string[]).includes(id), `${id} must be an allowed tracked button`);
});

test("homepage: the hero is wrapped in the provider, shows the toggle, and takes its city from the address", () => {
  const home = read("src/app/(marketing)/page.tsx");
  assert.match(home, /marketFromParams\(\{\s*market: firstValue\(params\.market\)/);
  assert.match(home, /<HeroMarketProvider fromAddress=\{heroMarket\}>/);
  assert.match(home, /<HeroMarketToggle \/>/);
  assert.match(home, /<HeroVideo \/>/);
});
