import test from "node:test";
import assert from "node:assert/strict";
import { CALC_START, pressDecimal, pressDigit, pressEquals, pressOperation, pressPercent, pressBackspace, type CalcState } from "../basic-calc.ts";

const keys = (start: CalcState, ...inputs: string[]): CalcState => {
  let s = start;
  for (const k of inputs) {
    if (/^\d$/.test(k)) s = pressDigit(s, k);
    else if (k === ".") s = pressDecimal(s);
    else if (k === "=") s = pressEquals(s);
    else if (k === "%") s = pressPercent(s);
    else if (k === "<") s = pressBackspace(s);
    else s = pressOperation(s, k as "+" | "−" | "×" | "÷");
  }
  return s;
};

test("calculator: a fresh display shows 0 and the first digit replaces it", () => {
  assert.equal(CALC_START.display, "0");
  assert.equal(keys(CALC_START, "7").display, "7");
  assert.equal(keys(CALC_START, "0", "0", "5").display, "5");
});

test("calculator: the four operations, chained left to right", () => {
  assert.equal(keys(CALC_START, "1", "2", "+", "3", "=").display, "15");
  assert.equal(keys(CALC_START, "9", "−", "4", "=").display, "5");
  assert.equal(keys(CALC_START, "6", "×", "7", "=").display, "42");
  assert.equal(keys(CALC_START, "8", "÷", "4", "=").display, "2");
  assert.equal(keys(CALC_START, "2", "+", "3", "×", "4", "=").display, "20");
});

test("calculator: float noise is removed and divide by zero is an error, not Infinity", () => {
  assert.equal(keys(CALC_START, "0", ".", "1", "+", "0", ".", "2", "=").display, "0.3");
  assert.equal(keys(CALC_START, "5", "÷", "0", "=").display, "Error");
});

test("calculator: percent works as a share of the first number after + or −, and backspace removes a typed digit", () => {
  assert.equal(keys(CALC_START, "2", "0", "0", "+", "1", "0", "%", "=").display, "220");
  assert.equal(keys(CALC_START, "5", "0", "%").display, "0.5");
  assert.equal(keys(CALC_START, "1", "2", "3", "<").display, "12");
});
