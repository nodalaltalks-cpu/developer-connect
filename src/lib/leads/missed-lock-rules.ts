/**
 * Which addresses stay open while follow-ups are missed. Clearing a miss happens on the missed lead itself, the missed list or the
 * follow-up board, so those are never locked. Any other lead, a new cold call and the dial pad are. The server enforces the same rule
 * on every action; this only decides when to show the pop-up instead of navigating.
 */

export const CLEARING_PATHS = ["/team/missed", "/team/follow-ups"];
const LEAD_LINK = /^\/team\/(leads|cold-call)\/([0-9a-f-]{36})(\/|$)/i;
const NEW_WORK = ["/team/dial", "/team/cold-call", "/team/queue"];

export function isLockedHref(href: string, missedIds: ReadonlySet<string>): boolean {
  let path = href;
  try {
    path = new URL(href, "http://x").pathname;
  } catch {
    return false;
  }
  if (CLEARING_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  const lead = LEAD_LINK.exec(path);
  if (lead) return !missedIds.has(lead[2].toLowerCase());
  return NEW_WORK.some((p) => path === p || path.startsWith(`${p}/`));
}
