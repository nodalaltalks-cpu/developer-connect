/**
 * The default share card (src/app/opengraph-image.tsx). Pages that set their own `openGraph` / `twitter` metadata
 * replace the root's, so each one lists this image explicitly or its shared link would show no preview picture.
 */
export const SHARE_IMAGES = [
  {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: "Developer Connects - property advisory for Mumbai, Dubai and the UAE",
  },
];
