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
          a sign-in prompt this browsing session, so we don&apos;t show it again immediately.
        </p>
      </LegalSection>

      <LegalSection title="5. What we don't use">
        <p>
          We do not use third-party advertising cookies, cross-site tracking cookies/pixels, or a third-party
          analytics platform&apos;s cookies. Product-usage analytics (searches, page views, clicks) are recorded
          directly to our own database via the session identifier above, not through a cookie-based
          third-party analytics tool.
        </p>
      </LegalSection>

      <LegalSection title="6. Consent">
        <p>
          Because the cookies above are strictly necessary for core functionality (sign-in and consistent
          browsing-session behavior) rather than for advertising or optional tracking, we have not built a
          cookie-consent banner. If our cookie use expands beyond what&apos;s described here — particularly
          into advertising, cross-site tracking, or optional analytics cookies — we will introduce an
          appropriate consent mechanism before doing so, consistent with applicable law.
        </p>
      </LegalSection>

      <LegalSection title="7. Managing cookies">
        <p>
          You can clear or block cookies through your browser&apos;s own settings at any time. Blocking the
          authentication or session cookie will likely prevent sign-in and some personalization features from
          working correctly.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes to this policy">
        <p>
          If the cookies or storage we use change, we&apos;ll update this page. The &ldquo;Last updated&rdquo;
          date above always reflects the current version.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
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
