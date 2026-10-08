import Link from "next/link";
import type { ProfileCompletion } from "@/lib/profile/types";
import { ProfileVerifiedBadge } from "@/components/profile/profile-verified-badge";

/**
 * The header's profile entry point (Part 1 of the profile-UX task) —
 * replaces a flat "Profile" text link with a two-line cue that states
 * the actual benefit of clicking ("get more relevant recommendations"),
 * not just a destination. Deliberately text-only (plus the small
 * verified badge when earned), no progress ring/widget — subtle
 * feedback, not a gamified widget — consistent with the existing
 * restrained design language.
 *
 * `completion` is read-only (see site-header.tsx: a plain getByUserId,
 * never getOrCreateProfile) so simply loading any page never creates a
 * profile row or fires an analytics event — only visiting /profile does.
 *
 * The secondary line used to read "N% complete · N left", where "left"
 * is `missingFieldKeys.length` — remaining PROFILE FIELDS, never a time
 * countdown. There is no completion deadline anywhere in this product,
 * so it stays a field count; "N left" is spelled out as "N fields left"
 * only so it can't be misread as a day count.
 */
export function ProfileHeaderLink({
  completion,
  verified,
}: {
  completion: ProfileCompletion;
  verified: boolean;
}) {
  const percentage = completion.percentage;
  const missing = completion.missingFieldKeys.length;

  let primary = "Your Profile";
  let secondary: string | null = null;

  if (percentage !== null) {
    if (percentage >= 100) {
      primary = "Your Profile";
      secondary = "Complete";
    } else if (percentage === 0) {
      primary = "Complete your profile";
      secondary = "For more relevant results";
    } else {
      primary = "Your Profile";
      secondary = `${percentage}% complete${missing > 0 ? ` · ${missing} field${missing === 1 ? "" : "s"} left` : ""}`;
    }
  }

  return (
    <Link
      href="/profile"
      className="hidden min-h-11 flex-col justify-center leading-tight hover:text-accent-hover sm:flex"
      aria-label={secondary ? `${primary}, ${secondary}${verified ? ", verified" : ""}` : primary}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {primary}
        {verified && <ProfileVerifiedBadge />}
      </span>
      {secondary && <span className="text-xs text-muted-foreground">{secondary}</span>}
    </Link>
  );
}
