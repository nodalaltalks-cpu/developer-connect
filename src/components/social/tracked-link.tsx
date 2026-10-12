"use client";

import type { ReactNode } from "react";
import { trackSocial } from "@/lib/social/track-client";

/** A link that counts its own taps (anonymously) before navigating. External links open in a new tab; mailto and wa.me work as normal links. */
export function TrackedLink({ linkKey, href, className, children }: { linkKey: string; href: string; className?: string; children: ReactNode }) {
  const external = /^https?:/.test(href);
  return (
    <a
      href={href}
      onClick={() => trackSocial({ kind: "link_click", linkKey })}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={className}
    >
      {children}
    </a>
  );
}
