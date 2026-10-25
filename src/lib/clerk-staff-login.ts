/**
 * Creates an email + password sign-in for a new team member through Clerk's Backend API (founder team management only,
 * never a public path). The password is generated or typed by the Founder, sent to Clerk once and never stored,
 * logged or returned by us; Clerk keeps only its hash.
 *
 * Kept apart from the read-only Clerk lookups, and outside lib/staff, which stays free of Clerk.
 */

const CLERK_API_TIMEOUT_MS = 8000;
export const MIN_PASSWORD_LENGTH = 8;
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

async function clerkWrite(method: "PATCH" | "POST", path: string, body?: unknown): Promise<{ ok: boolean; code: string; message: string | null }> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) return { ok: false, code: "no_key", message: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLERK_API_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.clerk.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true, code: "", message: null };
    const parsed = (await res.json().catch(() => null)) as { errors?: { code?: string; message?: string }[] } | null;
    return { ok: false, code: parsed?.errors?.[0]?.code ?? `http_${res.status}`, message: parsed?.errors?.[0]?.message ?? null };
  } catch {
    return { ok: false, code: "unreachable", message: null };
  } finally {
    clearTimeout(timeout);
  }
}

const CLERK_USER_ID = /^user_[A-Za-z0-9_]{4,64}$/;

/** Sets a new password on an existing login and signs it out of every other session. Founder team management only. */
export async function setClerkPassword(userId: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CLERK_USER_ID.test(userId)) return { ok: false, error: "That is not a valid sign-in identity." };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  const r = await clerkWrite("PATCH", `/users/${encodeURIComponent(userId)}`, { password, sign_out_of_other_sessions: true });
  if (r.ok) return { ok: true };
  if (r.code.startsWith("form_password")) return { ok: false, error: r.message ?? "Clerk did not accept that password. Try a longer or less common one." };
  return { ok: false, error: "Could not change the password. Check that Password sign-in is switched on in Clerk, then try again." };
}

/** Bans (or unbans) a login so it cannot sign in at all; Clerk ends the user's sessions on a ban. Founder team management only. */
export async function setClerkBanned(userId: string, banned: boolean): Promise<boolean> {
  if (!CLERK_USER_ID.test(userId)) return false;
  return (await clerkWrite("POST", `/users/${encodeURIComponent(userId)}/${banned ? "ban" : "unban"}`)).ok;
}
