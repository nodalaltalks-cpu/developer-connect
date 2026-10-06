"use client";

import { useState, useTransition } from "react";
import { eraseLeadAction } from "@/app/admin/_actions/lead-actions";

/**
 * The founder's erasure control for one lead — for when a buyer has asked us
 * to erase their details. It is deliberately two steps (open, then type the
 * confirmation word): erasure cannot be undone. The server action is
 * founder-only and re-validates everything; this component only collects the
 * confirmation. It is not rendered for a lead that is already erased.
 */

const CONFIRM_WORD = "ERASE";

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const BTN_DANGER =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
// 16px text on inputs so iOS Safari does not zoom on focus.
const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LeadEraseCard({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  function close() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  function erase() {
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await eraseLeadAction(leadId, typed);
      // On success the action revalidates this page and it re-renders as an erased lead (this card disappears).
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Erase personal data</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use this when the buyer has asked us to erase their details.</p>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${BTN} mt-3`}>
          Erase personal data…
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="text-sm text-foreground">
            <p className="font-medium">This cannot be undone.</p>
            <p className="mt-2 text-muted-foreground">
              <span className="font-medium text-foreground">Removed:</span> name, phone number, email, location, session and
              user links, the follow-up, and every note and other free text in this lead&apos;s history. Consent is recorded
              as withdrawn.
            </p>
            <p className="mt-2 text-muted-foreground">
              <span className="font-medium text-foreground">Kept:</span> status, the structured requirement (budget band,
              configuration, timeline), the developer, attribution, bookings and an anonymous timeline of what happened and
              when. An &ldquo;erased&rdquo; event is added to it. If the same person enquires again they become a new lead.
            </p>
          </div>

          <div>
            <label htmlFor="erase-confirm" className="block text-sm font-medium text-foreground">
              Type {CONFIRM_WORD} to confirm
            </label>
            <input
              id="erase-confirm"
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

          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={erase} disabled={!confirmed || pending} className={BTN_DANGER}>
              {pending ? "Erasing…" : "Erase permanently"}
            </button>
            <button type="button" onClick={close} disabled={pending} className={BTN}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
