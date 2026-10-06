import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LEAD_COOKIE_NAME, signLeadToken, verifyLeadToken } from "../leads/gate/lead-cookie.ts";
import { RETURNING_LEAD_TTL_DAYS } from "../leads/gate/gate-config.ts";
import { COMMERCIAL_DISCLOSURE, gateCopy } from "../leads/gate/gate-copy.ts";
import { LEGAL_CONFIG } from "../legal-config.ts";

/**
 * The Privacy and Cookie policies must describe what the code ACTUALLY does.
 * These tests read the policy pages as text and cross-check every concrete
 * claim about the enquiry cookie, browser storage, the commercial disclosure
 * and erasure against the real implementation — so the policy cannot drift
 * from the product without a test failing.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, ".."); // src/lib
const appRoot = path.resolve(srcRoot, "..", "app");
const read = (...parts: string[]) => readFileSync(path.join(...parts), "utf8");
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** JSX page source -> the plain sentences a reader sees (entities decoded, tags removed, whitespace collapsed). */
function plain(source: string): string {
  return source
    .replace(/\{" "\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const cookies = plain(read(appRoot, "cookies", "page.tsx"));
const privacySource = read(appRoot, "privacy", "page.tsx");
const privacy = plain(privacySource);
const section10A = plain(privacySource.slice(privacySource.indexOf('title="10A.'), privacySource.indexOf('title="11.')));
const gateActions = code(read(appRoot, "_actions", "lead-gate-actions.ts"));

// --- the dc_lead cookie ---------------------------------------------------------------------------

test("cookie policy: names the enquiry cookie exactly as the code does, and says when it is (not) set", () => {
  assert.equal(LEAD_COOKIE_NAME, "dc_lead");
  assert.match(read(appRoot, "cookies", "page.tsx"), /title="3A\. Enquiry cookie — only if you send a request"/);
  assert.match(cookies, /called dc_lead/);
  assert.match(cookies, /It is not set just by browsing/);
  // The code really does set it only after a saved request, never on a page view.
  const setters = [...gateActions.matchAll(/rememberLead\(/g)].length;
  assert.equal(setters, 3, "rememberLead is defined once and called after submitGate and continueAsReturning only");
  assert.match(gateActions, /if \(result\.leadId\) await rememberLead\(result\.leadId\)/);
});

test("cookie policy: the stated duration matches the code (30 days, restarted by a later request)", () => {
  assert.equal(RETURNING_LEAD_TTL_DAYS, 30);
  assert.match(cookies, /30 days from the request/);
  assert.match(cookies, /another request on this browser starts the 30 days again/);
  assert.match(privacy, /dc_lead for 30 days/);
  // maxAge in the code is that same constant, in seconds.
  assert.match(gateActions, /maxAge: RETURNING_LEAD_TTL_DAYS \* 86_400/);
});

test("cookie policy: the stated protections are the ones the code sets — httpOnly, SameSite Lax, secure in production, signed", () => {
  assert.match(gateActions, /httpOnly: true/);
  assert.match(gateActions, /sameSite: "lax"/);
  assert.match(gateActions, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(cookies, /httpOnly cookie \(page scripts cannot read it\)/);
  assert.match(cookies, /SameSite "Lax"/);
  assert.match(cookies, /marked secure so it is sent only over HTTPS/);
  assert.match(cookies, /digitally signed/);
  assert.doesNotMatch(cookies + privacy, /encrypted cookie|cookie is encrypted/i, "signed is not the same as encrypted — never claim encryption");
});

test("cookie policy: what it says the cookie CONTAINS is what a real token contains — an id, an expiry and a signature, never personal data", () => {
  const leadId = "3f1c2b4a-5d6e-4f70-8a91-b2c3d4e5f607";
  const secret = "test-secret-0123456789-abcdefghijklmnop";
  const token = signLeadToken(leadId, secret, new Date("2026-10-06T10:00:00Z"), RETURNING_LEAD_TTL_DAYS * 86_400);
  assert.ok(token);

  const parts = token.split(".");
  assert.equal(parts.length, 4, "version, lead reference, expiry, signature");
  assert.equal(parts[0], "v1");
  assert.equal(parts[1], leadId);
  assert.match(parts[2], /^\d+$/);
  assert.ok(parts[3].length >= 40, "an HMAC signature");
  assert.doesNotMatch(token, /\+\d|@|\bAsha\b|9876/, "no phone, email or name can be in the token");
  assert.equal(verifyLeadToken(token, secret, new Date("2026-10-06T10:00:01Z")), leadId);

  assert.match(cookies, /a version marker, an internal reference number for your enquiry record/);
  assert.match(cookies, /an expiry time and the signature/);
  assert.match(cookies, /does not contain your name, phone number or email address/);
  assert.match(cookies, /Because the reference number points to your enquiry record on our servers, we treat it as linked to your enquiry details/);
  assert.match(privacy, /contains only an internal reference to your enquiry record, an expiry and a signature — not your name, number or email/);
});

test("cookie policy: with no secret the cookie is not set, exactly as the policy says", () => {
  assert.equal(signLeadToken("3f1c2b4a-5d6e-4f70-8a91-b2c3d4e5f607", undefined, new Date(), 100), null);
  assert.match(gateActions, /if \(!token\) return;/);
  assert.match(cookies, /If we cannot sign it .* we do not set it and the form is always shown in full/);
});

test("cookie policy: the purpose it states is the real one — the number is only ever shown masked, and the cookie is used for nothing else", () => {
  assert.match(cookies, /shown only with most of its digits hidden/);
  assert.match(cookies, /advertising, cross-site tracking or analytics/);
  // The only reader of the cookie is the gate (buildGate), which returns a masked number.
  const readers = walk(appRoot)
    .concat(walk(srcRoot))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/__tests__|\.test\./.test(file))
    .filter((file) => /LEAD_COOKIE_NAME/.test(code(readFileSync(file, "utf8"))))
    .map((file) => path.basename(file))
    .sort();
  assert.deepEqual(readers, ["lead-cookie.ts", "lead-gate-actions.ts"]);
});

test("cookie policy: no longer claims we set a single cookie or that browser storage is never sent to us", () => {
  assert.doesNotMatch(cookies, /set one cookie ourselves/i);
  assert.doesNotMatch(cookies, /never sent to our servers/i);
  assert.match(cookies, /These values are not sent to our servers/);
});

// --- attribution in browser storage -------------------------------------------------------------------

test("cookie policy: the 'how you found us' storage is sent to the server ONLY with a request, as the policy says", () => {
  const storageUsers = walk(path.resolve(srcRoot, ".."))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/__tests__|\.test\./.test(file))
    .filter((file) => /readAttributionForSubmit/.test(code(readFileSync(file, "utf8"))))
    .map((file) => path.relative(path.resolve(srcRoot, ".."), file).split(path.sep).join("/"))
    .sort();
  assert.deepEqual(storageUsers, ["components/assistance-gate.tsx", "lib/leads/attribution-storage.ts"], "only the gate submission reads the stored touches");

  assert.match(cookies, /It is sent to our servers only if you send a request to connect with a developer/);
  assert.match(cookies, /stays in your browser's session storage and is cleared when you close the tab/);
  assert.match(cookies, /If you have accepted analytics cookies, a copy of the first arrival is also kept in local storage/);

  // The storage rules the policy states are the code's rules.
  const storage = code(read(srcRoot, "leads", "attribution-storage.ts"));
  assert.match(storage, /if \(analyticsAccepted\(\)\) localStorage\.setItem\(FIRST_TOUCH_KEY/);
  assert.doesNotMatch(storage.replace(/if \(analyticsAccepted\(\)\) localStorage\.setItem\(FIRST_TOUCH_KEY/, ""), /localStorage\.setItem\(CURRENT/, "the current touch never goes to local storage");
});

// --- commercial disclosure --------------------------------------------------------------------------------

const PAYMENT_SENTENCE = /may receive payment from developers or others in connection with property transactions/;
const NO_EFFECT = /no effect on whether a developer's website is verified/;

test("commercial disclosure: the SAME approved sentence is at the point of enquiry and in the Privacy Policy, as on About, Disclaimer and FAQ", () => {
  assert.match(COMMERCIAL_DISCLOSURE, PAYMENT_SENTENCE);
  assert.match(COMMERCIAL_DISCLOSURE, NO_EFFECT);
  assert.equal(gateCopy("Acme Realty").commercialDisclosure, COMMERCIAL_DISCLOSURE);
  assert.equal(gateCopy("Acme Realty", "PHONE_CALL").commercialDisclosure, COMMERCIAL_DISCLOSURE, "shown whichever channel is chosen");

  assert.match(section10A, PAYMENT_SENTENCE);
  assert.match(section10A, NO_EFFECT);
  for (const page of ["about/page.tsx", "disclaimer/page.tsx", "faq/page.tsx"]) {
    const text = plain(read(appRoot, ...page.split("/")));
    assert.match(text, PAYMENT_SENTENCE, `${page} keeps the approved disclosure`);
  }
});

test("commercial disclosure: states the relationship, and makes no claim about fees, independence, licensing or being a non-broker", () => {
  const stated = COMMERCIAL_DISCLOSURE + " " + section10A.slice(section10A.indexOf("Our commercial relationship"), section10A.indexOf("Erasure:"));
  for (const pattern of [
    /commission[- ]free|zero[- ](commission|brokerage)|no[- ]brokerage|brokerage[- ]free/i,
    /\bfree\b|no (fee|charge|cost)|at no cost/i,
    /independent|impartial|unbiased|neutral/i,
    /not (a|an) (broker|agent|intermediary)/i,
    /licen[cs]ed|RERA[- ]registered|registered (broker|agent)/i,
    /guarantee/i,
  ]) {
    assert.doesNotMatch(stated, pattern, `commercial wording matches ${pattern}`);
  }
});

// --- privacy 10A accuracy vs. implementation -----------------------------------------------------------------

test("privacy 10A: only claims to collect what the gate actually collects (no email is asked for)", () => {
  const gateService = code(read(srcRoot, "leads", "gate", "gate-service.ts"));
  assert.match(gateService, /email: null/, "the gate never takes an email");
  assert.doesNotMatch(section10A, /name and email|your email/i);
  assert.match(section10A, /your name if you give it/);
  assert.match(section10A, /your phone or WhatsApp number/);
});

test("privacy 10A: erasure — says how to ask, and describes what the code removes and keeps", () => {
  assert.match(section10A, /by emailing/);
  const section10ASource = privacySource.slice(privacySource.indexOf('title="10A.'), privacySource.indexOf('title="11.'));
  assert.ok(section10ASource.includes("mailto:${LEGAL_CONFIG.privacyEmail}"), "the address shown is the configured privacy contact");
  assert.ok(LEGAL_CONFIG.privacyEmail.includes("@"));
  assert.match(section10A, /remove your name, phone number, email, location and any free text we recorded/);
  assert.match(section10A, /withdraw your consent record/);
  assert.match(section10A, /an anonymised record of the enquiry/);
  assert.match(section10A, /If you enquire again afterwards, you are treated as a new enquiry/);

  // …which is what eraseLead does.
  const service = code(read(srcRoot, "leads", "lead-service.ts"));
  const erase = service.slice(service.indexOf("export async function eraseLead("));
  for (const field of ["name: null", "email: null", "phoneE164: null", "location: null", "sessionId: null", "userId: null", "nextFollowUpAt: null"]) {
    assert.match(erase, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `eraseLead clears ${field}`);
  }
  assert.match(erase, /withdrawActive/);
  assert.match(erase, /redactPayloads/);
  assert.match(erase, /"LEAD_ERASED"/);
});

test("legal pages: the 'last updated' date moved with this change", () => {
  assert.equal(LEGAL_CONFIG.lastUpdated, "2026-10-06");
});
