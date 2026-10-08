package com.developerconnects.dialer

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** A call report waiting to be delivered. Mirrors PendingDeviceReport in src/lib/leads/native-bridge.ts. */
data class PendingReport(
    val callId: String,
    val startedAtMs: Long,
    val durationSeconds: Int,
    val simRef: String?,
    val callLogRef: String?,
    val deviceRef: String?,
    val notPlaced: Boolean,
    /** The call was placed but this phone could not read how long it lasted. The website records it with no duration and never counts it as Connected or Dialed. */
    val durationUnavailable: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("callId", callId)
        .put("startedAtMs", startedAtMs)
        .put("durationSeconds", durationSeconds)
        .put("simRef", simRef)
        .put("callLogRef", callLogRef)
        .put("deviceRef", deviceRef)
        .put("notPlaced", notPlaced)
        .put("durationUnavailable", durationUnavailable)

    companion object {
        fun notPlaced(callId: String) = PendingReport(callId, 0, 0, null, null, null, true)
        fun unmeasured(callId: String, startedAtMs: Long) = PendingReport(callId, startedAtMs, 0, null, null, android.os.Build.MODEL, false, true)
        fun fromJson(o: JSONObject) = PendingReport(
            o.getString("callId"), o.getLong("startedAtMs"), o.getInt("durationSeconds"),
            o.optString("simRef").ifEmpty { null }, o.optString("callLogRef").ifEmpty { null },
            o.optString("deviceRef").ifEmpty { null }, o.optBoolean("notPlaced"), o.optBoolean("durationUnavailable"),
        )
    }
}

/** An attempt the phone dialed whose call-log entry has not been read yet. */
/** `measurable`: the phone could read the call log for this attempt (internal build with the permission granted). */
data class Attempt(val callId: String, val phone: String, val startedAtMs: Long, val measurable: Boolean = true)

/**
 * Small durable store in SharedPreferences: attempts waiting for their call to end, and reports waiting for the website
 * to acknowledge them. A report stays here until acknowledged, so a dropped connection or a killed app loses nothing.
 */
class Outbox(context: Context) {
    private val prefs = context.getSharedPreferences("dc_outbox", Context.MODE_PRIVATE)

    @Synchronized fun attempts(): List<Attempt> = read("attempts").let { arr ->
        (0 until arr.length()).map { i -> arr.getJSONObject(i).let { Attempt(it.getString("callId"), it.getString("phone"), it.getLong("startedAtMs"), it.optBoolean("measurable", true)) } }
    }

    @Synchronized fun beginAttempt(callId: String, phone: String, startedAtMs: Long, measurable: Boolean) {
        val arr = read("attempts")
        arr.put(JSONObject().put("callId", callId).put("phone", phone).put("startedAtMs", startedAtMs).put("measurable", measurable))
        prefs.edit().putString("attempts", arr.toString()).apply()
    }

    @Synchronized fun cancelAttempt(callId: String) = replace("attempts") { it.getString("callId") != callId }

    @Synchronized fun add(report: PendingReport) {
        val arr = read("reports")
        for (i in 0 until arr.length()) if (arr.getJSONObject(i).getString("callId") == report.callId) return // one report per call
        arr.put(report.toJson())
        prefs.edit().putString("reports", arr.toString()).apply()
    }

    @Synchronized fun remove(callId: String) = replace("reports") { it.getString("callId") != callId }

    @Synchronized fun pendingJson(): String = read("reports").toString()

    private fun read(key: String): JSONArray = try { JSONArray(prefs.getString(key, "[]")) } catch (e: Exception) { JSONArray() }

    private fun replace(key: String, keep: (JSONObject) -> Boolean) {
        val arr = read(key)
        val out = JSONArray()
        for (i in 0 until arr.length()) arr.getJSONObject(i).let { if (keep(it)) out.put(it) }
        prefs.edit().putString(key, out.toString()).apply()
    }
}
