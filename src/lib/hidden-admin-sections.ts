/**
 * Founder-dashboard sections that are switched off to stay inside the free Firestore daily allowance. Their pages answer 404
 * (src/proxy.ts), they are gone from the menus, and nothing links to them. The code is still in git, so a section comes back by
 * deleting its line here and putting its menu entry back.
 */
export const HIDDEN_ADMIN_SECTIONS = [
  "/admin/finance",
  "/admin/social-automation",
  "/admin/social",
  "/admin/campaigns",
  "/admin/ratings",
  "/admin/acquisition",
  "/admin/spend",
  "/admin/ads-playbook",
  "/admin/audit-log",
  "/admin/behaviour",
] as const;

export function isHiddenAdminPath(pathname: string): boolean {
  const p = pathname.toLowerCase().replace(/\/+$/, "");
  return HIDDEN_ADMIN_SECTIONS.some((s) => p === s || p.startsWith(`${s}/`));
}
