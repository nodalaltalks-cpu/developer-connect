import { GATE_ERROR_MESSAGES, type GateErrorCode } from "./gate-copy.ts";
import type { GateContactPreference, GatePhoneCountry, GateSourceCta } from "./gate-config.ts";

/**
 * The assistance gate's behaviour, separated from React so it can be tested
 * without a browser: a state machine (what the buyer sees) and the submit
 * orchestration (what happens when they press the button).
 *
 * The invariant that matters most: nothing in this module — no state, no
 * server response type, no action — can carry a developer URL or domain.
 * The buyer is never sent to a developer's website; a successful submit only
 * ever leads to the "we've received your request" phase, and a failure can
 * only ever lead to an error the buyer can retry.
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
  /** When the buyer pressed "Connect with developer" (ISO). */
  requestedAt?: string;
}

export interface GateReturningInput {
  developerId: string;
  sourceCta: GateSourceCta;
  attribution?: GateAttribution;
  requestedAt?: string;
}

export type GateSubmitResponse =
  | {
      ok: true;
      /** A masked form only ("+91 ••••••210"). The full number never returns to the browser. */
      maskedPhone: string;
      contactPreference: GateContactPreference;
    }
  | { ok: false; code: GateErrorCode; message: string; field?: string };

export type GateStateResponse =
  | { mode: "required"; returning: false }
  | { mode: "required"; returning: true; maskedPhone: string; contactPreference: GateContactPreference }
  | { mode: "unavailable"; code: GateErrorCode; message: string };

// --- state machine ------------------------------------------------------------------------------

export type GatePhase = "loading" | "form" | "returning" | "submitting" | "success" | "error";

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
  /** Present only in the "success" phase: how Developer Connects will reach the buyer. */
  success: { maskedPhone: string; preference: GateContactPreference } | null;
  /** Which kind of submit was in flight, so "Try again" repeats the right one. */
  lastAttempt: "form" | "returning" | null;
}

export function initialGateState(country: GatePhoneCountry = "IN"): GateState {
  return {
    phase: "loading",
    form: { country, phone: "", preference: "WHATSAPP", name: "" },
    returning: null,
    error: null,
    success: null,
    lastAttempt: null,
  };
}

/**
 * The contact method the buyer-facing copy should speak about: the one they just
 * used (success), the one on file (returning buyer), otherwise the one selected in the form.
 */
export function gatePreference(state: GateState): GateContactPreference {
  if (state.phase === "success" && state.success) return state.success.preference;
  if (state.returning && (state.phase === "returning" || state.lastAttempt === "returning")) return state.returning.preference;
  return state.form.preference;
}

export type GateAction =
  | { type: "LOADED_NEW" }
  | { type: "LOADED_RETURNING"; maskedPhone: string; preference: GateContactPreference }
  | { type: "LOAD_FAILED"; code: GateErrorCode; message: string }
  | { type: "EDIT"; patch: Partial<GateFormState> }
  | { type: "SUBMIT_START"; attempt: "form" | "returning" }
  | { type: "SUBMIT_SUCCEEDED"; maskedPhone: string; preference: GateContactPreference }
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

    case "LOAD_FAILED":
      return state.phase === "loading"
        ? { ...state, phase: "error", error: { code: action.code, message: action.message }, lastAttempt: null }
        : state;

    case "EDIT":
      if (state.phase !== "form" && state.phase !== "error") return state;
      return { ...state, form: { ...state.form, ...action.patch }, error: state.phase === "error" ? null : state.error, phase: state.phase === "error" ? "form" : state.phase };

    case "SUBMIT_START":
      if (state.phase === "submitting") return state; // no double submit
      return { ...state, phase: "submitting", error: null, success: null, lastAttempt: action.attempt };

    case "SUBMIT_SUCCEEDED":
      // Only a server response that said ok (the details are saved) can reach "success".
      return state.phase === "submitting" ? { ...state, phase: "success", success: { maskedPhone: action.maskedPhone, preference: action.preference } } : state;

    case "SUBMIT_ERROR":
      if (state.phase !== "submitting") return state;
      return { ...state, phase: "error", error: { code: action.code, message: action.message, field: action.field } };

    case "USE_DIFFERENT_NUMBER":
      return state.phase === "returning" || state.phase === "error"
        ? { ...state, phase: "form", returning: null, error: null, lastAttempt: null }
        : state;
  }
}

// --- submit orchestration ------------------------------------------------------------------------

export interface GateRunDeps<TInput> {
  submit(input: TInput): Promise<GateSubmitResponse>;
}

export type GateRunResult =
  | { kind: "success"; maskedPhone: string; preference: GateContactPreference }
  | { kind: "error"; code: GateErrorCode; message: string; field?: string };

/** Runs one submit. Any failure — including a network error or a crash — is an error result the buyer can retry. */
export async function runGateSubmit<TInput>(deps: GateRunDeps<TInput>, input: TInput): Promise<GateRunResult> {
  let response: GateSubmitResponse;
  try {
    response = await deps.submit(input);
  } catch {
    return { kind: "error", code: "TEMPORARY_FAILURE", message: GATE_ERROR_MESSAGES.TEMPORARY_FAILURE };
  }
  if (!response.ok) return { kind: "error", code: response.code, message: response.message, field: response.field };
  return { kind: "success", maskedPhone: response.maskedPhone, preference: response.contactPreference };
}

/** Maps a run result onto the state machine. */
export function actionForResult(result: GateRunResult): GateAction {
  return result.kind === "success"
    ? { type: "SUBMIT_SUCCEEDED", maskedPhone: result.maskedPhone, preference: result.preference }
    : { type: "SUBMIT_ERROR", code: result.code, message: result.message, field: result.field };
}
