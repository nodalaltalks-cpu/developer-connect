import type { Guide } from "./types.ts";

/**
 * Dubai buying guides and the "how to choose an advisor" guides. Same rules as guides-india.ts: stable facts stated plainly, changing
 * numbers described as "check the current figure", no ranking, no guarantee, no claim about a named developer.
 */

const UPDATED = "2026-10-13";

export const DUBAI_AND_ADVISOR_GUIDES: readonly Guide[] = [
  {
    slug: "buying-property-in-dubai-from-india",
    topic: "Dubai",
    title: "Buying property in Dubai from India: costs, process and risks",
    metaTitle: "Buying Property in Dubai from India: Costs and Process",
    description:
      "How Indians buy property in Dubai: freehold areas, the 4% Dubai Land Department fee, payment routes from India, tax on both sides, and checks on the project.",
    summary:
      "Foreign nationals, including Indians, can buy freehold property in designated Dubai areas. The main one-time cost is the Dubai Land Department fee of 4 percent of the price, with smaller registration and agent costs. Dubai has no annual property tax on individuals, but money sent from India falls under Indian foreign-exchange and tax rules, so plan the payment route first.",
    market: "dubai",
    blocks: [
      { t: "h2", text: "Who can buy and where" },
      {
        t: "p",
        text: "Foreign nationals, including Indian citizens and NRIs, can buy freehold property in the areas Dubai has designated for foreign ownership. These include most of the large master-planned communities and waterfront districts. You do not need to be a resident to buy, and owning a property does not by itself make you a resident, although some purchase values qualify for a long-term residence visa.",
      },
      { t: "h2", text: "The process in seven steps" },
      {
        t: "ol",
        items: [
          "Set the budget in dirhams, including fees, and decide whether you want ready or off-plan.",
          "Shortlist communities by what you want: rental yield, end-use, schools, or lifestyle.",
          "Check the project and the developer with the Dubai Land Department and the regulator, and confirm that sales funds go into a regulated escrow account for off-plan.",
          "Reserve the unit with a booking form and booking amount.",
          "Sign the sale and purchase agreement. For off-plan, the agreement is registered on the Oqood system; for ready property, the transfer happens at a Dubai Land Department trustee office.",
          "Pay the instalments or the balance, and the Dubai Land Department fee.",
          "Receive the title or registered contract, and arrange handover, service charges and utilities.",
        ],
      },
      { t: "h2", text: "What it costs on top of the price" },
      {
        t: "ul",
        items: [
          "Dubai Land Department transfer fee: 4 percent of the property value, plus a small administrative fee. For off-plan it is paid at registration.",
          "Registration or trustee fees and a mortgage registration fee if you borrow.",
          "Agency commission on resale property is commonly about 2 percent, paid in line with local practice; on a new off-plan sale from the developer, ask whether any commission is added.",
          "Annual service charges for the building or community, billed per square foot.",
          "There is no annual property tax or capital gains tax for individuals on Dubai property, but tax rules in India still apply to you if you are an Indian tax resident.",
        ],
      },
      { t: "h2", text: "Moving money from India" },
      {
        t: "p",
        text: "Resident Indians can remit money abroad under the Liberalised Remittance Scheme, which has an annual per-person limit, and a tax collected at source applies above a threshold. NRIs have different routes. Rules and rates change, so confirm the current position with your bank or a chartered accountant before you commit to a payment plan.",
      },
      {
        t: "note",
        title: "Pay only to the regulated account",
        text: "For off-plan purchases, the instalments go to the project's escrow account named on the contract. Never pay a booking amount to an individual's account or in cash.",
      },
      { t: "h2", text: "Risks to plan for" },
      {
        t: "ul",
        items: [
          "Currency: the dirham is pegged to the dollar, but your costs and income are in rupees.",
          "Delivery: an off-plan project can be late. Check the developer's record and the contract's delay terms.",
          "Liquidity: resale takes time and costs, especially in a new community with many similar units.",
          "Over-promised returns: treat any yield promise as marketing until you see the actual rents and service charges.",
        ],
      },
    ],
    faq: [
      { question: "Can an Indian citizen buy property in Dubai?", answer: "Yes. Foreign nationals, including Indians, can buy freehold property in designated areas of Dubai, with or without residence in the UAE." },
      { question: "What are the costs of buying property in Dubai?", answer: "The main one-time cost is the Dubai Land Department fee of 4 percent, plus administrative and registration fees, any mortgage fees and agency commission on resale. Then annual service charges apply." },
      { question: "Is there tax on property in Dubai?", answer: "There is no annual property tax and no capital gains tax for individuals on Dubai property. If you are an Indian tax resident, Indian tax rules on your foreign assets and income still apply." },
      { question: "Is it safe to buy off-plan in Dubai?", answer: "Off-plan sales are regulated, with buyer money held in escrow accounts and contracts registered, but delivery and market risk remain. Check the developer, the project registration and the payment schedule." },
    ],
    related: ["dubai-off-plan-property-guide", "dubai-golden-visa-property", "nri-buying-property-in-india"],
    updated: UPDATED,
  },
  {
    slug: "dubai-off-plan-property-guide",
    topic: "Dubai",
    title: "Off-plan property in Dubai: how it works and what to check",
    metaTitle: "Off-Plan Property in Dubai: How It Works and What to Check",
    description:
      "Escrow accounts, Oqood registration, payment plans and handover: how off-plan purchases work in Dubai, and the checks that protect your money.",
    summary:
      "Off-plan means buying a unit before it is built, usually on a staged payment plan. In Dubai the money is meant to go into a regulated escrow account for the project, and the sale is registered on the government's Oqood system. The protections are real but not total, so check the developer's record, the project registration and the contract.",
    market: "dubai",
    blocks: [
      { t: "h2", text: "How an off-plan purchase works" },
      {
        t: "p",
        text: "You book a unit from a developer's launch, pay a booking amount, and sign the sale and purchase agreement. The price is paid in instalments tied to a payment plan, often with a portion on handover, and sometimes with part payable after handover. The contract is registered by the Dubai Land Department on its Oqood system.",
      },
      { t: "h2", text: "Why escrow matters" },
      {
        t: "p",
        text: "Dubai law requires developers to open a project escrow account at an approved bank and deposit buyers' instalments there. Funds are released against construction progress certified by the regulator's process. This is the main protection for an off-plan buyer, so always confirm the escrow details on the contract.",
      },
      { t: "h2", text: "What to check before you book" },
      {
        t: "ol",
        items: [
          "The project's registration with the Dubai Land Department and the developer's licence.",
          "The escrow account name and bank, written in the sale agreement.",
          "The advertising permit number shown on the listing, which links the advert to a registered project.",
          "The developer's history: earlier projects delivered, on what dates, and what residents say.",
          "The payment plan: instalment dates, the handover amount, and any post-handover payments.",
          "The delay and cancellation terms in the contract.",
          "Service charge estimates and who manages the community.",
        ],
      },
      { t: "h2", text: "Common mistakes" },
      {
        t: "ul",
        items: [
          "Booking on the first day because inventory is 'running out', before reading the contract.",
          "Judging a payment plan only by its first instalment and ignoring the handover amount.",
          "Treating a yield or resale-profit projection as a promise.",
          "Paying a booking amount to a person or an account that is not the developer's regulated account.",
          "Not budgeting for the 4 percent transfer fee, registration and service charges.",
        ],
      },
      {
        t: "note",
        title: "Read the contract before the reservation, not after",
        text: "Ask for the sale and purchase agreement in advance. Anything that is not clear before you pay a booking amount is difficult to fix afterwards.",
      },
    ],
    faq: [
      { question: "What is Oqood in Dubai?", answer: "Oqood is the Dubai Land Department's registration system for off-plan sales. Registering the contract gives you an official record of your purchase." },
      { question: "What is a typical off-plan payment plan in Dubai?", answer: "Plans vary by developer and project: a booking amount, staged instalments during construction, a payment on handover, and sometimes instalments after handover. Compare the plans on the total and the timing." },
      { question: "What happens if an off-plan project is delayed?", answer: "The contract and the regulator's rules set out your options, which can include refund in certain cases. Read the delay and termination clauses before you pay." },
    ],
    related: ["buying-property-in-dubai-from-india", "dubai-golden-visa-property", "under-construction-vs-ready-to-move"],
    updated: UPDATED,
  },
  {
    slug: "dubai-golden-visa-property",
    topic: "Dubai",
    title: "Dubai Golden Visa through property: what to know before you buy",
    metaTitle: "Dubai Golden Visa Through Property: What to Know",
    description:
      "The property route to a UAE long-term residence visa: the value threshold, what qualifies, what the visa does not do, and how to confirm the current rules.",
    summary:
      "Investing in Dubai property above a stated value threshold can qualify an owner for a long-term residence visa. The rules on the threshold, mortgaged property and off-plan have changed before, so confirm them with the Dubai Land Department before you buy, and do not choose a property for the visa alone.",
    market: "dubai",
    blocks: [
      { t: "h2", text: "What the property route is" },
      {
        t: "p",
        text: "The UAE offers a long-term residence visa, commonly called the Golden Visa, for certain investors. For property, eligibility has been linked to owning real estate above a set value, which has been AED 2 million. The visa lets the holder, and in most cases family members, live in the UAE, and is renewable.",
      },
      { t: "h2", text: "Points to confirm for your purchase" },
      {
        t: "ul",
        items: [
          "The current value threshold, and whether it applies to the property price or to the amount paid.",
          "Whether off-plan property qualifies, and at what stage of payment.",
          "Whether a mortgaged property qualifies, and the minimum equity required.",
          "Whether several smaller properties can be combined to reach the threshold.",
          "The process and fees to apply, and the medical and insurance requirements.",
        ],
      },
      {
        t: "p",
        text: "These conditions have been updated by the authorities more than once. Treat any figure here, or from a salesperson, as a starting point, and verify it with the Dubai Land Department or the immigration authority.",
      },
      { t: "h2", text: "What the visa does not do" },
      {
        t: "ul",
        items: [
          "It does not make a weak property a good investment.",
          "It does not by itself change your tax position in India. Residency and tax rules are separate, so ask a chartered accountant.",
          "It does not remove the need to check the developer, the escrow account and the contract.",
        ],
      },
      {
        t: "note",
        title: "Buy the property for the property",
        text: "Choose the project on location, price, developer track record and your use. Qualifying for a visa should be a bonus on a purchase you would make anyway.",
      },
    ],
    faq: [
      { question: "What is the minimum property value for the UAE Golden Visa?", answer: "It has been AED 2 million for property investors. The authorities can change the rules, so confirm the current threshold and conditions before buying." },
      { question: "Can I get the Golden Visa with an off-plan property?", answer: "Rules on off-plan eligibility have varied. Ask the Dubai Land Department or a licensed advisor for the current position at the time of your purchase." },
    ],
    related: ["buying-property-in-dubai-from-india", "dubai-off-plan-property-guide"],
    updated: UPDATED,
  },
  {
    slug: "how-to-choose-a-property-consultant",
    topic: "Choosing an advisor",
    title: "How to choose a property consultant in India: 10 questions to ask",
    metaTitle: "How to Choose a Property Consultant in India: 10 Questions",
    description:
      "How to tell a useful property consultant from a salesperson: how they are paid, which projects they cover, and ten questions to ask before you share your number.",
    summary:
      "A good property consultant shows how they are paid before you ask, covers several developers, is transparent about registration and track record, and is comfortable if you say no. Ask the ten questions below, and walk away from anyone who pressures you to book quickly.",
    market: "both",
    blocks: [
      { t: "h2", text: "What a consultant should actually do for you" },
      {
        t: "ul",
        items: [
          "Understand your budget, timeline and use, before naming a project.",
          "Compare options across more than one developer, on the same cost sheet.",
          "Explain the legal and regulatory checks for each project.",
          "Plan site visits and be present, so you are not alone with a sales team.",
          "Stay involved through the agreement, loan and possession.",
        ],
      },
      { t: "h2", text: "Ten questions to ask" },
      {
        t: "ol",
        items: [
          "How are you paid, and by whom? On new launches, is anything added to my price?",
          "Which developers and projects do you cover, and which do you not?",
          "Are you registered with the real estate regulator where I am buying? What is your registration number?",
          "How many projects like this have you closed, and can I speak to a past client who agrees to it?",
          "What will you do if you think a project I like is not right for me?",
          "Will you give me the cost sheet and the agreement in writing, before I pay a booking amount?",
          "Who does the legal checks, and is the lawyer working for me?",
          "What happens after I book: do you help with the loan, the registration and possession?",
          "Can I speak to the developer directly if I want to?",
          "What is your policy if I decide not to buy?",
        ],
      },
      { t: "h2", text: "Signals to trust" },
      {
        t: "ul",
        items: [
          "They tell you how they earn before you ask.",
          "They name a project's disadvantages without being asked.",
          "They are comfortable with you checking everything yourself.",
          "They have a named, reachable person and a business with a track record you can verify.",
        ],
      },
      { t: "h2", text: "Signals to leave" },
      {
        t: "ul",
        items: [
          "Urgency: only one more unit left, price rises tomorrow.",
          "Guaranteed returns or buy-back promises.",
          "A request to pay cash, or to pay into a personal account.",
          "Reluctance to put things in writing.",
          "A shortlist of one.",
        ],
      },
      {
        t: "note",
        title: "A consultant works for the buyer, not for the sale",
        text: "The best test is how they respond when you say you want to wait. A good one agrees. A salesperson increases the pressure.",
      },
    ],
    faq: [
      { question: "Do I have to pay a property consultant?", answer: "It depends on the transaction and the consultant. On many new launches the developer pays the channel partner and the buyer pays nothing extra, while resale and rental deals usually carry commission as per market practice. Ask for the answer in writing." },
      { question: "Should I use a consultant or buy directly from the developer?", answer: "Buying directly is perfectly valid. A consultant is worth it when they save you time comparing projects, add checks you would not know to make, and are open about how they earn." },
      { question: "How do I know a consultant is genuine?", answer: "Ask for a regulator registration number where one is required, check it on the regulator's website, look for a named person with a verifiable track record, and be wary of guarantees and pressure." },
    ],
    related: ["how-property-consultants-get-paid", "how-to-buy-a-flat-in-mumbai", "check-a-project-on-maharera"],
    updated: UPDATED,
  },
  {
    slug: "how-property-consultants-get-paid",
    topic: "Choosing an advisor",
    title: "How property consultants get paid, and why it matters to you",
    metaTitle: "How Property Consultants Get Paid: Commission Explained",
    description:
      "Who pays a property consultant on new launches, resale and rentals, how that can shape the advice you get, and how to ask for full disclosure before you commit.",
    summary:
      "On new launches a consultant is usually paid by the developer, on resale and rentals by the buyer, seller or tenant according to market practice. Neither is wrong, but each creates an incentive, so ask who pays, how much, and whether the advice would change if you bought nothing.",
    market: "both",
    blocks: [
      { t: "h2", text: "The three common models" },
      {
        t: "ul",
        items: [
          "New launches (primary sales): the developer pays the consultant a commission on a sale. The buyer typically pays the same price as buying directly.",
          "Resale and rentals (secondary): the consultant is usually paid a percentage of the deal, by the buyer, the seller, or split between them, according to market practice.",
          "Fee-for-advice: the buyer pays for the research and advice, whichever project is chosen. This is less common in India but exists.",
        ],
      },
      { t: "h2", text: "Why the model matters" },
      {
        t: "p",
        text: "Whoever pays shapes the incentive. A consultant paid only if you buy has a reason to close; one paid by a developer has a reason to favour that developer. This does not make the advice wrong, but it is why disclosure matters more than reassurance.",
      },
      { t: "h2", text: "What to ask for" },
      {
        t: "ul",
        items: [
          "A clear statement of who pays the consultant on your transaction, and whether any amount is added to your price.",
          "A list of the developers they work with, and the ones they do not.",
          "A commitment to compare at least three options with the same cost sheet.",
          "A written note of why they recommend one project over another.",
        ],
      },
      { t: "h2", text: "How Developer Connects states it" },
      {
        t: "p",
        text: "Developer Connects charges 0% commission on primary (new-launch) sales. On secondary (resale) and rental transactions, commission is applicable as per market standards. The same statement appears in our privacy policy and disclaimer.",
      },
      {
        t: "note",
        title: "The question that cuts through",
        text: "Ask: if I decide not to buy anything, what do you lose? Then read the answer carefully.",
      },
    ],
    faq: [
      { question: "Does a consultant make a property more expensive?", answer: "On a new launch the price is generally set by the developer and is the same whether or not a consultant is involved. Ask to confirm that no extra amount is added to your price." },
      { question: "What is a fair commission on resale in India?", answer: "Market practice varies by city and deal size, and is usually a percentage of the price. Agree the amount and who pays it in writing before you begin." },
    ],
    related: ["how-to-choose-a-property-consultant", "hidden-costs-of-buying-property-in-mumbai", "how-to-buy-a-flat-in-mumbai"],
    updated: UPDATED,
  },
];
