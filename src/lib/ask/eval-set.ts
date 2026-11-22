/**
 * The questions the assistant is measured against. Two kinds:
 *  - ANSWERABLE: our content covers it. The retrieval must put a passage from one of `from` (guide slugs, passage-id prefixes or
 *    paths) in its top results, so the AI model is always shown the right source.
 *  - MUST_DECLINE: not about property buying in India or Dubai, or something we must not answer (live prices, rankings, legal
 *    verdicts). Retrieval must report "not answerable" so no AI call is made, or the AI is told to decline.
 *
 * This is the accuracy contract. When a guide changes, run the tests: a question that stops finding its source is a regression.
 */

export interface AnswerableCase {
  q: string;
  market?: "india" | "dubai";
  /** Substrings of a passage id or url that must appear among the top results. */
  from: string[];
}

export const ANSWERABLE: AnswerableCase[] = [
  { q: "How do I check a project on MahaRERA before paying?", from: ["check-a-project-on-maharera"] },
  { q: "What hidden costs are there when buying a flat in Mumbai?", from: ["hidden-costs-of-buying-property-in-mumbai"] },
  { q: "Should I buy under construction or ready to move in?", from: ["under-construction-vs-ready-to-move"] },
  { q: "Can an NRI buy a flat in India and how to pay?", from: ["nri-buying-property-in-india"] },
  { q: "What should I check in an agreement for sale before signing?", from: ["agreement-for-sale-checklist"] },
  { q: "How do Indians buy property in Dubai?", from: ["buying-property-in-dubai-from-india"] },
  { q: "How does off-plan property work in Dubai and what is escrow?", from: ["dubai-off-plan-property-guide"] },
  { q: "Does buying property in Dubai give a Golden Visa?", from: ["dubai-golden-visa-property"] },
  { q: "What is carpet area?", from: ["glossary:carpet-area"] },
  { q: "What does Oqood mean in Dubai?", from: ["glossary:oqood"] },
  { q: "What is an occupancy certificate and why does it matter?", from: ["glossary:occupancy-certificate"] },
  { q: "What is the difference between Mumbai, Navi Mumbai and Thane for buying a home?", from: ["mumbai-vs-navi-mumbai-vs-thane"] },
  { q: "How do property consultants get paid?", from: ["how-property-consultants-get-paid"] },
  { q: "What questions should I ask before choosing a property consultant?", from: ["how-to-choose-a-property-consultant"] },
  { q: "What should I look for on a site visit?", from: ["site-visit-checklist"] },
  { q: "How much home loan can I get before I shortlist projects?", from: ["home-loan-before-you-buy-property"] },
  { q: "What should I know about buying in Powai?", from: ["buying-property-in-powai"] },
  { q: "What is Dubai Land Department and RERA in Dubai?", from: ["rera-dubai", "dld", "dubai-land-department"] },
  { q: "My flat is delayed. What interest can I claim?", from: ["tool:delay"] },
  { q: "What is pre-EMI for an under-construction flat?", from: ["glossary:pre-emi", "tool:emi"] },
  { q: "Which regulator should I check for a developer in Mumbai?", from: ["market:mumbai:regulator", "regulator:maharera"] },
  { q: "How do I step-by-step buy a flat in Mumbai?", from: ["how-to-buy-a-flat-in-mumbai"] },
];

export const MUST_DECLINE: string[] = [
  "Write me a poem about the sea",
  "What is the capital of France?",
  "Who won the cricket world cup?",
  "How do I bake a chocolate cake?",
  "Explain quantum computing",
  "What is the weather in Paris tomorrow?",
];
