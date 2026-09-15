import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal-page-layout";
import { LEGAL_CONFIG } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Disclaimer | Developer Connects",
  description: "Important limits on how to use information found on Developer Connects.",
  alternates: { canonical: "/disclaimer" },
};

export default function DisclaimerPage() {
  return (
    <LegalPageLayout
      title="Disclaimer"
      intro="Real-estate decisions are significant. Please read this before relying on anything you find through Developer Connects."
    >
      <LegalSection title="1. Not investment, financial, legal, or tax advice">
        <p>
          Nothing on Developer Connects — including developer listings, search results, rankings, or
          recommendations — is investment, financial, legal, or tax advice. We are not licensed financial
          advisors, real-estate brokers, or legal counsel, and nothing here should be treated as a
          recommendation to buy, sell, lease, or invest in any property or with any developer.
        </p>
      </LegalSection>

      <LegalSection title="2. Not a broker or transaction party">
        <p>
          Developer Connects does not sell property, negotiate on your behalf, collect payments, or participate
          in any transaction between you and a developer. We only help you find a developer&apos;s genuine
          official website.
        </p>
      </LegalSection>

      <LegalSection title="3. &ldquo;Verified&rdquo; means website identity, not endorsement">
        <p>
          Our verification process confirms that a listed website genuinely belongs to the named developer. It
          is not an endorsement, not a quality rating, and not a guarantee of the developer&apos;s legitimacy,
          financial health, project quality, or business practices. See &ldquo;Verification and
          &lsquo;verified&rsquo; meaning&rdquo; in our{" "}
          <a href="/terms" className="text-accent-hover hover:underline">
            Terms of Service
          </a>{" "}
          for the full definition.
        </p>
      </LegalSection>

      <LegalSection title="4. No guarantee of project outcomes">
        <p>
          We make no representation or guarantee about any property project&apos;s completion timeline,
          possession date, construction quality, regulatory approvals, legal compliance, or eventual value.
          These are matters for you to verify directly with the developer and through your own independent
          due diligence, including appropriate legal and financial professionals.
        </p>
      </LegalSection>

      <LegalSection title="5. No guarantee of appreciation or returns">
        <p>
          Property values can rise or fall. We make no promise, projection, or guarantee about price
          appreciation, rental yield, or any other financial return connected to any property or developer
          listed on Developer Connects.
        </p>
      </LegalSection>

      <LegalSection title="6. Accuracy of developer information">
        <p>
          Developer information is sourced from developers&apos; own official websites, publicly available
          records, and our verification process, and can change or become outdated. Always confirm current
          details — pricing, availability, approvals, possession dates — directly with the developer before
          making any decision.
        </p>
      </LegalSection>

      <LegalSection title="7. External websites">
        <p>
          Clicking through to a developer&apos;s official website takes you to a site we don&apos;t control or
          operate. We&apos;re not responsible for the content, accuracy, availability, or practices of any
          external website.
        </p>
      </LegalSection>

      <LegalSection title="8. Do your own due diligence">
        <p>
          Before making any property-related decision, we strongly encourage independent verification —
          including legal title checks, regulatory approval checks (such as applicable regional real-estate
          regulatory authority registrations), site visits, and consultation with qualified, licensed
          professionals.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation">
        <p>
          To the fullest extent permitted by law, Developer Connects is not liable for any decision made, or
          loss incurred, in reliance on information found on or through the platform. See &ldquo;Limitation of
          liability&rdquo; in our{" "}
          <a href="/terms" className="text-accent-hover hover:underline">
            Terms of Service
          </a>{" "}
          for full detail.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions about this disclaimer: contact{" "}
          <a href={`mailto:${LEGAL_CONFIG.contactEmail}`} className="text-accent-hover hover:underline">
            {LEGAL_CONFIG.contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
