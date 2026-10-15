# Developer Connects: SEO and AI-search playbook

What the website now does (built in code), and what only the founder can do off the website. Rankings cannot be promised: Google and the AI assistants decide them. What we control is being the clearest, most trustworthy, most quotable answer to the questions buyers ask.

## 1. What is built into the site

- **Buying guides** (`/guides`): 34 long-form guides (14 core guides plus 20 more neighbourhood guides in `guides-areas-more.ts`) answering the questions buyers search (how to buy in Mumbai, Dubai from India, hidden costs, MahaRERA check, NRI rules, loans, choosing a consultant). Each has an "In short" answer first, FAQ, Article + FAQPage + BreadcrumbList schema, a named author and a "facts checked" date.
- **City pages** (`/property-consultant/{mumbai,thane,navi-mumbai,dubai}`): the pages that target "property consultant in {city}". Service + FAQ + breadcrumb schema, areas covered, regulator, the commission statement.
- **Neighbourhood guides** (`src/lib/seo/guides-areas.ts`): Powai, Goregaon East, Andheri, Thane West / Ghodbunder Road, Dubai Marina, Downtown Dubai, JVC, Dubai Hills Estate. Each `area` matches a city page's area chip, which links to it. No prices, rents or yields (a test blocks them). Add more only with real, specific content.
- **Free tools**: `/tools/home-loan-emi-calculator` (EMI and affordability, INR or AED, WebApplication + FAQ schema) and `/property-glossary` (28 terms, DefinedTermSet schema, one anchor per term). Calculators and glossaries earn links and are quoted by AI assistants.
- **Fees** appear only in the Disclaimer, Privacy, FAQ and the "how consultants get paid" guide, never on the home page or the city landing pages (founder's decision, 2026-10-13; enforced by a test).
- **IndexNow**: after each deploy, new URLs are pinged to api.indexnow.org (key in `src/lib/indexnow.ts`), which Bing, and through it ChatGPT search and Copilot, pick up within minutes.
- **Entity markup**: one Organization/ProfessionalService entity and one Person (founder) site-wide, with the company's own Instagram and Facebook as `sameAs`. No rating, review count or street address is invented.
- **AI visibility**: `/llms.txt` (index) and `/llms-full.txt` (full text of every guide and city page); `robots.txt` explicitly welcomes GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Google-Extended and others.
- **Crawl**: sitemap lists every guide and city page; the footer and home page link to them.
- **Tests** (`src/lib/seo/__tests__`) keep the content honest: no broker/ranking/rating claims, one approved commission sentence, no hard-coded tax rates, valid links, title and description lengths.

To add a guide: add an entry in `src/lib/seo/guides-india.ts` or `guides-dubai-advisor.ts`. The page, sitemap, llms files and schema follow automatically. When facts are re-checked, change the guide's `updated` date.

## 2. What only the founder can do (in priority order)

### Week 1: get found at all
1. **Google Search Console**: add `https://developerconnects.com`, submit `/sitemap.xml`, request indexing for `/guides`, `/property-consultant` and the four city pages. Check Pages > Why pages aren't indexed weekly.
2. **Bing Webmaster Tools**: import from Search Console. ChatGPT search and several assistants lean on Bing's index, so this matters for AI answers.
3. **Google Business Profile**: create "Developer Connects" as a service-area business (no storefront needed): categories "Real estate consultant" and "Real estate agency", service areas Mumbai, Thane, Navi Mumbai, Dubai, the website, the WhatsApp number, the founder photo and logo. This is what decides the "near me" and map results. Needs verification (video or postcard).
4. **NAP consistency**: exactly the same business name, phone and email on the website, Google Business Profile, Instagram, Facebook, LinkedIn and every directory.

### Month 1: earn trust signals
5. **Reviews**: after each completed deal, ask the client for a Google review (send the direct review link on WhatsApp). 10 to 20 genuine, detailed reviews is the single biggest local-ranking lever. Never buy, fake or incentivise reviews.
6. **RERA**: put the MahaRERA agent registration number (and the Dubai RERA/BRN number) in `NEXT_PUBLIC_RERA_REGISTRATION` and on Google Business Profile. A visible registration is a trust and E-E-A-T signal.
7. **LinkedIn**: a Company Page for Developer Connects; the founder's profile headline "Founder, Developer Connects | Property advisory, Mumbai and Dubai", linking to the site. Post one guide a week.
8. **YouTube**: a channel with one explainer per guide (10 minutes, screen-share or face to camera). YouTube is the second-largest search engine and Google shows videos in property searches. Link each video to its guide.

### Months 2 to 6: authority
9. **Backlinks from real places**: guest articles or quotes in Mumbai and Dubai property and finance outlets; local business associations and chambers; NRI community sites and forums; university alumni pages (Symbiosis). A handful of relevant links beat hundreds of directory links.
10. **Digital PR with data**: publish an original, honest piece of research (for example, a quarterly cost-of-buying comparison for Mumbai and Dubai from your own deal experience). Journalists and AI tools cite original numbers.
11. **Answer questions where buyers ask**: Quora, Reddit (r/mumbai, r/dubai, r/IndiaInvestments) and Facebook groups. Be helpful first and link only where it genuinely answers the question. Use your real name.
12. **Founder entity**: a Wikidata entry is only possible with independent coverage, so aim for press mentions first; keep the LinkedIn, About page and Google profile saying the same thing.

## 3. Being named by ChatGPT, Gemini, Perplexity and Claude

AI assistants recommend firms that are (a) clearly described on their own site, (b) mentioned consistently by other sites, and (c) easy to quote. So:
- Keep the About page, home page and the Google Business Profile describing the firm in the same words.
- Get mentioned in third-party articles, lists and communities (section 2, items 9 to 11).
- Keep the guides current (update the `updated` date only when facts were actually re-checked).
- Check monthly: ask each assistant "best property consultant in Mumbai", "how to buy property in Dubai from India" and note whether Developer Connects and the guides appear. Log it.

## 4. Do not do

- Buying links, fake reviews, review gating, or stuffing city names into pages: these can get the whole site penalised.
- Claiming "#1", "top-rated", "best" or any ranking without a citable source (the tests block this, and it is also a legal risk).
- Publishing thin pages for dozens of localities. A new city or locality page should be added only when there is real, specific content for it.

## 5. What to measure

Search Console: impressions and clicks for "property consultant {city}", "buy flat in Mumbai", "Dubai property for Indians"; pages indexed; average position per guide. Google Business Profile: calls, direction requests, review count. The Founder's dashboard: enquiries by landing page (the enquiry form already records landing path and source).
