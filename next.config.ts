import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The sitemap is built from the whole published directory on every
        // request (see app/sitemap.ts), which takes several seconds — slow
        // enough that Google Search Console reported "Couldn't fetch". The
        // CDN now serves a cached copy (fresh for an hour, then stale-while-
        // revalidate so a crawler never waits on a rebuild), while the
        // sitemap still tracks the live directory within the hour.
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
