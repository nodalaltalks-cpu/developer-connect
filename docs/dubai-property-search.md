# Dubai Property Search (experiment)

A free, isolated property metasearch experiment for Dubai: search once, see the same property advertised on several sources, compare, then open the original advertisement. Built on branch `feat/dubai-property-search`. **Not deployed.** Off by default.

## What it is, and is not

- **Free for everyone, permanently.** No payments, subscriptions, sponsored or paid-ranked results, commissions, paid enquiries, checkout or monetisation code anywhere. A test fails if payment or promotion wording appears in what the feature renders.
- **Zero cost.** No paid API, data feed, database, AI service, analytics or hosting. It uses no Firestore, no Postgres and no server storage at all.
- **Demo data only.** Every property comes from a seeded generator (`lib/demo-data.ts`) and is labelled **DEMO DATA — NOT LIVE PROPERTY INVENTORY** on the page. Demo links use `example.invalid` and are never opened; the "View original" button explains this instead.
- **No real portal is integrated or tested.** See "Sources" below.

## Enable, disable

| Action | How |
|---|---|
| Enable locally | Add `DUBAI_SEARCH_ENABLED=true` to `.env.local`, run `npm run dev`, open `/dubai-property-search`. |
| Enable on a deployment | Set the environment variable `DUBAI_SEARCH_ENABLED=true` for that environment and redeploy. |
| Disable | Remove the variable (or set anything other than `true`). The nav link, the phone strip and the homepage section render nothing, and `/dubai-property-search` answers 404. No code change is needed. |

`/dubai-property-search/promo-preview` is a review aid that shows the real header and the homepage section on their own. It is also behind the flag.

## Where it appears

- **Route:** `/dubai-property-search` (search-first, its own page; "← Developer Connects" leads back). `noindex` while an experiment, and not in the sitemap.
- **Navigation:** a "Dubai Property Search NEW" link in the header on large screens. On phones and tablets the header has no room (the logo would shrink), so a slim "NEW · Dubai Property Search →" strip sits under the header on the homepage.
- **Homepage:** one section ("Searching for property in Dubai?") after the Free tools section. The hero and every existing section are untouched.

## What was built

Search by community or building (short names such as JVC work), buy or rent, property type, bedrooms, price range, size, ready or off-plan, furnishing and chosen sources. Sorting by price, size, most sources and recently checked. Results grouped by property. Compare up to four advertisements side by side. Save properties, save searches, search history, recently viewed, and "View original". Add your own listings by pasting a link and typing the details (the page is never fetched), or import a CSV you are authorised to use. Local, browser-only usage counts.

### Duplicate detection (`lib/duplicates.ts`)

Pairs of advertisements from different sources are classified:

- **Confirmed:** same purpose, community, building and bedrooms, the same unit number shown by both, area within 2%.
- **Probable:** same building and bedrooms, the same known floor, area within 3%, asking prices within 15%, no sign of a different unit.
- **Similar (kept separate):** everything else, including any advertisement with no floor and no unit (stacked flats often share an area, so area alone proves nothing).

A group forms only when every pair inside it agrees, so a chain of maybes never merges. The page always tells the buyer to confirm the unit, price and availability with the advertiser. Measured on the demo data (which has known ground truth): confirmed groups never mix units; probable errors are held under 20% by a test.

### Trust (`lib/trust.ts`)

Each indicator says exactly what was checked. There is **no "verified" state**: an advertiser's permit number is shown as their claim, "not checked by us", with the note that a permit does not guarantee availability, ownership or clear title; Madmoun QR is "not checked"; availability is only what the advertiser says; "last recorded" is explicitly not a confirmation that the property is still available.

## Sources: what is real

| Source | State |
|---|---|
| Sample Portal A/B/C, Sample Agency Site | **Made-up demonstration sources.** |
| Links you add; your CSV import | **Real and working**, stored only in your browser. |
| Bayut, Property Finder, dubizzle, Houza, PropSearch | **Not integrated.** No free public listing feed was found. Property Finder's customer agreement points to separate API Access Terms; Bayut's and dubizzle's terms were not retrieved or reviewed. Public access does not give permission to copy or republish listings, so nothing is collected. |
| Agency and developer websites | Realistic route: a feed or CSV an agency chooses to share. The CSV import is where to test it. |
| Dubai Land Department open data (Dubai Pulse) | Not integrated. Official transaction data (past sales, not advertisements); could later give price context. Licence terms not reviewed. |

Before any real integration: read each site's own terms, ask permission or for a feed, and never copy photos or private contact details.

## Isolation: exactly what touches existing files

New files only, except three small edits:

| File | Edit |
|---|---|
| `src/components/site-header.tsx` | one import and `<DubaiSearchNavLink />` |
| `src/app/(marketing)/page.tsx` | two imports, `<DubaiSearchMobileStrip />` under the header and `<DubaiSearchPromo />` after the tools section |
| `package.json` | one test glob added to `npm test` |

No existing URL, SEO setting, database, business logic or global style changed. The experiment's own styles are plain Tailwind classes inside its components.

## Remove the whole experiment

1. Delete `src/features/dubai-search/` and `src/app/dubai-property-search/` and this file.
2. In `src/components/site-header.tsx` remove the `DubaiSearchNavLink` import and its one use.
3. In `src/app/(marketing)/page.tsx` remove the `DubaiSearchPromo` and `DubaiSearchMobileStrip` imports and their two uses.
4. In `package.json` remove `"src/features/dubai-search/lib/__tests__/*.test.ts"` from the `test` script.
5. Remove `DUBAI_SEARCH_ENABLED` from any environment.
6. Visitors' browsers hold harmless `dcds:v1:*` localStorage keys; they are never read again.

Or, if the branch was never merged, simply delete it: `git branch -D feat/dubai-property-search`.

## Tests

- `npm test` includes `src/features/dubai-search/lib/__tests__` (search, filters, sorting, duplicate classification, trust wording, CSV and link validation, saving, local analytics, the flag).
- `node --import tsx --test src/features/dubai-search/components/__tests__/flag-and-ui.test.tsx` checks that every entry point renders nothing when the flag is off, the agreed copy when on, and that no payment, promotion or "verified" wording appears.
