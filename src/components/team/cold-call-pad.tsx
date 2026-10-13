"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CallButton } from "@/components/leads/call-button";
import { getMyCallStatusAction, lookupMyColdCallNumberAction, prepareMyColdCallAction, reportMyBrowserCallAction, setMyCallDispositionAction } from "@/app/team/_actions/team-actions";
import { ColdCallResult } from "@/components/team/cold-call-result";
import { CountryCodeField, DEFAULT_COUNTRY, countryReady, dialCode, maxDigits, minDigits, type CountrySelection } from "@/components/team/country-code-field";
import type { ColdCallLookup } from "@/lib/leads/cold-call-service";
import type { CallView } from "@/lib/leads/call-view";
import { CALL_REPORTED_EVENT } from "@/lib/leads/native-bridge";

/**
 * Cold Call: type a number, call it from your own SIM, and have the call counted.
 *
 * A cold call is NOT a lead. The number is kept as a hidden prospect so the call can be recorded and counted: every synced call is
 * one dialed call, and one that the phone measured at more than 10 seconds is also connected. After the call the employee taps what
 * happened: Not interested (a few words, nothing else), Did not connect (one tap), or Interested (the short lead form). Only
 * Interested creates a lead. Then the pad clears for the next number. Anyone may call the same prospect again, as often as they like.
 *
 * In the Android app the phone's call log gives the real talk time. In an ordinary phone browser the green Call button opens the
 * phone's own dialer on its SIM: the call is still recorded and counted as dialed, but no talk time (a browser cannot read it).
 */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const KEY =
  "flex min-h-14 items-center justify-center rounded-full border border-border bg-background text-2xl font-medium text-foreground active:bg-muted hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";
const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function format(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

export function ColdCallPad() {
  const [country, setCountry] = useState<CountrySelection>(DEFAULT_COUNTRY);
  const [digits, setDigits] = useState("");
  // The answer is stored WITH the number it is about, so an old answer can never show for a different number.
  const [answer, setAnswer] = useState<{ number: string; result: ColdCallLookup | null } | null>(null);
  const [session, setSession] = useState(0); // remounts the call control for the next number
  const [prepared, setPrepared] = useState<{ callId: string; leadId: string; prospect: boolean } | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const full = `${dialCode(country)}${digits}`;
  const ready = countryReady(country) && digits.length >= minDigits(country);
  const locked = prepared !== null && !finished; // a call is under way: the number cannot be edited
  const checking = ready && !prepared;
  const lookup = checking && answer?.number === full ? answer.result : null;
  const looking = checking && answer?.number !== full;

  // Before dialing: is this number new, already yours, or someone else's lead? (Debounced; the server decides.)
  useEffect(() => {
    if (!checking) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await lookupMyColdCallNumberAction(full).catch(() => null);
      if (!stale) setAnswer({ number: full, result });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [full, checking]);

  // The server accepted the phone's report for this call: it is over, so the outcome panel can open.
  useEffect(() => {
    if (!prepared) return;
    const onReported = (event: Event) => {
      const view = (event as CustomEvent<CallView>).detail;
      if (view && view.id === prepared.callId) setFinished(true);
    };
    window.addEventListener(CALL_REPORTED_EVENT, onReported);
    return () => window.removeEventListener(CALL_REPORTED_EVENT, onReported);
  }, [prepared]);

  function press(key: string) {
    if (locked) return;
    setSaved(null);
    setDigits((d) => (d.length >= maxDigits(country) ? d : d + key));
  }

  async function paste() {
    if (locked) return;
    try {
      const text = await navigator.clipboard.readText();
      let cleaned = text.replace(/[^\d+]/g, "");
      if (cleaned.startsWith("+971")) {
        setCountry({ key: "AE", custom: "" });
        cleaned = cleaned.slice(4);
      } else if (cleaned.startsWith("+91")) {
        setCountry({ key: "IN", custom: "" });
        cleaned = cleaned.slice(3);
      } else if (cleaned.startsWith("+")) {
        // Another country: take a two-digit code as typed; the person can correct it in the code box.
        const code = cleaned.slice(1, 3);
        setCountry({ key: "OTHER", custom: code });
        cleaned = cleaned.slice(1 + code.length);
      }
      setDigits(cleaned.replace(/\D/g, "").replace(/^0+/, "").slice(-14));
    } catch {
      // clipboard blocked: the keypad still works
    }
  }

  function next(message: string | null = null) {
    setDigits("");
    setAnswer(null);
    setPrepared(null);
    setFinished(false);
    setSaved(message);
    setSession((n) => n + 1);
  }

  const blocked = lookup?.kind === "NOT_YOURS";

  return (
    <div className="mx-auto w-full max-w-sm">
      {saved && (
        <p role="status" className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          {saved}
        </p>
      )}
      <div className="flex items-center gap-2">
        <CountryCodeField value={country} onChange={setCountry} disabled={locked} />
        <p aria-label="Number to call" aria-live="polite" className="min-h-11 min-w-0 flex-1 truncate rounded-md border border-border px-3 text-right text-2xl font-medium leading-[2.75rem] tracking-wide text-foreground">
          {digits ? format(digits) : <span className="text-base font-normal text-muted-foreground">Enter a number</span>}
        </p>
        <button type="button" aria-label="Delete last digit" className={`${BTN} w-11 px-0 text-lg`} disabled={locked || digits === ""} onClick={() => setDigits((d) => d.slice(0, -1))}>
          ⌫
        </button>
      </div>

      <div className="mt-2 min-h-14" aria-live="polite">
        {ready && looking && <p className="text-sm text-muted-foreground">Checking this number…</p>}
        {ready && !looking && lookup?.kind === "NEW" && !prepared && <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">New number. It is only a call until you mark the client interested.</p>}
        {ready && !looking && lookup?.kind === "YOURS" && !prepared && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
            Already your lead{lookup.leadName ? `: ${lookup.leadName}` : ""}. This call is added to it.{" "}
            <Link href={`/team/leads/${lookup.leadId}`} className="font-medium text-accent-hover underline">
              Open lead
            </Link>
          </p>
        )}
        {ready && !looking && blocked && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">This number is already a lead assigned to someone else, so you cannot call it from here.</p>}
        {ready && !looking && lookup?.kind === "INVALID" && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Check the number: it does not look valid.</p>}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button key={k} type="button" className={KEY} disabled={locked} onClick={() => press(k)} aria-label={k}>
            {k}
          </button>
        ))}
        <button type="button" className={`${KEY} text-base`} disabled={locked} onClick={paste} aria-label="Paste a number">
          Paste
        </button>
        <button type="button" className={KEY} disabled={locked} onClick={() => press("0")} aria-label="0">
          0
        </button>
        <button type="button" className={`${KEY} text-base`} disabled={locked || digits === ""} onClick={() => setDigits("")} aria-label="Clear number">
          Clear
        </button>
      </div>

      <div className="mt-4">
        <fieldset data-lock-lead={prepared ? undefined : "new"} disabled={!ready || blocked || lookup?.kind === "INVALID" || looking} className="disabled:opacity-60">
          <CallButton
            key={session}
            configured={false}
            telHref={null}
            hideOutcome={prepared?.prospect === true}
            onPlace={async () => ({ ok: false, error: "Calls are placed from your phone." })}
            onPrepare={async () => {
              const result = await prepareMyColdCallAction(full, null);
              if (!result.ok) return result;
              setSaved(null);
              setPrepared({ callId: result.callId, leadId: result.leadId, prospect: result.prospect });
              return { ok: true, callId: result.callId, phone: result.phone };
            }}
            onReportBrowserCall={reportMyBrowserCallAction}
            onStatus={getMyCallStatusAction}
            onDisposition={setMyCallDispositionAction}
          />
        </fieldset>
      </div>

      {/* A cold-called prospect: how did it go? (Not interested / did not connect / interested.) */}
      {prepared?.prospect && finished && <ColdCallResult callId={prepared.callId} leadId={prepared.leadId} onDone={(message) => next(message)} />}

      {/* A number that is already this member's own lead keeps the usual lead outcome flow. */}
      {prepared && !prepared.prospect && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/team/leads/${prepared.leadId}`} className={BTN}>
            View lead
          </Link>
          <button type="button" className={BTN} disabled={!finished} onClick={() => next()}>
            {finished ? "Next number" : "Next number (after the call)"}
          </button>
        </div>
      )}

      {!prepared && ready && lookup?.kind !== "NOT_YOURS" && lookup?.kind !== "INVALID" && (
        <p className="mt-3 text-center text-sm">
          <Link href={`/team/cold-call?phone=${encodeURIComponent(full)}`} className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
            Add a lead without calling
          </Link>
        </p>
      )}
    </div>
  );
}
