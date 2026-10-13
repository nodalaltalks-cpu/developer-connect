"use client";

import { useState } from "react";
import { emiFor, formatMoney, loanForEmi, type LoanCurrency } from "@/lib/seo/emi";

/**
 * Two questions buyers ask before they visit anything: "what will my EMI be?" and "how much can I borrow for the EMI I can afford?".
 * One currency at a time (rupees or dirhams, never mixed). The starting values are examples; the visitor types their own.
 */

type Mode = "emi" | "afford";

const EXAMPLES: Record<LoanCurrency, { amount: number; rate: number; years: number; budget: number }> = {
  INR: { amount: 7_500_000, rate: 8.5, years: 20, budget: 60_000 },
  AED: { amount: 1_500_000, rate: 4.5, years: 25, budget: 8_000 },
};

const FIELD =
  "mt-1 block min-h-12 w-full rounded-sm border border-field-border bg-white px-3 text-base text-foreground [font-variant-numeric:tabular-nums] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function NumberField({ id, label, value, onChange, step, suffix, hint }: { id: string; label: string; value: number; onChange: (v: number) => void; step: number; suffix?: string; hint?: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className={`${FIELD} ${suffix ? "pr-16" : ""}`}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-sm font-medium text-brass-700 [font-variant-numeric:tabular-nums]">{hint}</span>}
    </label>
  );
}

export function EmiCalculator() {
  const [currency, setCurrency] = useState<LoanCurrency>("INR");
  const [mode, setMode] = useState<Mode>("emi");
  const [amount, setAmount] = useState(EXAMPLES.INR.amount);
  const [rate, setRate] = useState(EXAMPLES.INR.rate);
  const [years, setYears] = useState(EXAMPLES.INR.years);
  const [budget, setBudget] = useState(EXAMPLES.INR.budget);

  const switchCurrency = (next: LoanCurrency) => {
    if (next === currency) return;
    setCurrency(next);
    const ex = EXAMPLES[next];
    setAmount(ex.amount);
    setRate(ex.rate);
    setYears(ex.years);
    setBudget(ex.budget);
  };

  const result = emiFor(amount, rate, years);
  const affordable = loanForEmi(budget, rate, years);
  const affordableResult = emiFor(affordable, rate, years);
  const interestShare = result.totalPayable > 0 ? Math.round((result.totalInterest / result.totalPayable) * 100) : 0;

  const pill = (active: boolean) =>
    `min-h-11 flex-1 rounded-sm px-4 text-sm font-semibold transition-colors ${active ? "bg-ink text-pearl" : "text-foreground hover:bg-muted"}`;

  return (
    <section aria-labelledby="calc-heading" className="mt-10 overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_0_rgba(20,23,31,0.04),0_24px_48px_-32px_rgba(11,18,32,0.35)]">
      <h2 id="calc-heading" className="sr-only">
        Calculator
      </h2>
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 sm:p-5">
        <div role="group" aria-label="Currency" className="flex gap-1 rounded-sm border border-field-border p-1">
          <button type="button" aria-pressed={currency === "INR"} onClick={() => switchCurrency("INR")} className={pill(currency === "INR")}>
            ₹ India
          </button>
          <button type="button" aria-pressed={currency === "AED"} onClick={() => switchCurrency("AED")} className={pill(currency === "AED")}>
            AED Dubai
          </button>
        </div>
        <div role="group" aria-label="What to work out" className="flex gap-1 rounded-sm border border-field-border p-1">
          <button type="button" aria-pressed={mode === "emi"} onClick={() => setMode("emi")} className={pill(mode === "emi")}>
            My EMI
          </button>
          <button type="button" aria-pressed={mode === "afford"} onClick={() => setMode("afford")} className={pill(mode === "afford")}>
            What I can borrow
          </button>
        </div>
      </div>

      <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-2">
        <div className="space-y-5">
          {mode === "emi" ? (
            <NumberField id="loan-amount" label="Loan amount" value={amount} onChange={setAmount} step={currency === "INR" ? 100000 : 10000} suffix={currency === "INR" ? "₹" : "AED"} hint={formatMoney(amount, currency)} />
          ) : (
            <NumberField id="emi-budget" label="Monthly instalment you can afford" value={budget} onChange={setBudget} step={currency === "INR" ? 1000 : 250} suffix={currency === "INR" ? "₹" : "AED"} hint={`${formatMoney(budget, currency)} a month`} />
          )}
          <NumberField id="loan-rate" label="Interest rate (per year)" value={rate} onChange={setRate} step={0.05} suffix="%" />
          <NumberField id="loan-years" label="Loan tenure" value={years} onChange={setYears} step={1} suffix="years" />
          <p className="text-xs leading-5 text-muted-foreground">The starting figures are examples only. Use the rate and tenure your lender offers you.</p>
        </div>

        <div aria-live="polite" className="dc-grain rounded-xl bg-ink p-6 text-pearl sm:p-8">
          <div className="relative z-10">
            {mode === "emi" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">Monthly EMI</p>
                <p className="mt-2 font-serif text-[clamp(2.25rem,1.6rem+3vw,3.5rem)] font-medium leading-none tracking-[-0.01em] text-white [font-variant-numeric:tabular-nums]">
                  {formatMoney(result.emi, currency)}
                </p>
                <dl className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">Total interest</dt>
                    <dd className="font-semibold [font-variant-numeric:tabular-nums]">{formatMoney(result.totalInterest, currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">Total you repay</dt>
                    <dd className="font-semibold [font-variant-numeric:tabular-nums]">{formatMoney(result.totalPayable, currency)}</dd>
                  </div>
                </dl>
                <div className="mt-5" aria-hidden="true">
                  <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="bg-brass-300" style={{ width: `${100 - interestShare}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-mist">
                    Loan {100 - interestShare}% · Interest {interestShare}% of what you repay
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">You could borrow about</p>
                <p className="mt-2 font-serif text-[clamp(2.25rem,1.6rem+3vw,3.5rem)] font-medium leading-none tracking-[-0.01em] text-white [font-variant-numeric:tabular-nums]">
                  {formatMoney(affordable, currency)}
                </p>
                <dl className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">Total interest</dt>
                    <dd className="font-semibold [font-variant-numeric:tabular-nums]">{formatMoney(affordableResult.totalInterest, currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">Total you repay</dt>
                    <dd className="font-semibold [font-variant-numeric:tabular-nums]">{formatMoney(affordableResult.totalPayable, currency)}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-xs leading-5 text-mist">Lenders also look at your income, existing loans and the property itself, so the amount they approve can differ.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
