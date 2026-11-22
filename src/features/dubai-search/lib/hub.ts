import type { FaqItem } from "./content.ts";

export const HUB_FAQ: FaqItem[] = [
  {
    question: "How does Dubai Property Search work?",
    answer:
      "You choose an area, buy or rent, the type of home and the number of bedrooms. We then set up the same search on Bayut, Property Finder and dubizzle, and each button opens that website's own results in a new tab. We do not copy or store their listings, so what you see is always their current information.",
  },
  {
    question: "Is it free?",
    answer: "Yes. There is nothing to pay and nothing to sign up for. We do not rank any website for payment and we earn nothing from your clicks.",
  },
  {
    question: "Are Bayut, Property Finder and dubizzle connected to Developer Connects?",
    answer: "No. Developer Connects is independent and is not affiliated with them. The listings, prices and photos belong to those websites. Always confirm the details with the advertiser.",
  },
  {
    question: "Can it tell me whether two listings are the same flat?",
    answer: "Yes. Add the listings you found to the comparison tool. It compares the building, bedrooms, area, floor and unit number, tells you if they look like the same property, and shows the price difference. It is a best guess, so confirm the unit with the advertiser.",
  },
  {
    question: "Does it check the advertising permit?",
    answer: "Not yet. We tell you to ask for the permit number and check it on the regulator's official service. A valid permit does not prove the property is available or that the seller owns it.",
  },
];

export const COMPARE_FAQ: FaqItem[] = [
  {
    question: "How does the tool decide two listings are the same flat?",
    answer:
      "It compares the building, number of bedrooms, area, floor and, where an advertisement shows it, the unit number. It is only sure when the unit number matches and the areas agree. With no unit number it can only say \"possibly the same\", and only when the floor is the same too. Anything unclear stays separate.",
  },
  {
    question: "Where are my listings stored?",
    answer: "Only in your own browser. Nothing you add is sent to our servers, and clearing your browser data removes it.",
  },
  {
    question: "Do you copy listings from other websites?",
    answer: "No. You add the link and type the details yourself, or import a file you are allowed to use. We never open or copy the page, and we never copy photos or contact details.",
  },
  {
    question: "Does a matching permit number mean the flat is real and available?",
    answer: "No. We show the permit number as the advertiser's claim and do not check it. Even a valid permit does not prove the property is available, that the seller owns it, or that the title is clear.",
  },
];
