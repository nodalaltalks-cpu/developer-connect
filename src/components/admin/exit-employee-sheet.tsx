"use client";

import { useState, useTransition } from "react";
import { exitStaffMemberAction } from "@/app/admin/_actions/staff-actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { EXIT_REASONS, type ExitReason } from "@/lib/staff/types";

/**
 * The confirmation for "Exit employee". It states plainly what will and will not happen, asks why (a structured reason,
 * not free text) and requires an explicit tick before the red button works. Exiting is permanent for access but never
 * deletes anything. The server action authorizes the Founder first and the service checks again.
 */

const REASON_LABEL: Record<ExitReason, string> = { RESIGNED: "Resigned", TERMINATED: "Terminated", CONTRACT_ENDED: "Contract ended", OTHER: "Other" };
const FIELD = "min-h-12 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ExitEmployeeSheet({ open, onClose, staffId, employeeId, name }: { open: boolean; onClose: () => void; staffId: string; employeeId: string; name: string }) {
  const [reason, setReason] = useState<ExitReason | "">("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await exitStaffMemberAction(staffId, reason);
      if (result.ok) setDone(result.message ?? "Exited.");
      else setError(result.error);
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Exit ${employeeId} · ${name}`} describedBy={`exit-desc-${employeeId}`}>
      {done ? (
        <div className="grid grid-cols-1 gap-4">
          <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
            {done}
          </p>
          <button type="button" onClick={onClose} className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Done
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <p id={`exit-desc-${employeeId}`} className="text-sm leading-6 text-foreground">
            This will remove this employee&apos;s access but permanently preserve their historical CRM activity, calls, leads, follow-ups, site visits and performance records. Their employee ID ({employeeId}) is retired and will never be given to anyone else.
          </p>
          <p className="text-sm text-muted-foreground">Their open leads stay where they are until you reassign or return them.</p>
          <div>
            <label htmlFor={`exit-reason-${employeeId}`} className="block text-sm font-medium text-foreground">
              Reason
            </label>
            <select id={`exit-reason-${employeeId}`} value={reason} onChange={(e) => setReason(e.target.value as ExitReason | "")} disabled={pending} className={`${FIELD} mt-1.5`}>
              <option value="">Choose a reason</option>
              {EXIT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={pending} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--accent)]" />
            <span>I understand that {employeeId} will lose access now.</span>
          </label>
          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="inline-flex min-h-12 items-center justify-center rounded-md border border-border px-4 text-base font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={pending || !reason || !understood} className="inline-flex min-h-12 items-center justify-center rounded-md bg-red-600 px-4 text-base font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50">
              {pending ? "Exiting…" : `Exit ${employeeId}`}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
