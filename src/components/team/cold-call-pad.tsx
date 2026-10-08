"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CallButton } from "@/components/leads/call-button";
import { getMyCallStatusAction, lookupMyColdCallNumberAction, prepareMyColdCallAction, setMyCallDispositionAction } from "@/app/team/_actions/team-actions";
import type { ColdCallLookup } from "@/lib/leads/cold-call-service";
import type { CallView } from "@/lib/leads/call-view";
import { CALL_REPORTED_EVENT, getNativeDialer } from "@/lib/leads/native-bridge";

/**
 * Cold Call: type a number, call it from your own SIM, and have the call counted like any other.
 *
 * The pad only edits a number. Everything that matters happens on the server: it finds the lead with that number or
 * creates your own self-generated lead (never a duplicate), issues the call attempt, and later classifies the phone's
 * reported duration (more than 10 seconds = CONNECTED). The call itself runs through the existing CallButton, so a cold
 * call has exactly the lifecycle of a call from a lead: attempt, SIM call, result, outcome.
 *
 * In an ordinary browser there is no Android app, so nothing can be dialed and tracked: the pad says so plainly rather
 * than opening an untracked phone call that would create no lead and count for nothing.
 */

const COUNTRIES = [
  { code: "+91", label: "India +91", minDigits: 10 },
  { code: "+971", label: "UAE +971", minDigits: 8 },
] as const;
type Country = (typeof COUNTRIES)[number];

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const KEY =
  "flex min-h-14 items-center justify-center rounded-full border border-border bg-background text-2xl font-medium text-foreground active:bg-muted hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";
const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const subscribeNever = () => () => {};

function format(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

export function ColdCallPad() {
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [digits, setDigits] = useState("");
  // The answer is stored WITH the number it is about, so an old answer can never show for a different number.
  const [answer, setAnswer] = useState<{ number: string; result: ColdCallLookup | null } | null>(null);
  const [session, setSession] = useState(0); // remounts the call control for the next number
  const [prepared, setPrepared] = useState<{ callId: string; leadId: string; createdLead: boolean } | null>(null);
  const [finished, setFinished] = useState(false);
  const hasBridge = useSyncExternalStore(subscribeNever, () => getNativeDialer() !== null, () => false);

  const full = `${country.code}${digits}`;
  const ready = digits.length >= country.minDigits;
  const locked = prepared !== null && !finished; // a call is under way: the number cannot be edited
  const checking = ready && !prepared;
  const lookup = checking && answer?.number === full ? answer.result : null;
  const looking = checking && answer?.number !== full;

  // Before dialing: is this number new, already yours, or someone else's? (Debounced; the server decides.)
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

  // The server accepted the phone's report for this call: it is over, so the next number may be dialed.
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
    setDigits((d) => (d.length >= 12 ? d : d + key));
  }

  async function paste() {
    if (locked) return;
    try {
      const text = await navigator.clipboard.readText();
      let cleaned = text.replace(/[^\d+]/g, "");
      for (const c of COUNTRIES) {
        if (cleaned.startsWith(c.code)) {
          setCountry(c);
          cleaned = cleaned.slice(c.code.length);
          break;
        }
      }
      setDigits(cleaned.replace(/\D/g, "").replace(/^0+/, "").slice(-12));
    } catch {
      // clipboard blocked: the keypad still works
    }
  }

  function next() {
    setDigits("");
    setAnswer(null);
    setPrepared(null);
    setFinished(false);
    setSession((n) => n + 1);
  }

  const blocked = lookup?.kind === "NOT_YOURS";

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="cold-call-country">
          Country code
        </label>
        <select
          id="cold-call-country"
          value={country.code}
          disabled={locked}
          onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? COUNTRIES[0])}
          className="min-h-11 rounded-md border border-border bg-background px-2 text-base text-foreground disabled:opacity-50"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <p aria-label="Number to call" aria-live="polite" className="min-h-11 flex-1 truncate rounded-md border border-border px-3 text-right text-2xl font-medium leading-[2.75rem] tracking-wide text-foreground">
          {digits ? format(digits) : <span className="text-base font-normal text-muted-foreground">Enter a number</span>}
        </p>
        <button type="button" aria-label="Delete last digit" className={`${BTN} w-11 px-0 text-lg`} disabled={locked || digits === ""} onClick={() => setDigits((d) => d.slice(0, -1))}>
          ⌫
        </button>
      </div>

      <div className="mt-2 min-h-14" aria-live="polite">
        {ready && looking && <p className="text-sm text-muted-foreground">Checking this number…</p>}
        {ready && !looking && lookup?.kind === "NEW" && !prepared && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">New number. Calling it creates a new lead owned by you.</p>
        )}
        {ready && !looking && lookup?.kind === "YOURS" && !prepared && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
            Already your lead{lookup.leadName ? `: ${lookup.leadName}` : ""}. This call is added to it.{" "}
            <Link href={`/team/leads/${lookup.leadId}`} className="font-medium text-accent-hover underline">
              Open lead
            </Link>
          </p>
        )}
        {ready && !looking && blocked && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">This number is already in the system and is not assigned to you, so you cannot call it from here.</p>}
        {ready && !looking && lookup?.kind === "INVALID" && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Check the number: it does not look valid.</p>}
        {prepared?.createdLead && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">A new lead was created for this number and it is yours.</p>}
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
        {!hasBridge ? (
          <p role="status" className="rounded-md border border-border bg-muted px-3 py-3 text-sm text-foreground">
            Open Developer Connects in the Android app to call from your own SIM. A call made any other way is not counted, so this pad does not place it.
          </p>
        ) : (
          <fieldset disabled={!ready || blocked || lookup?.kind === "INVALID" || looking} className="disabled:opacity-60">
            <CallButton
              key={session}
              configured={false}
              telHref={null}
              onPlace={async () => ({ ok: false, error: "Calls are placed from the Android app." })}
              onPrepare={async () => {
                const result = await prepareMyColdCallAction(full, null);
                if (!result.ok) return result;
                setPrepared({ callId: result.callId, leadId: result.leadId, createdLead: result.createdLead });
                return { ok: true, callId: result.callId, phone: result.phone };
              }}
              onStatus={getMyCallStatusAction}
              onDisposition={setMyCallDispositionAction}
            />
          </fieldset>
        )}
      </div>

      {!prepared && ready && lookup?.kind !== "NOT_YOURS" && lookup?.kind !== "INVALID" && (
        <p className="mt-3 text-center text-sm">
          <Link href={`/team/cold-call?phone=${encodeURIComponent(full)}`} className="inline-flex min-h-11 items-center text-accent-hover hover:underline">
            Record a cold call lead without dialing
          </Link>
        </p>
      )}

      {prepared && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/team/cold-call/${prepared.leadId}`} className={`${BTN} border-accent bg-accent/10`}>
            Add call details
          </Link>
          <Link href={`/team/leads/${prepared.leadId}`} className={BTN}>
            View lead
          </Link>
          <button type="button" className={BTN} disabled={!finished} onClick={next}>
            {finished ? "Next number" : "Next number (after the call)"}
          </button>
        </div>
      )}
    </div>
  );
}
