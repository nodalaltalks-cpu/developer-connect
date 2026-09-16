import Link from "next/link";
import { Container } from "@/components/ui/container";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { OPERATING_COUNTRIES } from "@/lib/developer-connect/operating-countries";

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
 * Each still links into the real, existing `/?country=` filter, which
 * already shows an honest "no verified developers yet" state rather than
 * fake results when a country has none — so this never implies a
 * populated directory that doesn't exist.
 */
function buildColumns(): FooterColumn[] {
  return [
    {
      heading: "Explore",
      links: [
        { label: "Developers", href: "/" },
        ...OPERATING_COUNTRIES.map((country) => ({
          label: country.name,
          href: `/?country=${encodeURIComponent(country.name)}`,
        })),
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "About Us", href: "/about" },
        { label: "Contact Us", href: "/contact" },
        { label: "Report Inaccurate Information", href: "/contact?reason=REPORT_INACCURATE_INFO" },
      ],
    },
    {
      heading: "Resources",
      links: [
        { label: "FAQ", href: "/faq" },
        { label: "Blog", comingSoon: true },
        { label: "Guides", comingSoon: true },
      ],
    },
    {
      heading: "Connect",
      links: [
        { label: "Instagram", href: "https://www.instagram.com/nodalaltalks/", external: true },
        {
          label: "LinkedIn",
          href: "https://www.linkedin.com/company/nodalaltalks/?viewAsMember=true",
          external: true,
        },
        { label: "Email", href: "mailto:nodalaltalks02@gmail.com" },
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
  return (
    <footer className="border-t border-border bg-muted/30">
      <Container className="py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-sm">
            <p className="font-semibold text-foreground">Developer Connects</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Find genuine developer websites. Research directly. We are not a broker, and we
              don&apos;t sell properties or collect your phone number for anyone.
            </p>
          </div>
          <NewsletterSignup source="footer" />
        </div>

        <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {columns.map((column) => (
            <div key={column.heading}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {column.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.comingSoon || !link.href ? (
                      <span className="text-sm text-muted-foreground">{link.label} — Coming Soon</span>
                    ) : link.href.startsWith("mailto:") ? (
                      <a href={link.href} className="text-sm text-foreground hover:text-accent-hover hover:underline">
                        {link.label}
                      </a>
                    ) : link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-foreground hover:text-accent-hover hover:underline"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-sm text-foreground hover:text-accent-hover hover:underline">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Developer Connects. All rights reserved. Part of the
          NoDalalTalks ecosystem.
        </p>
      </Container>
    </footer>
  );
}
