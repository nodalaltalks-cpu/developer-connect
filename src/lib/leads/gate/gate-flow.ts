import { GATE_ERROR_MESSAGES, type GateErrorCode } from "./gate-copy.ts";
import type { GateContactPreference, GatePhoneCountry, GateSourceCta } from "./gate-config.ts";

/**
 * The assistance gate's behaviour, separated from React so it can be tested
 * without a browser: a state machine (what the buyer sees) and the submit
 * orchestration (what happens when they press the button).
 *
 * The invariant that matters most: a destination URL exists in state ONLY in
 * the two "success" phases, which are reached ONLY from a server response
 * that said ok. An error can never carry or produce a destination, and there
 * is no transition from an error (or from "form") straight to a redirect —
 * so a failure can never silently bypass the gate.
 */

// --- responses from the server actions ---------------------------------------------------------

/** Campaign/referrer data the browser remembered. Untrusted: the server re-cleans every field and ignores unknown ones. */
export interface GateTouchInput {
  landingPath?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  occurredAt?: string | null;
}

export interface GateAttribution {
  currentTouch?: GateTouchInput;
  firstTouch?: GateTouchInput | null;
}

export interface GateSubmitInput {
  developerId: string;
  sourceCta: GateSourceCta;
  phone: string;
  phoneCountry: GatePhoneCountry;
  contactPreference: GateContactPreference;
  name?: string;
  attribution?: GateAttribution;
  /** A hidden field a human never fills in; a bot that does is refused. */
  website?: string;
  /** When the buyer pressed "Visit official website" (ISO). */
  clickedAt?: string;
}

export interface GateReturningInput {
  developerId: string;
  sourceCta: GateSourceCta;
  attribution?: GateAttribution;
  clickedAt?: string;
}

export type GateSubmitResponse =
  | {
      ok: true;
      /** Resolved by the SERVER from the verified developer record — never supplied by the client. */
      destinationUrl: string;
      destinationDomain: string;
      /** A masked form only ("+91 ••••••210"). The full number never returns to the browser. */
      maskedPhone: string;
      contactPreference: GateContactPreference;
    }
  | { ok: false; code: GateErrorCode; message: string; field?: string };

export type GateStateResponse =
  | { mode: "required"; returning: false }
  | { mode: "required"; returning: true; maskedPhone: string; contactPreference: GateContactPreference }
  /** Operator escape hatch (LEAD_GATE_MODE=off): the server hands over the verified destination without a lead. */
  | { mode: "off"; destinationUrl: string; destinationDomain: string }
  | { mode: "unavailable"; code: GateErrorCode; message: string };

// --- state machine ------------------------------------------------------------------------------

export type GatePhase = "loading" | "form" | "returning" | "submitting" | "success" | "blocked" | "error";

export interface GateFormState {
  country: GatePhoneCountry;
  phone: string;
  preference: GateContactPreference;
  name: string;
}

export interface GateState {
  phase: GatePhase;
  form: GateFormState;
  returning: { maskedPhone: string; preference: GateContactPreference } | null;
  error: { code: GateErrorCode; message: string; field?: string } | null;
  /** Present ONLY in the "success" and "blocked" phases. */
  destinationUrl: string | null;
  /** Which kind of submit was in flight, so "Try again" repeats the right one. */
  lastAttempt: "form" | "returning" | null;
}

export function initialGateState(country: GatePhoneCountry = "IN"): GateState {
  return {
    phase: "loading",
    form: { country, phone: "", preference: "WHATSAPP", name: "" },
    returning: null,
    error: null,
    destinationUrl: null,
    lastAttempt: null,
  };
}

export type GateAction =
  | { type: "LOADED_NEW" }
  | { type: "LOADED_RETURNING"; maskedPhone: string; preference: GateContactPreference }
  | { type: "LOADED_OFF"; destinationUrl: string }
  | { type: "LOAD_FAILED"; code: GateErrorCode; message: string }
  | { type: "EDIT"; patch: Partial<GateFormState> }
  | { type: "SUBMIT_START"; attempt: "form" | "returning" }
  | { type: "SUBMIT_REDIRECTED" }
  | { type: "SUBMIT_BLOCKED"; destinationUrl: string }
  | { type: "SUBMIT_ERROR"; code: GateErrorCode; message: string; field?: string }
  | { type: "USE_DIFFERENT_NUMBER" };

export function gateReducer(state: GateState, action: GateAction): GateState {
  switch (action.type) {
    case "LOADED_NEW":
      return state.phase === "loading" ? { ...state, phase: "form" } : state;

    case "LOADED_RETURNING":
      return state.phase === "loading"
        ? { ...state, phase: "returning", returning: { maskedPhone: action.maskedPhone, preference: action.preference } }
        : state;

    case "LOADED_OFF":
      // Operator escape hatch only: the buyer still presses a real button to leave.
      return state.phase === "loading" ? { ...state, phase: "blocked", destinationUrl: action.destinationUrl } : state;

    case "LOAD_FAILED":
      return state.phase === "loading"
        ? { ...state, phase: "error", error: { code: action.code, message: action.message }, lastAttempt: null }
        : state;

    case "EDIT":
      if (state.phase !== "form" && state.phase !== "error") return state;
      return { ...state, form: { ...state.form, ...action.patch }, error: state.phase === "error" ? null : state.error, phase: state.phase === "error" ? "form" : state.phase };

    case "SUBMIT_START":
      if (state.phase === "submitting") return state; // no double submit
      return { ...state, phase: "submitting", error: null, destinationUrl: null, lastAttempt: action.attempt };

    case "SUBMIT_REDIRECTED":
      return state.phase === "submitting" ? { ...state, phase: "success" } : state;

    case "SUBMIT_BLOCKED":
      // The browser blocked the new tab. The buyer's details ARE saved; they open the site with a real click.
      return state.phase === "submitting" ? { ...state, phase: "blocked", destinationUrl: action.destinationUrl } : state;

    case "SUBMIT_ERROR":
      if (state.phase !== "submitting") return state;
      return {
        ...state,
        phase: "error",
        destinationUrl: null,
        error: { code: action.code, message: action.message, field: action.field },
      };

    case "USE_DIFFERENT_NUMBER":
      return state.phase === "returning" || state.phase === "error"
        ? { ...state, phase: "form", returning: null, error: null, lastAttempt: null }
        : state;
  }
}

// --- submit orchestration ------------------------------------------------------------------------

/** A tab the gate opened synchronously (inside the click) so the browser's popup blocker allows it. */
export interface TabHandle {
  navigate(url: string): void;
  close(): void;
}

export interface GateRunDeps<TInput> {
  submit(input: TInput): Promise<GateSubmitResponse>;
  /** Called synchronously, before any await. Returns null when the browser refused to open a tab. */
  openTab(): TabHandle | null;
}

export type GateRunResult =
  | { kind: "redirected" }
  | { kind: "blocked"; destinationUrl: string }
  | { kind: "error"; code: GateErrorCode; message: string; field?: string };

/**
 * Runs one submit: open the tab FIRST (popup blockers only allow this inside
 * the user's click), ask the server, and only then — on an ok response —
 * point the tab at the server-resolved URL. On any failure the tab is closed
 * and NOTHING is navigated.
 */
export async function runGateSubmit<TInput>(deps: GateRunDeps<TInput>, input: TInput): Promise<GateRunResult> {
  const tab = deps.openTab();

  let response: GateSubmitResponse;
  try {
    response = await deps.submit(input);
  } catch {
    // Network error, server crash, timeout: an error state, never a bypass.
    tab?.close();
    return { kind: "error", code: "TEMPORARY_FAILURE", message: GATE_ERROR_MESSAGES.TEMPORARY_FAILURE };
  }

  if (!response.ok) {
    tab?.close();
    return { kind: "error", code: response.code, message: response.message, field: response.field };
  }

  if (tab) {
    tab.navigate(response.destinationUrl);
    return { kind: "redirected" };
  }
  return { kind: "blocked", destinationUrl: response.destinationUrl };
}

/** Maps a run result onto the state machine. */
export function actionForResult(result: GateRunResult): GateAction {
  switch (result.kind) {
    case "redirected":
      return { type: "SUBMIT_REDIRECTED" };
    case "blocked":
      return { type: "SUBMIT_BLOCKED", destinationUrl: result.destinationUrl };
    case "error":
      return { type: "SUBMIT_ERROR", code: result.code, message: result.message, field: result.field };
  }
}
