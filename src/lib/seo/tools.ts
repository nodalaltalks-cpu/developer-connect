import type { FaqEntry } from "./types.ts";

/** The free tools and the glossary: their paths and the words they publish, shared by the pages, the sitemap and llms-full.txt. */

export const EMI_TOOL_PATH = "/tools/home-loan-emi-calculator";
export const GLOSSARY_PATH = "/property-glossary";

export const EMI_TOOL_FAQ: readonly FaqEntry[] = [
  { question: "What is an EMI?", answer: "An equated monthly instalment (EMI) is the fixed amount you pay your lender every month. Each EMI covers that month's interest on the outstanding loan and repays part of the loan itself." },
  { question: "Does a longer tenure reduce my EMI?", answer: "Yes, a longer tenure lowers the monthly instalment, but you pay interest for longer, so the total interest rises. Compare the total you repay, not only the EMI." },
  { question: "Is the EMI the same for an under-construction flat?", answer: "Not at first. During construction the bank releases the loan in stages, and you usually pay interest only on what has been released (pre-EMI) until the full loan is disbursed. Some lenders let you start the full EMI earlier." },
  { question: "Can I use this calculator for a Dubai mortgage?", answer: "Yes. Choose AED and enter the rate and tenure your UAE lender offers. UAE lenders also set a maximum loan-to-value for each buyer type, so the loan amount you can get depends on the property value and your residency status." },
];

export interface GlossaryTerm {
  term: string;
  /** An anchor-safe id, so each definition has its own link. */
  id: string;
  market: "India" | "Dubai" | "Both";
  definition: string;
}

export const GLOSSARY: readonly GlossaryTerm[] = [
  { term: "Agreement for sale", id: "agreement-for-sale", market: "India", definition: "The contract between a buyer and a developer (or seller) that sets out the carpet area, price, payment schedule, possession date and specifications. In Maharashtra it is stamped and registered with the Sub-Registrar." },
  { term: "Carpet area", id: "carpet-area", market: "India", definition: "Under RERA, the net usable floor area of a flat, inside the walls, excluding external walls, service shafts, the balcony and open terrace areas. Developers must state the price on carpet area." },
  { term: "Built-up area", id: "built-up-area", market: "India", definition: "Carpet area plus the thickness of the walls and, often, the balcony. It is always larger than the carpet area, so compare prices on carpet area." },
  { term: "Super built-up area", id: "super-built-up-area", market: "India", definition: "Built-up area plus a share of common areas such as the lobby, lifts and stairs. It was widely used for pricing before RERA; ask for the carpet area instead." },
  { term: "Loading", id: "loading", market: "India", definition: "The percentage by which the super built-up area exceeds the carpet area. A high loading means you pay for more common area and get less usable space." },
  { term: "RERA", id: "rera", market: "India", definition: "The Real Estate (Regulation and Development) Act, 2016, and the state authorities it created. Projects above the size threshold must register before they are advertised or sold, and must disclose approvals, timelines and the project bank account." },
  { term: "MahaRERA", id: "maharera", market: "India", definition: "The Maharashtra Real Estate Regulatory Authority. Its website shows each registered project's promoter, approvals, completion date, litigation and quarterly progress." },
  { term: "Commencement certificate (CC)", id: "commencement-certificate", market: "India", definition: "Permission from the planning authority to start construction, often issued floor by floor. Check that it covers the floor you are buying." },
  { term: "Occupancy certificate (OC)", id: "occupancy-certificate", market: "India", definition: "The certificate from the planning authority confirming that a building was built as approved and is fit to occupy. Ask for it before you take possession and pay the final instalment." },
  { term: "Floor rise", id: "floor-rise", market: "India", definition: "An extra charge per square foot for higher floors, added to the base rate. It should appear on the written cost sheet." },
  { term: "Stamp duty", id: "stamp-duty", market: "India", definition: "A state tax paid on the agreement for sale or sale deed. The rate depends on the state, the location and sometimes the buyer; check the current rate before you budget." },
  { term: "Registration fee", id: "registration-fee", market: "India", definition: "The fee paid to register the property document with the Sub-Registrar, separate from stamp duty and usually subject to a cap." },
  { term: "Ready reckoner rate", id: "ready-reckoner-rate", market: "India", definition: "The minimum property value per square metre set by the Maharashtra government for each area, used to calculate stamp duty when it is higher than the agreement value." },
  { term: "Pre-EMI", id: "pre-emi", market: "India", definition: "Interest-only payments on the part of a home loan disbursed so far, paid during construction until the full loan is released and the regular EMI begins." },
  { term: "Share certificate", id: "share-certificate", market: "India", definition: "The certificate issued by a co-operative housing society showing that a member owns shares linked to a flat. In a resale it is transferred to the buyer." },
  { term: "Redevelopment", id: "redevelopment", market: "India", definition: "Demolishing an older society building and constructing a new one through an agreement with a developer. Existing members get new flats; extra flats are sold to fund the project." },
  { term: "Dubai Land Department (DLD)", id: "dubai-land-department", market: "Dubai", definition: "The government body that registers property and regulates real estate in Dubai. Its transfer fee is charged on each sale and is a percentage of the price." },
  { term: "RERA (Dubai)", id: "rera-dubai", market: "Dubai", definition: "The Real Estate Regulatory Agency, the regulatory arm of the Dubai Land Department. It licenses developers and brokers, registers projects and oversees escrow accounts." },
  { term: "Off-plan", id: "off-plan", market: "Dubai", definition: "Property sold before or during construction, usually on a staged payment plan. Buyer payments go into a regulated escrow account for the project." },
  { term: "Escrow account", id: "escrow-account", market: "Both", definition: "A bank account dedicated to one project, where buyer payments are held and released to the developer against construction progress. Dubai and Indian RERA rules both require one in different forms." },
  { term: "Oqood", id: "oqood", market: "Dubai", definition: "The interim registration of an off-plan property with the Dubai Land Department, recorded before the title deed is issued at completion." },
  { term: "Title deed", id: "title-deed", market: "Dubai", definition: "The document issued by the Dubai Land Department proving ownership of a completed property." },
  { term: "Freehold area", id: "freehold-area", market: "Dubai", definition: "A designated area of Dubai where foreign nationals can own property outright and register it in their own name." },
  { term: "Service charge", id: "service-charge", market: "Dubai", definition: "The yearly fee owners pay for the upkeep of a building's common areas and facilities, quoted per square foot. It varies by building, so ask for the current figure." },
  { term: "Ejari", id: "ejari", market: "Dubai", definition: "Dubai's system for registering rental contracts. A registered tenancy is needed for utilities and many residence processes." },
  { term: "Golden Visa (property route)", id: "golden-visa", market: "Dubai", definition: "A long-term UAE residence visa available to property investors who meet the government's value and ownership conditions. The thresholds and rules are set by the authorities and can change." },
  { term: "Handover", id: "handover", market: "Both", definition: "The point at which the developer delivers the completed home to the buyer, after the final payment and the completion or occupancy certificate." },
  { term: "Payment plan", id: "payment-plan", market: "Both", definition: "The schedule of instalments agreed with the developer, linked to dates or construction stages. Read it alongside the possession or handover clause." },
];
