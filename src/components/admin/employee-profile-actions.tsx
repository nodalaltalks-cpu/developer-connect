"use client";

import { useState, useTransition } from "react";
import { approveStaffMemberAction, changeStaffEmailAction, loadEmployeeHistoryAction, returnOpenLeadsAction, setStaffActiveAction, type HistoryRow } from "@/app/admin/_actions/staff-actions";
import { ExitEmployeeSheet } from "@/components/admin/exit-employee-sheet";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { StaffStatus } from "@/lib/staff/types";

const BTN = "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Lifecycle buttons for one profile. Server actions authorize the Founder; these only ask. */
export function ProfileActions({ staffId, employeeId, name, status, approved, openLeads, email }: { staffId: string; employeeId: string; name: string; status: StaffStatus; approved: boolean; openLeads: number; email: string | null }) {
  const [pending, startTransition] = useTransition();
  const [exiting, setExiting] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function run(work: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    setNote(null);
    startTransition(async () => {
      const r = await work();
      setNote(r.ok ? { tone: "ok", text: r.message ?? "Done." } : { tone: "error", text: r.error });
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "INVITED" && !approved && (
          <button type="button" disabled={pending} onClick={() => run(() => approveStaffMemberAction(staffId))} className={BTN_PRIMARY}>
            Approve
          </button>
        )}
        {(status === "ACTIVE" || status === "INACTIVE") && (
          <button type="button" disabled={pending} onClick={() => run(() => setStaffActiveAction(staffId, status !== "ACTIVE"))} className={BTN}>
            {status === "ACTIVE" ? "Deactivate" : "Activate"}
          </button>
        )}
        {status !== "EXITED" && (
          <button type="button" disabled={pending} onClick={() => setExiting(true)} className={`${BTN} text-red-700`}>
            Exit employee
          </button>
        )}
        {status !== "EXITED" && (
          <button type="button" disabled={pending} onClick={() => { setNote(null); setChangingEmail(true); }} className={BTN}>
            Change login email
          </button>
        )}
        {openLeads > 0 && (
          <button type="button" disabled={pending} onClick={() => run(() => returnOpenLeadsAction(employeeId))} className={BTN}>
            Return {openLeads} open {openLeads === 1 ? "lead" : "leads"} to my queue
          </button>
        )}
      </div>
      {note && (
        <p role={note.tone === "error" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-sm ${note.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {note.text}
        </p>
      )}
      {status !== "EXITED" && (
        <BottomSheet open={changingEmail} onClose={() => setChangingEmail(false)} title={`Change login email · ${employeeId}`}>
          <form
            className="grid grid-cols-1 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await changeStaffEmailAction(staffId, newEmail);
                if (r.ok) {
                  setNewEmail("");
                  setChangingEmail(false);
                }
                return r;
              });
            }}
          >
            <p className="text-sm text-muted-foreground">
              {employeeId} stays {employeeId}: the ID, their leads, calls and history do not change, and the old address is kept in their account history. Current: {email ?? "none"}.
              {status === "INVITED" ? " They will be matched on this address when they first sign in." : " They keep signing in with the same account they use now."}
            </p>
            <div>
              <label htmlFor={`new-email-${employeeId}`} className="block text-sm font-medium text-foreground">
                New login email
              </label>
              <input id={`new-email-${employeeId}`} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="done" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="mt-1.5 min-h-12 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            {note && note.tone === "error" && (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {note.text}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setChangingEmail(false)} className={BTN}>
                Cancel
              </button>
              <button type="submit" disabled={pending || !newEmail.trim()} className={BTN_PRIMARY}>
                {pending ? "Saving…" : "Save email"}
              </button>
            </div>
          </form>
        </BottomSheet>
      )}
      {status !== "EXITED" && <ExitEmployeeSheet open={exiting} onClose={() => setExiting(false)} staffId={staffId} employeeId={employeeId} name={name} />}
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const label = (t: string) => t.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Newest-first activity with "Load more" (cursor = the oldest time shown). */
export function HistoryList({ employeeId, initial, pageSize }: { employeeId: string; initial: HistoryRow[]; pageSize: number }) {
  const [rows, setRows] = useState(initial);
  const [done, setDone] = useState(initial.length < pageSize);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function more() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setError(null);
    startTransition(async () => {
      const r = await loadEmployeeHistoryAction(employeeId, last.at);
      if (!r.ok) return setError(r.error);
      setRows((cur) => [...cur, ...r.rows]);
      if (r.rows.length < pageSize) setDone(true);
    });
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No recorded activity yet.</p>;
  return (
    <div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{label(r.eventType)}</span>
              <a href={`/admin/leads/${r.leadId}`} className="inline-flex min-h-11 items-center text-xs text-accent-hover underline underline-offset-2">
                Open lead
              </a>
            </span>
            <time dateTime={r.at} className="shrink-0 text-xs text-muted-foreground">
              {when(r.at)}
            </time>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {!done && (
        <button type="button" onClick={more} disabled={pending} className={`${BTN} mt-3 w-full`}>
          {pending ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
