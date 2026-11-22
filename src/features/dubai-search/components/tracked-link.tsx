"use client";

import Link from "next/link";
import { track, type EventName } from "../lib/analytics.ts";

/** A link that records one click in the experiment's own local event log (this browser only) and then navigates normally. */
export function TrackedLink({ href, event, className, children }: { href: string; event: EventName; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={className} onClick={() => track(event)}>
      {children}
    </Link>
  );
}
