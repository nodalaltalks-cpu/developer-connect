import Link from "next/link";
import { Container } from "@/components/ui/container";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { createPostgresRepositories } from "@/lib/developer-connect/db/postgres-repository";
import { listPublicGeographyOptions } from "@/lib/developer-connect/search-service";

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
 * `isDubaiActive` comes from the real published-developer dataset (see
 * SiteFooter below) — the same "UAE" country convention the existing
 * "India" link already assumes (`/?country=India`). No hardcoded list of
 * cities/countries: this only ever flips once a real VERIFIED developer
 * with country "UAE" exists, and reverts to "Coming Soon" text — never a
 * dead link — if that's ever no longer true.
 */
function buildColumns(isDubaiActive: boolean): FooterColumn[] {
  return [
    {
      heading: "Explore",
      links: [
        { label: "Developers", href: "/" },
        { label: "India", href: "/?country=India" },
        isDubaiActive ? { label: "Dubai", href: "/?country=UAE" } : { label: "Dubai", comingSoon: true },
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
        { label: "Privacy Policy", comingSoon: true },
        { label: "Terms of Service", comingSoon: true },
        { label: "Cookie Policy", comingSoon: true },
        { label: "Disclaimer", comingSoon: true },
      ],
    },
  ];
}

/**
 * The full site footer (Part 32) — five short columns, only ever linking
 * to pages/accounts that are actually real (`comingSoon` renders as plain
 * text, never a fabricated URL/#). Positioning statement makes explicit
 * what Developer Connects is NOT: not a broker, doesn't sell property,
 * doesn't capture phone numbers for brokers.
 *
 * Async: checks the real published-developer dataset (the same
 * VERIFIED-only geography query the homepage filters already use) so
 * "Dubai — Coming Soon" flips to a real, active link the moment a
 * published UAE developer exists — no manual footer edit required.
 */
export async function SiteFooter() {
  const repos = createPostgresRepositories();
  const { countries } = await listPublicGeographyOptions(repos);
  const isDubaiActive = countries.some((c) => c.toLowerCase() === "uae");
  const columns = buildColumns(isDubaiActive);

  return (
    <footer className="border-t border-border bg-muted/30">
      <Container className="py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-sm">
            <p className="font-semibold text-foreground">Developer Connects</p>
            <p className="mt-2 text-sm text-muted-foreground">
              We help people find genuine real-estate developers and reach their official websites
              directly. We are not a broker, we do not sell properties, and we do not capture phone
              numbers for brokers.
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
          © {new Date().getFullYear()} Developer Connects. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
