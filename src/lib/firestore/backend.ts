/**
 * Which store the repositories talk to. Defaults to PostgreSQL so nothing changes until the cutover.
 * Set DATA_BACKEND=firestore to switch every domain at once (per-domain overrides: DATA_BACKEND_<DOMAIN>, e.g.
 * DATA_BACKEND_NOTIFICATIONS=firestore), which is how each adapter is verified before the flip.
 */
export function useFirestore(domain?: string): boolean {
  if (domain) {
    const override = process.env[`DATA_BACKEND_${domain.toUpperCase()}`];
    if (override) return override === "firestore";
  }
  return process.env.DATA_BACKEND === "firestore";
}
