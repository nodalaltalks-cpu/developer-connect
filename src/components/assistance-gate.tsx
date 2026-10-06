"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { continueAsReturning, getGateState, recordGateFormStarted, submitGate } from "@/app/_actions/lead-gate-actions";
import { readAttributionForSubmit } from "@/lib/leads/attribution-storage";
import { GATE_ERROR_MESSAGES, gateCopy } from "@/lib/leads/gate/gate-copy";
import type { GateSourceCta } from "@/lib/leads/gate/gate-config";
import {
  actionForResult,
  gatePreference,
  gateReducer,
  initialGateState,
  runGateSubmit,
  type GateAction,
  type GateState,
} from "@/lib/leads/gate/gate-flow";
import { MODAL_IDS, preemptModal, releaseModal } from "@/lib/modal-lock";
import { AssistanceGateView } from "@/components/assistance-gate-view";

/**
 * The property-assistance gate: shown whenever a visitor presses "Connect with
 * developer". It asks, plainly, for a WhatsApp number or phone so Developer
 * Connects' property team can help connect them — and says plainly that the
 * DEVELOPER does not require it. After a successful submit the visitor sees
 * "we've received your request"; they are never sent to a developer's website,
 * and a failure shows a retry state.
 *
 * Two parts (the view lives in assistance-gate-view.tsx):
 *  - AssistanceGateView: a pure, stateless rendering of a GateState (so every
 *    state can be rendered and tested without a browser);
 *  - AssistanceGate: the container that talks to the server actions.
 */

// --- container ------------------------------------------------------------------------------------

export interface AssistanceGateProps {
  developerId: string;
  developerName: string;
  sourceCta: GateSourceCta;
  /** When the visitor pressed "Connect with developer" (ISO). */
  requestedAt: string;
  onClose: () => void;
  /** Fired once the request is saved. */
  onCompleted: () => void;
}

export function AssistanceGate({ developerId, developerName, sourceCta, requestedAt, onClose, onCompleted }: AssistanceGateProps) {
  const [state, dispatch] = useReducer(gateReducer, undefined, () => initialGateState());
  const startedRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const copy = gateCopy(developerName, gatePreference(state));

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
      const work =
        attempt === "form"
          ? runGateSubmit(
              { submit: submitGate },
              {
                developerId,
                sourceCta,
                phone: current.form.phone,
                phoneCountry: current.form.country,
                contactPreference: current.form.preference,
                name: current.form.name || undefined,
                attribution,
                requestedAt,
                website: (document.querySelector('input[name="website"]') as HTMLInputElement | null)?.value ?? "",
              },
            )
          : runGateSubmit({ submit: continueAsReturning }, { developerId, sourceCta, attribution, requestedAt });
      void work.then((result) => {
        const action: GateAction = actionForResult(result);
        dispatch(action);
        if (result.kind !== "error") onCompleted();
      });
    },
    [developerId, sourceCta, requestedAt, onCompleted],
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
