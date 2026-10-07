import type { CallClassification } from "./types.ts";

/**
 * THE BUSINESS RULE FOR A CALL — one pure function, used by the server for every finished call and by nothing else.
 *
 *   duration <= 10 seconds  → DIALED
 *   duration  > 10 seconds  → CONNECTED   (strictly greater: exactly 10 is still DIALED)
 *
 *    0 s → DIALED     5 s → DIALED     10 s → DIALED     11 s → CONNECTED     30 s → CONNECTED     5 min → CONNECTED
 *
 * WHAT "DURATION" MEANS. It is the talk time the AUTHORITATIVE source reported for the call, in whole seconds:
 *  - Android SIM calls: the `duration` of the phone's own call-log entry for that outgoing call — Android's measure of
 *    how long the call was connected. It is 0 for a call nobody answered. (Some carriers and phone makers count from the
 *    moment the network answers, which can include a voicemail greeting; that is the phone's figure and is used as
 *    reported. The app never adds ring time or edits it.)
 *  - Telephony-provider calls: the provider's own reported duration (or its own answered/ended timestamps).
 * A call that never reached the other end has duration 0 and is DIALED. A call that could not be placed at all has no
 * classification (it is a failed attempt, not a dialed call).
 *
 * The client never sends, and the server never accepts, a classification: it only reports a duration, and the server
 * decides.
 */

export const CONNECTED_THRESHOLD_SECONDS = 10;

export function classifyCallDuration(durationSeconds: number | null | undefined): CallClassification {
  const seconds = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) ? durationSeconds : 0;
  return seconds > CONNECTED_THRESHOLD_SECONDS ? "CONNECTED" : "DIALED";
}
