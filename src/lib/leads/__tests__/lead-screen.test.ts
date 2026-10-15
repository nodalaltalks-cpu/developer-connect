import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { submitEnquiry, type EnquiryStore } from "../../social/enquiry-service.ts";
import { buildInstantAlertText } from "../instant-alert.ts";
import { isLikelyFakeNumber, nameLooksLikeBusiness, nationalNumber, screenContact } from "../lead-screen.ts";

test("fake numbers: made-up patterns are caught", () => {
  for (const fake of ["9999999999", "9876543210", "9898989898", "9999988888", "9876543211", "8888888812", "1234567890", "9090909090"]) {
    assert.equal(isLikelyFakeNumber(fake), true, `${fake} should be refused`);
  }
});

test("fake numbers: ordinary real-looking mobiles are not refused", () => {
  for (const real of ["9820314567", "9833750932", "7021458963", "8454902817", "9004455667", "9619000123"]) {
    assert.equal(isLikelyFakeNumber(real), false, `${real} should be accepted`);
  }
  assert.equal(isLikelyFakeNumber("12345"), false, "too short is a different error, reported elsewhere");
});

test("national number: country code is stripped for India and the UAE", () => {
  assert.equal(nationalNumber("+919820314567"), "9820314567");
  assert.equal(nationalNumber("+971508902817"), "508902817");
});

test("business names are flagged, personal names are not", () => {
  for (const name of ["Sharma Realty", "ABC Properties", "Deepak Real Estate Consultants", "Galaxy Associates", "Mehta & Co. Brokers", "Om Sai Enterprises"]) {
    assert.equal(nameLooksLikeBusiness(name), true, name);
  }
  for (const name of ["Meera Shah", "Rahul Properia", "Anita Estaban", "Suresh Kumar", "", null, undefined]) {
    assert.equal(nameLooksLikeBusiness(name as string | null | undefined), false, String(name));
  }
  assert.deepEqual(screenContact({ name: "Sharma Realty", e164: "+919820314567" }).flags.length, 1);
  assert.equal(screenContact({ name: "Meera Shah", e164: "+919820314567" }).flags.length, 0);
});

function memoryStore() {
  const rows: unknown[] = [];
  const store = { async insert(row: unknown) { rows.push(row); } } as unknown as EnquiryStore;
  return { store, rows };
}

test("enquiry: a made-up number is refused and nothing is saved; a business-looking name is still accepted", async () => {
  const repos = createInMemoryLeadRepositories();
  const s = memoryStore();
  const deps = { leads: repos, store: s.store, now: () => new Date("2026-10-16T10:00:00.000Z") };
  const answers = { intent: "BUY", market: "MUMBAI" };
  const refused = await submitEnquiry(deps, { sessionId: "f1" }, { answers, name: "Test", phone: "99999 99999", phoneCountry: "IN", touch: { sessionId: "f1" } });
  assert.equal(refused.ok, false);
  assert.equal(s.rows.length, 0);
  assert.equal(await repos.leads.findByPhone("+919999999999"), null);

  const accepted = await submitEnquiry(deps, { sessionId: "f2" }, { answers, name: "Sharma Realty", phone: "98203 14567", phoneCountry: "IN", touch: { sessionId: "f2" } });
  assert.equal(accepted.ok, true, "a flag is advice, never a refusal");
});

test("instant alert: carries the check-first flag and still no name or number", () => {
  const text = buildInstantAlertText({ leadId: "abc", created: true, channel: "GOOGLE", flags: ["name looks like a property business (agent or channel partner?)"] });
  assert.match(text, /CHECK FIRST: name looks like a property business/);
  assert.doesNotMatch(text, /Sharma|\d{10}/);
});
