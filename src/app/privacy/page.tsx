import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal-page-layout";
import { LEGAL_CONFIG, LEGAL_ENTITY_PLACEHOLDER } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Privacy Policy | Developer Connects",
  description: "How Developer Connects collects, uses, and protects information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      intro="This policy explains what information Developer Connects actually collects, why, and what choices you have about it. We've written it to describe our real product, not a generic template."
    >
      <LegalSection title="1. Who we are">
        <p>
          {LEGAL_CONFIG.productName} is a discovery platform that helps people find the genuine official
          websites of real-estate developers. This policy applies to developerconnects.com and the{" "}
          {LEGAL_CONFIG.productName} product. Contact us at{" "}
          <a href={`mailto:${LEGAL_CONFIG.contactEmail}`} className="text-accent-hover hover:underline">
            {LEGAL_CONFIG.contactEmail}
          </a>
          . Our registered legal entity and operating details are: {LEGAL_ENTITY_PLACEHOLDER}
        </p>
      </LegalSection>

      <LegalSection title="2. What Developer Connects does">
        <p>
          We maintain a directory of real-estate developers and verify that the official websites we link to
          genuinely belong to them. Visitors can search and filter the directory, and click through to a
          developer&apos;s own website. We are not a broker, a property seller, or a party to any property
          transaction.
        </p>
      </LegalSection>

      <LegalSection title="3. Information we collect">
        <p>We only collect information that our actual, current features require. In practice, this is:</p>
      </LegalSection>

      <LegalSection title="4. Information you provide directly">
        <ul>
          <li>
            <strong>Account information</strong>, when you sign in — provided by our authentication provider,
            Clerk. This may include your name, email address, and profile image, depending on how you signed
            in (e.g. email or a Google account).
          </li>
          <li>
            <strong>Profile information</strong>, entirely optional and field-by-field — things like city,
            budget range, property type interest, construction-stage preference, and preferred locations. See
            &ldquo;Profile information&rdquo; below for the full picture.
          </li>
          <li>
            <strong>Contact Us submissions</strong> — name, email, a reason category, and your message.
          </li>
          <li>
            <strong>Report Inaccurate Information submissions</strong> — the category of what&apos;s wrong, your
            description, and an optional email address.
          </li>
          <li>
            <strong>Newsletter subscription</strong> — just your email address.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Information collected automatically">
        <p>When you use Developer Connects, we automatically record certain product-usage events:</p>
        <ul>
          <li>Searches you perform (the query text, and which Country/State/City filter, if any, was active)</li>
          <li>Which developer pages you view, and which official-website links you click</li>
          <li>Which search result you click, and its position in the results</li>
          <li>A coarse device type (mobile or desktop), derived from your browser&apos;s user-agent string</li>
          <li>
            An anonymous session identifier (see &ldquo;Cookies&rdquo; below) that lets us tell repeat activity
            within one browsing session apart from a brand-new visitor, without identifying you personally
          </li>
        </ul>
        <p>
          If you are signed in, some of these events are also associated with your account, so that features
          like &ldquo;Continue your research&rdquo; and personalized search ranking can work. If you are not
          signed in, they are associated only with the anonymous session identifier above.
        </p>
      </LegalSection>

      <LegalSection title="6. Authentication information">
        <p>
          Sign-in is handled entirely by Clerk, our authentication provider — we never see or store your
          password. Clerk provides us your user ID and, where available, your name, email, and profile image.
        </p>
      </LegalSection>

      <LegalSection title="7. Search and interaction data">
        <p>
          Covered in &ldquo;Information collected automatically&rdquo; above — we&apos;re calling it out
          separately here because it&apos;s the category we use most for personalization and product
          improvement (see &ldquo;Personalisation and recommendations&rdquo; below).
        </p>
      </LegalSection>

      <LegalSection title="8. Profile information">
        <p>
          If you choose to fill in your profile, the fields currently available include things like name,
          phone, city, current locality, date of birth, gender, budget range, property type and configuration
          preferences, construction-stage preferences, purpose (self-use, investment, or just researching),
          preferred locations, family size, family income, and notification preferences. Every field is
          optional — nothing in your profile is required to keep using Developer Connects, and your profile is
          never shown to other users.
        </p>
      </LegalSection>

      <LegalSection title="9. Developer/company information">
        <p>
          We also hold information about real-estate developers themselves (company name, location, official
          website, verification status). This is business information about companies, not personal
          information about you, and is described here only for completeness — see &ldquo;How developer
          information is sourced&rdquo; in our Terms of Service for detail.
        </p>
      </LegalSection>

      <LegalSection title="10. Reports and contact submissions">
        <p>
          Information you submit via Contact Us or Report Inaccurate Information is used to respond to you and
          to investigate/correct directory information. It is visible only to Developer Connects; reporter
          identity is never shown publicly.
        </p>
      </LegalSection>

      <LegalSection title="11. Newsletter information">
        <p>
          If you subscribe, we store your email address for that purpose. We do not currently send automated
          newsletter emails — when we do, every email will include a straightforward way to unsubscribe, and we
          will not send marketing email without an appropriate lawful basis.
        </p>
      </LegalSection>

      <LegalSection title="12. Notifications">
        <p>
          Signed-in users may receive in-product notifications (for example, a profile-completion tip). We
          store whether each notification has been read. You can control profile-completion notification
          preferences from your profile.
        </p>
      </LegalSection>

      <LegalSection title="13. Cookies and similar technologies">
        <p>We keep this deliberately minimal:</p>
        <ul>
          <li>
            <strong>Authentication cookies</strong>, set by Clerk, to keep you signed in. We don&apos;t control
            their exact names or contents — that&apos;s Clerk&apos;s infrastructure.
          </li>
          <li>
            <strong>An anonymous session cookie</strong> we set ourselves (necessary for the product to
            function — it lets zero-result searches and recently-viewed developers work), valid for up to a
            year, never used to identify you personally.
          </li>
          <li>
            <strong>Local browser storage</strong> for a small amount of non-essential state, such as whether
            you&apos;ve already dismissed the sign-in prompt this browsing session — never sent to our servers.
          </li>
        </ul>
        <p>
          We do not use third-party advertising or cross-site tracking cookies. See our{" "}
          <a href="/cookies" className="text-accent-hover hover:underline">
            Cookie Policy
          </a>{" "}
          for full detail.
        </p>
      </LegalSection>

      <LegalSection title="14. Why we use information">
        <p>
          To operate the directory and search, to respond to your submissions, to keep your account and profile
          working, to improve search relevance and recommendations, to understand product usage and where our
          developer coverage has gaps, to maintain security, and to meet legal obligations.
        </p>
      </LegalSection>

      <LegalSection title="15. Personalisation and recommendations">
        <p>
          We use real product signals — like your recent searches, developer views, official-website clicks,
          selected filters, and any profile preferences you&apos;ve provided — to make search results and
          recommendations more relevant to you. For example, if your profile city is set, developers in that
          city may be ranked slightly higher in your search results; you can always search anywhere regardless.
        </p>
      </LegalSection>

      <LegalSection title="16. Search intelligence and analytics">
        <p>
          We analyse search and interaction data in aggregate to understand what people are searching for,
          which searches return nothing useful, and which locations or developers are in demand. This helps us
          decide where to add developer coverage next. We do not publish or expose any individual
          user&apos;s search history.
        </p>
      </LegalSection>

      <LegalSection title="17. AI/ML and product improvement">
        <p>
          Today, search ranking and recommendations use deterministic, rule-based logic driven by the real
          signals described above — not a trained machine-learning model. We are building the data foundation
          that could support a machine-learning-based ranking system in the future. If and when that changes,
          we will update this policy. We do not use AI to make decisions about you individually, and we do not
          claim any AI-driven profiling exists today beyond the straightforward, transparent ranking logic
          described above.
        </p>
      </LegalSection>

      <LegalSection title="18. How we share information">
        <p>
          We do not sell your personal information. We share information only with the service providers
          described below (to operate the product), when required by law, to protect rights and safety, or
          with your direction (for example, if you use a share button to send a developer&apos;s page to
          someone).
        </p>
      </LegalSection>

      <LegalSection title="19. Third-party service providers">
        <p>Developer Connects is built on a small number of infrastructure providers:</p>
        <ul>
          <li>
            <strong>Clerk</strong> — authentication and account/sign-in management.
          </li>
          <li>
            <strong>Neon</strong> — our PostgreSQL database provider, where product and account data is stored.
          </li>
          <li>
            <strong>Vercel</strong> — application hosting and deployment.
          </li>
        </ul>
        <p>
          We do not currently use a third-party analytics platform, advertising network, or email-sending
          service — analytics events described above are recorded in our own database, not sent to an outside
          analytics company.
        </p>
      </LegalSection>

      <LegalSection title="20. International/cross-border data transfers">
        <p>
          Developer Connects is intended to serve users in India and the UAE. Information may be processed in
          countries where we or our service providers operate infrastructure, which may be outside the country
          you&apos;re located in. We have not made — and do not make — a specific data-residency promise (for
          example, that all data stays physically within India or the UAE); where cross-border transfer occurs,
          we aim to rely on the service providers&apos; own appropriate safeguards and applicable legal
          mechanisms.
        </p>
      </LegalSection>

      <LegalSection title="21. Data retention">
        <p>
          We keep information for as long as reasonably necessary to provide the service, maintain your
          account, support analytics and product improvement, meet legal obligations, and resolve disputes. We
          do not currently have fixed, published retention periods for every data category; retention depends
          on the purpose and applicable legal requirements. If you&apos;d like a specific answer about a
          category of your own data, contact us.
        </p>
      </LegalSection>

      <LegalSection title="22. Data security">
        <p>
          We use reasonable technical and organisational measures appropriate to the information we hold —
          including relying on our infrastructure providers&apos; own security practices. No system can be made
          100% secure, and we cannot guarantee that information will never be accessed without authorization.
        </p>
      </LegalSection>

      <LegalSection title="23. Your rights">
        <p>
          Depending on applicable law, you may have rights to access the information we hold about you, correct
          inaccurate information, request deletion, withdraw consent where processing is based on consent,
          object to or restrict certain processing, and receive information about how your data is processed.
          Some of these rights are subject to conditions or exceptions under applicable law.
        </p>
      </LegalSection>

      <LegalSection title="24. How to exercise your rights">
        <p>
          Contact us at{" "}
          <a href={`mailto:${LEGAL_CONFIG.privacyEmail}`} className="text-accent-hover hover:underline">
            {LEGAL_CONFIG.privacyEmail}
          </a>{" "}
          with your request. You can update most of your own profile information directly from your Profile
          page at any time. Account-level actions (like managing your sign-in details, or — where our
          authentication provider supports it — deleting your account) are available from the account menu;
          if you can&apos;t find a self-service option for something, contact us and we&apos;ll process it
          manually. We do not currently offer a fully automated, instant account-deletion button outside of
          what our authentication provider&apos;s own account management may provide.
        </p>
      </LegalSection>

      <LegalSection title="25. Children's privacy">
        <p>
          Developer Connects is not directed at children, and we do not knowingly collect personal information
          from children. If you believe a child has provided us with personal information, contact us and
          we&apos;ll take appropriate action.
        </p>
      </LegalSection>

      <LegalSection title="26. Changes to this policy">
        <p>
          We may update this policy as the product changes. The &ldquo;Last updated&rdquo; date at the top of
          this page always reflects the current version. Material changes will be reflected here.
        </p>
      </LegalSection>

      <LegalSection title="27. Contact / privacy enquiries">
        <p>
          Questions about this policy, or any privacy request, can be sent to{" "}
          <a href={`mailto:${LEGAL_CONFIG.privacyEmail}`} className="text-accent-hover hover:underline">
            {LEGAL_CONFIG.privacyEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
