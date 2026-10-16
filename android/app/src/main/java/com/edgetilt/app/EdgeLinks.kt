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

  fun isAppHost(uri: Uri): Boolean = isHttp(uri) && hostMatches(uri, appHosts)

  fun isBet(uri: Uri): Boolean = isHttp(uri) && hostMatches(uri, betHosts)

  fun staysInApp(uri: Uri): Boolean = isHttp(uri) && (hostMatches(uri, appHosts) || hostMatches(uri, authHosts))

  fun isEdgeCustomScheme(uri: Uri): Boolean =
    uri.scheme.equals("edgetilt", ignoreCase = true)

  /**
   * Map `edgetilt://…` handoffs (Yahoo / open / live-session) to an https SPA URL for the WebView.
   * OAuth auth-callback is handled by [EdgeWebAuth] and must not go through here.
   */
  fun httpsFromCustomScheme(uri: Uri): Uri? {
    if (!isEdgeCustomScheme(uri)) return null
    val host = uri.host?.lowercase() ?: return null
    if (host == "auth-callback") return null
    val base = Uri.parse(BuildConfig.BASE_URL)
    val b = base.buildUpon().path("/").clearQuery()
    when (host) {
      "yahoo-oauth", "open", "live-session" -> {
        // Preserve query (tab / yahoo / …)
        uri.queryParameterNames.forEach { name ->
          uri.getQueryParameter(name)?.let { b.appendQueryParameter(name, it) }
        }
        if (uri.getQueryParameter("tab").isNullOrBlank()) {
          b.appendQueryParameter("tab", if (host == "yahoo-oauth") "fantasy" else "home")
        }
        return b.build()
      }
      "live-game" -> {
        val id = uri.getQueryParameter("id")?.trim().orEmpty()
        b.appendQueryParameter("tab", "home")
        if (id.isNotEmpty()) b.appendQueryParameter("game", id)
        return b.build()
      }
      "auth" -> {
        // edgetilt://auth/confirm?… → https://…/auth/confirm?…
        val path = uri.path?.lowercase() ?: ""
        if (path == "/confirm" || path.startsWith("/confirm/")) {
          return base.buildUpon().path("/auth/confirm").encodedQuery(uri.encodedQuery).build()
        }
        return null
      }
      else -> return null
    }
  }

  /**
   * HTTPS App Link we are willing to open (mirrors IPA `isAllowedUniversalLink`).
   * Manifest claims these paths; this is the in-app gate for root `/?…` noise.
   */
  fun isAllowedAppLink(uri: Uri): Boolean {
    if (!isAppHost(uri)) return false
    val path = uri.path?.lowercase() ?: ""
    if (path == "/auth/confirm" || path.startsWith("/auth/confirm/")) return true
    if (path.startsWith("/lounge/p/")) return true
    if (path.startsWith("/lounge/g/")) return true
    if (path.startsWith("/u/")) return true
    if (path == "/" || path.isEmpty()) {
      for (name in listOf("post", "u", "profile", "game", "yahoo", "tab")) {
        val value = uri.getQueryParameter(name)?.trim().orEmpty()
        if (value.isNotEmpty()) return true
      }
    }
    return false
  }

  /**
   * Map share permalinks to the SPA query the web already opens (`/?tab=home&post=` / `&game=` / `&u=`).
   * Same job as IPA `canonicalWebURL(fromUniversalLink:)` … avoids loading OG HTML in the WebView.
   */
  fun canonicalWebUri(uri: Uri): Uri {
    if (!isAppHost(uri)) return uri
    val path = uri.path ?: return uri
    val pathLower = path.lowercase()

    fun spaHome(queryKey: String, value: String): Uri =
      uri.buildUpon()
        .path("/")
        .clearQuery()
        .appendQueryParameter("tab", "home")
        .appendQueryParameter(queryKey, value)
        .build()

    if (pathLower.startsWith("/lounge/p/")) {
      val id = pathLower.removePrefix("/lounge/p/").trim('/').substringBefore('/')
      if (id.isNotEmpty()) return spaHome("post", id)
    }
    if (pathLower.startsWith("/lounge/g/")) {
      val id = pathLower.removePrefix("/lounge/g/").trim('/').substringBefore('/')
      if (id.isNotEmpty()) return spaHome("game", id)
    }
    if (pathLower.startsWith("/u/")) {
      val handle = pathLower.removePrefix("/u/").trim('/').substringBefore('/')
      if (handle.isNotEmpty()) return spaHome("u", handle)
    }
    return uri
  }

  /** App Link / cold-start VIEW intent → URI to load (or null to fall back to BASE_URL). */
  fun appLinkLoadUri(uri: Uri?): Uri? {
    val raw = uri ?: return null
    if (!isAllowedAppLink(raw)) return null
    return canonicalWebUri(raw)
  }

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
