import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPhone, normalizePhone } from "../phone.ts";

// --- valid numbers -----------------------------------------------------------------------------

const VALID_INDIA = [
  "+91 98765 43210",
  "+919876543210",
  "98765 43210",
  "098765 43210", // trunk prefix "0"
  "98765-43210",
  "91 9876543210",
  "00 91 98765 43210", // "00" international prefix
  " +91 (98765) 43210 ",
];

for (const input of VALID_INDIA) {
  test(`phone: Indian number "${input}" normalises to +919876543210`, () => {
    const result = normalizePhone(input);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.e164, "+919876543210");
      assert.equal(result.country, "IN");
    }
  });
}

const VALID_UAE = [
  ["+971 50 123 4567", "+971501234567"],
  ["+971501234567", "+971501234567"],
  ["00971 50 123 4567", "+971501234567"],
  ["050 123 4567", "+971501234567"], // national format needs the AE default region
] as const;

for (const [input, expected] of VALID_UAE) {
  test(`phone: UAE number "${input}" normalises to ${expected}`, () => {
    const result = normalizePhone(input, "AE");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.e164, expected);
      assert.equal(result.country, "AE");
    }
  });
}

test("phone: a number with its own international prefix keeps its country regardless of the default region", () => {
  const uaeWhileDefaultIndia = normalizePhone("+971 50 123 4567", "IN");
  assert.equal(uaeWhileDefaultIndia.ok && uaeWhileDefaultIndia.country, "AE");
  const indiaWhileDefaultUae = normalizePhone("+91 98765 43210", "AE");
  assert.equal(indiaWhileDefaultUae.ok && indiaWhileDefaultUae.e164, "+919876543210");
});

test("phone: numbers from other countries are accepted when written internationally", () => {
  const uk = normalizePhone("+44 7911 123456");
  assert.equal(uk.ok, true);
  assert.equal(uk.ok && uk.e164, "+447911123456");
});

test("phone: different spellings of one number give the SAME canonical value (the duplicate key)", () => {
  const forms = ["+91 98765 43210", "098765 43210", "91-98765-43210", "9876543210"];
  const normalised = new Set(forms.map((form) => (normalizePhone(form) as { e164: string }).e164));
  assert.equal(normalised.size, 1);
});

// --- invalid numbers ---------------------------------------------------------------------------

const INVALID: Array<[string, string]> = [
  ["", "empty"],
  ["   ", "blank"],
  ["abc", "letters"],
  ["12345", "too short"],
  ["98765 4321", "one digit short"],
  ["98765 432100", "one digit long"],
  ["+91 98765 43210 99", "Indian number with extra digits"],
  ["+91 98765", "too short with a country code"],
  ["+999 123456789", "unknown country code"],
  ["0000000000", "all zeros"],
  ["+1 555", "too short for any country"],
  ["9".repeat(60), "absurdly long"],
];

for (const [input, why] of INVALID) {
  test(`phone: rejects "${input.slice(0, 24)}" (${why})`, () => {
    const result = normalizePhone(input);
    assert.equal(result.ok, false, `${input} should be rejected`);
  });
}

test("phone: null and undefined are rejected as EMPTY, never thrown on", () => {
  assert.deepEqual(normalizePhone(null), { ok: false, reason: "EMPTY" });
  assert.deepEqual(normalizePhone(undefined), { ok: false, reason: "EMPTY" });
});

test("phone: the rejection reason distinguishes empty from invalid", () => {
  assert.deepEqual(normalizePhone(""), { ok: false, reason: "EMPTY" });
  const bad = normalizePhone("12345");
  assert.equal(bad.ok, false);
  assert.notEqual(!bad.ok && bad.reason, "EMPTY");
});

test("phone: a UAE national number is rejected when read as an Indian one (no silent cross-country guess)", () => {
  // 050 123 4567 is valid in the UAE but not in India — with the India default it must NOT be accepted.
  assert.equal(normalizePhone("050 123 4567", "IN").ok, false);
});

// --- masking -----------------------------------------------------------------------------------

test("maskPhone: shows the country code and last three digits only", () => {
  assert.equal(maskPhone("+919876543210"), "+91 ••••••210");
  assert.equal(maskPhone("+971501234567"), "+971 ••••••567");
});

test("maskPhone: never contains the full number", () => {
  const masked = maskPhone("+919876543210");
  assert.ok(!masked.includes("98765"));
  assert.ok(!masked.includes("9876543210"));
});

test("maskPhone: a too-short value is fully masked rather than echoed", () => {
  assert.equal(maskPhone("+9112"), "••••");
});
