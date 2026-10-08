"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { isLockedHref } from "@/lib/leads/missed-lock-rules";

/**
 * THE LOCK. While a team member has unresolved missed follow-ups, every other lead, every new number and every new lead is closed
 * until each missed one is cleared (completed, rescheduled with a date and time, cancelled with a reason, or returned), each with a
 * comment. The server enforces this on every action; this is the friendly face of it: the bucket names stay visible, a banner says how
 * many are waiting, and the moment anything else is tapped a pop-up explains and leads straight to the missed ones.
 *
 * It intercepts links to other leads and the Call controls of other leads (marked data-lock-lead). Links to the missed leads
 * themselves, to the missed list and to the follow-up board stay open, because that is how the lock is cleared.
 */

export interface MissedLead {
  leadId: string;
  name: string | null;
  /** Already formatted, e.g. "2 hours". */
  overdue: string;
}

export function MissedLock({ missed }: { missed: MissedLead[] }) {
  const [open, setOpen] = useState(false);
  const ids = missed.map((m) => m.leadId.toLowerCase()).join("|");

  useEffect(() => {
    if (missed.length === 0) return;
    const missedIds = new Set(ids.split("|"));
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const anchor = target.closest("a[href]");
      const locked = target.closest("[data-lock-lead]");
      let block = false;
      if (anchor && isLockedHref(anchor.getAttribute("href") ?? "", missedIds)) block = true;
      // Once a call is under way, recording its outcome is never blocked (a follow-up can go missed mid-call).
      if (!block && locked && target.closest("button") && !target.closest("[data-call-active]")) {
        const lead = (locked.getAttribute("data-lock-lead") ?? "").toLowerCase();
        block = lead === "new" || !missedIds.has(lead);
      }
      if (block) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [missed.length, ids]);

  if (missed.length === 0) return null;
  const shown = missed.slice(0, 5);
  return (
    <>
      <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
        <span>
          <strong>{missed.length}</strong> missed follow-up{missed.length === 1 ? "" : "s"}. Your other leads are locked until {missed.length === 1 ? "it is" : "they are"} cleared.
        </span>
        <Link href="/team/missed" className="inline-flex min-h-11 items-center rounded-md bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800">
          Clear now
        </Link>
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Clear your missed follow-ups first">
        <p className="text-sm leading-6 text-foreground">
          You have {missed.length} missed follow-up{missed.length === 1 ? "" : "s"}. Open each one, call the client or update it with a comment, and set the next date and time. After that, every other lead and new number opens again.
        </p>
        <ul className="mt-4 space-y-2">
          {shown.map((m) => (
            <li key={m.leadId}>
              <Link href={`/team/leads/${m.leadId}`} onClick={() => setOpen(false)} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border px-4 py-2 hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{m.name ?? "Unnamed lead"}</span>
                  <span className="block text-xs text-red-700">Missed by {m.overdue}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-accent-hover">Clear →</span>
              </Link>
            </li>
          ))}
        </ul>
        {missed.length > shown.length && <p className="mt-2 text-xs text-muted-foreground">And {missed.length - shown.length} more in the missed list.</p>}
        <Link href="/team/missed" onClick={() => setOpen(false)} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
          Open the missed list
        </Link>
      </BottomSheet>
    </>
  );
}
