import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal-page-layout";
import { LEGAL_CONFIG } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Cookie Policy | Developer Connects",
  description: "What cookies and local storage Developer Connects actually uses.",
  alternates: { canonical: "/cookies" },
};

export default function CookiePolicyPage() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      intro="We keep cookies to the minimum the product actually needs. This page lists exactly what we use — no invented categories, no generic boilerplate list."
    >
      <LegalSection title="1. What this page covers">
        <p>
          This policy describes the cookies and browser-storage mechanisms Developer Connects actually sets,
          categorized honestly by what they do.
        </p>
      </LegalSection>

      <LegalSection title="2. Strictly necessary — authentication cookies">
        <p>
          Set by Clerk, our authentication provider, when you sign in. These keep you signed in as you move
          between pages. We don&apos;t control their exact names or contents — that&apos;s Clerk&apos;s
          infrastructure — but they exist only to support sign-in and account access.
        </p>
      </LegalSection>

      <LegalSection title="3. Strictly necessary — session cookie">
        <p>
          We set one cookie ourselves: <code className="rounded bg-muted px-1 py-0.5 text-sm">dc_session</code>,
          an httpOnly, randomly generated identifier with no personal information in it. It lets features like
          zero-result search tracking and &ldquo;recently viewed developers&rdquo; work consistently across
          pages in the same browsing session, whether or not you&apos;re signed in. It&apos;s valid for up to a
          year, or until you clear cookies.
        </p>
      </LegalSection>

      <LegalSection title="4. Local/session browser storage">
        <p>
          We use a small amount of local browser storage (not a cookie, and never sent to our servers) for
          purely cosmetic, per-device convenience — for example, remembering that you&apos;ve already dismissed
          a sign-in prompt this browsing session, so we don&apos;t show it again immediately. If you make a
          choice on our cookie banner, that choice is stored the same way so we can remember it on this
          device.
        </p>
      </LegalSection>

      <LegalSection title="5. Optional — analytics cookies (Google Analytics)">
        <p>
          If you choose &ldquo;Accept&rdquo; on our cookie banner, we load Google Analytics 4, a service
          provided by Google, to understand how Developer Connects is used — for example which pages are viewed,
          and roughly where in the world and on what kind of device. It sets cookies named{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">_ga</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">_ga_</code> followed by an identifier, which by
          default last up to two years unless you clear them, and Google receives the resulting usage data.
        </p>
        <p>
          If you choose &ldquo;Accept only essentials&rdquo;, Google Analytics is not loaded and none of these
          cookies are set. We do not load Google Analytics on our admin or account pages, and we do not enable
          Google&apos;s advertising features.
        </p>
      </LegalSection>

      <LegalSection title="6. What we don't use">
        <p>
          We do not use advertising cookies or cross-site tracking pixels. Other than the optional Google
          Analytics cookies described above, we do not use a third-party analytics platform&apos;s cookies. Our
          own product-usage analytics (searches, page views, clicks) are recorded directly to our own database
          via the session identifier above.
        </p>
      </LegalSection>

      <LegalSection title="7. Consent">
        <p>
          The cookies in sections 2 and 3 are strictly necessary for core functionality (sign-in and consistent
          browsing-session behavior), so they don&apos;t depend on a choice. Analytics cookies are optional and
          stay off until you choose. Our cookie banner offers two choices, shown with equal prominence:
          &ldquo;Accept&rdquo; (essential cookies plus Google Analytics) and &ldquo;Accept only
          essentials&rdquo;. Your choice is remembered on this device in local browser storage (see section 4).
          If you later choose &ldquo;Accept only essentials&rdquo;, Google Analytics stops running and we remove
          its cookies from your browser.
        </p>
      </LegalSection>

      <LegalSection title="8. Managing cookies">
        <p>
          You can change your analytics choice at any time using &ldquo;Cookie settings&rdquo; in the site
          footer. You can also clear or block cookies through your browser&apos;s own settings. Blocking the
          authentication or session cookie will likely prevent sign-in and some personalization features from
          working correctly.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to this policy">
        <p>
          If the cookies or storage we use change, we&apos;ll update this page. The &ldquo;Last updated&rdquo;
          date above always reflects the current version.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions about this policy: contact{" "}
          <a href={`mailto:${LEGAL_CONFIG.contactEmail}`} className="text-accent-hover hover:underline">
            {LEGAL_CONFIG.contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
