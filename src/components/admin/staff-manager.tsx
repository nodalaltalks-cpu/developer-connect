"use client";

import { useState, useTransition } from "react";
import { addStaffMemberAction, setStaffActiveAction } from "@/app/admin/_actions/staff-actions";

/** Founder-only team list + add form. Server actions do the real checking; this only collects input. */

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
// 16px text on inputs so iOS Safari does not zoom on focus.
const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface StaffRow {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  active: boolean;
  leadCount: number;
}

const ROLE_LABEL: Record<string, string> = { EMPLOYEE: "Employee", SALES_MANAGER: "Sales manager", MANAGER: "Manager" };

export function StaffManager({ rows }: { rows: StaffRow[] }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addStaffMemberAction(email, name);
      if (result.ok) {
        setEmail("");
        setName("");
      } else setError(result.error);
    });
  }

  function toggle(id: string, active: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setStaffActiveAction(id, active);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Add a team member</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          They must already have a Developer Connects sign-in. Use the email they signed up with.
        </p>
        <label htmlFor="staff-email" className="mt-3 block text-sm font-medium text-foreground">
          Email
        </label>
        <input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" disabled={pending} className={`${FIELD} mt-1.5`} />
        <label htmlFor="staff-name" className="mt-3 block text-sm font-medium text-foreground">
          Name
        </label>
        <input id="staff-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" disabled={pending} className={`${FIELD} mt-1.5`} />
        <button type="button" onClick={add} disabled={pending || !email.trim() || !name.trim()} className={`${BTN_PRIMARY} mt-3`}>
          {pending ? "Saving…" : "Add to team"}
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team members yet.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">{row.displayName}</p>
                  {row.email && <p className="break-all text-sm text-muted-foreground">{row.email}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${row.active ? "bg-accent-soft text-accent-hover" : "bg-muted text-muted-foreground"}`}
                >
                  {row.active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {ROLE_LABEL[row.role] ?? row.role} · {row.leadCount} {row.leadCount === 1 ? "lead" : "leads"}
              </p>
              {!row.active && row.leadCount > 0 && (
                <p className="mt-1 text-xs text-amber-700">Inactive — reassign their leads from each lead&apos;s page.</p>
              )}
              <button type="button" onClick={() => toggle(row.id, !row.active)} disabled={pending} className={`${BTN} mt-3`}>
                {row.active ? "Deactivate" : "Reactivate"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
