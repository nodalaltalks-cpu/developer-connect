import Image from "next/image";

/**
 * The one canonical place the Developer Connects brand mark is rendered
 * (Part 10/11 of the profile-UX task; Part 2/3/4 of the homepage-polish
 * task). `public/developer-connects-logo.jpg` is the real logo asset the
 * founder supplied — a 1600x1600 square mark, plain white background
 * (this site is light-mode only, so that background is invisible against
 * every surface it's placed on) — not a redrawn or substitute icon.
 *
 * The image is marked `alt=""` (decorative) deliberately: every call
 * site of this component already shows the visible "Developer Connects"
 * text right next to the mark, so a screen reader announcing the image's
 * name too would just repeat the same words twice in a row. The visible
 * text remains the one accessible name for the mark + wordmark pair.
 *
 * `size="sm"` matches the exact text sizing site-footer.tsx already used
 * before this component existed; `size="default"` matches site-header.tsx's —
 * both call sites still render byte-identical text output, just through
 * one shared place now.
 */
export function Logo({ size = "default" }: { size?: "default" | "sm" }) {
  const imageSize = size === "sm" ? 20 : 24;

  return (
    <span className="inline-flex items-center gap-2">
      <Image
        src="/developer-connects-logo.jpg"
        alt=""
        width={1600}
        height={1600}
        className="shrink-0 rounded-sm"
        style={{ width: imageSize, height: imageSize }}
      />
      <span
        className={
          size === "sm"
            ? "font-semibold text-foreground"
            : "text-lg font-semibold tracking-tight text-foreground"
        }
      >
        Developer Connects
      </span>
    </span>
  );
}
