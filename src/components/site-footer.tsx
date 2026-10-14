import Link from "next/link";
import { ADVISOR_CONTACT } from "@/lib/advisor-contact";
import { FOUNDER } from "@/lib/founder";
import { RERA_REGISTRATION_NUMBER } from "@/lib/leads/gate/gate-copy";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/logo";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { CookieSettingsButton } from "@/components/analytics-consent";
import { OPERATING_COUNTRIES } from "@/lib/developer-connect/operating-countries";
import { locationPath, resolveLocationPage } from "@/lib/developer-connect/location-pages";

interface FooterLink {
  label: string;
  href?: string;
  /** True when the page/account this would link to doesn't exist yet — shown as plain text, never a fabricated URL. */
  comingSoon?: boolean;
  /** External destination (opens in a new tab with rel="noopener noreferrer") — never a Next.js <Link>. */
  external?: boolean;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

/**
 * Every OPERATING_COUNTRIES entry is a real, active Developer Connects
 * market — not gated behind "does a VERIFIED developer already exist
 * there" (that's a different, genuinely different fact; see
 * operating-countries.ts and getPublicHomepageData's countriesCovered).
 * A country with an approved directory page links straight to it
 * (/developers?country=…). Any other operating country falls back to the
 * homepage's `/?country=` filter, which shows an honest "no verified
 * developers yet" state rather than fake results — so this never implies
 * a populated directory that doesn't exist.
 */
function buildColumns(): FooterColumn[] {
  return [
    {
      heading: "Explore",
      links: [
        { label: "Developers", href: "/" },
        { label: "All developers", href: "/developers" },
        ...OPERATING_COUNTRIES.map((country) => {
          const approved = resolveLocationPage(country.name, undefined);
          return {
            label: country.name,
            href: approved ? locationPath(approved) : `/?country=${encodeURIComponent(country.name)}`,
          };
        }),
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "About Us", href: "/about" },
        { label: "Client feedback", href: "/testimonials" },
        { label: "Contact Us", href: "/contact" },
        { label: "Report Inaccurate Information", href: "/contact?reason=REPORT_INACCURATE_INFO" },
      ],
    },
    {
      heading: "Resources",
      links: [
        { label: "Buying guides", href: "/guides" },
        { label: "Property consultant", href: "/property-consultant" },
        { label: "Buying in Mumbai", href: "/guides/how-to-buy-a-flat-in-mumbai" },
        { label: "Buying in Dubai from India", href: "/guides/buying-property-in-dubai-from-india" },
        { label: "EMI calculator", href: "/tools/home-loan-emi-calculator" },
        { label: "Calculator", href: "/tools/calculator" },
        { label: "Property glossary", href: "/property-glossary" },
        { label: "FAQ", href: "/faq" },
        { label: "Developer research guides", href: "/buy-direct-from-developer" },
      ],
    },
    {
      heading: "Connect",
      links: [
        { label: "Instagram", href: "https://www.instagram.com/developerconnects/", external: true },
        { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61595466475332", external: true },
        { label: "LinkedIn", href: FOUNDER.linkedinUrl, external: true },
        { label: "Email", href: `mailto:${ADVISOR_CONTACT.email}` },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Service", href: "/terms" },
        { label: "Cookie Policy", href: "/cookies" },
        { label: "Disclaimer", href: "/disclaimer" },
      ],
    },
  ];
}

const columns = buildColumns();

/**
 * The full site footer (Part 32) — five short columns, only ever linking
 * to pages/accounts that are actually real (`comingSoon` renders as plain
 * text, never a fabricated URL/#). Positioning statement is deliberately
 * user-first, not broker-negative — what Developer Connects helps you do,
 * not an attack on an alternative.
 */
export function SiteFooter() {
  const link = "inline-flex min-h-11 items-center text-sm text-mist hover:text-pearl hover:underline";
  return (
    <footer className="dc-grain bg-ink text-pearl">
      <div aria-hidden="true" className="h-px bg-gold/70" />
      <Container className="relative z-10 py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-sm">
            <Logo size="sm" tone="light" />
            <p className="mt-4 font-serif text-2xl font-medium leading-snug tracking-[-0.01em] text-pearl">Know before you buy.</p>
            <p className="mt-2 text-sm leading-6 text-mist">Property research and advisory for Mumbai and Dubai, led by Ambish Singh.</p>
          </div>
          {/* The sign-up form is built for light surfaces, so it sits on a light card. */}
          <div className="rounded-xl bg-background p-5 text-foreground">
            <NewsletterSignup source="footer" />
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {columns.map((column) => (
            <div key={column.heading}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">{column.heading}</p>
              <ul className="mt-3 space-y-1">
                {column.links.map((item) => (
                  <li key={item.label}>
                    {item.comingSoon || !item.href ? (
                      <span className="text-sm text-mist">{item.label}</span>
                    ) : item.href.startsWith("mailto:") ? (
                      <a href={item.href} className={link}>
                        {item.label}
                      </a>
                    ) : item.external ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className={link}>
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.href} className={link}>
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
                {column.heading === "Legal" && <CookieSettingsButton className={link} />}
              </ul>
            </div>
          ))}
        </div>

        {/* Who we are, stated where a careful buyer looks: the registration, with a way to check it. Nothing is shown that has not been supplied. */}
        <div className="mt-12 border-t border-white/10 pt-6 text-sm leading-6 text-mist">
          {RERA_REGISTRATION_NUMBER && (
            <p className="mt-1">
              MahaRERA registration no. <span className="font-semibold text-pearl">{RERA_REGISTRATION_NUMBER}</span>.{" "}
              <a href="https://maharera.maharashtra.gov.in" target="_blank" rel="noopener noreferrer" className="font-medium text-brass-300 underline-offset-4 hover:underline">
                Check it on the MahaRERA website
              </a>
            </p>
          )}
          <p className="mt-4 text-xs text-mist">
            © {new Date().getFullYear()} Developer Connects. All rights reserved. Part of the NoDalalTalks ecosystem.
          </p>
        </div>
      </Container>
    </footer>
  );
}
