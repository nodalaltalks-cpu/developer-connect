/**
 * The "this official website has been checked" trust line — deliberately
 * a distinct treatment from VerifiedBadge (blue): a restrained,
 * professional green, the color association everyone already reads as
 * confirmation/safety, on a very light green background. Not an
 * advertisement, not neon — just "this has been checked." One component,
 * used everywhere this exact claim is made (developer cards, developer
 * detail pages).
 */
export function OfficialWebsiteVerifiedBadge({ full = false }: { full?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-trust-soft px-2.5 py-1 text-xs font-medium text-trust">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path
          d="M3 8.5L6.5 12L13 4.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {full ? "Official website verified by Developer Connects" : "Official website verified"}
    </span>
  );
}
