"use client";

import { useState, useTransition } from "react";
import { createCrmCallingBatchAction, type CrmBatchResult } from "@/app/admin/_actions/lead-actions";

/** Creates a calling batch from the next unassigned CRM leads. All validation is on the server (Founder-only action). */

const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CallingBatchForm({ team }: { team: Array<{ id: string; name: string }> }) {
  const [name, setName] = useState("");
  const [assignee, setAssignee] = useState("");
  const [count, setCount] = useState("100");
  const [result, setResult] = useState<CrmBatchResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setResult(null);
    startTransition(async () => {
      setResult(await createCrmCallingBatchAction(name, assignee, Number(count)));
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div>
        <label htmlFor="batch-name" className="block text-sm font-medium text-foreground">
          Batch name
        </label>
        <input id="batch-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Unassigned leads — week 41" className={`${FIELD} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="batch-assignee" className="block text-sm font-medium text-foreground">
          Give to
        </label>
        <select id="batch-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={`${FIELD} mt-1.5`}>
          <option value="">Choose a team member</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="batch-count" className="block text-sm font-medium text-foreground">
          How many leads (oldest unassigned first, up to 500)
        </label>
        <input id="batch-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} className={`${FIELD} mt-1.5`} />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim() || !assignee}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create calling batch"}
      </button>
      {result && !result.ok && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {result.error}
        </p>
      )}
      {result && result.ok && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Batch created with {result.included} {result.included === 1 ? "lead" : "leads"}.
        </p>
      )}
    </div>
  );
}
