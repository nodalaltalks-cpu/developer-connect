import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, composePhone, findPhoneCountry, phoneCountryLabel } from "../phone-countries.ts";
import { normalizePhone } from "../leads/phone.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../..", relative), "utf8");

test("world list: every country has a unique code, India is first and the default, the UAE second", () => {
  assert.ok(PHONE_COUNTRIES.length >= 230, "the whole world, not a handful");
  assert.equal(new Set(PHONE_COUNTRIES.map((c) => c.iso)).size, PHONE_COUNTRIES.length);
  assert.equal(DEFAULT_PHONE_COUNTRY, "IN");
  assert.equal(PHONE_COUNTRIES[0].iso, "IN");
  assert.equal(PHONE_COUNTRIES[1].iso, "AE");
  for (const c of PHONE_COUNTRIES) {
    assert.match(c.dial, /^\d{1,4}$/);
    assert.match(c.iso, /^[A-Z]{2}$/);
    assert.ok(c.name.length > 1);
  }
  for (const iso of ["US", "GB", "CA", "AU", "SG", "SA", "QA", "KW", "OM", "BH", "NP", "BD", "LK", "PK", "DE", "FR", "ZA", "NZ", "KE", "NG"]) {
    assert.ok(PHONE_COUNTRIES.some((c) => c.iso === iso), `${iso} is missing`);
  }
  assert.equal(phoneCountryLabel(findPhoneCountry("GB")), "+44 United Kingdom");
  assert.equal(findPhoneCountry("ZZ").iso, "IN", "an unknown code falls back to India");
});

test("compose: India and the UAE keep their region; any other country becomes an international number the server accepts", () => {
  assert.deepEqual(composePhone("IN", "98765 43210"), { phone: "98765 43210", phoneCountry: "IN" });
  assert.deepEqual(composePhone("AE", "50 890 2817"), { phone: "50 890 2817", phoneCountry: "AE" });

  const uk = composePhone("GB", "07400 123456");
  assert.equal(uk.phone, "+447400123456", "a leading national zero is dropped");
  const ukResult = normalizePhone(uk.phone, uk.phoneCountry);
  assert.ok(ukResult.ok && ukResult.country === "GB");

  const us = composePhone("US", "(415) 555-2671");
  assert.equal(us.phone, "+14155552671");
  const usResult = normalizePhone(us.phone, us.phoneCountry);
  assert.ok(usResult.ok && usResult.e164 === "+14155552671");

  const sg = normalizePhone(composePhone("SG", "8123 4567").phone, "IN");
  assert.ok(sg.ok && sg.country === "SG");

  assert.equal(composePhone("GB", "+44 7911 123456").phone, "+44 7911 123456", "a number already in international form is left alone");
  assert.equal(composePhone("GB", "").phone, "");
});

test("forms: both public phone fields offer the world list, with India selected first", () => {
  const gate = read("src/components/assistance-gate-view.tsx");
  assert.match(gate, /PHONE_COUNTRIES\.map/);
  assert.match(gate, /phoneCountryLabel/);
  const enquiry = read("src/components/social/enquiry-form.tsx");
  assert.match(enquiry, /PHONE_COUNTRIES\.map/);
  assert.match(enquiry, /useState\("IN"\)/);
  assert.match(read("src/components/assistance-gate.tsx"), /composePhone\(current\.form\.country/);
});
