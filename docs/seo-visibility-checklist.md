# Visibility checklist: Google, Bing, ChatGPT and Gemini

State as of 2026-10-24 (from Search Console and the live site):

- Google: 129 pages indexed, 1,146 discovered but not yet crawled (report dated 2026-10-16). 28 days: 15 clicks, 470 impressions, average position 45.8. The home page ranks at 1.2 for brand searches. Developer pages with sourced About facts rank around positions 7 to 10.
- Bing: `site:developerconnects.com` returns nothing. IndexNow was accepted (HTTP 200) on 2026-10-15 and again on 2026-10-24 for the 95 non-developer URLs, but Bing Webmaster Tools is not set up.
- Technical SEO is sound: title, meta description, canonical, one H1, Organization / ProfessionalService / Person / Service / FAQPage / Article JSON-LD, robots.txt welcoming the AI crawlers, llms.txt and llms-full.txt.
- What is missing is authority: no backlinks, no reviews on the city pages, Google Business Profile not verified.

ChatGPT search leans on Bing's index and Gemini on Google's. Being indexed and cited there depends on the same things: a crawled page, a clear answer, a source worth citing, and other sites that mention you.

## 1. Bing Webmaster Tools (about 5 minutes, needs your sign-in)

1. Open https://www.bing.com/webmasters/ and choose Get started, then sign in with Google (use the account that owns Search Console).
2. Choose "Import your site(s) from Google Search Console", approve access, and import https://developerconnects.com/.
3. Open Sitemaps and confirm https://developerconnects.com/sitemap.xml is listed. Submit it if not.
4. Open URL Inspection and request indexing for the home page, /property-consultant/mumbai, /property-consultant/dubai and /buy-direct-from-developer/mumbai.
5. Optional: Settings, then API access, then generate an API key. Do not share it in chat; it can be added as a Vercel environment variable later.

## 2. Google Search Console (about 10 requests a day)

Request indexing, one a day or so, for the pages Google has not crawled. Check each with URL Inspection first, since several guides turned out to be indexed already. Priority: /buy-direct-from-developer/uae, /india, /thane, /navi-mumbai, then the guides under /guides/ that inspect as "not on Google".

## 3. Google Business Profile

Created under developerconnects02@gmail.com and stopped at verification. It needs a private mailing address. Do not enter an address that is not yours. Then add a second category, hours, a description, a logo, and fetch the review link. Dubai needs its own separate profile.

## 4. Reviews and trust on the city pages

The Mumbai page has a phone and email but no testimonials and no street address. Collect 3 to 5 real, consented testimonials through the existing consent-first flow, and publish them only once approved. Never publish illustrative ones.

## 5. Backlinks (the main ranking lever for a new domain)

Aim for a few real mentions a week. Nothing here is paid, and none of it is automated.

- Your own profiles, linked to the site: YouTube (done), Instagram, Facebook page, LinkedIn company page, X.
- Business listings with consistent name, phone and website: Google Business Profile, Bing Places, Justdial, Sulekha (India), and UAE listings such as Yellow Pages UAE.
- Answer real questions with the relevant guide as the source: Quora, Reddit (r/mumbai, r/dubai, r/IndiaInvestments), NRI forums. Be useful first; disclose that it is your site.
- Offer a short, factual quote to journalists and local real-estate writers (HARO-style requests, LinkedIn).
- Ask developers and partners you work with to link to their page on your site only if they actually want to.
- Do not buy links, join link exchanges or post the same text across forums. These can get a site demoted.

## 6. Content that earns citations

- Every claim on a guide should be checkable. The guides now link MahaRERA and the Dubai Land Department; the next step is a per-claim source line wherever a figure appears (stamp duty, registration fee, thresholds).
- Developer pages with sourced About facts are what already ranks. Add more only where two sources agree. Skip any developer whose sources are weak.
- Keep "Facts checked" dates honest. Update a guide only when its facts were actually rechecked.

## 7. How to measure

Search Console, weekly: Pages (indexed vs not), Performance (queries, pages, average position). Bing Webmaster: the same two views. For AI answers, search your target questions in ChatGPT and Gemini monthly and note whether the site is cited. Expect weeks to months, not days.
