"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addStaffMemberAction, approveStaffMemberAction, setStaffActiveAction } from "@/app/admin/_actions/staff-actions";
import { ExitEmployeeSheet } from "@/components/admin/exit-employee-sheet";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { FOUNDER_IDENTITY, invitedDetail, STATUS_LABEL } from "@/lib/staff/identity";
import type { StaffRole, StaffStatus } from "@/lib/staff/types";

/** Founder-only team directory. Server actions do the real checking; this only collects input. Cards, not a table. */

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
// 16px text on inputs so iOS Safari does not zoom on focus.
const FIELD =
  "min-h-12 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface StaffRow {
  id: string;
  employeeId: string;
  displayName: string;
  email: string | null;
  role: StaffRole;
  status: StaffStatus;
  approvedAt: string | null;
  joinedAt: string | null;
  exitedAt: string | null;
  leadCount: number;
}

const ROLE_LABEL: Record<string, string> = { EMPLOYEE: "Employee", SALES_MANAGER: "Sales manager", MANAGER: "Manager" };
const STATUS_TONE: Record<StaffStatus, string> = {
  ACTIVE: "bg-green-50 text-green-800",
  INVITED: "bg-amber-50 text-amber-800",
  INACTIVE: "bg-muted text-muted-foreground",
  EXITED: "bg-red-50 text-red-800",
};
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null);

export function IdChip({ id }: { id: string }) {
  return <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold tabular-nums tracking-wide text-accent-hover">{id}</span>;
}

export function StatusPill({ status }: { status: StaffStatus }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function AddEmployeeForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("EMPLOYEE");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await addStaffMemberAction(email, name, role);
      // On a validation error the entered values stay, so nothing has to be retyped.
      if (result.ok) {
        setMessage({ tone: "ok", text: result.message ?? "Added." });
        setEmail("");
        setName("");
      } else setMessage({ tone: "error", text: result.error });
    });
  }

  return (
    <form
      className="grid grid-cols-1 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-muted-foreground">
        They get their permanent ID now, but no access until you approve them <strong>and</strong> they sign in with exactly this email. A Gmail address is fine.
      </p>
      <div>
        <label htmlFor="staff-name" className="block text-sm font-medium text-foreground">
          Full name
        </label>
        <input id="staff-name" type="text" autoComplete="off" autoCapitalize="words" enterKeyHint="next" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} className={`${FIELD} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="staff-email" className="block text-sm font-medium text-foreground">
          Sign-in email
        </label>
        <input id="staff-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="done" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} className={`${FIELD} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="staff-role" className="block text-sm font-medium text-foreground">
          Role
        </label>
        <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} disabled={pending} className={`${FIELD} mt-1.5`}>
          <option value="EMPLOYEE">Employee</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">Employee is the only role that exists today; manager permissions are not built yet.</p>
      </div>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !email.trim() || !name.trim()} className={`${BTN_PRIMARY} flex-1`}>
          {pending ? "Saving…" : "Create employee"}
        </button>
        <button type="button" onClick={onDone} className={BTN}>
          Done
        </button>
      </div>
    </form>
  );
}

function StaffCard({ row, onError, onMessage }: { row: StaffRow; onError: (e: string) => void; onMessage: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [exiting, setExiting] = useState(false);
  const detail = invitedDetail({ status: row.status, approvedAt: row.approvedAt ? new Date(row.approvedAt) : null });
  const canApprove = row.status === "INVITED" && !row.approvedAt;
  const canToggle = row.status === "ACTIVE" || row.status === "INACTIVE";
  const canExit = row.status !== "EXITED";

  function run(work: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    onError("");
    startTransition(async () => {
      const result = await work();
      if (!result.ok) onError(result.error);
      else if (result.message) onMessage(result.message);
    });
  }

  return (
    <li className="min-w-0 rounded-xl border border-border">
      <Link href={`/admin/staff/${row.employeeId}`} className="block rounded-t-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open ${row.employeeId} ${row.displayName}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <IdChip id={row.employeeId} />
            <p className="mt-1.5 truncate text-base font-semibold text-foreground">{row.displayName}</p>
            <p className="text-sm text-muted-foreground">{ROLE_LABEL[row.role] ?? row.role}</p>
          </div>
          <StatusPill status={row.status} />
        </div>
        {row.email && <p className="mt-2 break-all text-xs text-muted-foreground">{row.email}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {detail ?? (row.status === "EXITED" ? `Exited ${date(row.exitedAt) ?? ""}` : row.joinedAt ? `Joined ${date(row.joinedAt)}` : "")}
          {row.status !== "INVITED" ? `${detail || row.joinedAt || row.exitedAt ? " · " : ""}${row.leadCount} open ${row.leadCount === 1 ? "lead" : "leads"} owned` : ""}
        </p>
      </Link>
      <div className="flex flex-wrap gap-2 border-t border-border p-3">
        <Link href={`/admin/staff/${row.employeeId}`} className={BTN}>
          View
        </Link>
        {canApprove && (
          <button type="button" disabled={pending} onClick={() => run(() => approveStaffMemberAction(row.id))} className={BTN_PRIMARY}>
            Approve
          </button>
        )}
        {canToggle && (
          <button type="button" disabled={pending} onClick={() => run(() => setStaffActiveAction(row.id, row.status !== "ACTIVE"))} className={BTN}>
            {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
          </button>
        )}
        {canExit && (
          <button type="button" disabled={pending} onClick={() => setExiting(true)} className={`${BTN} text-red-700`}>
            Exit
          </button>
        )}
      </div>
      <ExitEmployeeSheet open={exiting} onClose={() => setExiting(false)} staffId={row.id} employeeId={row.employeeId} name={row.displayName} />
    </li>
  );
}

export function StaffManager({ rows, query }: { rows: StaffRow[]; query: string }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button type="button" onClick={() => setAdding(true)} className={`${BTN_PRIMARY} flex-1 sm:flex-none`}>
          Add employee
        </button>
      </div>

      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Add an employee">
        <AddEmployeeForm onDone={() => setAdding(false)} />
      </BottomSheet>

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          {message}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <li className="min-w-0 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <IdChip id={FOUNDER_IDENTITY.employeeId} />
              <p className="mt-1.5 truncate text-base font-semibold text-foreground">{FOUNDER_IDENTITY.name}</p>
              <p className="text-sm text-muted-foreground">{FOUNDER_IDENTITY.role}</p>
            </div>
            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-hover">You</span>
          </div>
        </li>
        {rows.map((row) => (
          <StaffCard key={row.id} row={row} onError={setError} onMessage={setMessage} />
        ))}
      </ul>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{query ? `No team member matches “${query}”.` : "No team members yet. Add your first employee above."}</p>
      )}
    </div>
  );
}
