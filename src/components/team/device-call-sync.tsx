"use client";

import { useEffect, useRef } from "react";
import { reportMyDeviceCallAction } from "@/app/team/_actions/team-actions";
import { CALL_REPORTED_EVENT, getNativeDialer, parsePendingReports } from "@/lib/leads/native-bridge";

/**
 * Delivers the Android app's call reports to the server. Renders nothing; does nothing in an ordinary browser.
 *
 * The phone keeps each report in a local outbox until it is ACKNOWLEDGED. This component reads the outbox when the page
 * opens, when it regains focus or comes back online, and every few seconds, sends each report through the
 * authenticated server action, and acknowledges it only after the server accepted it (a "duplicate" answer also counts
 * - the server already had it). A failed send leaves the report in the outbox to be retried, so a dropped connection
 * never loses or double-counts a call: the server accepts each call's report once.
 */

const POLL_MS = 5000;

export function DeviceCallSync() {
  const busy = useRef(false);

  useEffect(() => {
    let stopped = false;

    async function flush() {
      // Looked up every time: the bridge is injected by the app, and an ordinary browser simply never has one.
      const bridge = getNativeDialer();
      if (busy.current || stopped || !bridge) return;
      busy.current = true;
      try {
        for (const report of parsePendingReports(bridge.pendingReports())) {
          if (stopped) break;
          const result = await reportMyDeviceCallAction(report.callId, {
            startedAtMs: report.startedAtMs,
            durationSeconds: report.durationSeconds,
            simRef: report.simRef,
            callLogRef: report.callLogRef,
            deviceRef: report.deviceRef,
            notPlaced: report.notPlaced,
            durationUnavailable: report.durationUnavailable,
          }).catch(() => null);
          if (!result) break; // offline: keep it, retry on the next tick
          if (!result.ok && !result.permanent) break; // a server hiccup: keep it
          // Accepted (or the server already had it), or refused for good - retrying cannot help either way.
          bridge.acknowledge(report.callId);
          if (result.ok) window.dispatchEvent(new CustomEvent(CALL_REPORTED_EVENT, { detail: result.call }));
        }
      } finally {
        busy.current = false;
      }
    }

    void flush();
    const timer = setInterval(flush, POLL_MS);
    const onWake = () => void flush();
    // The Android app fires this the moment the employee comes back from a call. Phones write the call-log entry a
    // moment after hang-up, so look again shortly: the call shows up within about a second instead of at the next poll.
    const burst: ReturnType<typeof setTimeout>[] = [];
    const onResumed = () => {
      void flush();
      for (const ms of [1200, 3000, 6000]) burst.push(setTimeout(() => void flush(), ms));
    };
    window.addEventListener("dc:app-resumed", onResumed);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("dc:app-resumed", onResumed);
      burst.forEach(clearTimeout);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  return null;
}
