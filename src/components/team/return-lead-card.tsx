"use client";

import { useState, useTransition } from "react";
import { formatEnumLabel } from "@/lib/leads/format";
import { RETURN_REASONS, type ReturnReason } from "@/lib/leads/types";

/**
 * Sends the lead back to the Founder. The reason is a mandatory structured choice — never a long comment; a note is
 * offered (and optional) only for "Other". The action is passed in by the page with the lead id bound; the server
 * checks the signed-in team member owns the lead. Two steps (open, then confirm) because returning ends their
 * ownership.
 */

export type ReturnLead = (reason: ReturnReason, note?: string) => Promise<{ ok: true } | { ok: false; error: string }>;

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ReturnLeadCard({ onReturn }: { onReturn: ReturnLead }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await onReturn(reason, reason === "OTHER" ? note || undefined : undefined);
      // On success the page re-renders and the lead is no longer theirs; nothing more to do here.
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Return lead</h2>
      <p className="mt-1 text-sm text-muted-foreground">Send this lead back to the Founder if you cannot move it forward. Your history on it is kept.</p>
      {!open ? (
        <button type="button" className={`${BTN} mt-3`} onClick={() => setOpen(true)}>
          Return lead…
        </button>
      ) : (
        <div className="mt-3 grid gap-3">
          <label htmlFor="return-reason" className="text-sm font-medium text-foreground">
            Why are you returning it?
          </label>
          <select id="return-reason" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason | "")} className={FIELD}>
            <option value="">Choose a reason</option>
            {RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {formatEnumLabel(r)}
              </option>
            ))}
          </select>
          {reason === "OTHER" && <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note" className={FIELD} aria-label="Optional note" />}
          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={!reason || pending} onClick={confirm}>
              {pending ? "Returning…" : "Return to Founder"}
            </button>
            <button type="button" className={BTN} disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
