import Link from "next/link";
import { Container } from "@/components/ui/container";
import { NewsletterSignup } from "@/components/newsletter-signup";

interface FooterLink {
  label: string;
  href?: string;
  /** True when the page/account this would link to doesn't exist yet — shown as plain text, never a fabricated URL. */
  comingSoon?: boolean;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

const COLUMNS: FooterColumn[] = [
  {
    heading: "Explore",
    links: [
      { label: "Developers", href: "/" },
      { label: "India", href: "/?country=India" },
      { label: "Dubai", comingSoon: true },
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
      { label: "Instagram", comingSoon: true },
      { label: "LinkedIn", comingSoon: true },
      { label: "Email", comingSoon: true },
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

/**
 * The full site footer (Part 32) — five short columns, only ever linking
 * to pages/accounts that are actually real (`comingSoon` renders as plain
 * text, never a fabricated URL/#). Positioning statement makes explicit
 * what Developer Connects is NOT: not a broker, doesn't sell property,
 * doesn't capture phone numbers for brokers.
 */
export function SiteFooter() {
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
          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {column.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.comingSoon || !link.href ? (
                      <span className="text-sm text-muted-foreground">{link.label} — Coming Soon</span>
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
