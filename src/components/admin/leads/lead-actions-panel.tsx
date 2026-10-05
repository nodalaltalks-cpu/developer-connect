"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  addLeadNoteAction,
  changeLeadStatusAction,
  completeLeadFollowUpAction,
  logLeadContactAction,
  setLeadFollowUpAction,
  setLeadTemperatureAction,
  updateLeadRequirementAction,
  type LeadActionResult,
} from "@/app/admin/_actions/lead-actions";
import { formatEnumLabel, formatMoney } from "@/lib/leads/format";
import {
  LEAD_CURRENCIES,
  LEAD_PURPOSES,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  LEAD_TIMELINES,
  type LeadCurrency,
  type LeadPurpose,
  type LeadStatus,
  type LeadTemperature,
  type LeadTimeline,
} from "@/lib/leads/types";
import type { ContactChannel, ContactOutcome, LostReasonCode } from "@/lib/leads/lead-service";

/**
 * Everything the founder does to one lead, on one screen, no modals: contact
 * (open the dialer or WhatsApp, then record how it went), temperature,
 * status, follow-up, note, requirement. Each control calls a founder-only
 * Server Action; the browser never says who is acting.
 */

export interface LeadPanelProps {
  leadId: string;
  telHref: string | null;
  whatsappHref: string | null;
  prefersWhatsApp: boolean;
  temperature: LeadTemperature | null;
  status: LeadStatus;
  nextFollowUpAt: string | null;
  requirement: {
    location: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    budgetCurrency: LeadCurrency | null;
    configuration: string | null;
    propertyType: string | null;
    purpose: LeadPurpose | null;
    timeline: LeadTimeline | null;
  };
}

const LOST_REASONS: LostReasonCode[] = ["PRICE", "LOCATION", "BOUGHT_ELSEWHERE", "NOT_RESPONDING", "FINANCING", "TIMING", "OTHER"];

const CALL_OUTCOMES: ContactOutcome[] = ["CONNECTED", "NO_ANSWER", "BUSY", "FAILED", "WRONG_NUMBER"];
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

/** A local date-time at 10:00 for the datetime-local input, `days` from today. */
function presetValue(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const toIntOrNull = (value: string): number | null => {
  const cleaned = value.replace(/[,\s]/g, "");
  return cleaned === "" ? null : Number(cleaned);
};

export function LeadActionsPanel(props: LeadPanelProps) {
  const { leadId } = props;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [channel, setChannel] = useState<ContactChannel | null>(null);
  const [contactNote, setContactNote] = useState("");
  const [status, setStatus] = useState<LeadStatus>(props.status);
  const [reason, setReason] = useState<LostReasonCode>("PRICE");
  const [followUp, setFollowUp] = useState(props.nextFollowUpAt ? "" : presetValue(1));
  const [followUpNote, setFollowUpNote] = useState("");
  const [note, setNote] = useState("");

  const req = props.requirement;
  const [location, setLocation] = useState(req.location ?? "");
  const [currency, setCurrency] = useState<LeadCurrency | "">(req.budgetCurrency ?? "");
  const [budgetMin, setBudgetMin] = useState(req.budgetMin?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(req.budgetMax?.toString() ?? "");
  const [configuration, setConfiguration] = useState(req.configuration ?? "");
  const [propertyType, setPropertyType] = useState(req.propertyType ?? "");
  const [purpose, setPurpose] = useState<LeadPurpose | "">(req.purpose ?? "");
  const [timeline, setTimeline] = useState<LeadTimeline | "">(req.timeline ?? "");

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
  const budgetHint = (value: string) => {
    const n = toIntOrNull(value);
    return n !== null && currency && Number.isFinite(n) ? formatMoney(n, currency) : null;
  };

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
          {props.telHref && (
            <a href={props.telHref} onClick={() => setChannel("PHONE_CALL")} className={props.prefersWhatsApp ? BTN : BTN_PRIMARY}>
              Call
            </a>
          )}
        </div>
        {channel && (
          <div className="mt-3 rounded-md bg-muted p-3">
            <p className="text-sm font-medium text-foreground">How did the {channel === "WHATSAPP" ? "WhatsApp" : "call"} go?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Only what you tap is recorded.</p>
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

      <Section title="Follow-up">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Tomorrow", days: 1 },
            { label: "In 3 days", days: 3 },
            { label: "Next week", days: 7 },
          ].map((preset) => (
            <button key={preset.label} type="button" className={BTN} onClick={() => setFollowUp(presetValue(preset.days))}>
              {preset.label}
            </button>
          ))}
        </div>
        <input
          type="datetime-local"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          className={`${FIELD} mt-2`}
          aria-label="Follow-up date and time"
        />
        <input
          value={followUpNote}
          onChange={(e) => setFollowUpNote(e.target.value)}
          placeholder="What to follow up on (optional)"
          maxLength={2000}
          className={`${FIELD} mt-2`}
          aria-label="Follow-up note"
        />
        <button
          type="button"
          disabled={pending || !followUp}
          className={`${BTN_PRIMARY} mt-2 w-full`}
          onClick={() =>
            perform(() => setLeadFollowUpAction(leadId, new Date(followUp).toISOString(), followUpNote || undefined), "Follow-up set.", () =>
              setFollowUpNote(""),
            )
          }
        >
          Set follow-up
        </button>
        {props.nextFollowUpAt && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={pending} className={BTN} onClick={() => perform(() => completeLeadFollowUpAction(leadId), "Follow-up marked done.")}>
              Mark done
            </button>
            <button type="button" disabled={pending} className={BTN} onClick={() => perform(() => setLeadFollowUpAction(leadId, null), "Follow-up cleared.")}>
              Clear
            </button>
          </div>
        )}
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

      <details className="rounded-lg border border-border p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold text-foreground">Edit requirement</summary>
        <div className="mt-3 grid gap-2">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" maxLength={120} className={FIELD} aria-label="Location" />
          <select value={currency} onChange={(e) => setCurrency(e.target.value as LeadCurrency | "")} className={FIELD} aria-label="Budget currency">
            <option value="">Budget currency</option>
            {LEAD_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} inputMode="numeric" placeholder="Minimum budget" className={FIELD} aria-label="Minimum budget" />
          {budgetHint(budgetMin) && <p className="-mt-1 text-xs text-muted-foreground">{budgetHint(budgetMin)}</p>}
          <input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} inputMode="numeric" placeholder="Maximum budget" className={FIELD} aria-label="Maximum budget" />
          {budgetHint(budgetMax) && <p className="-mt-1 text-xs text-muted-foreground">{budgetHint(budgetMax)}</p>}
          <input value={configuration} onChange={(e) => setConfiguration(e.target.value)} placeholder="Configuration (e.g. 2 BHK)" maxLength={60} className={FIELD} aria-label="Configuration" />
          <input value={propertyType} onChange={(e) => setPropertyType(e.target.value)} placeholder="Property type" maxLength={60} className={FIELD} aria-label="Property type" />
          <select value={purpose} onChange={(e) => setPurpose(e.target.value as LeadPurpose | "")} className={FIELD} aria-label="Purpose">
            <option value="">Purpose</option>
            {LEAD_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {formatEnumLabel(p)}
              </option>
            ))}
          </select>
          <select value={timeline} onChange={(e) => setTimeline(e.target.value as LeadTimeline | "")} className={FIELD} aria-label="Buying timeline">
            <option value="">Buying timeline</option>
            {LEAD_TIMELINES.map((t) => (
              <option key={t} value={t}>
                {formatEnumLabel(t)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            className={`${BTN_PRIMARY} w-full`}
            onClick={() =>
              perform(
                () =>
                  updateLeadRequirementAction(leadId, {
                    location: location || null,
                    budgetCurrency: currency || null,
                    budgetMin: toIntOrNull(budgetMin),
                    budgetMax: toIntOrNull(budgetMax),
                    configuration: configuration || null,
                    propertyType: propertyType || null,
                    purpose: purpose || null,
                    timeline: timeline || null,
                  }),
                "Requirement saved. Changes are kept in the history.",
              )
            }
          >
            Save requirement
          </button>
        </div>
      </details>
    </div>
  );
}
