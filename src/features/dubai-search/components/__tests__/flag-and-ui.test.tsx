import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DubaiSearchMobileStrip, DubaiSearchNavLink } from "../nav-link.tsx";
import { DubaiSearchPromo } from "../promo.tsx";
import { SourcesPanel } from "../sources-panel.tsx";
import { GroupCard } from "../group-card.tsx";
import { CompareView } from "../compare-view.tsx";
import { DEMO_LISTINGS, DEMO_REFERENCE_TIME } from "../../lib/demo-data.ts";
import { groupListings } from "../../lib/duplicates.ts";

/** Run with `node --import tsx --test` (the components are TSX). */
function withFlag<T>(value: string | undefined, fn: () => T): T {
  const before = process.env.DUBAI_SEARCH_ENABLED;
  if (value === undefined) delete process.env.DUBAI_SEARCH_ENABLED;
  else process.env.DUBAI_SEARCH_ENABLED = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.DUBAI_SEARCH_ENABLED;
    else process.env.DUBAI_SEARCH_ENABLED = before;
  }
}

test("flag off: the header link, the phone strip and the homepage section render nothing at all", () => {
  withFlag(undefined, () => {
    assert.equal(renderToStaticMarkup(<DubaiSearchNavLink />), "");
    assert.equal(renderToStaticMarkup(<DubaiSearchMobileStrip />), "");
    assert.equal(renderToStaticMarkup(<DubaiSearchPromo />), "");
  });
  withFlag("false", () => assert.equal(renderToStaticMarkup(<DubaiSearchPromo />), ""));
});

test("flag on: the link, the strip and the section appear, point at the new route and carry the agreed copy", () => {
  withFlag("true", () => {
    const nav = renderToStaticMarkup(<DubaiSearchNavLink />);
    assert.match(nav, /href="\/dubai-property-search"/);
    assert.match(nav, /Dubai Property Search/);
    assert.match(nav, /NEW/);
    assert.match(nav, /lg:inline-flex/, "header link only on large screens, so the logo is never squeezed");
    assert.match(renderToStaticMarkup(<DubaiSearchMobileStrip />), /lg:hidden/);
    const promo = renderToStaticMarkup(<DubaiSearchPromo />);
    assert.match(promo, /Searching for property in Dubai\?/);
    assert.match(promo, /Discover and compare property advertisements across multiple real estate platforms, all from one search\./);
    assert.match(promo, /Search Dubai Properties/);
  });
});

test("the experiment never offers payment, subscriptions or ranking for money anywhere in what it renders", () => {
  const groups = groupListings(DEMO_LISTINGS.filter((l) => l.purpose === "buy")).slice(0, 5);
  const html = [
    renderToStaticMarkup(<SourcesPanel />),
    ...groups.map((g) =>
      renderToStaticMarkup(<GroupCard group={g} now={new Date(DEMO_REFERENCE_TIME)} saved={[]} compare={[]} onToggleSave={() => {}} onToggleCompare={() => {}} onOpenOriginal={() => {}} onViewed={() => {}} />),
    ),
    renderToStaticMarkup(<CompareView listings={DEMO_LISTINGS.slice(0, 2) as never} onClose={() => {}} onRemove={() => {}} onOpenOriginal={() => {}} />),
  ].join(" ");
  assert.doesNotMatch(html, /subscribe|premium|upgrade|checkout|sponsored|promoted|featured listing|pay now/i);
  assert.doesNotMatch(html, /\bverified\b/i, "no verification badge appears anywhere");
});

test("the sources panel says no real website is integrated", () => {
  const html = renderToStaticMarkup(<SourcesPanel />);
  assert.match(html, /No real property website is integrated or tested yet/);
  assert.match(html, /not integrated/);
});

test("a grouped card shows each source's own price, the price gap, the match explanation and the confirm-with-advertiser warning", () => {
  const group = groupListings(DEMO_LISTINGS.filter((l) => l.purpose === "buy")).find((g) => g.members.length >= 2 && g.minPrice !== g.maxPrice)!;
  const html = renderToStaticMarkup(
    <GroupCard group={group} now={new Date(DEMO_REFERENCE_TIME)} saved={[]} compare={[]} onToggleSave={() => {}} onToggleCompare={() => {}} onOpenOriginal={() => {}} onViewed={() => {}} />,
  );
  assert.match(html, /apart \(/);
  assert.match(html, /Always confirm the actual unit, the price and that it is still available/);
  assert.match(html, /View original/);
  assert.match(html, /Sample (Portal|Agency)/);
});
