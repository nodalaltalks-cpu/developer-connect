/**
 * The everyday calculator's arithmetic, kept apart from the screen so it can be tested. It works like a pocket calculator: enter a
 * number, choose an operation, enter the next, press equals; pressing an operation again chains from the result.
 */

export type Operation = "+" | "−" | "×" | "÷";

export interface CalcState {
  /** What the display shows. */
  display: string;
  /** The number waiting for the next entry, once an operation is chosen. */
  stored: number | null;
  operation: Operation | null;
  /** The next digit starts a fresh number (after an operation or an equals). */
  fresh: boolean;
  /** The calculation so far, shown small above the display. */
  trail: string;
}

export const CALC_START: CalcState = { display: "0", stored: null, operation: null, fresh: true, trail: "" };

const MAX_DIGITS = 15;

function apply(a: number, op: Operation, b: number): number | null {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? null : a / b;
  }
}

/** Numbers are shown to at most 10 decimal places with the float noise removed (0.1 + 0.2 shows 0.3). */
export function formatCalcNumber(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const rounded = Number(n.toPrecision(12));
  return String(rounded);
}

export function pressDigit(state: CalcState, digit: string): CalcState {
  if (state.display === "Error") state = CALC_START;
  if (state.fresh) return { ...state, display: digit, fresh: false };
  if (state.display.replace(/[-.]/g, "").length >= MAX_DIGITS) return state;
  return { ...state, display: state.display === "0" ? digit : state.display + digit };
}

export function pressDecimal(state: CalcState): CalcState {
  if (state.display === "Error") state = CALC_START;
  if (state.fresh) return { ...state, display: "0.", fresh: false };
  if (state.display.includes(".")) return state;
  return { ...state, display: state.display + "." };
}

/** Delete the last typed character (never the result of a calculation). */
export function pressBackspace(state: CalcState): CalcState {
  if (state.fresh || state.display === "Error") return state;
  const next = state.display.slice(0, -1);
  return { ...state, display: next === "" || next === "-" ? "0" : next };
}

export function pressOperation(state: CalcState, op: Operation): CalcState {
  if (state.display === "Error") return state;
  const current = Number(state.display);
  // Two operations in a row: the second replaces the first.
  if (state.stored !== null && state.operation && state.fresh) {
    return { ...state, operation: op, trail: `${formatCalcNumber(state.stored)} ${op}` };
  }
  if (state.stored !== null && state.operation) {
    const result = apply(state.stored, state.operation, current);
    if (result === null) return { ...CALC_START, display: "Error", trail: "Cannot divide by zero" };
    return { display: formatCalcNumber(result), stored: result, operation: op, fresh: true, trail: `${formatCalcNumber(result)} ${op}` };
  }
  return { display: state.display, stored: current, operation: op, fresh: true, trail: `${formatCalcNumber(current)} ${op}` };
}

export function pressEquals(state: CalcState): CalcState {
  if (state.display === "Error" || state.stored === null || !state.operation) return state;
  const current = Number(state.display);
  const result = apply(state.stored, state.operation, current);
  if (result === null) return { ...CALC_START, display: "Error", trail: "Cannot divide by zero" };
  return {
    display: formatCalcNumber(result),
    stored: null,
    operation: null,
    fresh: true,
    trail: `${formatCalcNumber(state.stored)} ${state.operation} ${formatCalcNumber(current)} =`,
  };
}

/** % : of the stored number when one is waiting (200 + 10 % = 200 + 20), otherwise a hundredth of what is shown. */
export function pressPercent(state: CalcState): CalcState {
  if (state.display === "Error") return state;
  const current = Number(state.display);
  const value = state.stored !== null && (state.operation === "+" || state.operation === "−") ? (state.stored * current) / 100 : current / 100;
  return { ...state, display: formatCalcNumber(value), fresh: true };
}

export function pressNegate(state: CalcState): CalcState {
  if (state.display === "Error" || state.display === "0") return state;
  return { ...state, display: state.display.startsWith("-") ? state.display.slice(1) : "-" + state.display };
}
