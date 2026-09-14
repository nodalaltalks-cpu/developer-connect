/**
 * The one visual trust signal used everywhere a verified developer's name
 * or card is shown: a small blue circular badge with a white checkmark —
 * deliberately evoking the familiar "verified account" pattern without
 * copying any platform's actual artwork (no shield/seal imagery implying
 * government certification either — this is Developer Connects' own
 * verification process, stated plainly). Exactly one component, one
 * markup, used identically on developer cards, search results, and
 * developer detail pages — see OfficialWebsiteVerifiedBadge for the
 * separate green "official website verified" trust line.
 */
export function VerifiedBadge({ label = true }: { label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      <span
        aria-hidden={label ? "true" : undefined}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent"
      >
        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none">
          <path
            d="M3 8.5L6.5 12L13 4.5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label ? "Verified" : <span className="sr-only">Verified</span>}
    </span>
  );
}
