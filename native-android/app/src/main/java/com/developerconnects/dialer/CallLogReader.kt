package com.developerconnects.dialer

import android.content.Context
import android.provider.CallLog

/**
 * Turns an attempt the app dialed into a report for the website. Two honest cases:
 *
 *  1. MEASURABLE (internal build, call-log permission granted): read the phone's OWN call log for the OUTGOING entry, and report
 *     its start time and length. The numbers are Android's; the app never computes, adds to or edits them. The website
 *     classifies the length (> 10 seconds = CONNECTED).
 *  2. NOT MEASURABLE (play build, or permission not granted): the app cannot know how long the call lasted. Once the
 *     employee is back in the app it reports "attempted, length unavailable". It never guesses a length, and the website
 *     never counts such a call as Connected or Dialed.
 *
 * If no call-log entry appears within ATTEMPT_TIMEOUT_MS the attempt is reported "not placed" (the employee backed out of the
 * SIM chooser, or the dialer never connected). Reading the log is a poll, not a background service: it runs whenever the
 * website asks for pendingReports(), which it does every few seconds while the app is open.
 *
 * UNBUILT AND UNTESTED. Known device-dependent behavior to verify on real phones: some makers write the log entry a
 * moment after hang-up; some count voicemail greetings as talk time (the phone's figure is used as reported).
 */
object CallLogReader {
    private const val ATTEMPT_TIMEOUT_MS = 10 * 60 * 1000L
    private const val EARLY_SLACK_MS = 5_000L

    /** Coming back to the app sooner than this after dialing is the SIM chooser closing, not a finished call. */
    private const val MIN_CALL_WINDOW_MS = 4_000L

    fun resolveAttempts(context: Context, outbox: Outbox, lastResumedAtMs: Long) {
        val now = System.currentTimeMillis()
        for (attempt in outbox.attempts()) {
            if (!attempt.measurable) {
                if (lastResumedAtMs > attempt.startedAtMs + MIN_CALL_WINDOW_MS) {
                    outbox.add(PendingReport.unmeasured(attempt.callId, attempt.startedAtMs))
                    outbox.cancelAttempt(attempt.callId)
                } else if (now - attempt.startedAtMs > ATTEMPT_TIMEOUT_MS) {
                    outbox.add(PendingReport.notPlaced(attempt.callId))
                    outbox.cancelAttempt(attempt.callId)
                }
                continue
            }
            val entry = try {
                find(context, attempt)
            } catch (e: SecurityException) {
                // The permission was withdrawn after dialing: fall back to the honest "length unavailable" report.
                outbox.add(PendingReport.unmeasured(attempt.callId, attempt.startedAtMs))
                outbox.cancelAttempt(attempt.callId)
                continue
            }
            if (entry != null) {
                outbox.add(entry)
                outbox.cancelAttempt(attempt.callId)
            } else if (now - attempt.startedAtMs > ATTEMPT_TIMEOUT_MS) {
                outbox.add(PendingReport.notPlaced(attempt.callId))
                outbox.cancelAttempt(attempt.callId)
            }
        }
    }

    private fun find(context: Context, attempt: Attempt): PendingReport? {
        val tail = attempt.phone.filter { it.isDigit() }.takeLast(10)
        val projection = arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.PHONE_ACCOUNT_ID)
        val selection = "${CallLog.Calls.TYPE} = ? AND ${CallLog.Calls.DATE} >= ?"
        val args = arrayOf(CallLog.Calls.OUTGOING_TYPE.toString(), (attempt.startedAtMs - EARLY_SLACK_MS).toString())
        context.contentResolver.query(CallLog.Calls.CONTENT_URI, projection, selection, args, "${CallLog.Calls.DATE} ASC")?.use { c ->
            while (c.moveToNext()) {
                val number = c.getString(1)?.filter { it.isDigit() }.orEmpty()
                if (tail.isEmpty() || !number.endsWith(tail)) continue
                val duration = c.getInt(3)
                // The entry is final once Android has written a duration; a still-ringing call has none yet.
                return PendingReport(
                    callId = attempt.callId,
                    startedAtMs = c.getLong(2),
                    durationSeconds = duration.coerceAtLeast(0),
                    simRef = c.getString(4),
                    callLogRef = c.getLong(0).toString(),
                    deviceRef = android.os.Build.MODEL,
                    notPlaced = false,
                    durationUnavailable = false,
                )
            }
        }
        return null
    }
}
