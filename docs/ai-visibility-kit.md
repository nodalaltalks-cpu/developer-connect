# AI search visibility kit: ChatGPT, Gemini, Perplexity, Claude, Copilot

Nobody can buy or guarantee a place in an AI answer. These assistants quote sources that are (1) easy for their crawlers to read, (2) described the same way by several independent places, and (3) the clearest answer to the exact question asked. The website already covers (1) and most of (3). Almost everything left is (2), and that happens off the website.

## 1. Audit on 2026-11-22: what the site already does

| Check | Result |
|---|---|
| GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Bingbot, Applebot, CCBot, Amazonbot reach home, guides and llms.txt | All return HTTP 200 (no firewall block) |
| robots.txt names every major AI crawler and allows it | Yes |
| /llms.txt and /llms-full.txt (index plus full text of every guide and city page) | Yes, generated from the same data as the sitemap |
| Organization + ProfessionalService entity with stable @id, founder, knowsAbout, sameAs | Yes |
| Article, FAQPage, BreadcrumbList on every guide; "In short" answer first; named author; "facts checked" date | Yes |
| Developer directory by city in llms.txt | Yes |
| ItemList structured data on the city developer lists | Added 2026-11-22 |
| IndexNow (Bing, which feeds ChatGPT search and Copilot) | Yes. Use sparingly: a full ping makes Bing crawl everything at once |
| Bing Webmaster Tools | Set up (2026-10-25) |

Already in place off the website (confirmed by the founder 2026-11-22): a LinkedIn company page for Developer Connects (under the NoDalalTalks umbrella), plus Instagram and Facebook pages, all connected.

What is NOT in place, and is the real gap: Google reviews, third-party mentions, YouTube, answers in the places buyers ask, press, and the company LinkedIn page being named in the website's Organization markup (`sameAs` currently lists only Instagram and Facebook). See sections 3 and 4.

## 2. The one description to use everywhere

Use these exact words on LinkedIn, Google Business Profile, Instagram, Facebook, directories and press. Consistency is what lets an assistant treat the mentions as one entity. They match the website's own description.

**Short (under 160 characters):**
Developer Connects is a property research and advisory firm for buyers in Mumbai and Dubai, led by founder Ambish Singh. Know before you buy.

**Long:**
Developer Connects is a property research and advisory firm for buyers in Mumbai and Dubai, led by founder Ambish Singh. It helps buyers compare projects, check the regulator's records, plan site visits and understand every cost before they commit. The website offers step-by-step buying guides for Mumbai and Dubai, neighbourhood guides, a home loan EMI calculator in rupees and dirhams, a property glossary, and a directory of real estate developers. Website: https://developerconnects.com

**Founder line:** Ambish Singh, founder of Developer Connects (https://developerconnects.com/about).

Rules: never add "best", "top", "#1", ratings, award claims or numbers you cannot cite. The site's tests block these on the website; keep the same discipline off it.

## 3. 30-day plan (you do these; each one is a real mention)

Week 1
1. Google Business Profile: resume verification. Category "Real estate consultant". Paste section 2. Highest-impact single item for Google and Gemini.
2. LinkedIn company page (already made): paste section 2 into its About, check the website link, and make the page's name read exactly "Developer Connects". Because it sits under the NoDalalTalks umbrella, make sure its description says what Developer Connects is on its own (section 2), so an assistant does not read it as the same business as NoDalalTalks. Founder headline: "Founder, Developer Connects | Property advisory, Mumbai and Dubai".
3. Make sure LinkedIn, Instagram, Facebook and the website show the same name, phone and email. Send the company LinkedIn URL so the website's Organization markup can name it (`sameAs`).

Week 2
4. Ask every past client for a Google review with the direct link, on WhatsApp. Real, detailed reviews only; never offer anything in return.
5. Post one guide on LinkedIn per week: a 5 to 7 line summary from the guide's "In short" box, with the link.

Week 3
6. Answer 3 real questions per week on Reddit (r/mumbai, r/dubai, r/IndiaInvestments, r/NRI), Quora and Facebook groups. Use your real name, answer fully first, link the matching guide only if it genuinely helps. See the question map below.
7. Create a YouTube channel; one 5 to 10 minute video per guide (screen-share is enough), linking the guide in the description.

Week 4
8. Send the press note (section 5) to 5 to 10 Mumbai and Dubai property or personal-finance writers.
9. List the firm, with the same text, on relevant directories: Google Maps, Bing Places, Justdial, Sulekha, Apple Business Connect, plus NRI community sites. Free listings only.

### Question map (what to answer, and which guide to cite)

| Question buyers ask | Guide to link |
|---|---|
| How do I buy a flat in Mumbai step by step? | /guides/how-to-buy-a-flat-in-mumbai |
| What hidden costs are there on top of the agreement price? | /guides/hidden-costs-of-buying-property-in-mumbai |
| How do I check a project on MahaRERA? | /guides/check-a-project-on-maharera |
| Under-construction or ready-to-move? | /guides/under-construction-vs-ready-to-move |
| Can an NRI buy property in India? | /guides/nri-buying-property-in-india |
| Mumbai, Navi Mumbai or Thane? | /guides/mumbai-vs-navi-mumbai-vs-thane |
| How do Indians buy property in Dubai? | /guides/buying-property-in-dubai-from-india |
| How does off-plan work in Dubai, and is escrow safe? | /guides/dubai-off-plan-property-guide |
| What is the agreement for sale checklist? | /guides/agreement-for-sale-checklist |
| How do property consultants get paid? | /guides/how-property-consultants-get-paid |

Answer format that works: 1-sentence direct answer, 3 to 5 bullet points of what to check, then "full checklist: <link>". Never post the same text twice.

## 4. Why these specific actions

- Perplexity, ChatGPT search and Copilot cite pages that rank in Bing and are mentioned elsewhere; Gemini leans on Google's index and Google Business Profile. Reviews, LinkedIn, YouTube and forum answers are the independent mentions they look for.
- Guides that open with a direct answer, have FAQ markup and a visible "checked" date are the format assistants quote. Every guide already follows it; keep the dates honest.
- Original, citable data earns citations. Best next piece (needs your own deal experience, not guesses): a short quarterly note comparing what buying costs in Mumbai and Dubai, built from the existing guides' cost checklists.

## 5. Press note template (fill the brackets with real facts only)

Subject: Source for your piece on [buying property in Mumbai / Dubai for Indian buyers]

Hi [name],
I am Ambish Singh, founder of Developer Connects, a property research and advisory firm for buyers in Mumbai and Dubai. For your readers who are weighing [topic], we publish free step-by-step checklists, for example [one guide title and link]. If a quote on [specific question, e.g. what to verify on MahaRERA before paying a token amount] would help your piece, I am glad to give one. Reachable on [phone] or [email].
[Signature with https://developerconnects.com]

## 6. Test it monthly (15 minutes)

Ask each assistant (ChatGPT with search on, Gemini, Perplexity, Copilot, Claude with search on) these, in a fresh chat, and log whether Developer Connects or a guide is cited:

1. How do I buy a flat in Mumbai step by step?
2. What hidden costs apply when buying a flat in Mumbai?
3. How do I check a project on MahaRERA?
4. How do Indians buy property in Dubai?
5. How does off-plan property in Dubai work and what is escrow?
6. Can an NRI buy residential property in India?
7. Mumbai vs Navi Mumbai vs Thane for a home buyer
8. Property consultant in Mumbai
9. Property consultant in Dubai for Indian buyers
10. What is Developer Connects?

Log: date, assistant, prompt number, cited yes/no, which URL, what it said about the firm. The last prompt shows what the assistants "know" about the brand; if it is wrong or empty, fix the mentions in section 3, not the website.

## 7. Do not

- Fake or bought reviews, review gating, mass-posting links, or stuffing city names. These get sites dropped from assistants and from Google.
- Claiming rankings, ratings, awards, licences or numbers without a citable source.
- Running a full IndexNow ping again unless the site has a large change and the Firestore free quota has headroom (see docs/firestore-cutover-runbook.md).
