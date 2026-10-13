import { FOUNDER } from "../founder.ts";
import { ADVISOR_CONTACT } from "../advisor-contact.ts";
import { SOCIAL_LINKS } from "../social/links.ts";
import type { FaqEntry, Guide } from "./types.ts";
import { guidePath } from "./guides.ts";

export const SITE_URL = "https://developerconnects.com";

/**
 * The organisation entity every other page points to (`@id` #organization). It describes only what is true and public: the name, the
 * logo, the founder, where the firm works, the real contact points and the real social profiles. There is no street address, rating or
 * review count here because none has been supplied, and none is invented.
 */
export function organizationSchema() {
  const sameAs = SOCIAL_LINKS.filter((l) => l.url && ["instagram", "facebook", "youtube"].includes(l.key)).map((l) => l.url as string);
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "ProfessionalService"],
    "@id": `${SITE_URL}/#organization`,
    name: "Developer Connects",
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/developer-connects-logo.jpg` },
    image: `${SITE_URL}/founder/ambish-singh.jpg`,
    description:
      "Developer Connects is a property research and advisory firm for buyers in Mumbai and Dubai, led by Ambish Singh. It helps buyers compare projects, check the regulator's records, plan site visits and understand every cost before they commit.",
    alternateName: "DeveloperConnects",
    slogan: "Know before you buy.",
    founder: { "@id": `${SITE_URL}/about#founder` },
    areaServed: [
      { "@type": "City", name: "Mumbai" },
      { "@type": "City", name: "Thane" },
      { "@type": "City", name: "Navi Mumbai" },
      { "@type": "City", name: "Dubai" },
      { "@type": "Country", name: "India" },
      { "@type": "Country", name: "United Arab Emirates" },
    ],
    knowsAbout: [
      "Real estate advisory",
      "Buying a flat in Mumbai",
      "New launch property",
      "Under-construction and ready-to-move homes",
      "MahaRERA project registration",
      "Home loans in India",
      "Stamp duty and registration in Maharashtra",
      "Buying property in Dubai",
      "Dubai off-plan property",
      "Dubai Land Department and escrow",
      "UAE Golden Visa through property",
      "NRI property investment",
    ],
    sameAs,
    contactPoint: [
      { "@type": "ContactPoint", contactType: "customer service", telephone: ADVISOR_CONTACT.india.e164, areaServed: "IN", availableLanguage: ["English", "Hindi"] },
      { "@type": "ContactPoint", contactType: "customer service", telephone: ADVISOR_CONTACT.uae.e164, areaServed: "AE", availableLanguage: ["English", "Hindi"] },
      { "@type": "ContactPoint", contactType: "customer service", email: ADVISOR_CONTACT.email },
    ],
  };
}

export function founderSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE_URL}/about#founder`,
    name: FOUNDER.name,
    jobTitle: "Founder",
    image: `${SITE_URL}/founder/ambish-singh.jpg`,
    worksFor: { "@id": `${SITE_URL}/#organization` },
    alumniOf: { "@type": "CollegeOrUniversity", name: "Symbiosis International University" },
    description: "Founder of Developer Connects, a property research and advisory firm for buyers in Mumbai and Dubai. MBA in Strategy, Symbiosis International University, Dubai.",
    knowsAbout: ["Real estate strategy", "Residential property in Mumbai", "Residential property in Dubai", "Property investment"],
    sameAs: [FOUNDER.linkedinUrl],
  };
}

export function faqSchema(items: readonly FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
  };
}

export function breadcrumbSchema(items: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: `${SITE_URL}${item.path}` })),
  };
}

export function articleSchema(guide: Guide) {
  const url = `${SITE_URL}${guidePath(guide)}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    author: { "@id": `${SITE_URL}/about#founder` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    image: `${SITE_URL}/opengraph-image`,
    datePublished: guide.updated,
    dateModified: guide.updated,
    mainEntityOfPage: url,
    inLanguage: "en-IN",
    ...(guide.area
      ? { about: { "@type": "Place", name: guide.area, containedInPlace: { "@type": "City", name: guide.market === "dubai" ? "Dubai" : guide.area === "Ghodbunder Road" ? "Thane" : "Mumbai" } } }
      : {}),
  };
}
