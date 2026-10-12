package com.edgetilt.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.browser.customtabs.CustomTabsIntent
import org.json.JSONObject

/**
 * Chrome Custom Tabs OAuth (Android equivalent of iOS `ASWebAuthenticationSession`).
 * JS: `EdgeAndroid.startWebAuthSession` → window event `edge-android-webauth`.
 */
object EdgeWebAuth {
  private const val TAG = "EdgeWebAuth"
  const val EVENT = "edge-android-webauth"
  private const val DEFAULT_SCHEME = "edgetilt"
  private const val CANCEL_GRACE_MS = 600L

  @Volatile private var pendingScheme: String? = null
  @Volatile private var awaitingReturn = false
  private val mainHandler = Handler(Looper.getMainLooper())
  private var cancelRunnable: Runnable? = null

  fun isCallbackUri(uri: Uri?, expectedScheme: String = DEFAULT_SCHEME): Boolean {
    val scheme = uri?.scheme?.lowercase() ?: return false
    return scheme == expectedScheme.lowercase()
  }

  /**
   * Launch Custom Tabs. Completes via [complete] when an `edgetilt://…` intent arrives,
   * or cancels shortly after [onHostResume] if the user closed the tab without a callback.
   */
  fun start(activity: Activity, url: String, callbackScheme: String): JSONObject {
    val href = url.trim()
    if (href.isEmpty()) return JSONObject().put("ok", false).put("error", "url required")
    val scheme = callbackScheme.trim().ifEmpty { DEFAULT_SCHEME }
    val uri = try {
      Uri.parse(href)
    } catch (_: Exception) {
      return JSONObject().put("ok", false).put("error", "bad url")
    }
    if (uri.scheme != "https" && uri.scheme != "http") {
      return JSONObject().put("ok", false).put("error", "url must be http(s)")
    }

    cancelPending(cancelled = true)
    pendingScheme = scheme.lowercase()
    awaitingReturn = true

    return try {
      CustomTabsIntent.Builder()
        .setShowTitle(true)
        .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
        .build()
        .launchUrl(activity, uri)
      JSONObject().put("ok", true).put("started", true)
    } catch (e: ActivityNotFoundException) {
      pendingScheme = null
      awaitingReturn = false
      // No browser that supports Custom Tabs … open a normal VIEW as last resort.
      try {
        activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
        JSONObject().put("ok", true).put("started", true).put("via", "view")
      } catch (e2: Exception) {
        Log.w(TAG, "launch failed", e2)
        JSONObject().put("ok", false).put("error", "Could not open browser for sign-in")
      }
    } catch (e: Exception) {
      pendingScheme = null
      awaitingReturn = false
      Log.w(TAG, "launch failed", e)
      JSONObject().put("ok", false).put("error", e.message ?: "launch failed")
    }
  }

  /** @return true when this URI completed a pending web-auth session. */
  fun handleCallback(activity: Activity, uri: Uri?): Boolean {
    if (uri == null || !awaitingReturn) return false
    val expected = pendingScheme ?: DEFAULT_SCHEME
    if (!isCallbackUri(uri, expected)) return false
    complete(
      activity,
      JSONObject().put("ok", true).put("url", uri.toString()),
    )
    return true
  }

  fun onHostResume(activity: Activity) {
    if (!awaitingReturn) return
    cancelRunnable?.let { mainHandler.removeCallbacks(it) }
    val run = Runnable {
      if (awaitingReturn) {
        complete(activity, JSONObject().put("ok", false).put("cancelled", true))
      }
    }
    cancelRunnable = run
    mainHandler.postDelayed(run, CANCEL_GRACE_MS)
  }

  private fun cancelPending(cancelled: Boolean) {
    cancelRunnable?.let { mainHandler.removeCallbacks(it) }
    cancelRunnable = null
    if (!awaitingReturn) return
    pendingScheme = null
    awaitingReturn = false
  }

  private fun complete(activity: Activity, payload: JSONObject) {
    cancelRunnable?.let { mainHandler.removeCallbacks(it) }
    cancelRunnable = null
    if (!awaitingReturn) return
    pendingScheme = null
    awaitingReturn = false
    val detail = payload.toString()
    activity.runOnUiThread {
      (activity as? MainActivity)?.dispatchWebAuthResult(detail)
    }
  }
}
