"use client";

import { useSyncExternalStore } from "react";

/**
 * ONE place that knows whether follow-up alerts are on for this device, and the ONE way to turn them on. The header pill,
 * the page banner and the alert poller all read it, so the state can never disagree and a tap always gives an answer:
 * on, blocked (with how to unblock it), or not possible here (with what to do instead). Nothing here is hidden after the
 * first tap, which is what made the old button look dead.
 */

export type AlertPermission = "default" | "granted" | "denied" | "unsupported";
export interface AlertsState {
  permission: AlertPermission;
  busy: boolean;
  /** The outcome of the last tap, shown next to the control. */
  message: { tone: "ok" | "error"; text: string } | null;
}

const SERVER: AlertsState = { permission: "default", busy: false, message: null };
let state: AlertsState = SERVER;
let started = false;
const listeners = new Set<() => void>();

function set(patch: Partial<AlertsState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function readPermission(): AlertPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    state = { ...state, permission: readPermission() };
    // Registering early means a notification can be shown the moment permission is granted.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  return () => listeners.delete(listener);
}

export function useAlertsState(): AlertsState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}

const TEST_PATTERN = [300, 120, 300, 120, 600];

/** Shows one real notification (and vibrates) so the person can see that alerts work on this phone. */
export async function sendTestAlert(): Promise<boolean> {
  try {
    navigator.vibrate?.(TEST_PATTERN);
  } catch {
    // vibration is optional
  }
  try {
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000))]);
    await registration.showNotification("Alerts are on", { body: "You will be buzzed the moment a follow-up is due or missed.", tag: "dc-alert-test", vibrate: TEST_PATTERN, data: { url: "/team" } } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

export async function enableAlerts(): Promise<void> {
  if (state.busy) return;
  if (typeof Notification === "undefined") {
    set({ permission: "unsupported", message: { tone: "error", text: "This app or browser cannot show notifications. Open developerconnects.com in Chrome on your phone and turn alerts on there. The in-app alert on screen still works." } });
    return;
  }
  set({ busy: true, message: null });
  try {
    if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js").catch(() => {});
    const result = await Notification.requestPermission();
    set({ permission: result });
    if (result === "granted") {
      const shown = await sendTestAlert();
      set({ message: { tone: "ok", text: shown ? "Alerts are on. You should have just felt a buzz and seen a notification." : "Alerts are on. The on-screen alert will show when a follow-up is due." } });
    } else if (result === "denied") {
      set({ message: { tone: "error", text: "Alerts are blocked for this site. In Chrome tap the lock icon next to the address, choose Permissions, allow Notifications, then reload." } });
    } else {
      set({ message: { tone: "error", text: "No choice was made. Tap Turn on alerts again and choose Allow." } });
    }
  } catch {
    set({ permission: readPermission(), message: { tone: "error", text: "Could not turn alerts on. Reload the page and try again." } });
  } finally {
    set({ busy: false });
  }
}

export async function testAlerts(): Promise<void> {
  set({ busy: true, message: null });
  const shown = await sendTestAlert();
  set({ busy: false, message: shown ? { tone: "ok", text: "Test sent. If you did not feel a buzz, check the phone is not on silent." } : { tone: "error", text: "Could not show a notification. Reload the page and try again." } });
}

/** Always visible in the header of every team page and the Founder dashboard. One tap does the right thing for the current state. */
export function AlertsPill() {
  const { permission, busy } = useAlertsState();
  const base = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const dot = "h-2 w-2 rounded-full";
  let button;
  if (permission === "granted") {
    button = (
      <button type="button" onClick={testAlerts} disabled={busy} className={`${base} border border-green-600 bg-green-50 text-green-800`} title="Alerts are on. Tap to send a test alert.">
        <span className={`${dot} bg-green-600`} aria-hidden="true" />
        Alerts on
      </button>
    );
  } else if (permission === "denied") {
    button = (
      <button type="button" onClick={enableAlerts} className={`${base} border border-red-500 bg-red-50 text-red-800`}>
        <span className={`${dot} bg-red-600`} aria-hidden="true" />
        Alerts blocked
      </button>
    );
  } else {
    button = (
      <button type="button" onClick={enableAlerts} disabled={busy} className={`${base} bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-60`}>
        <span className={`${dot} animate-pulse bg-black`} aria-hidden="true" />
        {busy ? "Turning on…" : "Turn on alerts"}
      </button>
    );
  }
  return button;
}

/** The result of the last tap, as a full-width line under the header so it is always read. */
export function AlertsMessage() {
  const { message } = useAlertsState();
  if (!message) return null;
  return (
    <p role="status" className={`mb-3 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
      {message.text}
    </p>
  );
}
