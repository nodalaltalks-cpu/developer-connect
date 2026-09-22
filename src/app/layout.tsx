import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "Developer Connects";
const SITE_DESCRIPTION =
  "Developer Connects verifies real-estate developers' official websites, so you can go straight to the source instead of a broker or listing site.";

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
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

/**
 * Organization + WebSite JSON-LD (Part: SEO entity signal). Deliberately
 * omits sameAs — the footer's social links belong to the parent
 * NoDalalTalks brand, not to Developer Connects itself, and asserting
 * them as this entity's own profiles would misrepresent the relationship
 * rather than clarify it. logo points at the one real image asset the
 * site actually serves.
 */
const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: "https://developerconnects.com",
    logo: "https://developerconnects.com/favicon.ico",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    // The same brand written as one word, as it appears in the domain —
    // helps search engines associate the site name with developerconnects.com.
    alternateName: "DeveloperConnects",
    url: "https://developerconnects.com/",
  },
];

export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <ClerkProvider
          afterSignOutUrl="/"
          appearance={{
            variables: {
              colorPrimary: "#2563eb",
              colorBackground: "#ffffff",
              colorForeground: "#111318",
              colorMuted: "#f7f8fa",
              colorMutedForeground: "#6b7280",
              colorBorder: "#e5e7eb",
              borderRadius: "0.375rem",
              fontFamily: "var(--font-geist-sans), sans-serif",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
