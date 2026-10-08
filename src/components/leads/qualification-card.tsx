"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useInteractionComment } from "@/components/team/interaction-comment";
import { formatEnumLabel } from "@/lib/leads/format";
import { OUTCOME_STATUS, QUALIFICATION_OUTCOMES, QUALIFICATION_REASONS, employeeMayMove, type QualificationOutcome, type QualificationReason } from "@/lib/leads/qualification-model";
import type { LeadStatus } from "@/lib/leads/types";

/**
 * Qualification: how far this buyer has really got, in one tap. The four outcomes are existing statuses (Qualified, Pending
 * qualification = Contacted, Future potential = Revisit later, Not looking = Not interested); the reason is context kept on
 * the lead's history. A team member is only offered the moves they are allowed to make; the server checks again and is the
 * authority. Everything is appended to the timeline, nothing is overwritten.
 */

const OUTCOME_TITLE: Record<QualificationOutcome, string> = {
  QUALIFIED: "Qualified",
  PENDING_QUALIFICATION: "Pending qualification",
  FUTURE_POTENTIAL: "Future potential",
  NOT_LOOKING: "Not looking right now",
};

const CHIP = "inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";
const toggle = (on: boolean) => (on ? "border-accent bg-accent/10 text-foreground" : "border-border text-foreground hover:bg-muted");

export function QualificationCard({
  status,
  latest,
  restrictToTeamMoves,
  onRecord,
}: {
  status: LeadStatus;
  latest: { outcome: string; reason: string | null; atLabel: string } | null;
  /** True for a team member: only the transitions they may make are enabled. The Founder is not limited. */
  restrictToTeamMoves: boolean;
  onRecord: (outcome: string, reason: string | null, comment?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const shared = useInteractionComment();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<QualificationOutcome | null>(null);
  const [reason, setReason] = useState<QualificationReason | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const allowed = (o: QualificationOutcome) => !restrictToTeamMoves || employeeMayMove(status, OUTCOME_STATUS[o]);
  const anyAllowed = QUALIFICATION_OUTCOMES.some(allowed);

  function record() {
    if (!outcome) return;
    setMessage(null);
    startTransition(async () => {
      const result = shared ? await onRecord(outcome, outcome === "QUALIFIED" ? reason : null, shared.comment) : await onRecord(outcome, outcome === "QUALIFIED" ? reason : null);
      if (result.ok) {
        shared?.clear();
        setMessage({ tone: "ok", text: "Recorded." });
        setOutcome(null);
        setReason(null);
        router.refresh();
      } else setMessage({ tone: "error", text: result.error });
    });
  }

  return (
    <section aria-label="Qualification" className="rounded-xl border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">Qualification</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Status now: <span className="font-medium text-foreground">{formatEnumLabel(status)}</span>
        {latest ? ` · last recorded: ${formatEnumLabel(latest.outcome)}${latest.reason ? ` (${formatEnumLabel(latest.reason)})` : ""}, ${latest.atLabel}` : ""}
      </p>

      {!anyAllowed ? (
        <p className="mt-3 text-sm text-muted-foreground">This lead is past qualification. Its status moves with the site visit and the booking, or by the Founder.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Qualification outcome" className="mt-3 flex flex-wrap gap-2">
            {QUALIFICATION_OUTCOMES.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={outcome === o} disabled={!allowed(o) || pending} onClick={() => { setOutcome(o); if (o !== "QUALIFIED") setReason(null); }} className={`${CHIP} ${toggle(outcome === o)}`}>
                {OUTCOME_TITLE[o]}
              </button>
            ))}
          </div>
          {outcome === "QUALIFIED" && (
            <div className="mt-3">
              <p className="text-sm font-medium text-foreground">Reason (optional)</p>
              <div role="radiogroup" aria-label="Reason" className="mt-2 flex flex-wrap gap-2">
                {QUALIFICATION_REASONS.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={reason === r} disabled={pending} onClick={() => setReason(reason === r ? null : r)} className={`${CHIP} ${toggle(reason === r)}`}>
                    {formatEnumLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={record} disabled={!outcome || pending} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-accent px-4 text-base font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            {pending ? "Saving…" : "Record qualification"}
          </button>
        </>
      )}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-2 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
