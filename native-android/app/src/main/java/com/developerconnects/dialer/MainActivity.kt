package com.developerconnects.dialer

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity

/**
 * The whole app: a WebView on the Developer Connects team workspace plus the DCDialer bridge. The bridge is attached
 * only when the page is on the allowed host, and navigation off that host is refused, so no other site can ever reach
 * window.DCDialer. Sign-in is the website's own (Clerk) - the app stores no credentials.
 *
 * UNBUILT AND UNTESTED.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.addJavascriptInterface(DialerBridge(this, Outbox(applicationContext)), "DCDialer")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = !allowed(request.url)
        }
        web.loadUrl(BuildConfig.START_URL)
    }

    /**
     * Coming back to the app (typically right after a call ends) tells the page to sync at once. This needs no extra
     * permission: it only nudges the website, which then asks pendingReports() for the call-log result.
     */
    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.evaluateJavascript("window.dispatchEvent(new Event('dc:app-resumed'))", null)
    }

    private fun allowed(uri: Uri): Boolean {
        val host = uri.host ?: return false
        val own = Uri.parse(BuildConfig.START_URL).host
        // Clerk's hosted sign-in pages are on a Clerk domain; allow only the configured hosts.
        return uri.scheme == "https" && (host == own || BuildConfig.EXTRA_ALLOWED_HOSTS.split(",").contains(host))
    }

    @Deprecated("Back navigates the WebView first")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
    }
}
