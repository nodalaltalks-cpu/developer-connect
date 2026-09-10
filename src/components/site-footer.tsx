import { Container } from "@/components/ui/container";

/**
 * Deliberately minimal — no Company/Legal/Social columns, because none of
 * those pages, contact addresses, or social profiles exist yet for
 * Developer Connect. Padding this out with placeholder links would read
 * as broken promises, not trust. Add sections here only once the pages
 * they'd link to are real (see the founder report for this decision).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <Container className="py-8">
        <p className="font-semibold text-foreground">Developer Connect</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Find the real developer. Go straight to the official website — no brokers, no lead
          forms.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Developer Connect. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
