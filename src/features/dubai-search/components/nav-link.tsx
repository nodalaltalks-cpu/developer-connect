import { dubaiSearchEnabled, DUBAI_SEARCH_PATH } from "../flag.ts";
import { TrackedLink } from "./tracked-link.tsx";

/**
 * The header link (large screens). Renders nothing unless the feature flag is on. On phones and tablets the header has no room (the logo would
 * shrink), so phones get DubaiSearchMobileStrip under the header and the homepage section instead.
 */
export function DubaiSearchNavLink() {
  if (!dubaiSearchEnabled()) return null;
  return (
    <TrackedLink href={DUBAI_SEARCH_PATH} event="nav_click" className="hidden min-h-11 items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent-hover lg:inline-flex">
      Dubai Property Search
      <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] font-semibold leading-none tracking-wide text-white">NEW</span>
    </TrackedLink>
  );
}

/** Phones only: a slim strip under the header on the homepage. Renders nothing unless the feature flag is on. */
export function DubaiSearchMobileStrip() {
  if (!dubaiSearchEnabled()) return null;
  return (
    <TrackedLink href={DUBAI_SEARCH_PATH} event="nav_click" className="flex min-h-11 items-center justify-center gap-2 border-b border-border bg-neutral-50 px-4 text-sm font-medium text-foreground lg:hidden">
      <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] font-semibold leading-none tracking-wide text-white">NEW</span>
      Dubai Property Search →
    </TrackedLink>
  );
}
