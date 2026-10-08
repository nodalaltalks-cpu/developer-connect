import { ImageResponse } from "next/og";

/**
 * Default share card (WhatsApp, Facebook, LinkedIn, X, iMessage). One static image for the whole site: it uses only the
 * brand name and the plain description the site already shows, so it can never claim something a page does not.
 */
export const alt = "Developer Connects - property advisory for Mumbai, Dubai and the UAE";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "#0f172a",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, color: "#93c5fd", letterSpacing: 2 }}>DEVELOPER CONNECTS</div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1, marginTop: 28 }}>
          Buy property with clarity
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#cbd5e1", marginTop: 36 }}>
          Property advisory · Mumbai · Dubai · India and the UAE
        </div>
      </div>
    ),
    { ...size },
  );
}
