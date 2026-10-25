"use client";

import { useState, useTransition } from "react";
import { setStaffTabAccessAction } from "@/app/admin/_actions/staff-actions";
import { EXTRA_TABS, STANDARD_TABS } from "@/lib/staff/tab-access";

const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/**
 * The Founder's tab switches for one person. Standard tabs start on; extra access starts off. The server action does the
 * real checking (founder only, known tabs only, at least one on) - this only collects the choice.
 */
export function TabAccessCard({ staffId, employeeId, initial }: { staffId: string; employeeId: string; initial: string[] }) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: string) => setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  function save() {
    setNote(null);
    startTransition(async () => {
      const r = await setStaffTabAccessAction(staffId, selected);
      setNote(r.ok ? { tone: "ok", text: r.message ?? "Saved." } : { tone: "error", text: r.error });
    });
  }

  const row = (tab: { key: string; label: string; description: string }) => (
    <li key={tab.key}>
      <label className="flex min-h-12 items-start gap-3 rounded-lg border border-border p-3 text-sm">
        <input type="checkbox" checked={selected.includes(tab.key)} onChange={() => toggle(tab.key)} disabled={pending} className="mt-0.5 size-5 shrink-0" />
        <span className="min-w-0">
          <span className="block font-medium text-foreground">{tab.label}</span>
          <span className="block text-xs text-muted-foreground">{tab.description}</span>
        </span>
      </label>
    </li>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Choose what {employeeId} can open in their team workspace. A tab you switch off disappears from their menu and its page stops working for them. It applies the next time they open a page.</p>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Standard tabs</h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{STANDARD_TABS.map(row)}</ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Extra access (off unless you switch it on)</h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{EXTRA_TABS.map(row)}</ul>
      </div>
      {note && (
        <p role={note.tone === "error" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-sm ${note.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {note.text}
        </p>
      )}
      <button type="button" onClick={save} disabled={pending || selected.length === 0} className={BTN_PRIMARY}>
        {pending ? "Saving…" : "Save tab access"}
      </button>
    </div>
  );
}
