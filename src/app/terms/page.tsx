import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal-page-layout";
import { LEGAL_CONFIG, LEGAL_ENTITY_PLACEHOLDER, GOVERNING_LAW_PLACEHOLDER } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Terms of Service | Developer Connects",
  description: "The terms that govern your use of Developer Connects.",
  alternates: { canonical: "/terms" },
};

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      intro="These terms govern your use of Developer Connects. By using the site, you agree to them."
    >
      <LegalSection title="1. Acceptance of terms">
        <p>
          By accessing or using Developer Connects, you agree to these Terms of Service and our{" "}
          <a href="/privacy" className="text-accent-hover hover:underline">
            Privacy Policy
          </a>
          . If you don&apos;t agree, please don&apos;t use the service.
        </p>
      </LegalSection>

      <LegalSection title="2. About Developer Connects">
        <p>
          Developer Connects is a discovery and information platform that helps users find genuine official
          websites of real-estate developers, and offers optional property assistance. It is not the developer
          of any project and is not a party to your agreement with a developer.
        </p>
      </LegalSection>

      <LegalSection title="3. Eligibility">
        <p>
          You must be capable of forming a binding contract under applicable law to create an account. If
          you&apos;re using Developer Connects on behalf of someone else, you confirm you&apos;re authorized to
          do so.
        </p>
      </LegalSection>

      <LegalSection title="4. Account registration">
        <p>
          Sign-in is provided through our authentication provider, Clerk. You&apos;re responsible for keeping
          your account credentials secure and for activity under your account. You can browse and search
          Developer Connects without an account; some features (like your profile and personalized
          recommendations) require signing in.
        </p>
      </LegalSection>

      <LegalSection title="5. Permitted use">
        <p>You may use Developer Connects to search for and discover genuine developers and to request property assistance.</p>
      </LegalSection>

      <LegalSection title="6. Search and directory use">
        <p>
          The directory lists developers we have chosen to include; a listing is not an endorsement (see
          &ldquo;Listings are not endorsements&rdquo; below). Search results and
          recommendations are generated automatically from directory data and your own activity — see our{" "}
          <a href="/privacy" className="text-accent-hover hover:underline">
            Privacy Policy
          </a>{" "}
          for how.
        </p>
      </LegalSection>

      <LegalSection title="7. Developer information">
        <p>
          Developer information shown on Developer Connects may be sourced from developers&apos; own official
          websites, publicly available records and sources, and information supplied to us. Developer information can change, and we don&apos;t guarantee it is complete or
          current at every moment. If you spot something wrong, you can report it using &ldquo;Report
          inaccurate information&rdquo; on that developer&apos;s page.
        </p>
      </LegalSection>

      <LegalSection title="8. Listings are not endorsements">
        <p>
          A developer&apos;s appearance on Developer Connects, and any information we show about it, does{" "}
          <strong>not</strong> mean:
        </p>
        <ul>
          <li>an endorsement of the developer or a recommendation to buy</li>
          <li>a guarantee of the developer&apos;s quality, project quality, or financial health</li>
          <li>a guarantee of legal compliance, project approvals, or completion/possession timelines</li>
          <li>a guarantee that every statement made on a developer&apos;s own website is accurate</li>
        </ul>
        <p>Our content is general information, not investment, legal or purchase advice.</p>
      </LegalSection>

      <LegalSection title="9. External developer websites">
        <p>
          Developer Connects does not send you to developers&apos; own websites. If a Developer Connects team
          member or anyone else shares a third-party website with you, it is a site we don&apos;t control. Review
          that website&apos;s own terms, privacy policy, and disclosures before relying on anything there or
          taking any action.
        </p>
      </LegalSection>

      <LegalSection title="10. User-submitted information">
        <p>
          If you submit information through your profile, Contact Us, or Report Inaccurate Information, you
          agree not to submit unlawful, impersonating, malicious, misleading, or infringing content, or private
          information about someone else without authority to share it.
        </p>
      </LegalSection>

      <LegalSection title="11. Reports/corrections">
        <p>
          You can report information you believe is incorrect. We review reports and correct information where
          appropriate, but we don&apos;t promise that every report automatically results in a change.
        </p>
      </LegalSection>

      <LegalSection title="12. Intellectual property">
        <p>
          The Developer Connects name, brand, interface, software, and original content are owned by us or our
          licensors. Developer names, logos, and trademarks shown in the directory belong to their respective
          owners — we don&apos;t claim ownership over them.
        </p>
      </LegalSection>

      <LegalSection title="13. Third-party links">
        <p>
          Developer Connects links to independently operated third-party websites. We&apos;re not responsible
          for their availability, content, privacy practices, or security.
        </p>
      </LegalSection>

      <LegalSection title="14. Availability/service changes">
        <p>
          We may change, suspend, or discontinue parts of the service at any time, and we don&apos;t guarantee
          uninterrupted availability.
        </p>
      </LegalSection>

      <LegalSection title="15. Prohibited conduct">
        <p>You agree not to:</p>
        <ul>
          <li>scrape or extract data from Developer Connects at an unreasonable scale</li>
          <li>attempt to bypass access controls or launch automated attacks against the service</li>
          <li>impersonate any person or entity, or misrepresent your affiliation</li>
          <li>submit fraudulent, misleading, or manipulative information, including attempts to manipulate the information we show</li>
          <li>interfere with the normal operation of the service</li>
          <li>use the service for any unlawful purpose</li>
        </ul>
      </LegalSection>

      <LegalSection title="16. Disclaimer of warranties">
        <p>
          Developer Connects is provided &ldquo;as is&rdquo; without warranties of any kind, to the fullest
          extent permitted by law. See our{" "}
          <a href="/disclaimer" className="text-accent-hover hover:underline">
            Disclaimer
          </a>{" "}
          for more detail specific to real-estate information.
        </p>
      </LegalSection>

      <LegalSection title="17. Limitation of liability">
        <p>
          To the fullest extent permitted by law, Developer Connects will not be liable for indirect,
          incidental, or consequential damages arising from your use of the service or reliance on information
          found through it, including information provided by developers or other third parties.
        </p>
      </LegalSection>

      <LegalSection title="18. Indemnity">
        <p>
          Where legally appropriate, you agree to indemnify Developer Connects against claims arising from your
          misuse of the service or violation of these terms.
        </p>
      </LegalSection>

      <LegalSection title="19. Suspension/termination">
        <p>
          We may suspend or terminate access for conduct that violates these terms or otherwise harms the
          service or other users.
        </p>
      </LegalSection>

      <LegalSection title="20. Changes to these terms">
        <p>
          We may update these terms as the product changes. The &ldquo;Last updated&rdquo; date above always
          reflects the current version.
        </p>
      </LegalSection>

      <LegalSection title="21. Governing law/jurisdiction">
        <p>{GOVERNING_LAW_PLACEHOLDER}</p>
      </LegalSection>

      <LegalSection title="22. Contact">
        <p>
          Questions about these terms: contact{" "}
          <a href={`mailto:${LEGAL_CONFIG.contactEmail}`} className="text-accent-hover hover:underline">
            {LEGAL_CONFIG.contactEmail}
          </a>
          . Legal entity details: {LEGAL_ENTITY_PLACEHOLDER}
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
