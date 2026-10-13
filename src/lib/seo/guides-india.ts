import type { Guide } from "./types.ts";

/**
 * India buying guides. Facts are stated at the level that stays true (the law, the process, the order of steps) and any figure that
 * changes (rates, thresholds) is described as "typically" or "check the current rate". Nothing here is a ranking, a guarantee or a
 * claim about a named developer.
 */

const UPDATED = "2026-10-13";

export const INDIA_GUIDES: readonly Guide[] = [
  {
    slug: "how-to-buy-a-flat-in-mumbai",
    topic: "Mumbai",
    title: "How to buy a flat in Mumbai: the step-by-step guide",
    metaTitle: "How to Buy a Flat in Mumbai: Step-by-Step Guide",
    description:
      "From budget and RERA checks to agreement, stamp duty and possession: the order of steps for buying a flat in Mumbai, with the costs and checks at each stage.",
    summary:
      "Buying a flat in Mumbai follows eight steps: fix the real budget, shortlist areas, check the project on MahaRERA, visit, negotiate, sign the agreement for sale, pay stamp duty and register, and take possession with the occupancy certificate. Most expensive mistakes happen when a step is skipped or done out of order.",
    market: "mumbai",
    blocks: [
      { t: "h2", text: "1. Fix your real budget first" },
      {
        t: "p",
        text: "The price on the brochure is not what you pay. Add GST on an under-construction flat, stamp duty and registration, legal checks, parking, society and maintenance deposits, and interiors. Then work backwards from your loan eligibility and how much you can put down without touching your emergency fund.",
      },
      { t: "p", text: "Our guide to the hidden costs of buying property in Mumbai lists every line item so nothing surprises you at registration." },
      { t: "h2", text: "2. Decide the area by your daily life, not the hoarding" },
      {
        t: "p",
        text: "Mumbai is a set of very different micro-markets. Choose by the commute you will actually do, the railway or metro line, the school and hospital you will use, and how the neighbourhood feels at 8 pm on a weekday. Price per square foot only makes sense when compared inside the same micro-market.",
      },
      {
        t: "ul",
        items: [
          "Island city and western suburbs: closer to the older business districts, higher prices, more resale stock.",
          "Central and harbour suburbs, Thane and the harbour side: larger homes for the same budget, newer projects, longer commute to the island city.",
          "Beyond the suburbs (Mira Road, Vasai-Virar, Kalyan and further): the lowest entry prices and the longest commutes.",
        ],
      },
      { t: "h2", text: "3. Check the project on MahaRERA before you fall in love with it" },
      {
        t: "p",
        text: "Any project above the RERA size threshold must be registered with the Maharashtra Real Estate Regulatory Authority (MahaRERA) before it is advertised or sold. The registration page shows the promoter, the approved layout, the declared completion date, the litigation disclosed, and the bank account where buyer money is held.",
      },
      {
        t: "note",
        title: "Do this before you pay a token amount",
        text: "Ask for the project's MahaRERA registration number, open the MahaRERA website yourself, and match the promoter name, location and completion date. Do not rely on a screenshot sent to you.",
      },
      { t: "h2", text: "4. Visit the site and the sample flat, then the neighbourhood" },
      {
        t: "p",
        text: "A sample flat is staged. Look at the actual construction stage, the access road, the surroundings, and any neighbouring project. For resale, meet the society secretary and check pending dues and any redevelopment plan.",
      },
      { t: "h2", text: "5. Compare in writing and negotiate" },
      {
        t: "p",
        text: "Ask for the cost sheet in writing: the base rate, floor rise, parking, club charges, GST, stamp duty and registration, and every other charge. Compare two or three projects on the same sheet. Negotiate on the whole package, not only the rate: payment plan, parking, and possession-linked terms matter as much.",
      },
      { t: "h2", text: "6. Read the agreement for sale line by line" },
      {
        t: "p",
        text: "This is the legal contract. Have it read by a property lawyer who is working for you. It should state the carpet area, the price, the payment schedule, the possession date, the penalty for delay, and the specifications. Anything promised verbally must be in the document.",
      },
      { t: "h2", text: "7. Pay stamp duty and register the agreement" },
      {
        t: "p",
        text: "In Maharashtra the agreement is registered with the Sub-Registrar after stamp duty is paid. The duty rate varies by location and buyer, and registration is a smaller percentage subject to a cap. Check the current rates on the Maharashtra registration department's website or with your lawyer, as these are revised from time to time.",
      },
      { t: "h2", text: "8. Possession: occupancy certificate first, keys second" },
      {
        t: "p",
        text: "For a new flat, ask for the occupancy certificate before you accept possession and before you pay the final instalment. Walk through the flat with the specification list from your agreement, note defects in writing, and under RERA the promoter must fix structural defects reported within five years of possession.",
      },
    ],
    faq: [
      { question: "How long does it take to buy a flat in Mumbai?", answer: "A ready flat can be bought in four to eight weeks once you have chosen it and arranged the loan. An under-construction flat is booked in a few weeks, but possession follows the project timeline stated in the agreement and on MahaRERA." },
      { question: "Should I buy under-construction or ready-to-move in Mumbai?", answer: "Ready-to-move removes delivery risk and the GST on under-construction purchases, but costs more per square foot and is usually older. Under-construction is cheaper to enter with staged payments but carries delay risk. Our comparison guide goes through both." },
      { question: "Is a property consultant necessary to buy a flat in Mumbai?", answer: "No. You can buy directly from a developer. A consultant helps when you want a side-by-side comparison of projects, someone to check the paperwork questions, and help planning visits. Ask how they are paid before you start." },
      { question: "Which documents should I check before buying?", answer: "For a new project: the MahaRERA registration, the commencement certificate, the approved plans, the title documents and the draft agreement for sale. For a resale: the previous agreements, society share certificate, no-objection certificate from the society, and property tax receipts." },
    ],
    related: ["hidden-costs-of-buying-property-in-mumbai", "check-a-project-on-maharera", "under-construction-vs-ready-to-move", "site-visit-checklist"],
    updated: UPDATED,
  },
  {
    slug: "hidden-costs-of-buying-property-in-mumbai",
    topic: "Costs and money",
    title: "Hidden costs of buying property in Mumbai: the full checklist",
    metaTitle: "Hidden Costs of Buying Property in Mumbai",
    description:
      "Stamp duty, registration, GST, parking, society deposits, legal fees and interiors: every cost on top of the agreement price when you buy a flat in Mumbai.",
    summary:
      "The agreement price is usually 85 to 90 percent of what you actually spend. On top come GST (for under-construction flats), stamp duty and registration, legal and loan charges, parking, society and maintenance deposits, and interiors. Ask for a full cost sheet before you pay a token amount.",
    market: "mumbai",
    blocks: [
      { t: "h2", text: "Taxes and government charges" },
      {
        t: "ul",
        items: [
          "GST: under-construction residential flats attract GST at a reduced rate, with a lower rate for the affordable category; a flat that already has its completion or occupancy certificate attracts none. Confirm the current rate when you book.",
          "Stamp duty: a percentage of the agreement value (or the ready-reckoner value if higher), paid before registration. The rate depends on the location and the buyer, and may include a metro or local-body cess. Check the Maharashtra registration department's current rates.",
          "Registration fee: a smaller percentage of the value, subject to a cap.",
          "TDS: if the seller is a resident and the price is above the threshold in the Income Tax Act, the buyer deducts 1 percent TDS and deposits it with the tax department. This is deducted from the payment, not extra, but it needs paperwork.",
        ],
      },
      { t: "h2", text: "Charges the developer or society adds" },
      {
        t: "ul",
        items: [
          "Floor rise, view or preferential location charges.",
          "Car parking, which can be a separate line of several lakh rupees in the island city and western suburbs.",
          "Club house, amenities and infrastructure charges.",
          "Advance maintenance for a fixed period and a society corpus or sinking fund, usually paid at possession.",
          "Share certificate and society formation or legal charges.",
        ],
      },
      { t: "h2", text: "Professional and financing costs" },
      {
        t: "ul",
        items: [
          "Property lawyer for title and agreement review.",
          "Loan processing fee, legal and valuation charges from the bank, and any prepayment or conversion charges.",
          "Home loan insurance if you take it.",
          "Commission on resale or rental transactions, as per market standards. On new launches, ask whether any commission is added to your price.",
        ],
      },
      { t: "h2", text: "After you get the keys" },
      {
        t: "ul",
        items: [
          "Interiors and furniture, often 5 to 10 percent of the property value for a basic fit-out.",
          "Electricity, gas and water connections, and the cost of moving.",
          "Monthly maintenance, property tax and the loan EMI together, which should still sit within your comfort level.",
        ],
      },
      {
        t: "note",
        title: "A simple rule",
        text: "Add 10 to 15 percent to the agreement price as your working number for taxes, deposits and set-up, and keep an extra reserve for six months of EMI.",
      },
    ],
    faq: [
      { question: "How much extra should I budget over the property price in Mumbai?", answer: "A sensible working number is 10 to 15 percent above the agreement price, covering GST where applicable, stamp duty, registration, deposits, legal charges and basic set-up. The exact figure depends on the project and your loan." },
      { question: "Do I pay GST on a ready-to-move flat?", answer: "No GST is charged on a flat sold after the completion or occupancy certificate is issued. GST applies to under-construction sales, at a rate that depends on the category of the project." },
      { question: "Is stamp duty paid on the agreement price or the ready reckoner rate?", answer: "Stamp duty is calculated on the higher of the agreement value and the government's ready-reckoner value for the area. Your lawyer or the registration department can confirm the figure for your flat." },
    ],
    related: ["how-to-buy-a-flat-in-mumbai", "home-loan-before-you-buy-property", "under-construction-vs-ready-to-move"],
    updated: UPDATED,
  },
  {
    slug: "check-a-project-on-maharera",
    topic: "Buying process",
    title: "How to check a project on MahaRERA before you pay",
    metaTitle: "How to Check a Project on MahaRERA Before Buying",
    description:
      "A five-minute MahaRERA check: registration number, promoter, completion date, litigation and the project bank account, and what each field means.",
    summary:
      "Every registered project in Maharashtra has a public MahaRERA page. Check the registration number, promoter name, declared completion date, litigation, and the dedicated bank account before you pay any amount, and open the page on the official website yourself.",
    market: "mumbai",
    blocks: [
      { t: "h2", text: "What RERA changed for buyers" },
      {
        t: "p",
        text: "The Real Estate (Regulation and Development) Act, 2016 made registration compulsory for most new residential and commercial projects, required promoters to keep a share of buyer payments in a separate project account, tied sales to carpet area, and gave buyers a way to claim interest on delayed possession. The state authority for Maharashtra is MahaRERA.",
      },
      { t: "h2", text: "The five-minute check" },
      {
        t: "ol",
        items: [
          "Ask the seller for the project's MahaRERA registration number. A project that is being advertised should show it.",
          "Go to the MahaRERA website yourself (not a link sent to you) and search for the project by number or name.",
          "Match the promoter name, the location and the project name with what you were told.",
          "Read the declared completion date and any extensions. Frequent extensions are a signal to ask questions.",
          "Look at the disclosures: litigation, the architect and engineer, the approved plans, and the project's designated bank account.",
        ],
      },
      { t: "h2", text: "What the registration does not tell you" },
      {
        t: "p",
        text: "A registration shows that a project is declared to the regulator. It is not a certificate of quality, financial strength or on-time delivery. Pair it with a visit to the site, a look at the developer's earlier projects, and a lawyer's review of the agreement.",
      },
      {
        t: "note",
        title: "Pay only by cheque or bank transfer to the project account",
        text: "Under RERA, payments for the flat go to the project's designated account. If you are asked to pay cash, or into an unrelated account, stop and ask why.",
      },
      { t: "h2", text: "If something looks wrong" },
      {
        t: "p",
        text: "You can file a complaint with MahaRERA against a promoter, and you can write to the project's listed contact. If the details on the page do not match what you were told, step back from the booking until they do.",
      },
    ],
    faq: [
      { question: "What is a MahaRERA registration number?", answer: "It is the unique number the authority gives a registered project in Maharashtra. Numbers begin with the letter P. Use it to look the project up on the official MahaRERA website." },
      { question: "Can I buy a flat in an unregistered project?", answer: "You can, but you lose the protections RERA gives buyers, and it is generally unlawful for a promoter to advertise or sell units in a project that should have been registered. Most buyers are better served by waiting for the registration." },
      { question: "Does RERA registration mean the project is safe?", answer: "It means the project is declared and monitored. Delivery risk, quality and the developer's finances still need your own checks: site visit, track record, and a lawyer's review." },
    ],
    related: ["how-to-buy-a-flat-in-mumbai", "agreement-for-sale-checklist", "site-visit-checklist"],
    updated: UPDATED,
  },
  {
    slug: "under-construction-vs-ready-to-move",
    topic: "Buying process",
    title: "Under-construction vs ready-to-move: which should you buy?",
    metaTitle: "Under-Construction vs Ready-to-Move: Which to Buy?",
    description:
      "GST, price, delay risk, payment plans and loan timing compared: how to choose between an under-construction and a ready-to-move flat in India.",
    summary:
      "Ready-to-move costs more per square foot but removes delay risk and GST. Under-construction costs less to start with and has staged payments, but carries delay, quality and market risk. Choose by when you need the home and how much waiting you can afford.",
    market: "both",
    blocks: [
      { t: "h2", text: "The two options side by side" },
      {
        t: "ul",
        items: [
          "Price: under-construction is usually lower per square foot at launch; ready-to-move prices already include the construction risk the developer has carried.",
          "Tax: GST applies to under-construction flats and not to those with a completion or occupancy certificate.",
          "Risk: with under-construction you carry delivery delay and construction-quality risk; with ready-to-move you can inspect what you are buying.",
          "Cash flow: under-construction payments are staged to progress, and many banks release the loan in the same stages, so your EMI starts small. Ready-to-move needs full payment at once.",
          "Rent: you pay rent and EMI together while you wait for an under-construction flat.",
        ],
      },
      { t: "h2", text: "When under-construction makes sense" },
      {
        t: "p",
        text: "If you do not need to move for two to four years, want a modern layout and amenities, and are comfortable with staged payments, under-construction can be a strong choice, provided the project is registered with the state RERA, the developer has a record of delivering, and the agreement states the possession date and the penalty for delay.",
      },
      { t: "h2", text: "When ready-to-move makes sense" },
      {
        t: "p",
        text: "If you need a home soon, want to see exactly what you are buying, or are unwilling to carry rent and EMI together, ready-to-move is easier to live with. Check the age of the building, the condition of the society, and the pending dues.",
      },
      { t: "h2", text: "A third option: nearly ready" },
      {
        t: "p",
        text: "Projects close to completion often combine a lower price with limited construction risk. Ask for the construction stage in writing and check the occupancy certificate timeline.",
      },
      {
        t: "note",
        title: "Questions that decide it",
        text: "When do I actually need to move? How long can I pay rent and EMI together? What does the agreement say if possession is late? Can I inspect a building by the same developer that is already delivered?",
      },
    ],
    faq: [
      { question: "Is under-construction cheaper than ready-to-move?", answer: "Usually the base price is lower, but GST and the cost of paying rent while you wait narrow the gap. Compare the total cost, not the rate per square foot." },
      { question: "Is it risky to buy an under-construction flat?", answer: "There is delay and quality risk. RERA registration, the developer's delivery record and a clear agreement reduce it, but do not remove it." },
      { question: "Can I claim a tax benefit on an under-construction flat?", answer: "Home loan interest deductions generally begin after possession, and rules change. Ask a chartered accountant what applies to you for the current year." },
    ],
    related: ["how-to-buy-a-flat-in-mumbai", "hidden-costs-of-buying-property-in-mumbai", "dubai-off-plan-property-guide"],
    updated: UPDATED,
  },
  {
    slug: "home-loan-before-you-buy-property",
    topic: "Costs and money",
    title: "Home loan before you buy: eligibility, pre-approval and the down payment",
    metaTitle: "Home Loan Before You Buy: Eligibility and Pre-Approval",
    description:
      "How much loan you can get, what the down payment must be under RBI loan-to-value limits, and why pre-approval comes before you shortlist projects.",
    summary:
      "Get your loan eligibility and a pre-approval before you shortlist. RBI limits what a bank can lend as a share of the property value, so the down payment is not negotiable; what you can control is the loan tenure, the rate and the cushion you keep.",
    market: "both",
    blocks: [
      { t: "h2", text: "Why the loan comes first" },
      {
        t: "p",
        text: "Your budget is decided by what a bank will lend and what you can comfortably repay, not by the price you hope to pay. A pre-approval tells you the number, makes negotiations easier, and avoids losing a token amount because the loan fell through.",
      },
      { t: "h2", text: "How much the bank will lend" },
      {
        t: "p",
        text: "Banks look at your income, existing EMIs, age, credit score and the property. Reserve Bank of India rules also cap the loan as a share of the property value: up to 90 percent for loans up to 30 lakh rupees, up to 80 percent for loans above 30 lakh and up to 75 lakh, and up to 75 percent above that. The rest is your down payment, and it excludes taxes and registration.",
      },
      { t: "h2", text: "Keep your total EMI comfortable" },
      {
        t: "p",
        text: "A common rule of thumb is to keep all EMIs together below roughly 40 percent of your monthly take-home income. Stay well inside that if your income is variable or you have dependents.",
      },
      { t: "h2", text: "Things to compare between banks" },
      {
        t: "ul",
        items: [
          "Interest rate and whether it is linked to an external benchmark that resets.",
          "Processing fee, legal and valuation charges.",
          "Whether the bank is approved for the project, which makes the loan faster.",
          "Prepayment rules, and whether part-prepayment is free on a floating-rate loan.",
          "How and when the loan is released against an under-construction project.",
        ],
      },
      {
        t: "note",
        title: "Keep a reserve",
        text: "Keep at least six months of EMI and household expenses aside after the down payment, taxes and set-up costs. Buying is a good decision when it does not leave you one bad month from stress.",
      },
    ],
    faq: [
      { question: "What credit score do I need for a home loan?", answer: "A score of around 750 or above generally gets the best terms. Lower scores can still be approved, usually at a higher rate. Check your score a few weeks before applying and correct any errors." },
      { question: "Is a pre-approval a guarantee of the loan?", answer: "No. It is an indication based on your documents and credit profile. The final sanction depends on the property's legal and valuation checks." },
      { question: "Can an NRI get a home loan in India?", answer: "Yes, banks lend to NRIs against Indian property, with documentation and income proof from abroad. Terms vary by bank." },
    ],
    related: ["hidden-costs-of-buying-property-in-mumbai", "nri-buying-property-in-india", "under-construction-vs-ready-to-move"],
    updated: UPDATED,
  },
  {
    slug: "agreement-for-sale-checklist",
    topic: "Buying process",
    title: "Agreement for sale checklist: what to check before you sign",
    metaTitle: "Agreement for Sale Checklist for Flat Buyers in India",
    description:
      "The clauses to read before signing a builder-buyer agreement in India: carpet area, payment schedule, possession date, delay interest, defects and specifications.",
    summary:
      "The agreement for sale decides your rights. Check the carpet area, total price and what it includes, the payment schedule tied to construction stages, the possession date with the penalty for delay, the specifications, and the refund terms, and get a property lawyer working for you to read it.",
    market: "both",
    blocks: [
      { t: "h2", text: "Why this document matters more than the brochure" },
      {
        t: "p",
        text: "A brochure is marketing. The agreement is the contract. Whatever the sales team said about amenities, views, possession or parking only counts if it is written in the agreement. RERA also prescribes a model form for the agreement, so a very different draft is worth questioning.",
      },
      { t: "h2", text: "Clauses to read slowly" },
      {
        t: "ul",
        items: [
          "Area: carpet area is the usable area inside the walls. Check that the price per square foot is on carpet area, not an inflated super built-up figure.",
          "Price: the total, what it includes, and every extra charge listed separately.",
          "Payment schedule: instalments should be linked to construction stages, with the maximum percentage payable before the agreement is registered kept within what the law allows.",
          "Possession date and delay: the date, any grace period, and the interest or compensation payable if the promoter is late.",
          "Specifications and amenities: flooring, fittings, brand names, and the amenities and their completion date.",
          "Defects: the promoter's liability to repair structural defects reported within the statutory period after possession.",
          "Cancellation and refund: what happens if you cancel, or the project is delayed beyond a limit.",
          "Title and approvals: the land title, the approved plans, and any pending litigation.",
        ],
      },
      { t: "h2", text: "Who should read it" },
      {
        t: "p",
        text: "Use a property lawyer who is paid by you and not by the developer or the person selling to you. Give them several days, not an afternoon. A good lawyer's fee is small next to the cost of a missed clause.",
      },
      {
        t: "note",
        title: "Never sign under time pressure",
        text: "A genuine offer survives a week of review. If the price is only available today, ask for the terms in writing and take the time anyway.",
      },
    ],
    faq: [
      { question: "What is the difference between carpet area and super built-up area?", answer: "Carpet area is the area you can lay a carpet on, inside the walls. Super built-up adds a share of common areas. RERA requires sale on carpet area, so compare prices on that basis." },
      { question: "How much can the builder ask before registering the agreement?", answer: "The law limits the advance a promoter can take before the agreement for sale is registered to a small percentage of the cost. Ask your lawyer to confirm the current limit." },
      { question: "Can I change clauses in the builder's agreement?", answer: "Standard clauses are fixed, but you can ask for additions, such as specifications or dates, to be written in. Anything you are promised should be in the document." },
    ],
    related: ["check-a-project-on-maharera", "how-to-buy-a-flat-in-mumbai", "site-visit-checklist"],
    updated: UPDATED,
  },
  {
    slug: "site-visit-checklist",
    topic: "Buying process",
    title: "Property site visit checklist: 25 things to check before you book",
    metaTitle: "Property Site Visit Checklist Before You Book a Flat",
    description:
      "What to check at the project, the sample flat and the neighbourhood before you pay a token amount: construction, access, light, water, noise, society and paperwork.",
    summary:
      "On a site visit, look past the sample flat. Check the construction stage, the road and transport access, light and ventilation, water supply, noise, the neighbourhood at different hours, and ask for the key documents. Visit twice, at different times, before you book.",
    market: "both",
    blocks: [
      { t: "h2", text: "At the project" },
      {
        t: "ul",
        items: [
          "Ask to see the actual tower and floor, not only the sample flat.",
          "Check the construction stage against the stage on the RERA page.",
          "Look at the quality of work visible: plaster, waterproofing, lift lobbies, fire exits.",
          "Ask which amenities are ready and which are only planned.",
          "Check the parking allotment and how cars will move.",
        ],
      },
      { t: "h2", text: "In the flat" },
      {
        t: "ul",
        items: [
          "Natural light and cross-ventilation at the time of day you are home.",
          "The view you will actually have, including any neighbouring plot or tower.",
          "Room sizes against the plan, and whether furniture will fit.",
          "Noise from the road, the railway or the lift, and the smell from nearby drains or industry.",
          "Water supply source and storage, and the power backup.",
        ],
      },
      { t: "h2", text: "Around the property" },
      {
        t: "ul",
        items: [
          "Time the commute at your real hour, not on a Sunday.",
          "Walk to the station or bus stop, the nearest school and hospital.",
          "Look at the area after dark and in the rain.",
          "Ask residents of nearby buildings about water, waterlogging and maintenance.",
          "Check planned infrastructure on official sources, not only on the brochure.",
        ],
      },
      { t: "h2", text: "Ask for the documents" },
      {
        t: "ul",
        items: [
          "RERA registration number and the cost sheet in writing.",
          "The approved plan and the commencement certificate.",
          "The draft agreement for sale, to read at home.",
          "For resale: the previous agreements, the society no-objection certificate and the latest maintenance and property tax receipts.",
        ],
      },
      {
        t: "note",
        title: "Visit twice",
        text: "Go once with the sales team and once alone, at a different time of day. The second visit is the one that tells you what living there is like.",
      },
    ],
    faq: [
      { question: "How many properties should I visit before deciding?", answer: "Most buyers decide well after seeing three to five projects that fit their budget and area, compared on the same cost sheet. Seeing many more tends to create confusion, not clarity." },
      { question: "Should I take someone with me on a site visit?", answer: "Yes. A second person notices what you miss and helps you resist the pressure of the moment." },
    ],
    related: ["how-to-buy-a-flat-in-mumbai", "agreement-for-sale-checklist", "check-a-project-on-maharera"],
    updated: UPDATED,
  },
  {
    slug: "nri-buying-property-in-india",
    topic: "NRI and overseas",
    title: "NRI buying property in India: eligibility, payments and paperwork",
    metaTitle: "NRI Buying Property in India: Rules, Payments, Paperwork",
    description:
      "What an NRI can and cannot buy in India, how to pay, which documents are needed, and what to know about tax and repatriation before you book a flat.",
    summary:
      "NRIs can buy residential and commercial property in India without special RBI permission, but not agricultural land, plantations or farmhouses. Pay through your NRE, NRO or FCNR account or inward remittance, keep every document attested, and ask a chartered accountant about tax and repatriation before you book.",
    market: "mumbai",
    blocks: [
      { t: "h2", text: "What an NRI can buy" },
      {
        t: "ul",
        items: [
          "Residential property: apartments, villas and plots for residential use.",
          "Commercial property: shops and offices.",
          "Not allowed without special permission: agricultural land, plantation property and farmhouses.",
        ],
      },
      { t: "h2", text: "How to pay" },
      {
        t: "p",
        text: "Payment must come through normal banking channels: an inward remittance, or funds from your NRE, NRO or FCNR account in India. Cash payments are not acceptable and are risky for you. Keep the bank record of every payment tied to the agreement.",
      },
      { t: "h2", text: "Documents you will typically need" },
      {
        t: "ul",
        items: [
          "Passport and visa or residence proof abroad, and your PAN card.",
          "Overseas address proof and recent photographs.",
          "A power of attorney if someone in India will sign on your behalf. It usually has to be attested or apostilled, so plan the time.",
          "Income documents if you are taking a home loan.",
        ],
      },
      { t: "h2", text: "Tax and repatriation" },
      {
        t: "p",
        text: "Rental income and sale proceeds are taxed in India, and the buyer of an NRI's property has to deduct tax at source, usually at higher rates than for a resident seller. Rules on moving sale proceeds abroad have conditions. These rules change, so speak to a chartered accountant who works with NRIs before you buy.",
      },
      { t: "h2", text: "Practical advice" },
      {
        t: "ul",
        items: [
          "Prefer a RERA-registered project with a clear completion date, so you are not managing a delayed project from abroad.",
          "Use one trusted person in India for site checks and document collection, and keep the power of attorney limited in scope.",
          "Ask for video walk-throughs and photographs at each construction stage.",
          "Plan rental management or maintenance before possession, not after.",
        ],
      },
    ],
    faq: [
      { question: "Can an NRI buy more than one property in India?", answer: "Yes, an NRI may buy any number of residential or commercial properties. Limits apply when moving sale proceeds abroad, which is why tax advice is worth taking early." },
      { question: "Can an NRI take a home loan in India?", answer: "Yes. Banks lend to NRIs against Indian property. Expect extra documentation, attested overseas income proof and repayment from an NRE or NRO account." },
      { question: "Do I need to travel to India to buy a flat?", answer: "Not always. With a properly drafted power of attorney and good document handling you can complete the purchase remotely, but many buyers still visit once to see the project in person." },
    ],
    related: ["home-loan-before-you-buy-property", "how-to-buy-a-flat-in-mumbai", "buying-property-in-dubai-from-india"],
    updated: UPDATED,
  },
  {
    slug: "which-part-of-mumbai-to-buy-in",
    topic: "Mumbai",
    title: "Which part of Mumbai should you buy in? Island city, suburbs and Thane",
    metaTitle: "Which Part of Mumbai Should You Buy In? A Plain Guide",
    description:
      "A plain comparison of the island city, the suburbs and the Thane and harbour side of the Mumbai region: prices, commute, infrastructure and who each suits.",
    summary:
      "The island city and western suburbs give proximity and prestige at the highest price. The central suburbs and Thane give mature neighbourhoods with strong rail and road links and a wide price range. The harbour side gives planned layouts and newer infrastructure at lower prices, with a longer trip to the island city. Choose by your commute and your budget, not by hype.",
    market: "mumbai",
    blocks: [
      { t: "h2", text: "At a glance" },
      {
        t: "ul",
        items: [
          "Island city and western suburbs: the highest prices, the shortest distance to the older business districts, and mostly resale and redevelopment stock.",
          "Central suburbs and Thane: established neighbourhoods with their own markets, schools and hospitals, a large number of new projects, and good links by rail and the eastern express highway.",
          "Harbour side (Vashi, Kharghar, Panvel and nearby): planned layouts with wide roads and open space, newer infrastructure, and lower prices than the central suburbs.",
        ],
      },
      { t: "h2", text: "Commute: decide this first" },
      {
        t: "p",
        text: "Test your actual route at your actual hour. A cheaper home that adds two hours a day to your life has a cost that never shows on the price sheet. Think about whether you commute to the island city, to a business district in the suburbs, to the harbour belt, or work from home.",
      },
      { t: "h2", text: "Infrastructure to follow on official sources" },
      {
        t: "p",
        text: "Metro lines, sea links, the coastal road and the new airport on the harbour side change travel times. Treat projected dates with caution, check the authority's own announcements, and avoid paying a premium for infrastructure that is not yet running.",
      },
      { t: "h2", text: "Who each suits" },
      {
        t: "ul",
        items: [
          "Buyers who need to be close to the island city and have a larger budget: the island city and western suburbs.",
          "Families who want space, schools and a developed neighbourhood without island-city prices: the central suburbs and Thane.",
          "Buyers who want a planned, newer neighbourhood and are willing to pay for a longer trip to the island city: the harbour side.",
        ],
      },
      {
        t: "note",
        title: "Compare like with like",
        text: "Compare carpet-area prices inside one micro-market, then compare total monthly cost: EMI plus transport plus maintenance.",
      },
    ],
    faq: [
      { question: "Is Thane or the harbour side better for a first home?", answer: "It depends on where you work. Thane suits those who travel on the central or eastern corridor; the harbour side suits those working in the harbour belt or nearby business districts. Test the commute before you decide." },
      { question: "Are prices lower away from the island city?", answer: "Generally, but the gap changes by micro-market and project. Compare carpet-area rates for the specific projects you are considering." },
    ],
    related: ["how-to-buy-a-flat-in-mumbai", "site-visit-checklist", "under-construction-vs-ready-to-move"],
    updated: UPDATED,
  },
];
