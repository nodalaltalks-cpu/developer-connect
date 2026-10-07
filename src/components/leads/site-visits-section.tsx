"use client";

import { useState, useTransition } from "react";
import { businessPresetLocal, formatDateTimeFull, formatEnumLabel } from "@/lib/leads/format";
import type { SiteVisitView } from "@/lib/leads/project-view";
import { SITE_VISIT_OUTCOMES, type SiteVisitOutcome } from "@/lib/leads/types";

/**
 * Site visits on a lead page: schedule one, then confirm it, record what happened (completed with an outcome, or
 * no-show), reschedule or cancel it. Every visit keeps its place in the history. The actions are props with the lead
 * already bound; the server decides who may act, what time it is, and which changes are allowed (a visit can only be
 * completed or marked no-show after its scheduled time).
 */

export type VisitActionResult = { ok: true } | { ok: false; error: string };
export type ScheduleVisit = (whenLocal: string, projectId: string, notes: string) => Promise<VisitActionResult>;
export type VisitChange =
  | { kind: "CONFIRM" }
  | { kind: "COMPLETE"; outcome: SiteVisitOutcome; notes?: string; nextAction?: string }
  | { kind: "NO_SHOW" }
  | { kind: "CANCEL"; reason: "BUYER_REQUEST" | "BUYER_NOT_AVAILABLE" | "PROJECT_UNAVAILABLE" | "OTHER" }
  | { kind: "RESCHEDULE"; whenLocal: string };
export type ChangeVisit = (visitId: string, change: VisitChange) => Promise<VisitActionResult>;

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const FIELD = "min-h-11 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_LABEL = { SCHEDULED: "Scheduled", CONFIRMED: "Confirmed", COMPLETED: "Completed", NO_SHOW: "No-show", RESCHEDULED: "Rescheduled", CANCELLED: "Cancelled" } as const;
const OPEN = new Set(["SCHEDULED", "CONFIRMED"]);

function VisitCard({ visit, pending, onChange }: { visit: SiteVisitView; pending: boolean; onChange: (change: VisitChange) => void }) {
  const [mode, setMode] = useState<"view" | "complete" | "reschedule" | "cancel">("view");
  const [outcome, setOutcome] = useState<SiteVisitOutcome>("INTERESTED");
  const [next, setNext] = useState("");
  const [when, setWhen] = useState(() => businessPresetLocal(new Date(), 1));
  const open = OPEN.has(visit.status);
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{formatDateTimeFull(new Date(visit.scheduledAt))}</p>
          <p className="truncate text-xs text-muted-foreground">{visit.projectName ?? "No project chosen"}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{STATUS_LABEL[visit.status]}</span>
      </div>
      {visit.awaitingOutcome && <p className="mt-1 text-xs font-medium text-red-700">The visit time has passed. Record what happened.</p>}
      {visit.outcome && <p className="mt-1 text-xs text-muted-foreground">Outcome: {formatEnumLabel(visit.outcome)}</p>}
      {visit.nextAction && <p className="mt-1 text-xs text-muted-foreground">Next: {visit.nextAction}</p>}
      {visit.rescheduledFromId && <p className="mt-1 text-xs text-muted-foreground">Rescheduled from an earlier visit.</p>}

      {open && mode === "view" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {visit.status === "SCHEDULED" && (
            <button type="button" className={BTN} disabled={pending} onClick={() => onChange({ kind: "CONFIRM" })}>
              Confirm
            </button>
          )}
          <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={() => setMode("complete")}>
            Record outcome
          </button>
          <button type="button" className={BTN} disabled={pending} onClick={() => setMode("reschedule")}>
            Reschedule
          </button>
          <button type="button" className={BTN} disabled={pending} onClick={() => setMode("cancel")}>
            Cancel
          </button>
        </div>
      )}

      {open && mode === "complete" && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor={`o-${visit.id}`}>
            How did it go?
          </label>
          <select id={`o-${visit.id}`} value={outcome} onChange={(e) => setOutcome(e.target.value as SiteVisitOutcome)} className={FIELD}>
            {SITE_VISIT_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {formatEnumLabel(o)}
              </option>
            ))}
          </select>
          <label className="text-sm font-medium text-foreground" htmlFor={`n-${visit.id}`}>
            Next action (optional)
          </label>
          <input id={`n-${visit.id}`} value={next} onChange={(e) => setNext(e.target.value)} maxLength={500} className={FIELD} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={() => onChange({ kind: "COMPLETE", outcome, nextAction: next })}>
              Mark completed
            </button>
            <button type="button" className={BTN} disabled={pending} onClick={() => onChange({ kind: "NO_SHOW" })}>
              Buyer did not come
            </button>
            <button type="button" className={BTN} disabled={pending} onClick={() => setMode("view")}>
              Back
            </button>
          </div>
        </div>
      )}

      {open && mode === "reschedule" && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor={`w-${visit.id}`}>
            New date and time (India time)
          </label>
          <input id={`w-${visit.id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={FIELD} />
          <div className="flex gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={() => onChange({ kind: "RESCHEDULE", whenLocal: when })}>
              Reschedule
            </button>
            <button type="button" className={BTN} disabled={pending} onClick={() => setMode("view")}>
              Back
            </button>
          </div>
        </div>
      )}

      {open && mode === "cancel" && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <p className="text-sm font-medium text-foreground">Why is it cancelled?</p>
          <div className="grid grid-cols-2 gap-2">
            {(["BUYER_REQUEST", "BUYER_NOT_AVAILABLE", "PROJECT_UNAVAILABLE", "OTHER"] as const).map((reason) => (
              <button key={reason} type="button" className={BTN} disabled={pending} onClick={() => onChange({ kind: "CANCEL", reason })}>
                {formatEnumLabel(reason)}
              </button>
            ))}
          </div>
          <button type="button" className={BTN} disabled={pending} onClick={() => setMode("view")}>
            Back
          </button>
        </div>
      )}
    </li>
  );
}

export function SiteVisitsSection({
  visits,
  projects,
  onSchedule,
  onChange,
}: {
  visits: SiteVisitView[];
  /** Active projects the visit can be for. */
  projects: Array<{ id: string; label: string }>;
  onSchedule: ScheduleVisit;
  onChange: ChangeVisit;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [when, setWhen] = useState(() => businessPresetLocal(new Date(), 2));
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");

  function perform(work: () => Promise<VisitActionResult>, success: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      setMessage(result.ok ? { tone: "ok", text: success } : { tone: "error", text: result.error });
    });
  }

  return (
    <section aria-labelledby="visits-heading" className="rounded-lg border border-border p-4">
      <h2 id="visits-heading" className="text-sm font-semibold text-foreground">
        Site visits
      </h2>
      {message && (
        <p role="status" className={`mt-2 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
      {visits.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No site visits yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visits.map((v) => (
            <VisitCard key={v.id} visit={v} pending={pending} onChange={(change) => perform(() => onChange(v.id, change), "Site visit updated.")} />
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Schedule a site visit</p>
        <label className="text-sm text-foreground" htmlFor="sv-when">
          Date and exact time (India time)
        </label>
        <input id="sv-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={FIELD} />
        <label className="text-sm text-foreground" htmlFor="sv-project">
          Project
        </label>
        <select id="sv-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD}>
          <option value="">Not decided yet</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="text-sm text-foreground" htmlFor="sv-notes">
          Note (optional)
        </label>
        <input id="sv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={FIELD} />
        <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={() => perform(() => onSchedule(when, projectId, notes), "Site visit scheduled.")}>
          {pending ? "Saving…" : "Schedule site visit"}
        </button>
      </div>
    </section>
  );
}
