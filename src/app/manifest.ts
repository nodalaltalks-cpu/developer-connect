import type { MetadataRoute } from "next";

/**
 * The web app manifest: what makes "Add to Home screen" / "Install" available. The icons are the brand mark on the same white the
 * logo uses; the theme colour is the site's navy accent so the phone's status bar matches the header.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Developer Connects",
    short_name: "Developer Connects",
    description: "Compare leading developers in Mumbai and Dubai and get one-to-one property guidance.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#1b2a49",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
