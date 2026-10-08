import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The old "How we verify" page no longer exists; keep old links and search results working.
  async redirects() {
    return [{ source: "/how-we-verify", destination: "/about", permanent: true }];
  },
};

export default nextConfig;
