"use client";

import { useEffect, useState } from "react";
import { delayInterest } from "@/lib/seo/delay-interest";
import { formatMoney } from "@/lib/seo/emi";

/**
 * "My flat is late: what interest am I owed?" The buyer types what they paid, the possession date in their agreement, the date they
 * got (or will get) the keys, and the interest rate that applies in their state. The rate is never pre-filled as if it were the real
 * one: it is set by state rules and changes, so the buyer enters it. Rupees only (a RERA matter).
 */

const FIELD =
  "mt-1 block min-h-12 w-full rounded-sm border border-field-border bg-white px-3 text-base text-foreground [font-variant-numeric:tabular-nums] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function todayYmd(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function NumberBox({ id, label, value, onChange, suffix, hint, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; suffix?: string; hint?: string; placeholder?: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder ?? "0"}
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1"))}
          className={`${FIELD} ${suffix ? "pr-14" : ""}`}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-sm font-medium text-brass-700 [font-variant-numeric:tabular-nums]">{hint}</span>}
    </label>
  );
}

export function DelayInterestCalculator() {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [promised, setPromised] = useState("");
  const [until, setUntil] = useState("");

  // Today's date can only be known in the browser, so it is filled in after the page loads (never during the server render).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the current date exists only in the browser
    setUntil((current) => current || todayYmd());
  }, []);

  const result = delayInterest({ amountPaid: Number(amount), annualRatePercent: Number(rate), promisedDate: promised, untilDate: until });
  const started = amount !== "" || rate !== "" || promised !== "";
  const amountNumber = Number(amount) || 0;

  return (
    <section aria-labelledby="delay-calc-heading" className="mt-10 overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_0_rgba(20,23,31,0.04),0_24px_48px_-32px_rgba(11,18,32,0.35)]">
      <h2 id="delay-calc-heading" className="sr-only">
        Possession-delay interest calculator
      </h2>
      <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-2">
        <div className="space-y-5">
          <NumberBox id="delay-amount" label="Amount you have paid the developer" value={amount} onChange={setAmount} suffix="₹" placeholder="e.g. 5000000" hint={amountNumber > 0 ? formatMoney(amountNumber, "INR") : undefined} />
          <label htmlFor="delay-promised" className="block">
            <span className="text-sm font-semibold text-foreground">Possession date in your agreement</span>
            <input id="delay-promised" type="date" value={promised} onChange={(e) => setPromised(e.target.value)} className={FIELD} />
          </label>
          <label htmlFor="delay-until" className="block">
            <span className="text-sm font-semibold text-foreground">Handover date, or today if you have not got the keys</span>
            <input id="delay-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={FIELD} />
          </label>
          <NumberBox id="delay-rate" label="Interest rate per year in your state" value={rate} onChange={setRate} suffix="%" placeholder="from your state's RERA rule" />
          <p className="text-xs leading-5 text-muted-foreground">
            The rate is set by your state&apos;s RERA rules and changes over time, so type the current one. We do not fill it in for you.
          </p>
        </div>

        <div aria-live="polite" className="dc-grain rounded-xl bg-ink p-6 text-pearl sm:p-8">
          <div className="relative z-10">
            {result.valid ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">Delay interest, about</p>
                <p className="mt-2 font-serif text-[clamp(2.25rem,1.6rem+3vw,3.5rem)] font-medium leading-none tracking-[-0.01em] text-white [font-variant-numeric:tabular-nums]">
                  {formatMoney(result.interest, "INR")}
                </p>
                <dl className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">Delay</dt>
                    <dd className="text-right font-semibold [font-variant-numeric:tabular-nums]">
                      {result.delayDays === 0 ? "No delay yet" : `${result.months} month${result.months === 1 ? "" : "s"}, ${result.days} day${result.days === 1 ? "" : "s"} (${result.delayDays} days)`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">For each further month</dt>
                    <dd className="font-semibold [font-variant-numeric:tabular-nums]">{formatMoney(result.perMonth, "INR")}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">For each further day</dt>
                    <dd className="font-semibold [font-variant-numeric:tabular-nums]">{formatMoney(result.perDay, "INR")}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-xs leading-5 text-mist">Simple interest on the amount paid. A starting point, not a legal figure: your agreement, extensions and the authority&apos;s method can change it.</p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">Delay interest</p>
                <p className="mt-3 text-base leading-7 text-white/90">{started ? result.reason : "Fill in the four boxes and the interest owed for the delay appears here."}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
