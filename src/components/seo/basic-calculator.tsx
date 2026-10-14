"use client";

import { useState } from "react";
import {
  CALC_START,
  pressBackspace,
  pressDecimal,
  pressDigit,
  pressEquals,
  pressNegate,
  pressOperation,
  pressPercent,
  type CalcState,
  type Operation,
} from "@/lib/seo/basic-calc";

/**
 * An everyday calculator for sums while you compare prices, areas and payment plans. It is separate from the EMI calculator, which is
 * for loans only. Big keys for a thumb; C clears everything.
 */

const KEY = "min-h-14 rounded-lg border border-border bg-white text-xl font-semibold text-foreground [font-variant-numeric:tabular-nums] hover:bg-muted";
const OP = "min-h-14 rounded-lg bg-ink text-2xl font-semibold text-pearl hover:opacity-90";

export function BasicCalculator() {
  const [state, setState] = useState<CalcState>(CALC_START);
  const set = (fn: (s: CalcState) => CalcState) => () => setState(fn);
  const ops: Operation[] = ["÷", "×", "−", "+"];

  return (
    <section aria-label="Calculator" className="mx-auto mt-10 max-w-sm rounded-xl border border-border bg-white p-4 shadow-[0_24px_48px_-32px_rgba(11,18,32,0.35)]">
      <div aria-live="polite" className="rounded-lg bg-ink px-4 py-3 text-right text-pearl">
        <p className="min-h-5 truncate text-sm text-mist">{state.trail || " "}</p>
        <p className="truncate font-serif text-5xl font-medium leading-tight text-white [font-variant-numeric:tabular-nums]" data-testid="calc-display">
          {state.display}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <button type="button" className={`${KEY} bg-muted`} onClick={() => setState(CALC_START)}>
          C
        </button>
        <button type="button" className={`${KEY} bg-muted`} onClick={set(pressNegate)} aria-label="Plus or minus">
          ±
        </button>
        <button type="button" className={`${KEY} bg-muted`} onClick={set(pressPercent)} aria-label="Percent">
          %
        </button>
        <button type="button" className={OP} onClick={set((s) => pressOperation(s, ops[0]))} aria-label="Divide">
          ÷
        </button>

        {["7", "8", "9"].map((d) => (
          <button key={d} type="button" className={KEY} onClick={set((s) => pressDigit(s, d))}>
            {d}
          </button>
        ))}
        <button type="button" className={OP} onClick={set((s) => pressOperation(s, "×"))} aria-label="Multiply">
          ×
        </button>

        {["4", "5", "6"].map((d) => (
          <button key={d} type="button" className={KEY} onClick={set((s) => pressDigit(s, d))}>
            {d}
          </button>
        ))}
        <button type="button" className={OP} onClick={set((s) => pressOperation(s, "−"))} aria-label="Subtract">
          −
        </button>

        {["1", "2", "3"].map((d) => (
          <button key={d} type="button" className={KEY} onClick={set((s) => pressDigit(s, d))}>
            {d}
          </button>
        ))}
        <button type="button" className={OP} onClick={set((s) => pressOperation(s, "+"))} aria-label="Add">
          +
        </button>

        <button type="button" className={KEY} onClick={set((s) => pressDigit(s, "0"))}>
          0
        </button>
        <button type="button" className={KEY} onClick={set(pressDecimal)} aria-label="Decimal point">
          .
        </button>
        <button type="button" className={KEY} onClick={set(pressBackspace)} aria-label="Delete the last digit">
          ⌫
        </button>
        <button type="button" className="min-h-14 rounded-lg bg-accent text-2xl font-semibold text-accent-foreground hover:bg-accent-hover" onClick={set(pressEquals)} aria-label="Equals">
          =
        </button>
      </div>
    </section>
  );
}
