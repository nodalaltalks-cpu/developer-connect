import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistanceGateView, type AssistanceGateViewProps } from "../assistance-gate-view.tsx";
import { gateCopy } from "../../lib/leads/gate/gate-copy.ts";
import { gateReducer, initialGateState, type GateAction, type GateState } from "../../lib/leads/gate/gate-flow.ts";

/**
 * Renders the REAL gate component (its pure view) in every state and checks
 * what a buyer would see and how it behaves on a phone. Run with
 * `node --import tsx --test` (the component is TSX).
 */

const DEV = "Acme Realty";
const DOMAIN = "acme.example";
const DESTINATION = "https://acme.example/";

const noop = () => {};
const baseProps = (state: GateState): AssistanceGateViewProps => ({
  state,
  copy: gateCopy(DEV, DOMAIN, state.form.preference),
  onEdit: noop,
  onSubmit: noop,
  onContinueReturning: noop,
  onUseDifferentNumber: noop,
  onRetry: noop,
  onClose: noop,
});

const html = (state: GateState) => renderToStaticMarkup(<AssistanceGateView {...baseProps(state)} />);
const reduce = (...actions: GateAction[]) => actions.reduce(gateReducer, initialGateState());

const STATES = {
  loading: initialGateState(),
  form: reduce({ type: "LOADED_NEW" }),
  formTyped: reduce({ type: "LOADED_NEW" }, { type: "EDIT", patch: { phone: "98765 43210", name: "Asha" } }),
  returning: reduce({ type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" }),
  submitting: reduce({ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }),
  returningSubmitting: reduce({ type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" }, { type: "SUBMIT_START", attempt: "returning" }),
  failure: reduce({ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_ERROR", code: "TEMPORARY_FAILURE", message: "We couldn't save your details just now, so we haven't opened the website. Please try again in a moment." }),
  invalidPhone: reduce({ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_ERROR", code: "INVALID_PHONE", message: "Please enter a valid WhatsApp or phone number.", field: "phone" }),
  returningFailure: reduce({ type: "LOADED_RETURNING", maskedPhone: "+91 ••••••210", preference: "WHATSAPP" }, { type: "SUBMIT_START", attempt: "returning" }, { type: "SUBMIT_ERROR", code: "TEMPORARY_FAILURE", message: "We couldn't save your details just now, so we haven't opened the website." }),
  success: reduce({ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_REDIRECTED" }),
  blocked: reduce({ type: "LOADED_NEW" }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_BLOCKED", destinationUrl: DESTINATION }),
};

// =================================================================================================
// GATE RENDERING — the form
// =================================================================================================

test("render: the form states the purpose, the transparency note and the developer's name", () => {
  const out = html(STATES.form);
  assert.match(out, /Looking for a property from Acme Realty\?/);
  assert.match(out, /personalised property assistance from Developer Connects/);
  assert.match(out, /Acme Realty does not need your phone number to view its website/);
  assert.match(out, /You&#x27;re choosing to share your details with Developer Connects/);
  assert.match(out, /acme\.example is the official website Developer Connects has verified for Acme Realty/);
});

test("render: the submit button reads 'Continue to official website' and says where it opens", () => {
  const out = html(STATES.form);
  assert.match(out, /<button type="submit"[^>]*>Continue to official website/);
  assert.match(out, /Opens acme\.example in a new tab/);
});

test("render: WhatsApp is the FIRST and pre-selected contact method; phone call is the second", () => {
  const out = html(STATES.form);
  const radios = [...out.matchAll(/<input type="radio"[^>]*>/g)].map((match) => match[0]);
  assert.equal(radios.length, 2);
  assert.match(radios[0], /value="WHATSAPP"/);
  assert.match(radios[0], /checked=""/);
  assert.match(radios[1], /value="PHONE_CALL"/);
  assert.doesNotMatch(radios[1], /checked=""/);
  assert.match(out, /WhatsApp<\/span><span[^>]*>Recommended/);
});

test("render: selecting phone call changes the consent wording to match", () => {
  const phone = reduce({ type: "LOADED_NEW" }, { type: "EDIT", patch: { preference: "PHONE_CALL" } });
  assert.match(html(phone), /may contact me by phone call/);
  assert.match(html(STATES.form), /may contact me on WhatsApp/);
});

test("render: consent is stated beside the button as plain text — there is NO pre-ticked box and no hidden opt-in", () => {
  const out = html(STATES.form);
  assert.match(out, /I agree that Developer Connects may contact me on WhatsApp about my property enquiry/);
  assert.doesNotMatch(out, /type="checkbox"/);
  assert.doesNotMatch(out, /checked=""[^>]*type="checkbox"/);
});

test("render: the reassurance line and a privacy policy link are shown", () => {
  const out = html(STATES.form);
  assert.match(out, /Your details are used to help with your property enquiry\. You can choose your preferred contact method\./);
  assert.match(out, /<a href="\/privacy"[^>]*>Privacy Policy<\/a>/);
});

test("render: typed values are shown back in the fields", () => {
  const out = html(STATES.formTyped);
  assert.match(out, /value="98765 43210"/);
  assert.match(out, /value="Asha"/);
});

test("render: the name field is optional (labelled so) and the phone field is the only required-looking input", () => {
  const out = html(STATES.form);
  assert.match(out, /Your name \(optional\)/);
  assert.match(out, /Your WhatsApp or phone number/);
});

test("render: both countries the product operates in are offered, India first", () => {
  const out = html(STATES.form);
  assert.match(out, /<option value="IN"[^>]*>India \+91<\/option>/);
  assert.match(out, /<option value="AE"[^>]*>UAE \+971<\/option>/);
  assert.ok(out.indexOf("India +91") < out.indexOf("UAE +971"));
});

test("render: there is NO way past the gate — no skip, no 'continue without', no direct link to the website", () => {
  for (const name of ["loading", "form", "formTyped", "returning", "submitting", "failure", "invalidPhone", "returningFailure"] as const) {
    const out = html(STATES[name]);
    assert.doesNotMatch(out, /skip|continue without|maybe later|no thanks/i, name);
    assert.doesNotMatch(out, /href="https?:\/\/(?!(www\.)?developerconnects)/i, `${name} links off-site`);
    assert.ok(!out.includes(DESTINATION), `${name} exposes the destination`);
  }
});

// =================================================================================================
// RETURNING BUYER
// =================================================================================================

test("render: a returning buyer sees a masked number, one-tap continue and 'use a different number' — and no phone field", () => {
  const out = html(STATES.returning);
  assert.match(out, /Welcome back/);
  assert.match(out, /Continue as <span[^>]*>\+91 ••••••210<\/span>\?/);
  assert.match(out, /Continue to official website/);
  assert.match(out, /Use a different number/);
  assert.doesNotMatch(out, /name="phone"/);
  assert.doesNotMatch(out, /9876543210/);
});

test("render: the returning card still shows the transparency note and the consent wording (it is a fresh affirmative act)", () => {
  const out = html(STATES.returning);
  assert.match(out, /Acme Realty does not need your phone number/);
  assert.match(out, /I agree that Developer Connects may contact me on WhatsApp/);
});

// =================================================================================================
// SUBMITTING / FAILURE / RETRY
// =================================================================================================

test("render: while saving, the form is disabled and the button says so (no double submit)", () => {
  const out = html(STATES.submitting);
  assert.match(out, /Saving your details…/);
  assert.match(out, /<button type="submit" disabled=""/);
  assert.match(out, /aria-busy="true"/);
  assert.ok((out.match(/disabled=""/g) ?? []).length >= 5, "inputs and button are disabled");
});

test("render: FAILURE shows a clear error, says the website was NOT opened, and offers Try again — never a link to the site", () => {
  const out = html(STATES.failure);
  assert.match(out, /role="alert"/);
  assert.match(out, /We couldn&#x27;t save your details/);
  assert.match(out, /we haven&#x27;t opened the website/);
  assert.match(out, /Try again/);
  assert.doesNotMatch(out, /href="https:\/\/acme/);
  assert.ok(!out.includes(DESTINATION));
  assert.match(out, /data-gate-phase="error"/);
});

test("render: the typed number survives a failure, so a retry does not mean retyping", () => {
  const failed = reduce({ type: "LOADED_NEW" }, { type: "EDIT", patch: { phone: "98765 43210" } }, { type: "SUBMIT_START", attempt: "form" }, { type: "SUBMIT_ERROR", code: "TEMPORARY_FAILURE", message: "x" });
  assert.match(html(failed), /value="98765 43210"/);
});

test("render: an invalid number is flagged on the field itself for screen readers", () => {
  const out = html(STATES.invalidPhone);
  assert.match(out, /aria-invalid="true"/);
  assert.match(out, /role="alert"/);
  assert.match(out, /valid WhatsApp or phone number/);
});

test("render: a failed one-tap continue stays on the returning card with Try again and the different-number option", () => {
  const out = html(STATES.returningFailure);
  assert.match(out, /role="alert"/);
  assert.match(out, /Try again/);
  assert.match(out, /Use a different number/);
  assert.doesNotMatch(out, /name="phone"/);
});

// =================================================================================================
// SUCCESS
// =================================================================================================

test("render: success confirms the details are saved and the website opened — with no link, since the tab was already sent", () => {
  const out = html(STATES.success);
  assert.match(out, /Thank you — your details are saved/);
  assert.match(out, /The official website has opened in a new tab/);
  assert.doesNotMatch(out, /<a /);
  assert.ok(!out.includes(DESTINATION));
});

test("render: if the browser blocked the new tab, a REAL link (opened by the buyer's own click) is offered — safely", () => {
  const out = html(STATES.blocked);
  assert.match(out, /Your browser blocked the new tab/);
  const anchor = out.match(/<a [^>]*href="https:\/\/acme\.example\/"[^>]*>/)?.[0];
  assert.ok(anchor, "the destination anchor is rendered in the blocked state");
  assert.match(anchor!, /target="_blank"/);
  assert.match(anchor!, /rel="noopener noreferrer"/);
});

test("render: the destination appears in exactly ONE state — the blocked-popup fallback — and nowhere else", () => {
  for (const [name, state] of Object.entries(STATES)) {
    const present = html(state).includes(DESTINATION);
    assert.equal(present, name === "blocked", `${name}: destination present = ${present}`);
  }
});

// =================================================================================================
// MOBILE BEHAVIOUR
// =================================================================================================

test("mobile: on a phone the gate is a bottom sheet — full width, rounded top, pinned to the bottom, scrollable, capped height", () => {
  const out = html(STATES.form);
  assert.match(out, /fixed inset-0 z-50 flex items-end justify-center/);
  assert.match(out, /rounded-t-2xl/);
  assert.match(out, /max-h-\[92dvh\]/);
  assert.match(out, /overflow-y-auto/);
  assert.match(out, /w-full/);
});

test("mobile: from the sm breakpoint it becomes a centred dialog instead", () => {
  const out = html(STATES.form);
  assert.match(out, /sm:items-center/);
  assert.match(out, /sm:max-w-md/);
  assert.match(out, /sm:rounded-2xl/);
});

test("mobile: it respects the iPhone home indicator (safe-area padding)", () => {
  assert.match(html(STATES.form), /padding-bottom:max\(env\(safe-area-inset-bottom\), ?1\.25rem\)/);
});

test("mobile: the phone field opens the NUMERIC keyboard and autofills (type=tel, inputmode=tel, autocomplete)", () => {
  const input = html(STATES.form).match(/<input id="gate-phone"[^>]*>/)?.[0] ?? "";
  assert.match(input, /type="tel"/);
  assert.match(input, /inputMode="tel"/);
  assert.match(input, /autoComplete="tel-national"/);
});

test("mobile: every input is at least 16px (so iOS never zooms) and at least 48px tall", () => {
  const out = html(STATES.form);
  const fields = [...out.matchAll(/<(input|select)\b[^>]*class="([^"]*)"[^>]*>/g)].filter((match) => !/type="(radio|hidden)"/.test(match[0]) && !/aria-hidden/.test(match[0]));
  const real = fields.filter((match) => /min-h-12/.test(match[2]));
  assert.ok(real.length >= 3, "phone, country and name fields");
  for (const field of real) {
    assert.match(field[2], /text-base/, "16px text");
    assert.match(field[2], /min-h-12/, "48px tall");
  }
});

test("mobile: every button and choice is a comfortable tap target (≥ 44px)", () => {
  const out = html(STATES.form);
  assert.match(out, /aria-label="Close"[^>]*>|class="[^"]*h-11 w-11[^"]*"/);
  assert.match(out, /h-11 w-11/, "the close button is 44×44");
  assert.match(out, /<label[^>]*min-h-12[^>]*>/, "the WhatsApp / phone call choices are 48px tall");
  assert.match(out, /<button type="submit"[^>]*min-h-12/);
});

test("mobile: the country selector keeps its fixed width and the number field takes the rest of the row (regression: the select once filled the whole row)", () => {
  const out = html(STATES.form);
  const select = out.match(/<select[^>]*class="([^"]*)"/)?.[1] ?? "";
  const phone = out.match(/<input id="gate-phone"[^>]*class="([^"]*)"/)?.[1] ?? "";
  const tokens = (classes: string) => classes.split(/\s+/);
  assert.ok(tokens(select).includes("w-32"));
  assert.ok(tokens(select).includes("shrink-0"));
  assert.ok(!tokens(select).includes("w-full"), "a full-width select pushes the number field off screen");
  assert.ok(tokens(phone).includes("flex-1"));
  assert.ok(tokens(phone).includes("min-w-0"), "lets the field shrink instead of overflowing on a narrow phone");
  assert.ok(!tokens(phone).includes("w-full"));
  // The name field, on its own row, is full width.
  assert.ok(tokens(out.match(/<input id="gate-name"[^>]*class="([^"]*)"/)?.[1] ?? "").includes("w-full"));
});

test("mobile: it stays one column — the country selector and number share a row, everything else stacks", () => {
  const out = html(STATES.form);
  assert.match(out, /flex gap-2/);
  assert.match(out, /grid gap-2/);
  assert.doesNotMatch(out, /grid-cols-[2-9]|sm:grid-cols/);
});

// =================================================================================================
// ACCESSIBILITY
// =================================================================================================

test("a11y: it is a labelled modal dialog, busy while working, with labelled controls", () => {
  const out = html(STATES.form);
  assert.match(out, /role="dialog"/);
  assert.match(out, /aria-modal="true"/);
  assert.match(out, /aria-labelledby="assistance-gate-title"/);
  assert.match(out, /<h2 id="assistance-gate-title"/);
  assert.match(out, /<label for="gate-phone"/);
  assert.match(out, /<label for="gate-name"/);
  assert.match(out, /<fieldset>\s*<legend[^>]*>How should we contact you\?/);
  assert.match(out, /aria-describedby="gate-phone-help"/);
});

test("a11y: the hidden spam trap is invisible to assistive tech and cannot be tabbed to", () => {
  const out = html(STATES.form);
  const trap = out.match(/<div class="absolute -left-\[9999px\][^>]*>.*?<\/div>/)?.[0] ?? "";
  assert.match(trap, /aria-hidden="true"/);
  assert.match(trap, /tabindex="-1"/);
  assert.match(trap, /name="website"/);
  assert.match(trap, /autoComplete="off"/);
});

test("a11y: every state has exactly one heading that the dialog is labelled by", () => {
  for (const [name, state] of Object.entries(STATES)) {
    const out = html(state);
    assert.equal((out.match(/id="assistance-gate-title"/g) ?? []).length, 1, name);
  }
});

test("a11y: errors are announced (role=alert) and success is announced politely (role=status)", () => {
  assert.match(html(STATES.failure), /role="alert"/);
  assert.match(html(STATES.success), /role="status"/);
});

// =================================================================================================
// NO PII IN THE MARKUP
// =================================================================================================

test("privacy: no state's markup ever contains a full phone number it was not given by the buyer in this session", () => {
  for (const name of ["loading", "form", "returning", "submitting", "failure", "success", "blocked"] as const) {
    const out = html(STATES[name]);
    assert.doesNotMatch(out, /\+91\s?\d{5}\s?\d{5}|\b\d{10}\b/, `${name} contains a full number`);
  }
});
