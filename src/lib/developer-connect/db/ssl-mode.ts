/**
 * pg currently treats sslmode=prefer|require|verify-ca as verify-full and prints a SECURITY WARNING (on stderr, which Vercel
 * logs at error level) the first time a connection is made. Spelling the mode out as verify-full gives EXACTLY the behaviour
 * the connection already has, minus the warning, and stays correct when pg v9 changes what the old names mean.
 *
 * Only the three ambiguous names are rewritten. Nothing is weakened: libpq-compat connections (uselibpqcompat=true), "disable",
 * "verify-full" and URLs with no sslmode are left exactly as they are.
 */
export function explicitSslMode(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  if (url.searchParams.get("uselibpqcompat") === "true") return connectionString;
  const mode = url.searchParams.get("sslmode");
  if (mode !== "prefer" && mode !== "require" && mode !== "verify-ca") return connectionString;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
