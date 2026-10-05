"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { continueAsReturning, getGateState, recordGateFormStarted, submitGate } from "@/app/_actions/lead-gate-actions";
import { readAttributionForSubmit } from "@/lib/leads/attribution-storage";
import { GATE_ERROR_MESSAGES, gateCopy } from "@/lib/leads/gate/gate-copy";
import type { GateSourceCta } from "@/lib/leads/gate/gate-config";
import {
  actionForResult,
  gateReducer,
  initialGateState,
  runGateSubmit,
  type GateAction,
  type GateState,
  type TabHandle,
} from "@/lib/leads/gate/gate-flow";
import { MODAL_IDS, preemptModal, releaseModal } from "@/lib/modal-lock";
import { AssistanceGateView } from "@/components/assistance-gate-view";

/**
 * The property-assistance gate: shown whenever a visitor presses "Visit
 * official website". It asks, plainly, for a WhatsApp number or phone so
 * Developer Connects' property team can help — and says plainly that the
 * DEVELOPER does not need it. After a successful submit the visitor is sent
 * on to the verified official website; there is no way past it that skips the
 * save, and a failure shows a retry state, never a bypass.
 *
 * Two parts (the view lives in assistance-gate-view.tsx):
 *  - AssistanceGateView: a pure, stateless rendering of a GateState (so every
 *    state can be rendered and tested without a browser);
 *  - AssistanceGate: the container that talks to the server actions.
 */

// --- container ------------------------------------------------------------------------------------

/** Opens a blank tab synchronously (inside the click, so popup blockers allow it) and later points it at the destination. */
function openBlankTab(): TabHandle | null {
  const tab = window.open("about:blank", "_blank");
  if (!tab) return null;
  try {
    tab.opener = null; // the destination site gets no handle back to us
  } catch {
    /* some browsers forbid it; the tab is still ours alone */
  }
  return {
    navigate: (url) => {
      tab.location.replace(url);
    },
    close: () => {
      try {
        tab.close();
      } catch {
        /* nothing to do */
      }
    },
  };
}

export interface AssistanceGateProps {
  developerId: string;
  developerName: string;
  domain: string;
  sourceCta: GateSourceCta;
  /** When the visitor pressed "Visit official website" (ISO). */
  clickedAt: string;
  onClose: () => void;
  /** Fired once the buyer has been sent on (or can continue) — the details are saved. */
  onCompleted: () => void;
}

export function AssistanceGate({ developerId, developerName, domain, sourceCta, clickedAt, onClose, onCompleted }: AssistanceGateProps) {
  const [state, dispatch] = useReducer(gateReducer, undefined, () => initialGateState());
  const startedRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const copy = gateCopy(developerName, domain, state.form.preference);

  // One modal at a time. The buyer explicitly asked for the gate, so it takes priority: an open sign-in prompt is
  // dismissed (never stacked under or over it) — pressing the button is never a silent dead end.
  useEffect(() => {
    preemptModal(MODAL_IDS.assistanceGate);
    return () => releaseModal(MODAL_IDS.assistanceGate);
  }, []);

  // Load what the gate should show (and record the anonymous "gate shown" event).
  useEffect(() => {
    let cancelled = false;
    void getGateState(developerId, sourceCta).then((response) => {
      if (cancelled) return;
      if (response.mode === "unavailable") dispatch({ type: "LOAD_FAILED", code: response.code, message: response.message });
      else if (response.mode === "off") dispatch({ type: "LOADED_OFF", destinationUrl: response.destinationUrl });
      else if (response.returning) dispatch({ type: "LOADED_RETURNING", maskedPhone: response.maskedPhone, preference: response.contactPreference });
      else dispatch({ type: "LOADED_NEW" });
    }).catch(() => {
      if (!cancelled) dispatch({ type: "LOAD_FAILED", code: "TEMPORARY_FAILURE", message: GATE_ERROR_MESSAGES.TEMPORARY_FAILURE });
    });
    return () => {
      cancelled = true;
    };
  }, [developerId, sourceCta]);

  // Escape closes (unless a save is in flight); the page behind doesn't scroll.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && stateRef.current.phase !== "submitting") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const run = useCallback(
    (attempt: "form" | "returning") => {
      const current = stateRef.current;
      if (attempt === "form" && current.form.phone.trim() === "") {
        dispatch({ type: "SUBMIT_START", attempt });
        dispatch({ type: "SUBMIT_ERROR", code: "INVALID_PHONE", message: GATE_ERROR_MESSAGES.INVALID_PHONE, field: "phone" });
        return;
      }
      dispatch({ type: "SUBMIT_START", attempt });
      const attribution = readAttributionForSubmit();
      // NOTE: runGateSubmit opens the tab synchronously, before any await — keep this call in the click's own tick.
      const work =
        attempt === "form"
          ? runGateSubmit(
              { submit: submitGate, openTab: openBlankTab },
              {
                developerId,
                sourceCta,
                phone: current.form.phone,
                phoneCountry: current.form.country,
                contactPreference: current.form.preference,
                name: current.form.name || undefined,
                attribution,
                clickedAt,
                website: (document.querySelector('input[name="website"]') as HTMLInputElement | null)?.value ?? "",
              },
            )
          : runGateSubmit({ submit: continueAsReturning, openTab: openBlankTab }, { developerId, sourceCta, attribution, clickedAt });
      void work.then((result) => {
        const action: GateAction = actionForResult(result);
        dispatch(action);
        if (result.kind !== "error") onCompleted();
      });
    },
    [developerId, sourceCta, clickedAt, onCompleted],
  );

  const onEdit = useCallback(
    (patch: Partial<GateState["form"]>) => {
      if (!startedRef.current) {
        startedRef.current = true;
        void recordGateFormStarted(developerId, sourceCta);
      }
      dispatch({ type: "EDIT", patch });
    },
    [developerId, sourceCta],
  );

  return (
    <AssistanceGateView
      state={state}
      copy={copy}
      onEdit={onEdit}
      onSubmit={() => run("form")}
      onContinueReturning={() => run("returning")}
      onUseDifferentNumber={() => dispatch({ type: "USE_DIFFERENT_NUMBER" })}
      onRetry={() => run(stateRef.current.lastAttempt === "returning" ? "returning" : "form")}
      onClose={onClose}
    />
  );
}
