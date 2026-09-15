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
          websites of real-estate developers. It is not a property seller, a real-estate developer, a
          real-estate agency, or a party to any property transaction.
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
        <p>You may use Developer Connects to search for, discover, and reach genuine developer websites.</p>
      </LegalSection>

      <LegalSection title="6. Search and directory use">
        <p>
          The directory shows only developers we have taken through our verification process (see
          &ldquo;Verification and &lsquo;verified&rsquo; meaning&rdquo; below). Search results and
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
          websites, publicly available records and sources, and information supplied during our verification
          process. Developer information can change, and we don&apos;t guarantee it is complete or
          current at every moment. If you spot something wrong, you can report it using &ldquo;Report
          inaccurate information&rdquo; on that developer&apos;s page.
        </p>
      </LegalSection>

      <LegalSection title="8. Verification and &ldquo;verified&rdquo; meaning">
        <p>
          When a developer&apos;s listing shows &ldquo;Official website verified by Developer Connects,&rdquo;
          this means we have conducted our verification process to establish that the listed website is
          associated with that developer, based on the evidence and process we use. It does <strong>not</strong>{" "}
          mean:
        </p>
        <ul>
          <li>an endorsement of the developer or a recommendation to buy</li>
          <li>a guarantee of the developer&apos;s quality, project quality, or financial health</li>
          <li>a guarantee of legal compliance, project approvals, or completion/possession timelines</li>
          <li>a guarantee that every statement made on the external website is accurate</li>
        </ul>
        <p>Verification is about website identity, not investment or purchase advice.</p>
      </LegalSection>

      <LegalSection title="9. External developer websites">
        <p>
          When you click &ldquo;Visit official website,&rdquo; you leave Developer Connects and go to a
          third-party website that we don&apos;t control. Review that website&apos;s own terms, privacy policy,
          and disclosures before relying on anything there or taking any action.
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
          <li>submit fraudulent, misleading, or manipulative information, including attempts to manipulate verification</li>
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
          found through it, including information on external developer websites we link to.
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
