package com.edgetilt.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.util.Log

/** Where a tapped URL goes: our WebView, the bet sheet, or another app. */
object EdgeLinks {
  private val appHosts = setOf("edgetilt.com", "lvslotpro.com")
  private val betHosts = setOf("kalshi.com", "polymarket.us")
  /** OAuth hops that must finish inside the main WebView so the session lands in its storage. */
  private val authHosts = setOf("supabase.co", "accounts.google.com")

  private fun hostMatches(uri: Uri, roots: Set<String>): Boolean {
    val host = uri.host?.lowercase() ?: return false
    return roots.any { host == it || host.endsWith(".$it") }
  }

  fun isHttp(uri: Uri): Boolean {
    val scheme = uri.scheme?.lowercase()
    return scheme == "http" || scheme == "https"
  }

  fun isBet(uri: Uri): Boolean = isHttp(uri) && hostMatches(uri, betHosts)

  fun staysInApp(uri: Uri): Boolean = isHttp(uri) && (hostMatches(uri, appHosts) || hostMatches(uri, authHosts))

  fun openBetSheet(activity: Activity, uri: Uri) {
    activity.startActivity(
      Intent(activity, BetSheetActivity::class.java).putExtra(BetSheetActivity.EXTRA_URL, uri.toString()),
    )
  }

  /** Browser / other apps. `intent:` URLs fall back to their `browser_fallback_url`. */
  fun openOutside(activity: Activity, uri: Uri) {
    try {
      if (uri.scheme.equals("intent", ignoreCase = true)) {
        val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
        try {
          activity.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
          intent.getStringExtra("browser_fallback_url")?.let {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it)))
          }
        }
        return
      }
      activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (e: Exception) {
      Log.w("EdgeLinks", "openOutside failed for $uri", e)
    }
  }
}
