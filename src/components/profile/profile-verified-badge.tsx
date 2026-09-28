/**
 * The blue "Verified" tick for a genuinely 100%-complete, email-verified
 * profile (Part 5 of the profile-UX task). Deliberately its own small
 * component, separate from `verified-badge.tsx` — that one asserts a
 * completely different, unrelated fact (a real-estate DEVELOPER's
 * official website has been verified by Developer Connects). Reusing it
 * here would conflate a user's own profile-completion state with the
 * public developer-verification system, which is exactly the kind of
 * cross-domain mixing this task explicitly rules out.
 *
 * Only ever rendered by a caller that already checked
 * `isProfileVerified()` (see lib/profile/verification.ts) — this
 * component itself has no logic and can't be shown "by accident"; it
 * either renders the tick or the caller doesn't render it at all.
 *
 * An original mark (a filled circle + check), not a copy of any other
 * product's verified-badge artwork.
 */
export function ProfileVerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Verified profile"
      title="Verified profile"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white ${className}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
        <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.9 3.9 6.7-6.7a1 1 0 0 1 1.4 0Z" />
      </svg>
    </span>
  );
}
