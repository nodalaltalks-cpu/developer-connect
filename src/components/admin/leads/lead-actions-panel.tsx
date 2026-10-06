"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  addLeadNoteAction,
  changeLeadStatusAction,
  logLeadContactAction,
  setLeadTemperatureAction,
  type LeadActionResult,
} from "@/app/admin/_actions/lead-actions";
import { formatEnumLabel } from "@/lib/leads/format";
import { LEAD_STATUSES, LEAD_TEMPERATURES, type LeadStatus, type LeadTemperature } from "@/lib/leads/types";
import type { ContactChannel, ContactOutcome, LostReasonCode } from "@/lib/leads/lead-service";

/**
 * Everything the founder does to one lead, on one screen, no modals: contact
 * (open the dialer or WhatsApp, then record how it went), temperature,
 * status, follow-up, note. (The buyer requirement has its own section; see requirement-section.tsx.) Each control calls a founder-only
 * Server Action; the browser never says who is acting.
 */

export interface LeadPanelProps {
  leadId: string;
  /** The tracked Call control (see CallButton), rendered where the plain Call link used to be. */
  callSlot?: ReactNode;
  /** Whether the internal dialer is connected. When it is not, a manual log of an untracked call stays available, clearly labelled. */
  dialerConfigured?: boolean;
  telHref: string | null;
  whatsappHref: string | null;
  prefersWhatsApp: boolean;
  temperature: LeadTemperature | null;
  status: LeadStatus;
}

const LOST_REASONS: LostReasonCode[] = ["PRICE", "LOCATION", "BOUGHT_ELSEWHERE", "NOT_RESPONDING", "FINANCING", "TIMING", "OTHER"];

const CALL_OUTCOMES: ContactOutcome[] = ["CONNECTED", "NO_ANSWER", "BUSY", "SWITCHED_OFF", "INVALID_NUMBER", "CALLBACK_REQUESTED"];
const WHATSAPP_OUTCOMES: ContactOutcome[] = ["SENT", "REPLIED", "WRONG_NUMBER"];

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
// 16px text on inputs so iOS Safari does not zoom on focus.
const FIELD =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function LeadActionsPanel(props: LeadPanelProps) {
  const { leadId } = props;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [channel, setChannel] = useState<ContactChannel | null>(null);
  const [contactNote, setContactNote] = useState("");
  const [status, setStatus] = useState<LeadStatus>(props.status);
  const [reason, setReason] = useState<LostReasonCode>("PRICE");
  const [note, setNote] = useState("");

  function perform(work: () => Promise<LeadActionResult>, success: string, then?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        setMessage({ tone: "ok", text: success });
        then?.();
      } else {
        setMessage({ tone: "error", text: result.error });
      }
    });
  }

  const outcomes = channel === "WHATSAPP" ? WHATSAPP_OUTCOMES : CALL_OUTCOMES;

  return (
    <div className="space-y-4">
      {message && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </p>
      )}

      <Section title="Contact">
        <div className="grid grid-cols-2 gap-2">
          {props.whatsappHref && (
            <a
              href={props.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setChannel("WHATSAPP")}
              className={props.prefersWhatsApp ? BTN_PRIMARY : BTN}
            >
              WhatsApp
            </a>
          )}
          {props.callSlot ? props.callSlot : props.telHref ? (
            <a href={props.telHref} onClick={() => setChannel("PHONE_CALL")} className={props.prefersWhatsApp ? BTN : BTN_PRIMARY}>
              Call
            </a>
          ) : null}
        </div>
        {props.callSlot && !props.dialerConfigured && props.telHref && (
          <button type="button" className="mt-2 min-h-11 text-sm text-muted-foreground underline" onClick={() => setChannel("PHONE_CALL")}>
            Log a call I made (not counted)
          </button>
        )}
        {channel && (
          <div className="mt-3 rounded-md bg-muted p-3">
            <p className="text-sm font-medium text-foreground">How did the {channel === "WHATSAPP" ? "WhatsApp" : "call"} go?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Only what you tap is recorded.{channel === "PHONE_CALL" && props.callSlot ? " A manual log — it is not counted in call statistics." : ""}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {outcomes.map((outcome) => (
                <button
                  key={outcome}
                  type="button"
                  disabled={pending}
                  className={BTN}
                  onClick={() =>
                    perform(
                      () => logLeadContactAction(leadId, channel, outcome, contactNote || undefined),
                      "Recorded.",
                      () => {
                        setChannel(null);
                        setContactNote("");
                      },
                    )
                  }
                >
                  {formatEnumLabel(outcome)}
                </button>
              ))}
            </div>
            <input
              value={contactNote}
              onChange={(e) => setContactNote(e.target.value)}
              placeholder="Optional note"
              maxLength={2000}
              className={`${FIELD} mt-2`}
              aria-label="Optional note about this contact"
            />
            <button type="button" className="mt-2 min-h-11 text-sm text-muted-foreground underline" onClick={() => setChannel(null)}>
              Don&apos;t record
            </button>
          </div>
        )}
      </Section>

      <Section title="Temperature">
        <div className="grid grid-cols-3 gap-2">
          {LEAD_TEMPERATURES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={pending || props.temperature === t}
              aria-pressed={props.temperature === t}
              className={props.temperature === t ? BTN_PRIMARY : BTN}
              onClick={() => perform(() => setLeadTemperatureAction(leadId, t), `Marked ${t.toLowerCase()}.`)}
            >
              {formatEnumLabel(t)}
            </button>
          ))}
        </div>
        {props.temperature && (
          <button
            type="button"
            disabled={pending}
            className="mt-2 min-h-11 text-sm text-muted-foreground underline"
            onClick={() => perform(() => setLeadTemperatureAction(leadId, null), "Temperature cleared.")}
          >
            Clear temperature
          </button>
        )}
      </Section>

      <Section title="Status">
        <label className="sr-only" htmlFor="lead-status">
          Status
        </label>
        <select id="lead-status" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} className={FIELD}>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatEnumLabel(s)}
            </option>
          ))}
        </select>
        {status === "LOST" && (
          <select value={reason} onChange={(e) => setReason(e.target.value as LostReasonCode)} className={`${FIELD} mt-2`} aria-label="Why was it lost?">
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>
                {formatEnumLabel(r)}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={pending || status === props.status}
          className={`${BTN_PRIMARY} mt-2 w-full`}
          onClick={() => perform(() => changeLeadStatusAction(leadId, status, status === "LOST" ? reason : undefined), "Status updated.")}
        >
          Update status
        </button>
      </Section>

      <Section title="Add a note">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What did you learn?"
          className={`${FIELD} py-2`}
          aria-label="Note"
        />
        <button
          type="button"
          disabled={pending || note.trim() === ""}
          className={`${BTN_PRIMARY} mt-2 w-full`}
          onClick={() => perform(() => addLeadNoteAction(leadId, note), "Note added.", () => setNote(""))}
        >
          Add note
        </button>
      </Section>

    </div>
  );
}
