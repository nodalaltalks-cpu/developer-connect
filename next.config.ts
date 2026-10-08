import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The old "How we verify" page no longer exists; keep old links and search results working.
  // Hero footage never changes under the same name; let browsers and the CDN keep it for a week.
  async headers() {
    return [{ source: "/video/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] }];
  },
  async redirects() {
    return [{ source: "/how-we-verify", destination: "/about", permanent: true }];
  },
};

export default nextConfig;
