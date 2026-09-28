/**
 * The one canonical place the Developer Connects brand mark is rendered
 * (Part 10/11 of the profile-UX task). There is no logo IMAGE asset
 * anywhere in this repository today (checked `public/`, `src/app/`, and
 * every existing component) — only the plain text "Developer Connects"
 * that site-header.tsx and site-footer.tsx each rendered independently.
 * Per the task's own rule ("do NOT create a new logo, do NOT redraw it"),
 * this component does not invent one; it centralizes the existing text
 * wordmark those two places already showed, byte-identical in size and
 * weight, so every current and future brand-name placement renders
 * through one component instead of duplicated markup. The moment a real
 * logo image exists, it drops in here once and every call site below
 * updates together.
 */
export function Logo({ size = "default" }: { size?: "default" | "sm" }) {
  return (
    <span
      className={
        size === "sm"
          ? "font-semibold text-foreground"
          : "text-lg font-semibold tracking-tight text-foreground"
      }
    >
      Developer Connects
    </span>
  );
}
