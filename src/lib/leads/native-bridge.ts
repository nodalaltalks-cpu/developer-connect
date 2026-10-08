/**
 * THE CONTRACT WITH THE ANDROID APP (native-android/). A normal web page cannot choose a SIM, dial through the phone's
 * own dialer with a SIM prompt, see call state or read the call duration - so the employee's phone runs a thin Android
 * shell around this website and injects `window.DCDialer`. The shell contains NO CRM logic: it only
 *   1. dials the number it is given (the system SIM chooser appears on a dual-SIM phone),
 *   2. after the call ends, reads the phone's own call-log entry (start time, duration, SIM) for that number, and
 *   3. keeps the result in a small local outbox until the website acknowledges it.
 * Everything else - who may call whom, the 10-second rule, history, analytics - is this website and the database.
 *
 * In an ordinary browser `window.DCDialer` does not exist, `getNativeDialer()` returns null and nothing here runs.
 *
 * Methods return strings or void only (the WebView bridge cannot return objects). The shape is deliberately small so
 * the native side stays small.
 */

export interface DCDialerNative {
  /** Native app version, e.g. "1". */
  version(): string;
  /** "true" once the permission needed to PLACE a call (CALL_PHONE) is granted. Reading call length is a separate, optional permission: see capabilities(). */
  hasPermissions(): string;
  /** Older name for requestCallPermission(); asks for CALL_PHONE only. */
  requestPermissions(): void;
  /** Asks Android for permission to place calls (CALL_PHONE). Nothing else. */
  requestCallPermission?(): void;
  /**
   * Asks Android for call-log access, used ONLY to read how long the calls placed from this app lasted. Never requested
   * automatically; the website explains why first. Absent in builds that do not carry the permission (see native-android/README.md).
   */
  requestDurationPermission?(): void;
  /** JSON: { canPlace: boolean, canMeasureDuration: boolean, durationSupported: boolean, version: string }. Older apps do not have it. */
  capabilities?(): string;
  /**
   * Starts the call: `callId` is the attempt the server issued, `phoneE164` the number the server returned. Android shows
   * its SIM chooser when the phone has more than one SIM. Returns immediately; the outcome arrives through pendingReports().
   */
  startCall(callId: string, phoneE164: string): void;
  /** JSON array of reports not yet acknowledged: see PendingDeviceReport. */
  pendingReports(): string;
  /** Removes a report from the phone's outbox once the server has it (including "already had it"). */
  acknowledge(callId: string): void;
}

declare global {
  interface Window {
    DCDialer?: DCDialerNative;
  }
}

/** One finished (or abandoned) call as the phone's own call log recorded it. */
export interface PendingDeviceReport {
  callId: string;
  /** Epoch ms of the call-log entry. Absent when the call was never placed. */
  startedAtMs: number;
  /** The call log's own duration in whole seconds. */
  durationSeconds: number;
  simRef: string | null;
  callLogRef: string | null;
  deviceRef: string | null;
  /** The call was never placed (the employee backed out of the SIM chooser, or permission was refused). */
  notPlaced: boolean;
  /** The call was placed but this phone cannot measure its length. The server records it with no duration and no classification. */
  durationUnavailable: boolean;
}

export interface DialerCapabilities {
  canPlace: boolean;
  /** Call-log access is granted: call length will be recorded from the phone's own log. */
  canMeasureDuration: boolean;
  /** This build of the app can ask for that access at all (the Play build cannot). */
  durationSupported: boolean;
  version: string;
}

/** Reads capabilities() defensively; an older app (or a malformed answer) yields the conservative reading. */
export function readCapabilities(bridge: DCDialerNative): DialerCapabilities {
  const fallback: DialerCapabilities = { canPlace: bridge.hasPermissions() === "true", canMeasureDuration: true, durationSupported: true, version: bridge.version() };
  try {
    const raw = bridge.capabilities?.();
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return { canPlace: o.canPlace === true, canMeasureDuration: o.canMeasureDuration === true, durationSupported: o.durationSupported === true, version: typeof o.version === "string" ? o.version.slice(0, 32) : fallback.version };
  } catch {
    return fallback;
  }
}

/** The Android bridge when running inside the app; null in an ordinary browser. */
export function getNativeDialer(): DCDialerNative | null {
  if (typeof window === "undefined") return null;
  const bridge = window.DCDialer;
  return bridge && typeof bridge.startCall === "function" && typeof bridge.pendingReports === "function" ? bridge : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses the outbox JSON defensively: anything malformed is dropped (the server validates again regardless). Pure.
 */
export function parsePendingReports(json: string): PendingDeviceReport[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: PendingDeviceReport[] = [];
  for (const item of raw.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.callId !== "string" || !UUID.test(r.callId)) continue;
    const notPlaced = r.notPlaced === true;
    const durationUnavailable = !notPlaced && r.durationUnavailable === true;
    const startedAtMs = Number(r.startedAtMs);
    const durationSeconds = Number(r.durationSeconds);
    if (!notPlaced && (!Number.isFinite(startedAtMs) || (!durationUnavailable && (!Number.isInteger(durationSeconds) || durationSeconds < 0)))) continue;
    const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 64) : null);
    out.push({ callId: r.callId, startedAtMs: notPlaced ? 0 : startedAtMs, durationSeconds: notPlaced || durationUnavailable ? 0 : durationSeconds, simRef: str(r.simRef), callLogRef: str(r.callLogRef), deviceRef: str(r.deviceRef), notPlaced, durationUnavailable });
  }
  return out;
}

/** Window event the sync component fires after the server accepted a device report; detail is the call's view. */
export const CALL_REPORTED_EVENT = "dc:call-reported";
