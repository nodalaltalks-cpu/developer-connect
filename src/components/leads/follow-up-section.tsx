"use client";

import { useState, useTransition } from "react";
import { businessPresetLocal, formatDateTimeFull, formatEnumLabel, formatOverdue } from "@/lib/leads/format";
import { isOverdue, openFollowUp, type FollowUpView } from "@/lib/leads/follow-up-view";
import { CANCEL_REASONS, FOLLOW_UP_TYPES, type CancelReason, type FollowUpType } from "@/lib/leads/types";

/**
 * The follow-up, inside the lead page — shared by the Founder and the team member. Every follow-up has a TYPE and an
 * EXACT date and time (India time); there is no date-only option. An overdue follow-up cannot be dismissed: it is
 * resolved by completing it, rescheduling it, or cancelling it with a reason (and, for a team member, by returning
 * the lead — see ReturnLeadCard). The actions are passed in as individual props with the lead id already bound, so
 * this component never says who is acting; the server re-checks everything and decides what is overdue.
 */

export type FollowUpActionResult = { ok: true } | { ok: false; error: string };

export type ScheduleFollowUp = (scheduledAtLocal: string, type: FollowUpType, note?: string) => Promise<FollowUpActionResult>;
export type RescheduleFollowUp = (followUpId: string, scheduledAtLocal: string, type: FollowUpType) => Promise<FollowUpActionResult>;
export type CompleteFollowUp = (followUpId: string) => Promise<FollowUpActionResult>;
export type CancelFollowUp = (followUpId: string, reason: CancelReason, note?: string) => Promise<FollowUpActionResult>;

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
// 16px text on inputs so iOS Safari does not zoom on focus.
const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_LABEL = { SCHEDULED: "Scheduled", MISSED: "Missed", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const;

function TimeFields({
  when,
  setWhen,
  type,
  setType,
  nowIso,
}: {
  when: string;
  setWhen: (value: string) => void;
  type: FollowUpType;
  setType: (value: FollowUpType) => void;
  nowIso: string;
}) {
  const now = new Date(nowIso);
  const presets = [
    { label: "Tomorrow 10 AM", days: 1 },
    { label: "In 3 days", days: 3 },
    { label: "Next week", days: 7 },
  ];
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-foreground" htmlFor="fu-type">
        Type
      </label>
      <select id="fu-type" value={type} onChange={(e) => setType(e.target.value as FollowUpType)} className={FIELD}>
        {FOLLOW_UP_TYPES.map((t) => (
          <option key={t} value={t}>
            {formatEnumLabel(t)}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => (
          <button key={preset.label} type="button" className={BTN} onClick={() => setWhen(businessPresetLocal(now, preset.days))}>
            {preset.label}
          </button>
        ))}
      </div>
      <label className="text-sm font-medium text-foreground" htmlFor="fu-when">
        Date and exact time (India time)
      </label>
      <input id="fu-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={FIELD} />
    </div>
  );
}

export function FollowUpSection({
  followUps,
  nowIso,
  onSchedule,
  onReschedule,
  onComplete,
  onCancel,
}: {
  followUps: FollowUpView[];
  /** The server's "now" at render time; used only to show how overdue a follow-up is. */
  nowIso: string;
  onSchedule: ScheduleFollowUp;
  onReschedule: RescheduleFollowUp;
  onComplete: CompleteFollowUp;
  onCancel: CancelFollowUp;
}) {
  const open = openFollowUp(followUps);
  const history = followUps.filter((followUp) => followUp !== open);
  const now = new Date(nowIso);
  const overdue = open ? isOverdue(open, now) : false;

  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel">("view");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [when, setWhen] = useState(() => businessPresetLocal(new Date(nowIso), 1));
  const [type, setType] = useState<FollowUpType>("CALL_BACK");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<CancelReason>("CLIENT_NOT_RESPONDING");
  const [cancelNote, setCancelNote] = useState("");

  function perform(work: () => Promise<FollowUpActionResult>, success: string, then?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        setMessage({ tone: "ok", text: success });
        then?.();
      } else setMessage({ tone: "error", text: result.error });
    });
  }

  return (
    <section className="rounded-lg border border-border p-4" aria-labelledby="follow-up-heading">
      <h2 id="follow-up-heading" className="text-sm font-semibold text-foreground">
        Follow-up
      </h2>

      {message && (
        <p role="status" className={`mt-3 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}

      {open ? (
        <div className="mt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">{formatEnumLabel(open.type)}</p>
              <p className="text-sm text-foreground">{formatDateTimeFull(new Date(open.scheduledAt))}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${overdue ? "bg-red-50 text-red-700" : "bg-muted text-foreground"}`}>
              {overdue ? "Missed" : STATUS_LABEL[open.status]}
            </span>
          </div>
          {overdue && (
            <p className="mt-1 text-sm font-medium text-red-700">
              Missed by {formatOverdue(now.getTime() - new Date(open.scheduledAt).getTime())}. Resolve it: complete, reschedule or cancel with a reason.
            </p>
          )}
          {open.rescheduleCount > 0 && <p className="mt-1 text-xs text-muted-foreground">Rescheduled {open.rescheduleCount} {open.rescheduleCount === 1 ? "time" : "times"}.</p>}

          {mode === "view" && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={() => perform(() => onComplete(open.id), "Follow-up marked done.")}>
                {overdue ? "Complete now" : "Mark done"}
              </button>
              <button type="button" className={BTN} disabled={pending} onClick={() => { setType(open.type); setMode("reschedule"); }}>
                Reschedule
              </button>
              <button type="button" className={BTN} disabled={pending} onClick={() => setMode("cancel")}>
                Cancel…
              </button>
            </div>
          )}

          {mode === "reschedule" && (
            <div className="mt-3 grid gap-3">
              <TimeFields when={when} setWhen={setWhen} type={type} setType={setType} nowIso={nowIso} />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={pending || !when}
                  onClick={() => perform(() => onReschedule(open.id, when, type), "Follow-up rescheduled.", () => setMode("view"))}
                >
                  Save new time
                </button>
                <button type="button" className={BTN} disabled={pending} onClick={() => setMode("view")}>
                  Back
                </button>
              </div>
            </div>
          )}

          {mode === "cancel" && (
            <div className="mt-3 grid gap-3">
              <label className="text-sm font-medium text-foreground" htmlFor="fu-cancel-reason">
                Why is it being cancelled?
              </label>
              <select id="fu-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value as CancelReason)} className={FIELD}>
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {formatEnumLabel(r)}
                  </option>
                ))}
              </select>
              {reason === "OTHER" && (
                <input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={500} placeholder="Optional note" className={FIELD} aria-label="Optional note" />
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={pending}
                  onClick={() => perform(() => onCancel(open.id, reason, reason === "OTHER" ? cancelNote || undefined : undefined), "Follow-up cancelled.", () => setMode("view"))}
                >
                  Cancel follow-up
                </button>
                <button type="button" className={BTN} disabled={pending} onClick={() => setMode("view")}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-muted-foreground">No follow-up scheduled.</p>
          <TimeFields when={when} setWhen={setWhen} type={type} setType={setType} nowIso={nowIso} />
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What to follow up on (optional)" className={FIELD} aria-label="Follow-up note" />
          <button
            type="button"
            className={`${BTN_PRIMARY} w-full`}
            disabled={pending || !when}
            onClick={() => perform(() => onSchedule(when, type, note || undefined), "Follow-up scheduled.", () => setNote(""))}
          >
            Schedule follow-up
          </button>
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2.5 text-sm text-muted-foreground">Earlier follow-ups ({history.length})</summary>
          <ul className="space-y-2">
            {history.map((followUp) => (
              <li key={followUp.id} className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium text-foreground">
                  {formatEnumLabel(followUp.type)} · {STATUS_LABEL[followUp.status]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTimeFull(new Date(followUp.scheduledAt))}
                  {followUp.missedCount > 0 ? ` · missed ${followUp.missedCount}×` : ""}
                  {followUp.cancelReason ? ` · ${formatEnumLabel(followUp.cancelReason)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
