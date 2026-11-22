# Dubai Property Search

A permanent section of developerconnects.com at `/dubai-property-search`: search Dubai property once and open the same search on Bayut, Property Finder and dubizzle, then compare. Built to be found by people who are already searching for Dubai property.

## How it works

1. **Search once.** Pick an area (116 Dubai areas: every area Bayut and Property Finder list for Dubai), buy or rent, type (apartments, plus villas and townhouses where the area has them) and bedrooms (studio to 3).
2. **Open every website.** Each button opens that portal's own live results page for the same search, in a new tab. Nothing is fetched, copied or stored, so the buyer always sees the portal's current listings and we never republish anyone's content.
3. **Compare and check.** The comparison tool at `/dubai-property-search/compare` takes listings the buyer found (a link plus typed details, or a CSV they are allowed to use), tells them whether any look like the same flat, shows the price gap, and carries a checklist. Everything stays in the browser.

## Why there are no fake listings

There is no free, permitted listing feed from the portals, and we do not scrape. Showing made-up listings on a public, indexed site would mislead buyers and search engines, so the live pages contain none. The generated sample listings (`lib/demo-data.ts`) appear only if a visitor presses "Try it with sample listings" inside the comparison tool, under a banner reading "DEMO DATA — NOT LIVE PROPERTY INVENTORY".

## Pages (all server-rendered, no database)

| Address | Purpose |
|---|---|
| `/dubai-property-search` | Section home: the search, how it works, areas, comparison tool, guides, FAQ. |
| `/dubai-property-search/{area}` | One page per area (116). |
| `/dubai-property-search/{area}/{intent}` | One page per thing people search for, such as `apartments-for-rent`, `villas-for-sale`, and for described areas `2-bedroom-apartments-for-sale` (806 routes in all). |
| `/dubai-property-search/compare` | The comparison tool. |

Each page has its own introduction, a plain checklist, FAQs, breadcrumbs, canonical, JSON-LD (BreadcrumbList and FAQPage only: no Product or Offer markup, since we sell nothing), links to our Dubai guides, and clear independence wording. The sitemap and `llms.txt` list the section, and the footer and header link to it. No page uses a price, yield, ranking or prediction.

### Which pages search engines are offered (279 in the sitemap)

An area is offered to search engines only if it has a written description (63 of the 116 do). For those: the area page, its apartments / villas / townhouses pages, and the single-bedroom-count pages for the four most-searched areas (JVC, Dubai Marina, Downtown Dubai, Business Bay). Areas without a description work for visitors and keep only their main pages, marked `noindex,follow`. To bring an area in, write its two-sentence description in `lib/communities.ts` (plain facts only; a test rejects numbers, rankings and predictions). After a few weeks of Search Console data, prune or widen with `indexBedroomPages`.

### Where the 116 areas come from

The area lists the two portals publish on their own Dubai pages (read 2026-11-22), joined by name: 82 areas are on both, 22 on Bayut only and 12 on Property Finder only. An area shows a button only for the portals that list it. Villa and townhouse pages exist only where Bayut showed at least 30 of them and Property Finder has the page (22 areas for villas, 13 for townhouses). A few areas may have more villas than the scan counted (the count could not be read for some pages), so those were left out rather than guessed.

## Where the portal links come from

`lib/portals.ts`. On 2026-11-22 each Bayut and Property Finder address pattern and every area slug was checked by opening the real page (a made-up place did not work on either site, so a working slug means the portal recognised it). dubizzle blocked page loading in the verification browser, so no location link could be verified: its button opens the Dubai apartments page (or the general property page for villas and townhouses) and the buyer picks the area there. If a portal changes an address, only that file and its test need updating. Developer Connects is not affiliated with any portal and earns nothing from clicks.

## Free, with nothing to pay for

No payments, subscriptions, sponsored or paid-ranked results, commissions, or monetisation anywhere in the section. A test fails if payment, promotion or "verified" wording appears. It uses no Firestore, Postgres, server storage or paid service.

## Trust wording

No "verified" state exists. A permit number is shown only as the advertiser's claim and "not checked by us"; Madmoun QR is "not checked"; availability is only what the advertiser says; "last recorded" is not a confirmation. The duplicate checker (`lib/duplicates.ts`) is deliberately cautious: it is sure only when the unit number matches and areas agree; with no unit number it says "possibly the same", only for the same known floor; everything unclear stays separate; a group forms only if every pair agrees.

## Controls

- **Kill switch:** set `DUBAI_SEARCH_ENABLED=false` in the environment and redeploy. The header link, homepage section, sitemap entries and every page under the section disappear (the pages answer 404). Unset or any other value means on.
- **Add an area:** add it to `lib/communities.ts` with portal slugs you have verified, and a plain two-sentence description with no prices or predictions. Tests check the page set, the links and that no invented numbers appear.
- **Counts on this device:** the page records basic usage in the visitor's own browser only. Outbound clicks are also sent to the site's existing Google Analytics, if present, as a `portal_click` event (portal and page only). Measure traffic and clicks there and in Search Console.

## Touches on existing files

`src/components/site-header.tsx` (header link), `src/app/(marketing)/page.tsx` (phone strip and homepage section), `src/components/site-footer.tsx` (link), `src/lib/sitemap-entries.ts` (section pages), `src/app/llms.txt/route.ts` (two lines), `package.json` (test glob). Everything else is under `src/features/dubai-search/` and `src/app/dubai-property-search/`.

## Remove it

Delete `src/features/dubai-search/` and `src/app/dubai-property-search/`; remove the imports and uses listed above; remove the test glob from `package.json`. Or use the kill switch.

## Tests

`npm test` covers the feature's logic (search, duplicates, trust wording, CSV and link validation, portal links, page set, sitemap rules, content rules). `node --import tsx --test src/features/dubai-search/components/__tests__/*.test.tsx` covers the rendered components.
