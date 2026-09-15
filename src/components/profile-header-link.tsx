import Link from "next/link";
import type { ProfileCompletion } from "@/lib/profile/types";

/**
 * The header's profile entry point (Part 1 of the profile-UX task) —
 * replaces a flat "Profile" text link with a two-line cue that states
 * the actual benefit of clicking ("get more relevant recommendations"),
 * not just a destination. Deliberately text-only, no progress ring/badge
 * — subtle feedback, not a gamified widget — consistent with the
 * existing restrained design language.
 *
 * `completion` is read-only (see site-header.tsx: a plain getByUserId,
 * never getOrCreateProfile) so simply loading any page never creates a
 * profile row or fires an analytics event — only visiting /profile does.
 */
export function ProfileHeaderLink({ completion }: { completion: ProfileCompletion }) {
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
      secondary = `${percentage}% complete${missing > 0 ? ` · ${missing} left` : ""}`;
    }
  }

  return (
    <Link
      href="/profile"
      className="hidden flex-col leading-tight hover:text-accent-hover sm:flex"
      aria-label={secondary ? `${primary}, ${secondary}` : primary}
    >
      <span className="text-sm font-medium text-foreground">{primary}</span>
      {secondary && <span className="text-xs text-muted-foreground">{secondary}</span>}
    </Link>
  );
}
