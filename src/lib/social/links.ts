import { ADVISOR_CONTACT } from "../advisor-contact.ts";
import { FOUNDER } from "../founder.ts";

/**
 * The social and contact links, in ONE place: the links page, the footer and the analytics all read this list, so a handle can
 * never differ between them. A link whose URL is not set yet is simply not shown (nothing broken, nothing invented): add the
 * address here when the account exists.
 *
 * Accounts: the company's social accounts use developerconnects02@gmail.com; the founder's personal ones use
 * ambishsingh223@gmail.com.
 */
export const BUSINESS_EMAIL = "developerconnects02@gmail.com";

export interface SocialLink {
  key: string;
  label: string;
  description: string;
  /** null until the account exists. */
  url: string | null;
}

export const SOCIAL_LINKS: readonly SocialLink[] = [
  { key: "whatsapp", label: "WhatsApp", description: "Message us directly on +91 98337 50932", url: `https://wa.me/${ADVISOR_CONTACT.india.whatsappDigits}?text=${encodeURIComponent("Hi, I'd like to know more about property options.")}` },
  { key: "instagram", label: "Instagram", description: "Short videos on Mumbai and Dubai property", url: "https://www.instagram.com/developerconnects/" },
  { key: "facebook", label: "Facebook", description: "Developer Connects on Facebook", url: "https://www.facebook.com/profile.php?id=61595466475332" },
  { key: "linkedin", label: "LinkedIn", description: "Ambish Singh on LinkedIn", url: FOUNDER.linkedinUrl },
  { key: "youtube", label: "YouTube", description: "Long-form property explainers", url: null },
  { key: "email", label: "Business enquiries", description: BUSINESS_EMAIL, url: `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent("Business enquiry — Developer Connects")}` },
];

export const LINK_KEYS = SOCIAL_LINKS.map((l) => l.key);
