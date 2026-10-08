"use client";

import { useState, useTransition, type ReactNode } from "react";
import { addMyLeadNoteAction, logMyLeadContactAction, type TeamActionResult } from "@/app/team/_actions/team-actions";
import { formatEnumLabel } from "@/lib/leads/format";
import { WhatsAppOpenLink } from "@/components/leads/whatsapp-open-link";
import type { ContactChannel, ContactOutcome } from "@/lib/leads/lead-service";

/**
 * What a team member does to a lead they own: contact (open the dialer or WhatsApp, then record how it went) and a
 * note. (The follow-up and the return-lead control have their own sections.) Nothing else is offered — no status, temperature, requirement or owner controls. Each button
 * calls a team Server Action; the browser never says who is acting. No telephony or WhatsApp API: Call and
 * WhatsApp are plain tel: / wa.me links.
 */

export interface TeamLeadActionsProps {
  leadId: string;
  /** The tracked Call control (see CallButton), rendered where the plain Call link used to be. */
  callSlot?: ReactNode;
  /** Whether the internal dialer is connected. When it is not, a manual log of an untracked call stays available, clearly labelled. */
  dialerConfigured?: boolean;
  telHref: string | null;
  whatsappHref: string | null;
  prefersWhatsApp: boolean;
}

const CALL_OUTCOMES: ContactOutcome[] = ["CONNECTED", "NO_ANSWER", "BUSY", "SWITCHED_OFF", "INVALID_NUMBER", "CALLBACK_REQUESTED"];
const WHATSAPP_OUTCOMES: ContactOutcome[] = ["SENT", "REPLIED", "WRONG_NUMBER"];

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
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

export function TeamLeadActions(props: TeamLeadActionsProps) {
  const { leadId } = props;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [channel, setChannel] = useState<ContactChannel | null>(null);
  const [contactNote, setContactNote] = useState("");
  const [note, setNote] = useState("");

  function perform(work: () => Promise<TeamActionResult>, success: string, then?: () => void) {
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
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}

      <Section title="Contact">
        <div className="grid grid-cols-2 gap-2">
          {props.whatsappHref && (
            <WhatsAppOpenLink href={props.whatsappHref} leadId={leadId} scope="team" onOpen={() => setChannel("WHATSAPP")} className={props.prefersWhatsApp ? BTN_PRIMARY : BTN} />
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
                      () => logMyLeadContactAction(leadId, channel, outcome, contactNote || undefined),
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
          onClick={() => perform(() => addMyLeadNoteAction(leadId, note), "Note added.", () => setNote(""))}
        >
          Add note
        </button>
      </Section>
    </div>
  );
}
