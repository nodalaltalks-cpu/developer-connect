"use client";

import { useState, useTransition } from "react";
import { finishMyColdCallAction } from "@/app/team/_actions/team-actions";
import { QuickLeadForm } from "@/components/team/quick-lead-form";

/**
 * What happened on the cold call? Three big taps and the employee is on to the next number:
 *   Not interested  -> a few words of comment (or one tap on a reason) and Save. No name, no details. NOT a lead.
 *   Did not connect -> one tap on why (no answer, busy, switched off, wrong number). NOT a lead.
 *   Interested      -> the short lead form (every answer a tap, NA allowed). Saving makes it this employee's lead.
 * The call itself is already counted as dialed (and as connected if the phone measured more than 10 seconds).
 */

const REASONS = ["Not looking right now", "Already bought", "Wrong person", "Budget too low"];
const NOT_CONNECTED = [
  { key: "NO_ANSWER", label: "No answer" },
  { key: "BUSY", label: "Busy" },
  { key: "SWITCHED_OFF", label: "Switched off" },
  { key: "INVALID_NUMBER", label: "Wrong number" },
] as const;

const BIG = "flex min-h-16 w-full items-center justify-center rounded-xl border-2 px-4 text-lg font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP = "inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-4 text-base font-medium text-foreground hover:bg-muted";

export function ColdCallResult({ callId, leadId, onDone }: { callId: string; leadId: string; onDone: (message: string) => void }) {
  const [view, setView] = useState<"choose" | "no" | "nc" | "yes">("choose");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function finish(input: Parameters<typeof finishMyColdCallAction>[1], message: string) {
    setError(null);
    start(async () => {
      const result = await finishMyColdCallAction(callId, input).catch(() => ({ ok: false as const, error: "Could not save. Please try again." }));
      if (result.ok) onDone(message);
      else setError(result.error);
    });
  }

  if (view === "yes") {
    return (
      <div className="mt-4">
        <button type="button" onClick={() => setView("choose")} className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-accent-hover hover:underline">← Back</button>
        <QuickLeadForm leadId={leadId} onSaved={() => onDone("Lead saved. Ready for the next number.")} />
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-border p-4" aria-label="What happened on the call">
      <h2 className="text-lg font-bold text-foreground">How did the call go?</h2>

      {view === "choose" && (
        <div className="mt-3 grid gap-3">
          <button type="button" onClick={() => setView("yes")} className={`${BIG} border-whatsapp bg-whatsapp text-white hover:bg-whatsapp-hover`}>Interested</button>
          <button type="button" onClick={() => setView("no")} className={`${BIG} border-red-500 bg-background text-red-700 hover:bg-red-50`}>Not interested</button>
          <button type="button" onClick={() => setView("nc")} className={`${BIG} border-border bg-background text-foreground hover:bg-muted`}>Did not connect</button>
        </div>
      )}

      {view === "no" && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">Tap a reason or write a few words. No name or other details needed.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setComment(r)} className={`${CHIP} ${comment === r ? "border-accent bg-accent text-accent-foreground" : ""}`}>{r}</button>
            ))}
          </div>
          <textarea aria-label="Comment on the call" rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Why not interested" className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setView("choose")} disabled={pending} className={CHIP}>Back</button>
            <button type="button" disabled={pending || comment.trim().length < 3} onClick={() => finish({ outcome: "NOT_INTERESTED", comment }, "Saved as not interested. Ready for the next number.")} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-base font-bold text-accent-foreground hover:bg-accent-hover disabled:opacity-50">
              {pending ? "Saving…" : "Save and next number"}
            </button>
          </div>
        </div>
      )}

      {view === "nc" && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">One tap saves it and moves to the next number.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {NOT_CONNECTED.map((r) => (
              <button key={r.key} type="button" disabled={pending} onClick={() => finish({ outcome: "NOT_CONNECTED", reason: r.key }, `Saved: ${r.label.toLowerCase()}. Ready for the next number.`)} className={`${CHIP} min-h-14 text-lg disabled:opacity-50`}>
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setView("choose")} disabled={pending} className={`${CHIP} mt-3`}>Back</button>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
