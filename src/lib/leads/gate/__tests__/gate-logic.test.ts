import { test } from "node:test";
import assert from "node:assert/strict";
import { GATE_ERROR_MESSAGES, gateCopy } from "../gate-copy.ts";
import { GATE_CONTACT_PREFERENCES, GATE_SOURCE_CTAS, getGateMode, parseGateMode } from "../gate-config.ts";
import {
  actionForResult,
  gateReducer,
  initialGateState,
  runGateSubmit,
  type GateAction,
  type GateState,
  type GateSubmitResponse,
  type TabHandle,
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
const DOMAIN = "acme.example";
const allCopy = (preference: "WHATSAPP" | "PHONE_CALL" = "WHATSAPP") => Object.values(gateCopy(DEV, DOMAIN, preference)).join("\n");

test("copy: says plainly that this is a Developer Connects property-assistance enquiry", () => {
  const copy = gateCopy(DEV, DOMAIN);
  assert.match(copy.intro, /property assistance from Developer Connects/i);
  assert.match(copy.transparency, /Developer Connects/);
  assert.match(copy.transparency, /property team/i);
});

test("copy: says plainly that the DEVELOPER does not need the buyer's number", () => {
  const { transparency } = gateCopy(DEV, DOMAIN);
  assert.match(transparency, new RegExp(`${DEV} does not need your phone number to view its website`));
});

test("copy: says plainly that the buyer is VOLUNTARILY sharing details with Developer Connects", () => {
  const { transparency, consent } = gateCopy(DEV, DOMAIN);
  assert.match(transparency, /You're choosing to share your details with Developer Connects/);
  assert.match(consent, /I agree that Developer Connects may contact me/);
  assert.match(consent, /sharing these details with Developer Connects, not with the developer/);
});

test("copy: says what happens next — they continue to the verified official website", () => {
  const copy = gateCopy(DEV, DOMAIN);
  assert.equal(copy.submit, "Continue to official website");
  assert.equal(copy.submitHint, `Opens ${DOMAIN} in a new tab`);
  assert.match(copy.verifiedNote, new RegExp(`${DOMAIN} is the official website Developer Connects has verified for ${DEV}`));
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

test("copy: no urgency, scarcity, countdown or guilt (no dark patterns)", () => {
  const text = allCopy();
  for (const pattern of [/hurry/i, /limited (time|offer|slots|units)/i, /only \d+ left/i, /last chance/i, /don't miss/i, /act now/i, /expires/i, /countdown/i, /exclusive deal/i, /no thanks, i (don't|do not)/i]) {
    assert.doesNotMatch(text, pattern, `copy matches ${pattern}`);
  }
});

test("copy: the button says what it does, and there is no misleading 'skip' / 'maybe later' that leaves without the save", () => {
  const copy = gateCopy(DEV, DOMAIN);
  assert.equal(copy.submit, "Continue to official website");
  assert.doesNotMatch(allCopy(), /skip|continue without|maybe later|no thanks/i);
});

test("copy: the consent wording follows the chosen channel (WhatsApp is the default)", () => {
  assert.match(gateCopy(DEV, DOMAIN).consent, /on WhatsApp/);
  assert.match(gateCopy(DEV, DOMAIN, "PHONE_CALL").consent, /by phone call/);
  assert.equal(GATE_CONTACT_PREFERENCES[0], "WHATSAPP", "WhatsApp is the primary option");
  assert.deepEqual([...GATE_CONTACT_PREFERENCES], ["WHATSAPP", "PHONE_CALL"]);
});

test("copy: every error message is calm, actionable and none suggests skipping the gate", () => {
  for (const [code, message] of Object.entries(GATE_ERROR_MESSAGES)) {
    assert.ok(message.length > 20, code);
    assert.doesNotMatch(message, /skip|bypass|continue anyway|ignore/i, code);
  }
  assert.match(GATE_ERROR_MESSAGES.TEMPORARY_FAILURE, /haven't opened the website/);
  assert.match(GATE_ERROR_MESSAGES.TEMPORARY_FAILURE, /try again/i);
});

test("copy: the returning-buyer text says who they continue as and why", () => {
  const copy = gateCopy(DEV, DOMAIN, "WHATSAPP");
  assert.match(copy.returningBody, /on WhatsApp/);
  assert.match(copy.returningBody, new RegExp(`${DEV}'s official website`));
  assert.equal(copy.useDifferentNumber, "Use a different number");
});

// =================================================================================================
// CONFIG
// =================================================================================================

test("config: the gate is REQUIRED unless the operator explicitly writes 'off'; a typo can only make it stricter", () => {
  assert.equal(parseGateMode(undefined), "required");
  assert.equal(parseGateMode(""), "required");
  assert.equal(parseGateMode("required"), "required");
  assert.equal(parseGateMode("REQUIRED"), "required");
  assert.equal(parseGateMode("of"), "required");
  assert.equal(parseGateMode("false"), "required");
  assert.equal(parseGateMode("0"), "required");
  assert.equal(parseGateMode("off"), "off");
  assert.equal(parseGateMode(" OFF "), "off");
  assert.equal(getGateMode({}), "required");
  assert.equal(getGateMode({ LEAD_GATE_MODE: "off" }), "off", "allowed outside production (e.g. a preview deployment)");
  assert.equal(getGateMode({ LEAD_GATE_MODE: "off", VERCEL_ENV: "preview" }), "off");
  assert.equal(getGateMode({ LEAD_GATE_MODE: "off", VERCEL_ENV: "development" }), "off");
});

test("config: on Vercel PRODUCTION the gate is always required — the off switch is not even read there", () => {
  assert.equal(getGateMode({ VERCEL_ENV: "production" }), "required");
  assert.equal(getGateMode({ VERCEL_ENV: "production", LEAD_GATE_MODE: "off" }), "required");
  assert.equal(getGateMode({ VERCEL_ENV: "production", LEAD_GATE_MODE: " OFF " }), "required");
  assert.equal(getGateMode({ VERCEL_ENV: "production", LEAD_GATE_MODE: "required" }), "required");
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
  assert.equal(state.destinationUrl, null);
});

test("state: a returning buyer sees the one-tap card with their MASKED number", () => {
  const state = run([{ type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "PHONE_CALL" }]);
  assert.equal(state.phase, "returning");
  assert.equal(state.returning?.maskedPhone, "+91 ••••••210");
  assert.equal(state.destinationUrl, null, "no destination until a submit succeeds");
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

test("state: SUCCESS — a destination exists only after a server-approved redirect, and only in the blocked-popup case", () => {
  const redirected = run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_REDIRECTED" }]);
  assert.equal(redirected.phase, "success");
  assert.equal(redirected.destinationUrl, null, "the tab was already navigated; no URL is kept in state");

  const blocked = run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_BLOCKED", destinationUrl: "https://acme.example/" }]);
  assert.equal(blocked.phase, "blocked");
  assert.equal(blocked.destinationUrl, "https://acme.example/");
});

test("state: FAILURE — an error never holds a destination and never reaches success without a new submit", () => {
  let state = run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_ERROR", code: "TEMPORARY_FAILURE", message: GATE_ERROR_MESSAGES.TEMPORARY_FAILURE }]);
  assert.equal(state.phase, "error");
  assert.equal(state.destinationUrl, null);
  // Stray late events cannot turn an error into a success.
  assert.strictEqual(gateReducer(state, { type: "SUBMIT_REDIRECTED" }), state);
  assert.strictEqual(gateReducer(state, { type: "SUBMIT_BLOCKED", destinationUrl: "https://evil.example/" }), state);
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
  assert.equal(state.destinationUrl, null);
});

test("state: the only transitions that set a destination are the operator escape hatch and a server-approved blocked-popup result", () => {
  const sources = [
    { type: "LOADED_NEW" } as GateAction,
    { type: "LOADED_RETURNING", maskedPhone: "m", preference: "WHATSAPP" } as GateAction,
    { type: "SUBMIT_ERROR", code: "INVALID_PHONE", message: "m" } as GateAction,
    { type: "EDIT", patch: { phone: "1" } } as GateAction,
    { type: "USE_DIFFERENT_NUMBER" } as GateAction,
  ];
  for (const action of sources) {
    for (const start of [initialGateState(), run([{ type: "LOADED_NEW" }]), run([{ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }])]) {
      assert.equal(gateReducer(start, action).destinationUrl, null, `${action.type} produced a destination`);
    }
  }
});

// =================================================================================================
// SUBMIT ORCHESTRATION (what happens when the button is pressed)
// =================================================================================================

function fakeTab() {
  const calls: string[] = [];
  const tab: TabHandle = { navigate: (url) => calls.push(`navigate:${url}`), close: () => calls.push("close") };
  return { tab, calls };
}
const OK: GateSubmitResponse = { ok: true, destinationUrl: "https://acme.example/", destinationDomain: "acme.example", maskedPhone: "+91 ••••••210", contactPreference: "WHATSAPP" };

test("submit: the tab is opened SYNCHRONOUSLY, before the server is asked (so popup blockers allow it)", async () => {
  const order: string[] = [];
  const { tab } = fakeTab();
  const promise = runGateSubmit(
    {
      openTab: () => {
        order.push("openTab");
        return tab;
      },
      submit: async () => {
        order.push("submit");
        return OK;
      },
    },
    {},
  );
  assert.deepEqual(order, ["openTab", "submit"], "openTab ran in the same tick as the call, before any await");
  await promise;
});

test("submit: success navigates the pre-opened tab to the SERVER's URL", async () => {
  const { tab, calls } = fakeTab();
  const result = await runGateSubmit({ openTab: () => tab, submit: async () => OK }, {});
  assert.deepEqual(result, { kind: "redirected" });
  assert.deepEqual(calls, ["navigate:https://acme.example/"]);
});

test("submit: a blocked popup still succeeds — the details are saved and the buyer gets a real link to click", async () => {
  const result = await runGateSubmit({ openTab: () => null, submit: async () => OK }, {});
  assert.deepEqual(result, { kind: "blocked", destinationUrl: "https://acme.example/" });
});

test("submit: an invalid phone is an error — the tab is CLOSED and nothing is navigated", async () => {
  const { tab, calls } = fakeTab();
  const result = await runGateSubmit(
    { openTab: () => tab, submit: async () => ({ ok: false, code: "INVALID_PHONE", message: GATE_ERROR_MESSAGES.INVALID_PHONE, field: "phone" }) },
    {},
  );
  assert.deepEqual(result, { kind: "error", code: "INVALID_PHONE", message: GATE_ERROR_MESSAGES.INVALID_PHONE, field: "phone" });
  assert.deepEqual(calls, ["close"]);
});

test("submit: a server failure (rejected promise) is a retryable error — NEVER a navigation", async () => {
  const { tab, calls } = fakeTab();
  const result = await runGateSubmit({ openTab: () => tab, submit: async () => Promise.reject(new Error("network down")) }, {});
  assert.equal(result.kind, "error");
  assert.equal(result.kind === "error" && result.code, "TEMPORARY_FAILURE");
  assert.deepEqual(calls, ["close"]);
});

test("submit: every failure code leaves the buyer on the gate with a retry — none navigates", async () => {
  for (const code of Object.keys(GATE_ERROR_MESSAGES) as Array<keyof typeof GATE_ERROR_MESSAGES>) {
    const { tab, calls } = fakeTab();
    const result = await runGateSubmit({ openTab: () => tab, submit: async () => ({ ok: false, code, message: GATE_ERROR_MESSAGES[code] }) }, {});
    assert.equal(result.kind, "error", code);
    assert.ok(!calls.some((call) => call.startsWith("navigate")), `${code} navigated`);
    assert.equal(actionForResult(result).type, "SUBMIT_ERROR");
  }
});

test("submit: results map onto the right state-machine actions", () => {
  assert.deepEqual(actionForResult({ kind: "redirected" }), { type: "SUBMIT_REDIRECTED" });
  assert.deepEqual(actionForResult({ kind: "blocked", destinationUrl: "https://a.example/" }), { type: "SUBMIT_BLOCKED", destinationUrl: "https://a.example/" });
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
