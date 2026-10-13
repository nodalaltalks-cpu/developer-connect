import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AVIF first (about half the bytes of WebP at the same quality), WebP as the fallback. Next requires the allowed qualities to be listed.
  images: { formats: ["image/avif", "image/webp"], qualities: [55, 75, 85, 92] },
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
