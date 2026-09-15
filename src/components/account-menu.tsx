"use client";

import { UserButton } from "@clerk/nextjs";

function ProfileMenuIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <circle cx="10" cy="6.5" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 17c1-3.5 4-5 6.5-5s5.5 1.5 6.5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Clerk requires <UserButton> custom children (MenuItems/Link) to be
 * rendered inside a Client Component — passing them as JSX from an async
 * Server Component crosses the RSC boundary and breaks the reference-
 * equality check Clerk's internals use to recognize its own sub-components,
 * which silently drops the custom item (logged as a dev-mode console error,
 * not a thrown error, so it's easy to miss). Keeping UserButton + its
 * MenuItems/Link entirely inside this client component avoids that.
 */
export function AccountMenu({ profilePercentage }: { profilePercentage: number | null }) {
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Link
          href="/profile"
          label={
            profilePercentage !== null ? `View Profile · ${profilePercentage}% complete` : "View Profile"
          }
          labelIcon={<ProfileMenuIcon />}
        />
      </UserButton.MenuItems>
    </UserButton>
  );
}
