# What makes Developer Connects hard to copy (second pass, 2026-11-22)

Builds on `docs/differentiation-strategy.md`. The first pass found a good product direction (project records, a tracker, an agreement checker). This pass asks a harder question: what can a well-funded competitor NOT copy quickly, and why?

## 1. New evidence

- **Buyers' collective action is legally structured, and under-served.** MahaRERA has held that collective grievances must be filed by a duly constituted homebuyers' association, not by individuals or an informal group ([LiveLaw](https://www.livelawbiz.com/compliance/rera/maharera-collective-grievances-must-be-filed-by-homeowner-associations-not-individuals-519105)). Associations can also take over and complete a stalled project once its registration is revoked, which is how a group of 160-plus buyers at one Talegaon project got their homes. Existing bodies (the Forum for People's Collective Efforts, Mumbai Grahak Panchayat) are advocacy groups, not a service that sets up and runs a proper association for each project. I did not find a digital product that does this; that search was not exhaustive.
- **Brokers are paid by developers and regulators are watching it.** Brokers in Mumbai typically earn 2 to 3 percent from the developer; MahaRERA has issued orders on commission sharing and on a broker's claim without a written agreement ([Free Press Journal](https://www.freepressjournal.in/mumbai/maharera-rejects-brokers-claim-for-2-commission-in-santacruz-west-flat-deal-case), [Aurum PropTech](https://www.aurumproptech.in/pulse/media/maharera-orders-broker-to-share-1-percent-brokerage-with-homebuyer)). That conflict is structural: a developer-paid broker cannot publish a developer's delay record or advise against a project without losing revenue.
- **"Buyer-only advisory" is not unique.** Relai markets itself that way ([OneIndia](https://www.oneindia.com/in-the-news/relai-india-first-buyer-only-home-advisory-service-real-estate-revolution-012-8099103.html), self-reported). Saying "independent" is not a moat; a mechanism is.
- **Reviews are not trusted.** Review sites show wild splits (for example 1.2 versus 4.7 on Trustpilot for two portals), and even Housing.com's own guide warns that all-positive reviews may be fake ([Housing.com](https://housing.com/news/how-to-choose-a-reputed-developer/)). I found no platform tracking developers' delivery records.
- **Progress verification exists, but is institutional.** PropEquity sells PropAlert, with engineers visiting sites, mostly to banks and institutions ([Outlook Business](https://www.outlookbusiness.com/amp/story/news/propequity-launches-propalert-services-to-help-homebuyers)). So paid site verification is not unique either.

## 2. The idea that follows

Portals sell a search. Brokers sell a deal. Neither is on the buyer's side during the 2 to 4 years between booking and keys, which is when buyers are weakest and most anxious. Own that period, and own it **with the buyers of each project together**.

**One-line promise:** "We stand with you from the first shortlist to the day you get the keys."

## 3. How hard each piece is to copy

| Piece | Copy time (my estimate) | Why |
|---|---|---|
| AI chat, calculators, guides, a verified-looking UI | Weeks | Anyone can build these. Keep them, but they are not the moat. |
| Agreement checker | Weeks to months | The model is a commodity; only the grounding and test set differ. |
| Project Record with history (promised vs current date, extensions, report filings) | A competitor starting today needs the same elapsed time to match depth. It cannot be backfilled. | Each quarter of recorded history is permanent head start. |
| Developer-paid brokers publishing delay records | Never, in practice | Cuts their own revenue. |
| Published rules applied the same to every developer, kept for years | Years | Credibility is earned by acting against your own interest while people are watching. |
| Project buyers' associations and rooms | Years | Needs members per project, legal process know-how and trust. Members cannot be copied. |
| What buyers really paid and what each project really delivered, from your own closed deals | Years | Needs volume of deals. |

The deepest moats are the bottom three. The first two are the entry ticket.

## 4. The flywheel

1. Project Records are free, sourced and quotable, so search engines and AI assistants send buyers **before** they book.
2. They watch a project and book through Developer Connects. This is where you earn.
3. My Home keeps them tracking dates and payments, with family sharing.
4. They join their project's association room. This is the retention engine: people stay for as long as the project is unfinished.
5. Outcomes (delivered when, at what real cost) flow back into the record, which makes the next buyer's dossier better.

Each turn adds data and members a competitor does not have.

## 5. What to do first (works with zero users today)

1. **Weeks 1 to 2:** check MahaRERA's terms and data on about 50 Mumbai projects; get a lawyer's view on how records are shown; write a **Buyer Charter** (same records for every developer, no rankings, a right of reply, how Developer Connects earns, said once and kept). Fee statements stay where you decided; the charter states principles.
2. **Weeks 3 to 8:** Project Record pages for about 100 Mumbai projects of developers already listed, snapshotted every quarter; "watch this project" alerts.
3. **In parallel:** a guide and templates for forming a project's homebuyers' association under MahaRERA (drafted with a lawyer). It earns links and is the on-ramp to the rooms.
4. **When you have real buyers:** pilot one or two project rooms.

## 6. Honest risks

- **How Developer Connects earns decides everything.** Whatever the model, the rules must be the same for every developer and disclosed. If a paying developer is treated differently, the moat and the legal position both collapse.
- **Legal:** publishing records about named developers needs fair, sourced, unadorned facts and a right of reply. Helping buyers form associations is legal activity: use a lawyer.
- **Data access:** unknown until Phase 0. The fallback is manual entry.
- **Early stage:** the site has few users, so the first assets must not depend on user numbers.
- **Cost:** history, alerts and rooms will outgrow Firestore's free plan; document AI needs a paid key or an own-model server.
- **Do not claim "first" or "only".** I found no competitor doing exactly this, but my search was not exhaustive; verify before claiming anything.
