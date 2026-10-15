import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AnalyticsConsentProvider } from "@/components/analytics-consent";
import { AdvisorProvider } from "@/components/advisor/advisor";
import { AttributionCapture } from "@/components/attribution-capture";
import { BehaviourTracker } from "@/components/behaviour-tracker";
import { getGaMeasurementId, getGoogleAdsId, getMetaPixelId } from "@/lib/analytics-config";
import { founderSchema, organizationSchema } from "@/lib/seo/schema";
import { serializeJsonLd } from "@/lib/developer-connect/developer-page-content";
import { AnalyticsEvents } from "@/components/analytics-events";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * The one editorial face: Newsreader, a transitional serif in the register of private-bank and luxury-hotel identities. Its contrast is
 * moderate, so every stroke (the "+", the "%", the rupee sign) stays visible on any screen, where a Didone's hairlines disappear. A
 * variable font with an optical-size axis: large headlines get the finer display cut, small ones the sturdier text cut. Everything
 * else is Geist.
 */
const serifDisplay = Newsreader({
  variable: "--font-serif-display",
  subsets: ["latin"],
  axes: ["opsz"],
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
 * Organization and founder JSON-LD (lib/seo/schema.ts) is rendered once, site-wide, in the body below. It carries the company's own
 * social profiles (not the founder's personal LinkedIn, which sits on the founder entity). WebSite JSON-LD lives on the homepage;
 * developer entity markup lives on developers/[slug]/page.tsx.
 */
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
  const googleAdsId = getGoogleAdsId(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${serifDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd([organizationSchema(), founderSchema()]) }}
        />
        <ClerkProvider
          afterSignOutUrl="/"
          appearance={{
            variables: {
              colorPrimary: "#1b2a49",
              colorBackground: "#ffffff",
              colorForeground: "#14171f",
              colorMuted: "#efeae2",
              colorMutedForeground: "#5b6170",
              colorBorder: "#e2dcd1",
              borderRadius: "0.25rem",
              fontFamily: "var(--font-geist-sans), sans-serif",
            },
          }}
        >
          <AttributionCapture />
          <BehaviourTracker />
          <AnalyticsConsentProvider measurementId={gaMeasurementId} metaPixelId={metaPixelId} adsId={googleAdsId}>
            <AnalyticsEvents />
            <AdvisorProvider>{children}</AdvisorProvider>
          </AnalyticsConsentProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
