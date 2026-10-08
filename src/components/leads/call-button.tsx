"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useInteractionComment } from "@/components/team/interaction-comment";
import { formatCallDuration } from "@/lib/leads/call-analytics";
import { isFinished, wasConnected, type CallView } from "@/lib/leads/call-view";
import { CALL_REPORTED_EVENT, getNativeDialer, readCapabilities, type DialerCapabilities } from "@/lib/leads/native-bridge";
import { formatEnumLabel } from "@/lib/leads/format";
import { CALL_DISPOSITIONS, type CallDisposition } from "@/lib/leads/types";

/**
 * THE Call control — one component everywhere a lead can be called (My Leads, lead pages, missed/returned/due lists).
 *
 *  - Dialer connected: Call places the call through the server (the browser sends only the lead). The panel then SHOWS
 *    what the server reports — it refreshes the status every few seconds, but the status, times and duration are the
 *    telephony provider's, never decided here. When the call has finished the person picks what it led to (once).
 *  - Android app (the phone's own SIM): Call asks the server for an attempt (onPrepare), hands the number to the app
 *    (DCDialer.startCall) and waits. The app reports the phone's call-log duration afterwards (DeviceCallSync) and the
 *    SERVER classifies it: more than 10 seconds is CONNECTED, otherwise DIALED. Nothing here decides that.
 *  - Dialer NOT connected (today): there is no tracked call to place. Call opens the phone's own dialer as before, and
 *    says plainly that such a call is not tracked or counted. Nothing pretends to be a dialer.
 *
 * The actions arrive as props with the lead already bound (Founder's or team member's), so this component never says
 * who is calling.
 */

export type PlaceCall = () => Promise<{ ok: true; callId: string } | { ok: false; error: string; notConfigured?: true }>;
export type PrepareCall = () => Promise<{ ok: true; callId: string; phone: string } | { ok: false; error: string }>;
export type CallStatusOf = (callId: string) => Promise<CallView | null>;
export type SetCallDisposition = (callId: string, disposition: CallDisposition, comment?: string) => Promise<{ ok: true } | { ok: false; error: string }>;

const CALL_BTN =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const STATUS_TEXT: Record<CallView["status"], string> = {
  INITIATED: "Connecting…",
  RINGING: "Ringing…",
  CONNECTED: "Connected",
  COMPLETED: "Call ended",
  NO_ANSWER: "No answer",
  BUSY: "Busy",
  FAILED: "Call failed",
  REJECTED: "Rejected",
};

const POLL_MS = 3000;

// The bridge is injected before the page loads and never changes, so there is nothing to subscribe to.
const subscribeNever = () => () => {};

export function CallButton({
  telHref,
  configured,
  onPlace,
  onPrepare,
  onStatus,
  onDisposition,
  compact = false,
}: {
  /** In list cards: no explanatory caption (the lead page carries it). */
  compact?: boolean;
  telHref: string | null;
  /** Whether the internal dialer is connected to a telephony provider (decided on the server). */
  configured: boolean;
  onPlace: PlaceCall;
  /** Starts an Android SIM call (team members only). Without it the button never uses the app. */
  onPrepare?: PrepareCall;
  onStatus: CallStatusOf;
  onDisposition: SetCallDisposition;
}) {
  const shared = useInteractionComment();
  const [localComment, setLocalComment] = useState("");
  const activeComment = shared ? shared.comment : localComment;
  const commentOk = activeComment.trim().length >= 3;
  const [pending, startTransition] = useTransition();
  const [callId, setCallId] = useState<string | null>(null);
  const [call, setCall] = useState<CallView | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Whether this phone can record how long the call lasted (known after the call was started).
  const [lengthNote, setLengthNote] = useState<"ASK" | "UNSUPPORTED" | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Whether the Android app is present is only known in the browser, after mount.
  const hasBridge = useSyncExternalStore(subscribeNever, () => getNativeDialer() !== null, () => false);
  const native = hasBridge && onPrepare !== undefined;

  // The sync component announces a report the server accepted: show it at once instead of waiting for the next poll.
  useEffect(() => {
    if (!callId) return;
    const onReported = (event: Event) => {
      const view = (event as CustomEvent<CallView>).detail;
      if (view && view.id === callId) setCall(view);
    };
    window.addEventListener(CALL_REPORTED_EVENT, onReported);
    return () => window.removeEventListener(CALL_REPORTED_EVENT, onReported);
  }, [callId]);

  // Display refresh only: the server is the source of truth for the call's state.
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    const refresh = async () => {
      const next = await onStatus(callId).catch(() => null);
      if (cancelled || !next) return;
      setCall(next);
      if (isFinished(next.status) && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
    void refresh();
    timer.current = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [callId, onStatus]);

  if (!configured && !native) {
    if (!telHref) return null;
    return (
      <div className="w-full">
        <a href={telHref} className={CALL_BTN} title="Not tracked — the internal dialer isn't connected yet, so this call won't be counted.">
          Call
        </a>
        {!compact && <p className="mt-1 text-xs text-muted-foreground">Not tracked — the internal dialer isn&apos;t connected yet, so this call won&apos;t be counted.</p>}
      </div>
    );
  }

  function place() {
    setMessage(null);
    const bridge = native ? getNativeDialer() : null;
    if (bridge && onPrepare) {
      const caps: DialerCapabilities = readCapabilities(bridge);
      if (!caps.canPlace) {
        // Only the permission to PLACE calls is asked for here. Reading call length is a separate, explained, optional step.
        (bridge.requestCallPermission ?? bridge.requestPermissions).call(bridge);
        setMessage({ tone: "error", text: "Allow phone calls in the app, then tap Call again." });
        return;
      }
      setLengthNote(caps.canMeasureDuration ? null : caps.durationSupported ? "ASK" : "UNSUPPORTED");
      startTransition(async () => {
        const prepared = await onPrepare();
        if (!prepared.ok) {
          setMessage({ tone: "error", text: prepared.error });
          return;
        }
        setCall(null);
        setCallId(prepared.callId);
        // The phone dials; Android shows its SIM chooser if there is more than one SIM.
        bridge.startCall(prepared.callId, prepared.phone);
      });
      return;
    }
    startTransition(async () => {
      const result = await onPlace();
      if (result.ok) {
        setCall(null);
        setCallId(result.callId);
      } else setMessage({ tone: "error", text: result.error });
    });
  }

  function choose(disposition: CallDisposition) {
    if (!callId) return;
    if (!commentOk) {
      setMessage({ tone: "error", text: "Add a comment on this call first. It is saved with the date, time and day." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await onDisposition(callId, disposition, activeComment);
      if (result.ok) {
        if (shared) shared.clear();
        else setLocalComment("");
        setCall((current) => (current ? { ...current, disposition } : current));
        setMessage({
          tone: "ok",
          text: disposition === "FOLLOW_UP_REQUIRED" || disposition === "CALLBACK_REQUESTED" ? "Recorded. Schedule the follow-up below." : "Recorded.",
        });
      } else setMessage({ tone: "error", text: result.error });
    });
  }

  const finished = call ? isFinished(call.status) : false;
  const connected = call ? wasConnected(call) : false;
  const lengthUnknown = call?.durationUnknown === true;
  const offered = CALL_DISPOSITIONS.filter((d) => lengthUnknown || (connected ? d !== "SWITCHED_OFF" && d !== "INVALID_NUMBER" && d !== "NO_ANSWER" && d !== "BUSY" : d === "SWITCHED_OFF" || d === "INVALID_NUMBER" || d === "NO_ANSWER" || d === "BUSY" || d === "OTHER"));

  return (
    <div className="w-full" data-call-active={callId ? "1" : undefined}>
      <button type="button" className={CALL_BTN} onClick={place} disabled={pending || (callId !== null && !finished)}>
        {pending && !callId ? "Calling…" : callId && !finished ? "Call in progress" : "Call"}
      </button>

      {message && (
        <p role="status" className={`mt-2 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}

      {callId && (
        <div className="mt-2 rounded-md bg-muted p-3" aria-live="polite">
          <p className="text-sm font-medium text-foreground">
            {call && lengthUnknown ? "Call attempted · length not recorded" : call && !(call.method === "ANDROID_SIM" && call.status === "INITIATED") ? STATUS_TEXT[call.status] : native ? "On a call from your phone… the result appears when the call ends." : "Connecting…"}
            {call && connected && call.durationSeconds !== null ? ` · ${formatCallDuration(call.durationSeconds)}` : ""}
            {call && call.classification === "DIALED" ? " · Dialed (10 seconds or less)" : ""}
          </p>
          {lengthNote && (
            <div className="mt-2 rounded-md border border-border bg-background p-3 text-sm text-foreground">
              {lengthNote === "ASK" ? (
                <>
                  <p>How long calls last is not being recorded. To record it, this app can read the length of the calls you place from it, and nothing else in your call history.</p>
                  <button type="button" className={`${BTN} mt-2`} onClick={() => getNativeDialer()?.requestDurationPermission?.()}>
                    Allow call-length recording
                  </button>
                </>
              ) : (
                <p>This version records that the call was placed, not how long it lasted. Choose what the call led to when it ends.</p>
              )}
            </div>
          )}
          {finished && !call?.disposition && (
            <>
              {!shared && (
                <label className="mt-2 block text-sm font-semibold text-foreground">
                  Comment on this call <span className="font-normal text-red-700">(required)</span>
                  <textarea value={localComment} onChange={(e) => setLocalComment(e.target.value)} rows={3} maxLength={2000} placeholder="What was said and what happens next" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">Saved with the date, time and day. The lead is not updated without it.</span>
                </label>
              )}
              <p className="mt-2 text-xs text-muted-foreground">What did the call lead to?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {offered.map((d) => (
                  <button key={d} type="button" className={BTN} disabled={pending || !commentOk} onClick={() => choose(d)}>
                    {formatEnumLabel(d)}
                  </button>
                ))}
              </div>
            </>
          )}
          {call?.disposition && <p className="mt-1 text-xs text-muted-foreground">Outcome: {formatEnumLabel(call.disposition)}</p>}
        </div>
      )}
    </div>
  );
}
