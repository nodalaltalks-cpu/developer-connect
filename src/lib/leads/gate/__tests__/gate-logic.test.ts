import { test } from "node:test";
import assert from "node:assert/strict";
import { GATE_ERROR_MESSAGES, gateCopy } from "../gate-copy.ts";
import * as gateConfig from "../gate-config.ts";
import { GATE_CONTACT_PREFERENCES, GATE_SOURCE_CTAS } from "../gate-config.ts";
import {
  actionForResult,
  gateReducer,
  initialGateState,
  runGateSubmit,
  type GateAction,
  type GateState,
  type GateSubmitResponse,
} from "../gate-flow.ts";
import { signLeadToken, verifyLeadToken } from "../lead-cookie.ts";
import { acquireModal, isOtherModalOpen, preemptModal, registerModalCloser, releaseModal } from "../../../modal-lock.ts";
import {
  attributionPayload,
  externalReferrer,
  nextCurrentTouch,
  nextFirstTouch,
  parseStoredTouch,
  touchFromLocation,
  type StoredTouch,
} from "../../attribution-client.ts";

// =================================================================================================
// COPY — what the buyer reads
// =================================================================================================

const DEV = "Acme Realty";
const allCopy = (preference: "WHATSAPP" | "PHONE_CALL" = "WHATSAPP") => Object.values(gateCopy(DEV, preference)).join("\n");

test("copy: says plainly that this is a Developer Connects enquiry to be connected with the developer", () => {
  const copy = gateCopy(DEV);
  assert.equal(copy.title, `Connect with ${DEV}`);
  assert.match(copy.intro, /You've found the developer you're interested in/);
  assert.match(copy.intro, /Share your details with Developer Connects/);
  assert.match(copy.intro, /help connect you based on your requirement/);
  assert.match(copy.transparency, /Developer Connects/);
  assert.match(copy.transparency, /property team/i);
});

test("copy: says plainly that the DEVELOPER does not require the buyer's number, and that Developer Connects is not the developer", () => {
  const { transparency } = gateCopy(DEV);
  assert.match(transparency, new RegExp(`${DEV} does not require your phone number through this flow`));
  assert.match(transparency, new RegExp(`we are not ${DEV}`));
});

test("copy: says plainly that the buyer is VOLUNTARILY sharing details with Developer Connects", () => {
  const { transparency, consent } = gateCopy(DEV);
  assert.match(transparency, /You're sharing your details with Developer Connects/);
  assert.match(consent, /I agree that Developer Connects may contact me/);
  assert.match(consent, /sharing these details with Developer Connects, not with the developer/);
});

test("copy: says what happens next — Developer Connects contacts them; they are NOT sent to another website", () => {
  const copy = gateCopy(DEV);
  assert.equal(copy.submit, "Request a connection");
  assert.match(copy.submitHint, /Developer Connects will contact you on WhatsApp/);
  assert.match(copy.submitHint, /won't be sent to another website/);
  assert.equal(copy.verifiedNote, `Your request goes to the Developer Connects advisory team for ${DEV}.`);
  assert.match(copy.successTitle, /we've received your request/);
  assert.match(copy.successBody, new RegExp(`will contact you on WhatsApp to help connect you with ${DEV}`));
});

test("copy: contains no URL, domain, link or outbound wording anywhere", () => {
  const text = allCopy() + allCopy("PHONE_CALL") + Object.values(GATE_ERROR_MESSAGES).join("\n");
  for (const pattern of [/https?:\/\//i, /\bwww\./i, /\b[a-z0-9-]+\.(com|in|ae|net|org|co|example)\b/i, /new tab/i, /opens .* in a/i, /visit/i, /continue to (the |its |their )?(official |developer)/i, /popup|pop-up/i]) {
    assert.doesNotMatch(text, pattern, `copy matches ${pattern}`);
  }
});

test("copy: never implies the developer requires the number or that the number unlocks anything", () => {
  const text = allCopy() + Object.values(GATE_ERROR_MESSAGES).join("\n");
  const forbidden = [
    /developer (requires|needs|asks for|demands|wants) (your|a) (phone|number|whatsapp)/i,
    /required by (the )?developer/i,
    /to (unlock|access|view|see) (the )?(official )?(website|site|details|brochure|price)/i,
    /mandatory/i,
    /must (provide|enter|share)/i,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(text, pattern, `copy matches ${pattern}`);
});

test("copy: makes no unsupported commercial claim and never presents Developer Connects as the developer", () => {
  const text = allCopy() + allCopy("PHONE_CALL") + Object.values(GATE_ERROR_MESSAGES).join("\n");
  for (const pattern of [/zero[- ](commission|brokerage)/i, /no[- ]brokerage/i, /brokerage[- ]free/i, /commission[- ]free/i, /free of (cost|charge)/i, /\bfree\b/i, /we are (the |your )?developer/i, /we (build|sell) (these )?(homes|properties)/i]) {
    assert.doesNotMatch(text, pattern, `copy matches ${pattern}`);
  }
});

test("copy: no urgency, scarcity, countdown or guilt (no dark patterns)", () => {
  const text = allCopy();
  for (const pattern of [/hurry/i, /limited (time|offer|slots|units)/i, /only \d+ left/i, /last chance/i, /don't miss/i, /act now/i, /expires/i, /countdown/i, /exclusive deal/i, /no thanks, i (don't|do not)/i]) {
    assert.doesNotMatch(text, pattern, `copy matches ${pattern}`);
  }
});

test("copy: the button says what it does, and there is no misleading 'skip' / 'maybe later' that leaves without the save", () => {
  assert.equal(gateCopy(DEV).submit, "Request a connection");
  assert.equal(gateCopy(DEV).returningContinue, "Request a connection");
  assert.doesNotMatch(allCopy(), /skip|continue without|maybe later|no thanks/i);
});

test("copy: the consent wording follows the chosen channel (WhatsApp is the default)", () => {
  assert.match(gateCopy(DEV).consent, /on WhatsApp/);
  assert.match(gateCopy(DEV, "PHONE_CALL").consent, /by phone call/);
  assert.match(gateCopy(DEV, "PHONE_CALL").successBody, /by phone call/);
  assert.equal(GATE_CONTACT_PREFERENCES[0], "WHATSAPP", "WhatsApp is the primary option");
  assert.deepEqual([...GATE_CONTACT_PREFERENCES], ["WHATSAPP", "PHONE_CALL"]);
});

test("copy: every error message is calm, actionable and none suggests skipping the gate", () => {
  for (const [code, message] of Object.entries(GATE_ERROR_MESSAGES)) {
    assert.ok(message.length > 20, code);
    assert.doesNotMatch(message, /skip|bypass|continue anyway|ignore/i, code);
  }
  assert.match(GATE_ERROR_MESSAGES.TEMPORARY_FAILURE, /request hasn't been sent/);
  assert.match(GATE_ERROR_MESSAGES.TEMPORARY_FAILURE, /try again/i);
});

test("copy: the returning-buyer text says who they continue as and why", () => {
  const copy = gateCopy(DEV, "WHATSAPP");
  assert.match(copy.returningBody, /on WhatsApp/);
  assert.match(copy.returningBody, new RegExp(`connect with ${DEV}`));
  assert.equal(copy.useDifferentNumber, "Use a different number");
});

// =================================================================================================
// CONFIG
// =================================================================================================

test("config: the gate has NO operating modes and no environment switch — nothing can turn it off or reveal a developer URL", async () => {
  assert.equal("getGateMode" in gateConfig, false);
  assert.equal("parseGateMode" in gateConfig, false);
  const { readFileSync } = await import("node:fs");
  for (const file of ["../../../../app/_actions/lead-gate-actions.ts", "../../../../app/developers/[slug]/page.tsx", "../gate-config.ts", "../gate-service.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.doesNotMatch(source, /LEAD_GATE_MODE|getGateMode|GateMode/, `${file} still refers to a gate mode`);
  }
});

test("docs: the lead README documents the returning-buyer variable, where it is read, and the launch blockers", async () => {
  const { readFileSync } = await import("node:fs");
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  assert.match(readme, /`LEAD_COOKIE_SECRET`/);
  assert.match(readme, /Optional/);
  assert.match(readme, /src\/app\/_actions\/lead-gate-actions\.ts/);
  assert.match(readme, /src\/lib\/leads\/gate\/lead-cookie\.ts/);
  assert.match(readme, /Production Clerk instance/);
  assert.match(readme, /Legal review/);
  assert.doesNotMatch(readme, /\| `LEAD_GATE_MODE` \|/, "the removed gate switch must not be documented as a variable");
  // The file it points to really reads that variable.
  const actions = readFileSync(new URL("../../../../app/_actions/lead-gate-actions.ts", import.meta.url), "utf8");
  assert.match(actions, /process\.env\.LEAD_COOKIE_SECRET/);
});

test("config: the surfaces that may open the gate are an explicit allowlist", () => {
  assert.deepEqual([...GATE_SOURCE_CTAS], ["developer_page", "directory_card", "other"]);
});

// =================================================================================================
// STATE MACHINE
// =================================================================================================

function run(actions: GateAction[], from: GateState = initialGateState()): GateState {
  return actions.reduce(gateReducer, from);
}

test("state: starts loading, then shows the form for a new buyer", () => {
  assert.equal(initialGateState().phase, "loading");
  const state = run([{ type: "LOADED_NEW" }]);
  assert.equal(state.phase, "form");
  assert.equal(state.form.preference, "WHATSAPP", "WhatsApp is preselected");
  assert.equal(state.form.country, "IN");
  assert.equal(state.success, null);
});

test("state: a returning buyer sees the one-tap card with their MASKED number", () => {
  const state = run([{ type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "PHONE_CALL" }]);
  assert.equal(state.phase, "returning");
  assert.equal(state.returning?.maskedPhone, "+91 ••••••210");
  assert.equal(state.success, null, "nothing is confirmed until a submit succeeds");
});

test("state: 'use a different number' returns to the form and forgets the returning identity", () => {
  const state = run([{ type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" }, { type: "USE_DIFFERENT_NUMBER" }]);
  assert.equal(state.phase, "form");
  assert.equal(state.returning, null);
});

test("state: typing edits the form; an error clears and the form returns when the buyer edits", () => {
  let state = run([{ type: "LOADED_NEW" }, { type: "EDIT", patch: { phone: "98765" } }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_ERROR", code: "INVALID_PHONE", message: "bad", field: "phone" }]);
  assert.equal(state.phase, "error");
  assert.equal(state.form.phone, "98765", "what they typed is kept");
  state = gateReducer(state, { type: "EDIT", patch: { phone: "98765 43210" } });
  assert.equal(state.phase, "form");
  assert.equal(state.error, null);
});

test("state: submitting cannot be started twice (no double submission)", () => {
  const once = run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }]);
  assert.equal(once.phase, "submitting");
  assert.strictEqual(gateReducer(once, { type: "SUBMIT_START", attempt: "form" }), once);
});

test("state: SUCCESS is reachable only from a submit in flight, and carries only the masked number and the channel", () => {
  const done = run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_SUCCEEDED", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" }]);
  assert.equal(done.phase, "success");
  assert.deepEqual(done.success, { maskedPhone: "+91 ••••••210", preference: "WHATSAPP" });
  // A stray success while the form is merely open changes nothing.
  const form = run([{ type: "LOADED_NEW" }]);
  assert.strictEqual(gateReducer(form, { type: "SUBMIT_SUCCEEDED", maskedPhone: "x", preference: "WHATSAPP" }), form);
});

test("state: FAILURE — an error never reaches success without a new submit", () => {
  let state = run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_ERROR", code: "TEMPORARY_FAILURE", message: GATE_ERROR_MESSAGES.TEMPORARY_FAILURE }]);
  assert.equal(state.phase, "error");
  assert.equal(state.success, null);
  // Stray late events cannot turn an error into a success.
  assert.strictEqual(gateReducer(state, { type: "SUBMIT_SUCCEEDED", maskedPhone: "x", preference: "WHATSAPP" }), state);
  // Retrying is a fresh submit, remembering which kind it was.
  state = gateReducer(state, { type: "SUBMIT_START", attempt: "form" });
  assert.equal(state.phase, "submitting");
  assert.equal(state.lastAttempt, "form");
});

test("state: a failed returning-buyer continue can be retried as a returning continue, or switched to the form", () => {
  let state = run([
    { type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" },
    { type: "SUBMIT_START", attempt: "returning" },
    { type: "SUBMIT_ERROR", code: "TEMPORARY_FAILURE", message: "x" },
  ]);
  assert.equal(state.phase, "error");
  assert.equal(state.lastAttempt, "returning");
  state = gateReducer(state, { type: "USE_DIFFERENT_NUMBER" });
  assert.equal(state.phase, "form");
});

test("state: a lost-session load failure is an error, not a way through", () => {
  const state = run([{ type: "LOAD_FAILED", code: "NOT_VERIFIED", message: GATE_ERROR_MESSAGES.NOT_VERIFIED }]);
  assert.equal(state.phase, "error");
  assert.equal(state.success, null);
});

test("state: no state and no action can carry a URL or domain (the state machine has no field for one)", () => {
  const everything = JSON.stringify([
    initialGateState(),
    run([{ type: "LOADED_NEW" }]),
    run([{ type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" }]),
    run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_SUCCEEDED", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" }]),
    run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_ERROR", code: "INVALID_PHONE", message: "m" }]),
  ]);
  assert.doesNotMatch(everything, /destination|https?:|\.example|\.com/i);
});

// =================================================================================================
// SUBMIT ORCHESTRATION (what happens when the button is pressed)
// =================================================================================================

const OK: GateSubmitResponse = { ok: true, maskedPhone: "+91 ••••••210", contactPreference: "WHATSAPP" };

test("submit: success returns only the masked number and the channel — there is nothing to navigate to", async () => {
  const result = await runGateSubmit({ submit: async () => OK }, {});
  assert.deepEqual(result, { kind: "success", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" });
  assert.deepEqual(actionForResult(result), { type: "SUBMIT_SUCCEEDED", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" });
});

test("submit: an invalid phone is an error with the field named", async () => {
  const result = await runGateSubmit(
    { submit: async () => ({ ok: false, code: "INVALID_PHONE", message: GATE_ERROR_MESSAGES.INVALID_PHONE, field: "phone" }) },
    {},
  );
  assert.deepEqual(result, { kind: "error", code: "INVALID_PHONE", message: GATE_ERROR_MESSAGES.INVALID_PHONE, field: "phone" });
});

test("submit: a server failure (rejected promise) is a retryable error, never a success", async () => {
  const result = await runGateSubmit({ submit: async () => Promise.reject(new Error("network down")) }, {});
  assert.equal(result.kind, "error");
  assert.equal(result.kind === "error" && result.code, "TEMPORARY_FAILURE");
});

test("submit: every failure code leaves the buyer on the gate with a retry — none is a success", async () => {
  for (const code of Object.keys(GATE_ERROR_MESSAGES) as Array<keyof typeof GATE_ERROR_MESSAGES>) {
    const result = await runGateSubmit({ submit: async () => ({ ok: false, code, message: GATE_ERROR_MESSAGES[code] }) }, {});
    assert.equal(result.kind, "error", code);
    assert.equal(actionForResult(result).type, "SUBMIT_ERROR");
  }
});

// =================================================================================================
// RETURNING-BUYER COOKIE
// =================================================================================================

const SECRET = "test-secret-123456789";
const LEAD = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-10T12:00:00.000Z");

test("cookie: a signed token round-trips to the lead id", () => {
  const token = signLeadToken(LEAD, SECRET, NOW, 3600)!;
  assert.equal(verifyLeadToken(token, SECRET, NOW), LEAD);
});

test("cookie: it holds an id and an expiry only — no phone, name or email", () => {
  const token = signLeadToken(LEAD, SECRET, NOW, 3600)!;
  assert.doesNotMatch(token, /\+91|@|9876/);
  assert.equal(token.split(".").length, 4);
});

test("cookie: expired, tampered, wrong-secret, wrong-version and malformed tokens all verify as 'no lead'", () => {
  const token = signLeadToken(LEAD, SECRET, NOW, 3600)!;
  const later = new Date(NOW.getTime() + 2 * 3_600_000);
  assert.equal(verifyLeadToken(token, SECRET, later), null, "expired");
  assert.equal(verifyLeadToken(token, "another-secret", NOW), null, "wrong secret");

  const [v, , expiry, sig] = token.split(".");
  const otherLead = "22222222-2222-4222-8222-222222222222";
  assert.equal(verifyLeadToken(`${v}.${otherLead}.${expiry}.${sig}`, SECRET, NOW), null, "swapped lead id");
  assert.equal(verifyLeadToken(`${v}.${LEAD}.${Number(expiry) + 99999}.${sig}`, SECRET, NOW), null, "extended expiry");
  assert.equal(verifyLeadToken(`v2.${LEAD}.${expiry}.${sig}`, SECRET, NOW), null, "wrong version");
  for (const junk of ["", "x", "a.b.c", "a.b.c.d.e", "v1.not-a-uuid.123.sig"]) assert.equal(verifyLeadToken(junk, SECRET, NOW), null, junk);
  assert.equal(verifyLeadToken(undefined, SECRET, NOW), null);
  assert.equal(verifyLeadToken(null, SECRET, NOW), null);
});

test("cookie: with NO secret configured the feature is simply off — never an unsigned, forgeable value", () => {
  assert.equal(signLeadToken(LEAD, undefined, NOW, 3600), null);
  assert.equal(signLeadToken(LEAD, "", NOW, 3600), null);
  const token = signLeadToken(LEAD, SECRET, NOW, 3600)!;
  assert.equal(verifyLeadToken(token, undefined, NOW), null);
});

// =================================================================================================
// ONE MODAL AT A TIME (gate vs sign-in prompt)
// =================================================================================================

test("modal lock: the first modal wins, a second is refused, and release lets the next in", () => {
  const store = {} as { __dcModalHolder?: string | null };
  assert.equal(acquireModal("assistance-gate", store), true);
  assert.equal(acquireModal("login-prompt", store), false, "the sign-in prompt cannot open over the gate");
  assert.equal(isOtherModalOpen("login-prompt", store), true);
  releaseModal("login-prompt", store); // a non-holder cannot release someone else's lock
  assert.equal(isOtherModalOpen("login-prompt", store), true);
  releaseModal("assistance-gate", store);
  assert.equal(isOtherModalOpen("login-prompt", store), false);
  assert.equal(acquireModal("login-prompt", store), true);
  assert.equal(acquireModal("assistance-gate", store), false, "a plain acquire never takes a lock someone else holds");
});

test("modal lock: the gate PRE-EMPTS an open sign-in prompt — the prompt is asked to close and the lock moves, so the button is never a dead end", () => {
  const store = {} as { __dcModalHolder?: string | null; __dcModalClosers?: Record<string, (() => void) | undefined> };
  let promptClosed = 0;
  registerModalCloser("login-prompt", () => (promptClosed += 1), store);
  assert.equal(acquireModal("login-prompt", store), true);

  preemptModal("assistance-gate", store);
  assert.equal(promptClosed, 1, "the prompt was asked to close");
  assert.equal(store.__dcModalHolder, "assistance-gate", "the gate now holds the lock");
  releaseModal("login-prompt", store); // the prompt's own cleanup runs afterwards and must not release the gate's lock
  assert.equal(store.__dcModalHolder, "assistance-gate");
  releaseModal("assistance-gate", store);
  assert.equal(store.__dcModalHolder, null);
});

test("modal lock: pre-empting when nothing is open just takes the lock; and the prompt can NEVER pre-empt the gate", () => {
  const store = {} as { __dcModalHolder?: string | null; __dcModalClosers?: Record<string, (() => void) | undefined> };
  let gateClosed = 0;
  registerModalCloser("assistance-gate", () => (gateClosed += 1), store);
  preemptModal("assistance-gate", store);
  assert.equal(store.__dcModalHolder, "assistance-gate");
  assert.equal(gateClosed, 0, "nothing was closed");
  // The prompt only ever calls acquireModal / isOtherModalOpen — never preemptModal — so it cannot displace the gate.
  assert.equal(acquireModal("login-prompt", store), false);
  assert.equal(gateClosed, 0);
});

test("modal lock: an unregistered closer is not called, and unregistering removes it", () => {
  const store = {} as { __dcModalHolder?: string | null; __dcModalClosers?: Record<string, (() => void) | undefined> };
  let closed = 0;
  const unregister = registerModalCloser("login-prompt", () => (closed += 1), store);
  unregister();
  acquireModal("login-prompt", store);
  preemptModal("assistance-gate", store);
  assert.equal(closed, 0);
});

test("modal lock: re-acquiring your own lock is fine", () => {
  const store = {} as { __dcModalHolder?: string | null };
  assert.equal(acquireModal("a", store), true);
  assert.equal(acquireModal("a", store), true);
});

// =================================================================================================
// BROWSER ATTRIBUTION RULES
// =================================================================================================

const at = (iso: string) => new Date(iso);
function touch(search: string, overrides: { referrer?: string; pathname?: string; when?: string } = {}): StoredTouch {
  return touchFromLocation({ search, pathname: overrides.pathname ?? "/developers/acme", referrer: overrides.referrer ?? "", ownHost: "developerconnects.com", now: at(overrides.when ?? "2026-10-01T10:00:00.000Z") });
}

test("attribution: UTM parameters and click ids are read from the landing URL", () => {
  const t = touch("?utm_source=Google&utm_medium=cpc&utm_campaign=brand&utm_content=ad1&utm_term=flats&gclid=G1&fbclid=F1");
  assert.deepEqual([t.utmSource, t.utmMedium, t.utmCampaign, t.utmContent, t.utmTerm, t.gclid, t.fbclid], ["Google", "cpc", "brand", "ad1", "flats", "G1", "F1"]);
  assert.equal(t.landingPath, "/developers/acme");
});

test("attribution: only an EXTERNAL referrer counts, reduced to origin + path", () => {
  assert.equal(externalReferrer("https://www.google.com/search?q=secret", "developerconnects.com"), "https://www.google.com/search");
  assert.equal(externalReferrer("https://developerconnects.com/faq", "developerconnects.com"), null);
  assert.equal(externalReferrer("", "developerconnects.com"), null);
  assert.equal(externalReferrer("android-app://x", "developerconnects.com"), null);
});

test("attribution: a new campaign arrival replaces the current touch; a plain page view keeps it", () => {
  const google = touch("?utm_source=google&utm_medium=cpc", { when: "2026-10-01T10:00:00.000Z" });
  const plain = touch("", { when: "2026-10-01T10:05:00.000Z" });
  const meta = touch("?utm_source=meta&utm_medium=paid", { when: "2026-10-01T10:10:00.000Z" });
  assert.equal(nextCurrentTouch(null, google), google);
  assert.equal(nextCurrentTouch(google, plain), google, "a plain view does not erase the campaign");
  assert.equal(nextCurrentTouch(google, meta), meta, "a new campaign wins");
  assert.equal(nextCurrentTouch(null, plain), plain, "with nothing stored, even 'direct' is recorded");
});

test("attribution: the FIRST touch is never replaced — except upgrading a 'direct' one once a real signal appears", () => {
  const direct = touch("", { when: "2026-10-01T10:00:00.000Z" });
  const google = touch("?utm_source=google", { when: "2026-10-02T10:00:00.000Z" });
  const meta = touch("?utm_source=meta", { when: "2026-10-03T10:00:00.000Z" });
  assert.equal(nextFirstTouch(null, direct), direct);
  assert.equal(nextFirstTouch(direct, google), google, "'direct' only meant we had not seen the arrival yet");
  assert.equal(nextFirstTouch(google, meta), google, "a real first touch is permanent");
  assert.equal(nextFirstTouch(google, direct), google);
});

test("attribution: stored values parse defensively — junk is ignored", () => {
  assert.equal(parseStoredTouch("not json"), null);
  assert.equal(parseStoredTouch("{}"), null);
  assert.equal(parseStoredTouch(null), null);
  const good = parseStoredTouch(JSON.stringify(touch("?utm_source=x")));
  assert.equal(good?.utmSource, "x");
});

test("attribution: the payload omits a first touch identical to the current one (no duplicate row for a first visit)", () => {
  const only = touch("?utm_source=google");
  assert.equal(attributionPayload(only, only).firstTouch, null);
  const earlier = touch("?utm_source=meta", { when: "2026-09-01T10:00:00.000Z" });
  assert.equal(attributionPayload(only, earlier).firstTouch, earlier);
  assert.deepEqual(attributionPayload(null, null), { firstTouch: null });
});
