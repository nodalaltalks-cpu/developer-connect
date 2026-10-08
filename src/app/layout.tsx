import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AnalyticsConsentProvider } from "@/components/analytics-consent";
import { ADVISOR_CONTACT } from "@/lib/advisor-contact";
import { AdvisorProvider } from "@/components/advisor/advisor";
import { AttributionCapture } from "@/components/attribution-capture";
import { BehaviourTracker } from "@/components/behaviour-tracker";
import { getGaMeasurementId, getMetaPixelId } from "@/lib/analytics-config";
import { AnalyticsEvents } from "@/components/analytics-events";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/** The one editorial face, used sparingly for headlines on the brand pages; everything else is Geist. Two families in total. */
const serifDisplay = Source_Serif_4({
  variable: "--font-serif-display",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "Developer Connects";
const SITE_DESCRIPTION =
  "Buy property in Mumbai, Dubai and across India and the UAE with clarity. Compare leading developers, understand every project and price, and get one-to-one expert guidance from first search to keys in hand.";

export const metadata: Metadata = {
  metadataBase: new URL("https://developerconnects.com"),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    // No `url` here: pages that don't define their own openGraph inherit
    // this object wholesale (metadata merges shallowly), so a url here
    // would label every such page's og:url as the homepage.
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

/**
 * Organization JSON-LD for Developer Connects itself (Part: SEO entity
 * signal) — present on every page, matching Google's own guidance to
 * place Organization markup describing "your organization" site-wide, not
 * just on one page. Deliberately omits sameAs — the footer's social links
 * belong to the parent NoDalalTalks brand, not to Developer Connects
 * itself, and asserting them as this entity's own profiles would
 * misrepresent the relationship rather than clarify it. `logo` points at
 * the real brand mark (public/developer-connects-logo.jpg, 1600x1600 —
 * see components/logo.tsx), replacing the earlier placeholder favicon.ico
 * reference now that a real logo asset exists at a size Google's
 * Organization logo guidance actually accepts.
 *
 * WebSite JSON-LD is deliberately NOT here: it describes the site as a
 * whole (its search entry point), which only makes sense attached to the
 * homepage — see (marketing)/page.tsx. Developer entity markup (a
 * different Organization, describing the third-party company a developer
 * page is about) similarly lives on developers/[slug]/page.tsx, never
 * here.
 */
const organizationStructuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: "https://developerconnects.com",
  logo: "https://developerconnects.com/developer-connects-logo.jpg",
};

export const viewport: Viewport = {
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  // Lets sticky bars and sheets use env(safe-area-inset-*) on notched phones. Zoom is NOT disabled (accessibility).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Google Analytics is OFF unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set to a
  // valid ID (see lib/analytics-config.ts), and even then it only loads after
  // the visitor presses "Accept" in the cookie banner (analytics-consent.tsx).
  const gaMeasurementId = getGaMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const metaPixelId = getMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${serifDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationStructuredData) }}
        />
        <ClerkProvider
          afterSignOutUrl="/"
          appearance={{
            variables: {
              colorPrimary: "#1b2a49",
              colorBackground: "#ffffff",
              colorForeground: "#111318",
              colorMuted: "#f7f5f1",
              colorMutedForeground: "#6b7280",
              colorBorder: "#e6e2da",
              borderRadius: "0.375rem",
              fontFamily: "var(--font-geist-sans), sans-serif",
            },
          }}
        >
          <AttributionCapture />
          <BehaviourTracker />
          <AnalyticsConsentProvider measurementId={gaMeasurementId} metaPixelId={metaPixelId}>
            <AnalyticsEvents />
            <AdvisorProvider>{children}</AdvisorProvider>
          </AnalyticsConsentProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
