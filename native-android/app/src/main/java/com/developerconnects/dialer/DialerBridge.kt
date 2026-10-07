package com.developerconnects.dialer

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * window.DCDialer - the ONLY thing the website can call. No CRM logic lives here: it dials the number the server gave
 * it, later reads the phone's own call log for that call, and hands the result back through the outbox. The website
 * (and the database behind it) decides everything else, including whether a call counts as CONNECTED (> 10 seconds).
 *
 * UNBUILT AND UNTESTED: written against the Android SDK but never compiled or run on a device. See native-android/README.md.
 */
class DialerBridge(private val activity: Activity, private val outbox: Outbox) {

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun hasPermissions(): String = if (granted()) "true" else "false"

    @JavascriptInterface
    fun requestPermissions() {
        activity.runOnUiThread {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.CALL_PHONE, Manifest.permission.READ_CALL_LOG), 1)
        }
    }

    /**
     * Dials. On a phone with two SIMs Android shows its own SIM chooser when "Calling accounts -> Always ask" is set in
     * the phone's settings; the app cannot (and does not try to) pick a SIM for the employee.
     */
    @JavascriptInterface
    fun startCall(callId: String, phoneE164: String) {
        if (!granted()) {
            outbox.add(PendingReport.notPlaced(callId))
            return
        }
        val startedAtMs = System.currentTimeMillis()
        outbox.beginAttempt(callId, phoneE164, startedAtMs)
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(phoneE164))))
            } catch (e: SecurityException) {
                outbox.cancelAttempt(callId)
                outbox.add(PendingReport.notPlaced(callId))
            }
        }
    }

    @JavascriptInterface
    fun pendingReports(): String {
        // Finish any attempt whose call has ended: read the phone's call log now.
        CallLogReader.resolveAttempts(activity, outbox)
        return outbox.pendingJson()
    }

    @JavascriptInterface
    fun acknowledge(callId: String) {
        outbox.remove(callId)
    }

    private fun granted(): Boolean =
        ContextCompat.checkSelfPermission(activity, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
}
