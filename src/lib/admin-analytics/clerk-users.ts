/**
 * Read-only lookups against Clerk's Backend API — the same mechanism and
 * pattern already used by platform-health's checkAuthenticationHealth
 * (raw fetch with a Bearer token, never the SDK's server client, never
 * exposes CLERK_SECRET_KEY to the caller). This is the only place
 * Developer Connect reads Clerk's user list; it never writes anything.
 *
 * Used only from founder-only admin pages/actions — never from a public
 * or user-facing path.
 */

const CLERK_API_TIMEOUT_MS = 8000;

export interface ClerkUserSummary {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  imageUrl: string | null;
  createdAt: Date;
  lastSignInAt: Date | null;
}

interface ClerkApiUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  created_at: number;
  last_sign_in_at: number | null;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
}

function toSummary(user: ClerkApiUser): ClerkUserSummary {
  const primaryEmail =
    user.email_addresses.find((e) => e.id === user.primary_email_address_id)?.email_address ??
    user.email_addresses[0]?.email_address ??
    null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();

  return {
    id: user.id,
    displayName: name || primaryEmail || user.id,
    primaryEmail,
    imageUrl: user.image_url,
    createdAt: new Date(user.created_at),
    lastSignInAt: user.last_sign_in_at ? new Date(user.last_sign_in_at) : null,
  };
}

function requireKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is not configured");
  return key;
}

async function clerkFetch(path: string): Promise<unknown> {
  const key = requireKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLERK_API_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.clerk.com/v1${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Clerk API request failed: ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Paginated list of every signed-up user, newest first — for the admin Users list. */
export async function listClerkUsers(
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ users: ClerkUserSummary[]; totalCount: number }> {
  // Clerk's default ordering for this endpoint is already newest-first
  // (created_at descending) — no explicit order_by needed.
  const [usersRaw, countRaw] = await Promise.all([
    clerkFetch(`/users?limit=${limit}&offset=${offset}`),
    clerkFetch(`/users/count`),
  ]);
  const users = (usersRaw as ClerkApiUser[]).map(toSummary);
  const totalCount = (countRaw as { total_count: number }).total_count;
  return { users, totalCount };
}

const CLERK_PAGE_SIZE = 100;
/** Sanity cap only — real user counts today are tiny; this just guards against an unbounded loop if Clerk's count endpoint ever disagreed with what pagination actually returns. */
const MAX_USERS_TO_FETCH = 2000;

/**
 * Every signed-up user, for founder-notification audience targeting
 * (Phase 4B) — "all users" / "incomplete profile" / "below X%" / "missing
 * section" all need the FULL user base, not one admin-list page. Pages
 * through Clerk's list endpoint at CLERK_PAGE_SIZE per call.
 */
export async function listAllClerkUsers(): Promise<ClerkUserSummary[]> {
  const all: ClerkUserSummary[] = [];
  let offset = 0;
  for (;;) {
    const { users, totalCount } = await listClerkUsers({ limit: CLERK_PAGE_SIZE, offset });
    all.push(...users);
    offset += users.length;
    if (users.length === 0 || offset >= totalCount || offset >= MAX_USERS_TO_FETCH) break;
  }
  return all;
}

/** A single user by Clerk id, for the individual admin user page. Returns null if not found. */
export async function getClerkUser(userId: string): Promise<ClerkUserSummary | null> {
  try {
    const user = await clerkFetch(`/users/${encodeURIComponent(userId)}`);
    return toSummary(user as ClerkApiUser);
  } catch {
    return null;
  }
}
