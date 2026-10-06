"use client";

import { useState, useTransition } from "react";
import { assignLeadAction } from "@/app/admin/_actions/lead-actions";

/**
 * The founder's owner control for one lead. Only ACTIVE team members are offered, plus "Founder (my queue)". This is
 * a convenience: assignLeadAction is founder-only and the service re-validates that the assignee exists and is
 * active. The previous owner is never lost — the change is added to the lead's timeline.
 */

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
// 16px text on inputs so iOS Safari does not zoom on focus.
const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface OwnerChoice {
  id: string;
  userId: string;
  name: string;
}

const FOUNDER_VALUE = "__founder__";

export function LeadOwnerCard({
  leadId,
  currentOwnerId,
  currentOwnerName,
  members,
  ownerInactive,
}: {
  leadId: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  members: OwnerChoice[];
  ownerInactive: boolean;
}) {
  const initial = members.find((m) => m.userId === currentOwnerId)?.id ?? FOUNDER_VALUE;
  const [choice, setChoice] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await assignLeadAction(leadId, choice === FOUNDER_VALUE ? null : choice);
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Owner</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Currently: <span className="font-medium text-foreground">{currentOwnerName ?? "Founder (my queue)"}</span>
        {ownerInactive ? " — no longer active. Reassign this lead." : ""}
      </p>

      <label htmlFor="owner-select" className="mt-3 block text-sm font-medium text-foreground">
        Assign to
      </label>
      <select
        id="owner-select"
        value={choice}
        onChange={(e) => {
          setChoice(e.target.value);
          setSaved(false);
        }}
        disabled={pending}
        className={`${FIELD} mt-1.5`}
      >
        <option value={FOUNDER_VALUE}>Founder (my queue)</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {members.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No active team members yet — add one under Team.</p>}

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Owner updated.
        </p>
      )}

      <button type="button" onClick={save} disabled={pending} className={`${BTN} mt-3`}>
        {pending ? "Saving…" : "Save owner"}
      </button>
    </section>
  );
}
