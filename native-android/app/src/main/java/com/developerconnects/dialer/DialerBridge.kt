package com.developerconnects.dialer

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.TelecomManager
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * window.DCDialer - the ONLY thing the website can call. No CRM logic lives here: it places the call the server issued,
 * reports what it can honestly know, and hands that to the website through the outbox. The website (and the database
 * behind it) decides everything else, including whether a call counts as CONNECTED (> 10 seconds).
 *
 * HOW A CALL IS PLACED: through Android's official Telecom framework, TelecomManager.placeCall(), which is an ordinary
 * cellular call on the employee's own SIM. On a phone with two SIMs Android shows its own "Choose SIM for this call" dialog
 * (when the phone's calling-accounts setting is "Always ask"). The app is NOT a phone/dialer app, has no Developer Connects
 * number, and does not try to pick a SIM for the employee: choosing the SIM in-app would need READ_PHONE_STATE, which we
 * deliberately do not request.
 *
 * PERMISSIONS (see native-android/README.md for the policy position):
 *  - CALL_PHONE: required, to place the call. Requested alone, when the employee first taps Call.
 *  - READ_CALL_LOG: OPTIONAL and only in the "internal" build flavor. Used only to read the LENGTH of calls this app placed.
 *    The "play" flavor does not declare it at all. Never requested automatically: the website explains it and the
 *    employee chooses. Without it the app still places calls, and reports each as "attempted, length unavailable".
 *
 * UNBUILT AND UNTESTED: written against the Android SDK but never compiled or run on a device. See native-android/README.md.
 */
class DialerBridge(private val activity: Activity, private val outbox: Outbox) {

    /** When the employee last came back to the app (set by MainActivity.onResume). Used to notice that a call is over when the length cannot be read. */
    @Volatile
    private var lastResumedAtMs: Long = 0L

    fun onActivityResumed() {
        lastResumedAtMs = System.currentTimeMillis()
    }

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    /** "true" when the app may place calls (CALL_PHONE). Reading call length is separate: see capabilities(). */
    @JavascriptInterface
    fun hasPermissions(): String = if (canPlace()) "true" else "false"

    @JavascriptInterface
    fun capabilities(): String = JSONObject()
        .put("canPlace", canPlace())
        .put("canMeasureDuration", canMeasureDuration())
        .put("durationSupported", BuildConfig.CALL_LOG_ENABLED)
        .put("version", BuildConfig.VERSION_NAME)
        .toString()

    /** Older name, kept so an older website build still works: asks for CALL_PHONE only. */
    @JavascriptInterface
    fun requestPermissions() = requestCallPermission()

    @JavascriptInterface
    fun requestCallPermission() {
        activity.runOnUiThread {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.CALL_PHONE), REQUEST_CALL)
        }
    }

    /** Explicit and separate. A no-op in the "play" flavor, which does not carry the permission. */
    @JavascriptInterface
    fun requestDurationPermission() {
        if (!BuildConfig.CALL_LOG_ENABLED) return
        activity.runOnUiThread {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.READ_CALL_LOG), REQUEST_CALL_LOG)
        }
    }

    /**
     * Places the call for an attempt the server issued. Returns immediately; the outcome arrives through pendingReports().
     * On a phone with two SIMs Android shows its own SIM chooser; the app cannot (and does not try to) pick for the employee.
     */
    @JavascriptInterface
    fun startCall(callId: String, phoneE164: String) {
        if (!canPlace()) {
            outbox.add(PendingReport.notPlaced(callId))
            return
        }
        val startedAtMs = System.currentTimeMillis()
        // Remember whether this phone will be able to read the call's length, so the right report is made afterwards.
        outbox.beginAttempt(callId, phoneE164, startedAtMs, canMeasureDuration())
        activity.runOnUiThread {
            try {
                val telecom = activity.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                telecom.placeCall(Uri.fromParts(PhoneAccount.SCHEME_TEL, phoneE164, null), Bundle())
            } catch (e: SecurityException) {
                outbox.cancelAttempt(callId)
                outbox.add(PendingReport.notPlaced(callId))
            }
        }
    }

    @JavascriptInterface
    fun pendingReports(): String {
        // Finish any attempt whose call has ended: read the call log (when allowed) or note that the length is unavailable.
        CallLogReader.resolveAttempts(activity, outbox, lastResumedAtMs)
        return outbox.pendingJson()
    }

    @JavascriptInterface
    fun acknowledge(callId: String) {
        outbox.remove(callId)
    }

    private fun canPlace(): Boolean =
        ContextCompat.checkSelfPermission(activity, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED

    private fun canMeasureDuration(): Boolean =
        BuildConfig.CALL_LOG_ENABLED &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

    private companion object {
        const val REQUEST_CALL = 1
        const val REQUEST_CALL_LOG = 2
    }
}
