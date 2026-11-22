import { COMMUNITIES_REVIEWED, communityLabel, type Community } from "./communities.ts";
import { type Intent, intentLabel } from "./intents.ts";

export interface FaqItem {
  question: string;
  answer: string;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function what(i: Intent): string {
  if (i.kind === "villas") return "villa";
  if (i.kind === "townhouses") return "townhouse";
  if (i.bedrooms === 0) return "studio";
  if (i.bedrooms !== null) return `${i.bedrooms}-bedroom apartment`;
  return "apartment";
}

/** One short paragraph that is specific to this page (area, purpose and size), not a template with a name swapped in. */
export function introFor(c: Community, i: Intent): string {
  const label = lower(intentLabel(i));
  const place = communityLabel(c);
  const sizeNote =
    i.bedrooms === 0
      ? "Studios are one open room with a kitchen area and a bathroom, so the building, the floor and the view usually matter more than the layout."
      : i.bedrooms === 1
        ? "One-bedroom homes are the most advertised size in many Dubai towers, which means the same flat is often listed by several agents."
        : i.bedrooms === 2
          ? "Two-bedroom homes vary widely in area between buildings, so compare the size in square feet as well as the price."
          : i.bedrooms === 3
            ? "Three-bedroom apartments are fewer than smaller ones, and the asking price can differ a lot with the floor, view and furnishing."
            : i.kind === "villas"
              ? "Villas are usually listed with plot size as well as built-up area, and the two are easy to confuse. Check which one an advertisement means."
              : i.kind === "townhouses"
                ? "Townhouses are often sold in clusters by the same developer, so several listings can describe near-identical homes in the same street."
                : "Apartments here range from studios to larger layouts, so narrow by bedrooms before you compare prices.";
  const rentNote = i.purpose === "rent" ? " Rents on the portals are normally quoted per year, so check whether a figure is yearly before you compare it with a monthly budget." : "";
  return `${c.about} Looking for ${label} in ${place}? ${sizeNote}${rentNote}`;
}

export function checklistFor(i: Intent): string[] {
  const common = [
    "Ask for the advertising permit number on the advertisement and check it on the regulator's official service. A permit does not prove the property is available or that the seller owns it.",
    "Compare the asking price in AED per square foot, not only the total, across the same building.",
    "Confirm the size, the floor and the unit with the advertiser. The same flat is often listed with slightly different details.",
    "Look at when the advertisement was last updated, and ask whether the property is still available.",
  ];
  if (i.purpose === "rent") return [...common, "Ask how many cheques the rent is paid in, what the deposit is, and what the service and utility charges are."];
  return [...common, "Ask whether it is ready or off-plan, what the service charge per square foot is, and whether there is a mortgage on the unit. Use an official service to check ownership before you pay anything."];
}

export function faqFor(c: Community, i: Intent): FaqItem[] {
  const place = communityLabel(c);
  const noun = what(i);
  const items: FaqItem[] = [
    {
      question: `How do I compare ${lower(intentLabel(i))} in ${place} across different websites?`,
      answer: `Open the same search on Bayut, Property Finder and dubizzle using the buttons on this page. Then compare each ${noun} by asking price, area in square feet, floor and the date the advertisement was updated. If one flat appears on several websites, compare the advertiser and the asking price for that same unit.`,
    },
    {
      question: `Why does the same ${noun} in ${c.name} show different ${i.purpose === "buy" ? "prices" : "rents"} on different websites?`,
      answer: `Different agents can advertise the same property, each with their own asking price, and websites update at different times. A lower figure is not always the better deal: it can be an old advertisement, a different floor, or a unit that is already sold. Confirm the unit and its availability with the advertiser.`,
    },
    {
      question: `What should I check before contacting an agent about ${i.purpose === "buy" ? "buying" : "renting"} a ${noun} in ${c.name}?`,
      answer: `Check the advertising permit number, the area and floor, when the advertisement was last updated, and the price per square foot compared with similar homes in the building. For a purchase, also confirm the ownership and any mortgage through official services before you pay a deposit.`,
    },
  ];
  if (i.purpose === "buy") {
    items.push({
      question: "Can an Indian or other overseas buyer purchase here?",
      answer: "Foreign buyers can buy freehold property in designated areas of Dubai, but whether a particular building qualifies should be confirmed for that building. Our guide for buyers from India explains the steps, costs and checks in order.",
    });
  } else {
    items.push({
      question: "Is the rent shown per month or per year?",
      answer: "Dubai rents on the property websites are usually quoted per year, but always read the advertisement. Ask how many cheques the rent can be paid in and what extra charges apply.",
    });
  }
  items.push({
    question: "Does Developer Connects list or sell these properties?",
    answer: "No. This page helps you search and compare. The buttons open each website's own results, and the listings, prices and photos belong to those websites. Developer Connects is not affiliated with them and earns nothing from your clicks.",
  });
  return items;
}

export const REVIEWED_LINE = `Area description last reviewed ${COMMUNITIES_REVIEWED}. Portal results change constantly and are not shown or stored here.`;
