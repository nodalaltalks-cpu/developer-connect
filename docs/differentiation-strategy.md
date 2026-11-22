# Differentiation and retention strategy (research, 2026-11-22)

Question: how does Developer Connects stand apart from brokerages and portals, add real value (including AI) that is hard to copy, and fix repeat visits and retention, while still selling properties?

## 1. What the research found

**Where competitors already are (so we should not compete there)**
- AI property *search* is crowded: Housing.com launched property search inside ChatGPT ([Housing.com on ChatGPT](https://cxotoday.com/media-coverage/housing-com-brings-property-search-to-chatgpt-redefining-home-discovery-through-conversational-ai/)); Square Yards has a ChatGPT app ([Square Yards](https://www.squareyards.com/blog/square-yards-chatgpt-property-search)); Anarock has a sales-side AI platform ([ANAROCK.AI](https://www.nbmcw.com/news/anarock-launches-anarock-ai-indias-first-comprehensive-ai-platform-for-residential-real-estate-sales.html)); CREDAI Pune has an AI search ([CREDAIBILITY.AI](https://realtynmore.com/credai-pune-launches-credaibility-ai-worlds-first-ai-powered-property-search-engine-for-homebuyers/)).
- Portals earn from developers and brokerage, so they cannot show a developer's delay record prominently. NoBroker's model has drifted toward brokerage-style revenue ([Inc42](https://inc42.com/features/nobrokers-future-is-beyond-home-listings-but-will-profits-follow/)), and Square Yards has evolved from brokerage into a full-stack ecosystem with a mortgage arm ([industry report](https://www.ghar.tv/blog/the-state-of-indian-proptech-2026-booming-sales-elusive-profits-the-definitive-industry-report/artid6662)).

**Where the pain is (and where nobody owns the experience): after booking**
- Possession delay is the central grievance. An older Magicbricks survey found about 72% of buyers would complain over a delay ([survey summary](https://www.asiapropertyawards.com/en/two-thirds-of-indian-buyers-to-fight-delays-in-delivery-of-homes-survey/)); a study of 540 buyers found almost 72% aggrieved by builder delay ([study](https://www.tandfonline.com/doi/full/10.1080/23311975.2022.2117164)). Both are dated, so treat them as indicative.
- Regulator data exists but is uneven: MahaRERA requires quarterly progress reports (QPRs), yet only 62% of projects were updating them in Feb 2025 ([Free Press Journal](https://www.freepressjournal.in/amp/mumbai/maharashtra-62-of-developers-update-project-details-to-improve-maharera-compliance)); thousands of projects have been listed as lapsed or suspended for missing deadlines ([Lokmat Times](https://www.lokmattimes.com/maharashtra/maharera-suspends-1950-housing-projects-for-missing-completion-deadlines-and-failing-to-update-details-a505)); extensions are granted project by project ([Construction World](https://www.constructionworld.in/latest-construction-news/real-estate-news/maharera-grants-extensions-to-key-housing-projects-ensuring-completion/50592)). The regulator shows the *current* state; buyers cannot easily see how a promise has moved over time.
- Existing post-booking tools are thin: PropEquity's PropAlert is a paid construction-monitoring service ([Outlook Business](https://www.outlookbusiness.com/news/propequity-launches-propalert-services-to-help-homebuyers)); Housing.com added a construction-update feature for a limited set of projects ([RP Realty Plus](https://www.rprealtyplus.com/news-views/housingcom-launches-construction-update-feature-for-homebuyers-2084.html)). None combines the agreement, the payment schedule, the regulator record and the family in one place.
- Agreement review is a paid, human service (NoBroker ₹3,999: [NoBroker](https://www.nobroker.in/sales-agreement-in-india); LegalKart ₹2,499: [LegalKart](https://legalkart.com/property-sale-and-purchase/document-review/sale-agreement-or-agreement-to-sale-review)) with at least one small AI tool ([PropWise](https://propwise-zeta.vercel.app/tools.html)), whose accuracy I could not verify.
- Repeat visits in real estate come from saved searches, alerts and tools that give a reason to return ([vendor guidance, promotional](https://help.repliers.com/en/article/saved-search-implementation-guide-1pomr3h)). A home is bought once every many years, so the reason to return has to be built into the 2 to 4 years *between booking and possession*.

**Not found / unverified:** MahaRERA's terms of use for automated access (must be checked before any data collection); current accuracy of Dubai Pulse's data (the dataset I found was last updated in 2024: [Dubai Pulse](https://www.dubaipulse.gov.ae/data/dld-transactions/dld_transactions-open)); whether the DPDP consent rules (notified 13 Nov 2025, consent obligations from May 2027 per [SCC Online](https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/)) treat document upload to an AI as a separate purpose (counsel should confirm).

## 2. The positioning

Portals help you *find* a flat. Developer Connects should be where you *check, track and protect* the purchase: from the first shortlist to the day you get the keys. The one-line promise: **"We keep watching your project after you book."** It is the opposite of a brokerage, whose relationship ends at the booking.

## 3. The components (in order of build)

### A. Project Record: promise versus delivery (the moat)
For each project of the developers in the directory, a page of *sourced facts* from the regulator's own record: RERA registration number, the possession date promised at registration, the current revised date, how many times it moved and when, whether quarterly reports are being filed, lapsed or extended status. Each fact links to the regulator page. No scores, no rankings, no opinions.
- **Why it is hard to copy:** the regulator shows only today's state. Developer Connects takes a snapshot every quarter, so the *history* ("date moved from Dec 2024 to Dec 2026, recorded 14 Aug 2026") exists only from the day we start recording. A competitor cannot backfill it. The archive grows more valuable every day.
- **Why it fits the business:** portals are paid by the developers they list, so they will not show this. A page that shows every developer the same way, with a right of reply, becomes the trusted reference. This also gives each developer and project page unique, quotable data, which is exactly what the thin pages lack (and what Google and AI assistants cite).
- **Condition:** apply identically to every developer, including those who pay Developer Connects. The moment it is softened for a paying developer, the moat and the legal position are both lost.

### B. My Home: the tracker that brings people back
After booking (or while shortlisting), a buyer adds a project. They get: the Project Record for it with alerts on any change; a payment-milestone calendar with reminders and a "before you pay this stage" check (is the stage actually reported complete?); a delay-interest calculator and an escalation kit if the possession date passes; family sharing so a spouse, parents or an NRI sibling can follow the same file. After possession: snag list, registration and utility steps, then loan, interiors and resale or rent help.
- **Retention engine:** the regulator's own calendar gives four fixed reasons a year to return: quarterly reports are due on 20 Jan, 20 Apr, 20 Jul and 20 Oct. A "your project this quarter" message after each date, plus any change alert, is a built-in habit with a purpose.
- **Revenue link:** the buyer stays inside Developer Connects through the whole holding period, so loan, interiors, legal help, resale and referrals are earned relationships instead of cold leads. Each tracked project also reveals which projects buyers research.

### C. Agreement Checker: AI where AI is truly useful
The buyer uploads the agreement for sale. AI extracts the key terms into a one-page sheet (carpet area, payment schedule, possession date, delay interest, cancellation terms, defect period), shows the exact page and line each came from, compares them to the project's RERA record, and lists what is missing or unusual for a lawyer to look at. A paid lawyer review is the upsell. It is not legal advice and says so.
- **Why it works:** every output is traceable to the document and the regulator record, so it is checkable, not a black box. Competitors charge ₹2,500 to ₹4,000 for human review; a free structured first pass, grounded in the regulator record for that exact project, is a strong reason to register.
- **Condition:** accuracy testing on real agreements before launch; clear consent and deletion (DPDP); a visible "check with a lawyer" step.

### D. Plain-language help in Hindi, Marathi and English
Explain a clause, a date change or a notice in the buyer's language, always citing the record or the document. This is a real gap for many buyers and is cheap once A and C exist.

### What not to build
Generic AI chat search, listings, EMI calculators, virtual tours and star ratings. The big portals already do search and AI chat; ratings and rankings are also barred by the site's own rules.

## 4. Quick wins (about a week, no scraping, no AI, real value)
1. **Possession-delay interest calculator** (a tool page): enter the promised date, the amount paid and the actual date. It attracts searches and links, and is the first piece of My Home.
2. **Interactive agreement checklist** that a signed-in buyer can tick and keep, built from the existing guide.
3. **"Quarter-end reminder"**: a subscribe option that sends the buyer a short guide to checking their project's quarterly report on the four dates. It starts the habit before the data product exists.

## 5. Phases
| Phase | What | Needs |
|---|---|---|
| 0 (1 to 2 weeks) | Check MahaRERA terms and data fields for 50 Mumbai projects; decide the presentation and right-of-reply rules; a lawyer's view on how records are shown | Founder decision, a lawyer |
| 1 (4 to 6 weeks) | Project Record pages for Mumbai projects of the listed developers; quarterly snapshots; "watch this project" alerts | Data collection job, careful Firestore use |
| 2 | My Home: payment calendar, reminders, family sharing, delay calculator | Sign-in already exists (Clerk) |
| 3 | Agreement Checker with human lawyer upsell | Claude API budget, DPDP consent flow |
| 4 | Dubai equivalent; post-possession services | Check Dubai data freshness first |

## 6. Risks and honest limits
- **Data rights:** automated collection from the regulator's site may be restricted. Phase 0 must confirm this first. If it is restricted, the fallback is manual entry by the buyer and by us for tracked projects, and a request to the regulator.
- **Fairness and defamation:** show only sourced facts with links; give the developer a reply route; never add adjectives or scores.
- **Business tension:** showing delays of developers who pay Developer Connects is uncomfortable. It is also the whole point. Decide the rule once, before building.
- **Cost and the free plan:** time-series snapshots, alerts and document uploads will not fit comfortably in Firestore's free plan, and AI use needs a paid API. This roadmap realistically needs a billing account. That conflicts with your current rule against billing, so it is a decision to make deliberately.
- **AI accuracy and privacy:** an AI that misreads an agreement can cause harm. Keep source citations, a lawyer step and clear consent. Rules on uploads and consent should be confirmed with counsel (DPDP).
- **Evidence is thin in places:** the delay surveys are old; I found no recent national study. Validate demand with 15 to 20 real buyers before building Phase 2 and 3.

## 7. How to measure success
- Project pages indexed and clicked from search (replaces thin developer pages).
- Number of projects being watched; share of watchers who return within 30 and 90 days.
- Reminder and quarter-report open rates.
- Agreement uploads, and the share that book a consultation.
- Enquiries and bookings from people who used My Home, versus others.
