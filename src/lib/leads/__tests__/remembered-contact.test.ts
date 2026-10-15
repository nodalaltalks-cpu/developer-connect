import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { indianMobileDigits, maskDigits, parseRememberedContact } from "../remembered-contact.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(here, rel), "utf8");

test("remembered contact: only a complete name and Indian mobile number is accepted", () => {
  assert.deepEqual(parseRememberedContact(JSON.stringify({ name: "  Meera   Shah ", digits: "9876543210" })), { name: "Meera Shah", digits: "9876543210" });
  for (const bad of [null, undefined, "", "not json", "[]", JSON.stringify({ name: "M", digits: "9876543210" }), JSON.stringify({ name: "Meera", digits: "12345" }), JSON.stringify({ name: "Meera", digits: "5876543210" }), JSON.stringify({ name: "Meera", digits: 9876543210 }), JSON.stringify({ name: "x".repeat(121), digits: "9876543210" })]) {
    assert.equal(parseRememberedContact(bad as string | null | undefined), null);
  }
});

test("remembered contact: typed numbers are reduced to the 10 digits, or refused", () => {
  assert.equal(indianMobileDigits("98765 43210"), "9876543210");
  assert.equal(indianMobileDigits("+91 98765 43210"), "9876543210");
  assert.equal(indianMobileDigits("09876543210"), "9876543210");
  assert.equal(indianMobileDigits("98765"), null);
  assert.equal(indianMobileDigits("1234567890"), null);
  assert.equal(indianMobileDigits(""), null);
});

test("remembered contact: shown masked, never in full", () => {
  assert.equal(maskDigits("9876543210"), "+91 98•••• •210");
  assert.ok(!maskDigits("9876543210").includes("9876543210"));
});

test("remembered contact storage: local storage only after analytics consent, session otherwise; 'Not you?' clears both", () => {
  const src = read("../remembered-contact.ts");
  assert.match(src, /sessionStorage\.setItem\(REMEMBERED_CONTACT_KEY/);
  assert.match(src, /if \(accepted\) safe\(\(\) => window\.localStorage\.setItem\(REMEMBERED_CONTACT_KEY/);
  assert.equal((src.match(/localStorage\.setItem\(REMEMBERED_CONTACT_KEY/g) ?? []).length, 1, "one local-storage write, and it sits behind the consent check");
  assert.match(src, /sessionStorage\.removeItem\(REMEMBERED_CONTACT_KEY/);
  assert.match(src, /localStorage\.removeItem\(REMEMBERED_CONTACT_KEY/);
});

test("remembered contact: only the enquiry forms write it, and only after a successful send", () => {
  for (const file of ["../../../components/campaign/project-quick-form.tsx", "../../../components/social/enquiry-form.tsx"]) {
    const src = read(file);
    assert.equal((src.match(/rememberContact\(/g) ?? []).length, 1, `${file} remembers once`);
    const afterOk = src.slice(src.indexOf("if (result.ok)"));
    assert.ok(afterOk.includes("rememberContact("), `${file} remembers only inside the success branch`);
  }
});
