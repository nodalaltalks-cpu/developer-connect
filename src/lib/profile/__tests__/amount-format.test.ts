import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIndianAmount, formatIndianAmount } from "../amount-format.ts";

test("parseIndianAmount: a plain rupee number", () => {
  assert.equal(parseIndianAmount("5000000"), 5000000);
  assert.equal(parseIndianAmount("50,00,000"), 5000000);
});

test("parseIndianAmount: Lakh in every spelling", () => {
  assert.equal(parseIndianAmount("50 Lakh"), 50 * 100000);
  assert.equal(parseIndianAmount("75L"), 75 * 100000);
  assert.equal(parseIndianAmount("12.5 lac"), 12.5 * 100000);
  assert.equal(parseIndianAmount("1 lakhs"), 100000);
});

test("parseIndianAmount: Crore in every spelling", () => {
  assert.equal(parseIndianAmount("1 Cr"), 10000000);
  assert.equal(parseIndianAmount("1.2 Cr"), 12000000);
  assert.equal(parseIndianAmount("2.5 Crore"), 25000000);
});

test("parseIndianAmount: whitespace and an optional ₹ are ignored", () => {
  assert.equal(parseIndianAmount("  1.2 Cr  "), 12000000);
  assert.equal(parseIndianAmount("₹75 Lakh"), 7500000);
});

test("parseIndianAmount: rejects empty, garbage, negative, and zero", () => {
  assert.equal(parseIndianAmount(""), null);
  assert.equal(parseIndianAmount("   "), null);
  assert.equal(parseIndianAmount("abc"), null);
  assert.equal(parseIndianAmount("1.2 C"), null); // mid-keystroke, not yet a real unit
  assert.equal(parseIndianAmount("-5 Lakh"), null);
  assert.equal(parseIndianAmount("0"), null);
  assert.equal(parseIndianAmount("0 Lakh"), null);
});

test("formatIndianAmount: below a Lakh uses plain Indian grouping", () => {
  assert.equal(formatIndianAmount(50000), "50,000");
});

test("formatIndianAmount: Lakh and Crore ranges, trimmed of trailing zeros", () => {
  assert.equal(formatIndianAmount(5000000), "50 Lakh");
  assert.equal(formatIndianAmount(12000000), "1.2 Cr");
  assert.equal(formatIndianAmount(10000000), "1 Cr");
});

test("formatIndianAmount: an invalid amount formats as an empty string, never NaN text", () => {
  assert.equal(formatIndianAmount(0), "");
  assert.equal(formatIndianAmount(Number.NaN), "");
  assert.equal(formatIndianAmount(-100), "");
});

test("parseIndianAmount then formatIndianAmount round-trips a typed amount to the same friendly form", () => {
  const parsed = parseIndianAmount("1.2 Cr");
  assert.equal(parsed !== null && formatIndianAmount(parsed), "1.2 Cr");
});
