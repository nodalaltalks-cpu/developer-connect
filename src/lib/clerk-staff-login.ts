/**
 * Creates an email + password sign-in for a new team member through Clerk's Backend API (founder team management only,
 * never a public path). The password is generated or typed by the Founder, sent to Clerk once and never stored,
 * logged or returned by us; Clerk keeps only its hash.
 *
 * Kept apart from the read-only Clerk lookups, and outside lib/staff, which stays free of Clerk.
 */

const CLERK_API_TIMEOUT_MS = 8000;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 72;

export type CreateLoginResult = { ok: true; userId: string } | { ok: false; error: string };

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `The password is too long (max ${MAX_PASSWORD_LENGTH} characters).`;
  return null;
}

/**
 * Creates the Clerk user with a verified email and the given password. Never touches an existing account: callers check
 * for one first, because setting a password on someone else's existing login would take it over.
 */
export async function createClerkLoginWithPassword(input: { email: string; password: string; displayName: string }): Promise<CreateLoginResult> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) return { ok: false, error: "Sign-in is not configured on the server." };
  const problem = passwordProblem(input.password);
  if (problem) return { ok: false, error: problem };

  const [first, ...rest] = input.displayName.trim().split(/\s+/);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLERK_API_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.clerk.com/v1/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email_address: [input.email.trim().toLowerCase()], password: input.password, first_name: first || undefined, last_name: rest.join(" ") || undefined }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as { id?: unknown; errors?: { code?: string; message?: string }[] } | null;
    if (res.ok && typeof body?.id === "string") return { ok: true, userId: body.id };
    const code = body?.errors?.[0]?.code ?? "";
    if (code === "form_identifier_exists") return { ok: false, error: "A login with that email already exists." };
    if (code.startsWith("form_password")) return { ok: false, error: body?.errors?.[0]?.message ?? "Clerk did not accept that password. Try a longer or less common one." };
    return { ok: false, error: "Could not create the login. Check that Password sign-in is switched on in Clerk, then try again." };
  } catch {
    return { ok: false, error: "Could not reach the sign-in service. Please try again." };
  } finally {
    clearTimeout(timeout);
  }
}
