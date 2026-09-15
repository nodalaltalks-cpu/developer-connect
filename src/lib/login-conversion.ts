/**
 * Shared client-only signal between VisitOfficialWebsiteButton (any page)
 * and LoginConversionPrompt (mounted once per page, anonymous visitors
 * only) — decoupled via a window event rather than React context, since
 * the two can be arbitrarily far apart in the tree and the prompt must
 * keep listening across a full page navigation (a fresh mount on the new
 * page, same tab, same sessionStorage).
 */
export const OFFICIAL_WEBSITE_CLICK_EVENT = "dc:official-website-click";

/** Fired by VisitOfficialWebsiteButton on every click — never blocks or delays the actual navigation. */
export function notifyOfficialWebsiteClicked(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFICIAL_WEBSITE_CLICK_EVENT));
}
