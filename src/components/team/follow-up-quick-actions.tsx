"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeMyLeadFollowUpAction, rescheduleMyLeadFollowUpAction } from "@/app/team/_actions/team-actions";
import { WhatsAppOpenLink } from "@/components/leads/whatsapp-open-link";
import { toBusinessLocalInput } from "@/lib/leads/format";

/**
 * One-tap follow-up actions for a board row: Done, +1 hour, Tomorrow 10:00 (India time), Pick a time, WhatsApp and Return.
 * Every action is a server action; the row refreshes from the server's answer (no pretend state). "Return" needs a reason, so it
 * opens the lead where that is asked.
 */

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function FollowUpQuickActions({ leadId, followUpId, whatsappHref }: { leadId: string; followUpId: string; whatsappHref: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const commentOk = comment.trim().length >= 3;

  function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        setPicking(false);
        setComment("");
        router.refresh();
      } else setError(result.error);
    });
  }
  const reschedule = (local: string) => run(() => rescheduleMyLeadFollowUpAction(leadId, followUpId, local, undefined, comment));

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-sm font-semibold text-foreground">
        Comment <span className="font-normal text-red-700">(required)</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={2000} placeholder="What was said, what happens next" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      {!commentOk && <p className="text-xs text-muted-foreground">Saved with the date, time and day. Done and reschedule need a comment.</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={PRIMARY} disabled={pending || !commentOk} onClick={() => run(() => completeMyLeadFollowUpAction(leadId, followUpId, undefined, comment))}>
          Done
        </button>
        {whatsappHref ? <WhatsAppOpenLink href={whatsappHref} leadId={leadId} scope="team" className={BTN} /> : <span />}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Reschedule">
        <button type="button" className={BTN} disabled={pending || !commentOk} onClick={() => reschedule(toBusinessLocalInput(new Date(Date.now() + 3_600_000)))}>
          +1 hour
        </button>
        <button type="button" className={BTN} disabled={pending || !commentOk} onClick={() => reschedule(toBusinessLocalInput(new Date(), { addDays: 1, atHour: 10 }))}>
          Tomorrow 10:00
        </button>
        <button type="button" className={BTN} disabled={pending} aria-expanded={picking} onClick={() => { setPicking((p) => !p); if (!when) setWhen(toBusinessLocalInput(new Date(Date.now() + 3_600_000))); }}>
          Pick a time
        </button>
        <Link href={`/team/leads/${leadId}`} className={BTN}>
          Return…
        </Link>
      </div>
      {picking && (
        <div className="flex gap-2">
          <input type="datetime-local" aria-label="New time (India time)" value={when} min={toBusinessLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} className="min-h-12 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground" />
          <button type="button" className={PRIMARY} disabled={pending || !when || !commentOk} onClick={() => reschedule(when)}>
            Save
          </button>
        </div>
      )}
      {picking && <p className="text-xs text-muted-foreground">Times are India time.</p>}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
