"use client";

import { useState, useTransition } from "react";
import { eraseLeadAction, restoreLeadAction, trashLeadAction } from "@/app/admin/_actions/lead-actions";

/**
 * The two ends of the Founder's lead clean-up path: Returned leads -> Trash (reversible) and Trash -> permanently removed
 * (typed confirmation, cannot be undone). Each button only calls a founder-only server action; who is acting never comes
 * from here.
 */

const CONFIRM_WORD = "ERASE";

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const BTN_DANGER =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
// 16px text on inputs so iOS Safari does not zoom on focus.
const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MoveToTrashButton({ leadId }: { leadId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pending}
        className={`${BTN} w-full`}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await trashLeadAction(leadId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Moving…" : "Move to Trash"}
      </button>
      {error && (
        <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export function TrashedLeadActions({ leadId }: { leadId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  function restore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreLeadAction(leadId);
      if (!result.ok) setError(result.error);
    });
  }

  function removeForever() {
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await eraseLeadAction(leadId, typed);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="mt-3 space-y-3">
      {!confirming ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={restore} disabled={pending} className={BTN}>
            {pending ? "Working…" : "Restore"}
          </button>
          <button type="button" onClick={() => setConfirming(true)} disabled={pending} className={BTN}>
            Delete permanently…
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">This cannot be undone.</span> The name, phone number, email, location and every
            note are removed for good. Only an anonymous record of what happened is kept.
          </p>
          <div>
            <label htmlFor={`erase-${leadId}`} className="block text-sm font-medium text-foreground">
              Type {CONFIRM_WORD} to confirm
            </label>
            <input
              id={`erase-${leadId}`}
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={pending}
              className={`${FIELD} mt-1.5`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={removeForever} disabled={!confirmed || pending} className={BTN_DANGER}>
              {pending ? "Removing…" : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
                setError(null);
              }}
              disabled={pending}
              className={BTN}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
