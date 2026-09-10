/**
 * The one visual trust signal used everywhere a verified developer is
 * shown. Deliberately restrained: no "100% verified", no shield/seal
 * imagery implying government certification — this is Developer
 * Connect's own verification process, stated plainly.
 */
export function VerifiedBadge({ full = false }: { full?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-hover">
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
      >
        <path
          d="M3 8.5L6.5 12L13 4.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {full ? "Official website verified by Developer Connect" : "Official website verified"}
    </span>
  );
}
