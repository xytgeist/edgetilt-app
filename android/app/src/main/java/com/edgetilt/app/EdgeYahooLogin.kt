package com.edgetilt.app

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import org.json.JSONObject

/**
 * Yahoo login in its own WebView. Stopgap while Yahoo's Fantasy API approval is pending: once Yahoo's own
 * fantasy web API answers for the signed-in user, returns the cookie header for that host. The app WebView
 * must not navigate to Yahoo. Password is never read. Completes with window event [EVENT].
 */
object EdgeYahooLogin {
  const val EVENT = "edge-android-yahoo-login"
  private const val LOGIN_URL =
    "https://login.yahoo.com/?.src=fantasy&.intl=us&.done=https%3A%2F%2Ffootball.fantasysports.yahoo.com%2F"
  private const val API_HOST_URL = "https://pub-api-ro.fantasysports.yahoo.com"
  private const val CHROME_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  /** Starts Yahoo's own profile probe once, then reports pending / yes / no on later polls. */
  private const val PROBE_JS =
    "(function(){var w=window;if(w.__edgeYahooProbe===undefined||w.__edgeYahooProbe==='no'){w.__edgeYahooProbe='pending';" +
      "fetch('https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2/users;use_login=1?format=json',{credentials:'include'})" +
      ".then(function(r){return r.ok?r.text():'';}).then(function(t){w.__edgeYahooProbe=t.indexOf('\"guid\"')>=0?'yes':'no';})" +
      ".catch(function(){w.__edgeYahooProbe='no';});}return w.__edgeYahooProbe;})()"

  private val mainHandler = Handler(Looper.getMainLooper())
  private var dialog: Dialog? = null
  private var webView: WebView? = null
  private var poll: Runnable? = null
  private var finished = false

  fun start(activity: Activity): JSONObject {
    if (activity !is MainActivity) {
      return JSONObject().put("ok", false).put("error", "Could not open Yahoo login.")
    }
    activity.runOnUiThread { present(activity) }
    return JSONObject().put("ok", true).put("started", true)
  }

  private fun present(activity: MainActivity) {
    dismiss(activity, notify = false)
    finished = false

    val cookies = CookieManager.getInstance()
    cookies.setAcceptCookie(true)

    val root = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
    }
    val cancel = Button(activity).apply {
      text = "Cancel"
      setOnClickListener { finish(activity, ok = false, cancelled = true, cookie = null) }
    }
    val view = WebView(activity)
    cookies.setAcceptThirdPartyCookies(view, true)
    view.settings.javaScriptEnabled = true
    view.settings.domStorageEnabled = true
    view.settings.userAgentString = CHROME_UA
    view.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
        val scheme = request.url.scheme?.lowercase()
        return scheme != "https" && scheme != "http"
      }

      override fun onPageFinished(v: WebView?, url: String?) {
        probe(activity)
      }
    }
    view.loadUrl(LOGIN_URL)

    root.addView(
      cancel,
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
    )
    root.addView(
      view,
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f),
    )

    val sheet = EdgeBottomDialog.show(activity, root) {
      finish(activity, ok = false, cancelled = true, cookie = null)
    }
    dialog = sheet
    webView = view

    val tick = object : Runnable {
      override fun run() {
        if (finished) return
        probe(activity)
        mainHandler.postDelayed(this, 1500L)
      }
    }
    poll = tick
    mainHandler.postDelayed(tick, 1500L)
  }

  private fun probe(activity: MainActivity) {
    if (finished) return
    val view = webView ?: return
    val host = android.net.Uri.parse(view.url ?: "").host?.lowercase().orEmpty()
    if (!host.endsWith("fantasysports.yahoo.com")) return
    view.evaluateJavascript(PROBE_JS) { value ->
      if (finished || value?.trim('"') != "yes") return@evaluateJavascript
      val jar = CookieManager.getInstance().getCookie(API_HOST_URL).orEmpty().trim()
      if (jar.length < 40) return@evaluateJavascript
      mainHandler.post { finish(activity, ok = true, cancelled = false, cookie = jar) }
    }
  }

  private fun finish(activity: MainActivity, ok: Boolean, cancelled: Boolean, cookie: String?) {
    if (finished) return
    finished = true
    poll?.let { mainHandler.removeCallbacks(it) }
    poll = null
    if (ok && cookie != null) clearYahooCookies(cookie)
    val payload = JSONObject().put("ok", ok).put("cancelled", cancelled)
    if (ok && cookie != null) payload.put("cookie", cookie)
    activity.dispatchYahooLoginResult(payload.toString())
    dismiss(activity, notify = false)
  }

  /** CookieManager is shared with the app WebView … expire the Yahoo session we just handed off. */
  private fun clearYahooCookies(header: String) {
    val cm = CookieManager.getInstance()
    val names = header.split(";").mapNotNull { part ->
      val eq = part.indexOf('=')
      if (eq > 0) part.substring(0, eq).trim() else null
    }
    val urls = listOf("https://yahoo.com", "https://login.yahoo.com", "https://football.fantasysports.yahoo.com")
    for (name in names) {
      for (url in urls) {
        cm.setCookie(url, "$name=; Max-Age=0; Path=/; Domain=.yahoo.com")
        cm.setCookie(url, "$name=; Max-Age=0; Path=/")
      }
    }
    cm.flush()
  }

  private fun dismiss(activity: Activity, notify: Boolean) {
    poll?.let { mainHandler.removeCallbacks(it) }
    poll = null
    webView?.apply {
      stopLoading()
      (parent as? ViewGroup)?.removeView(this)
      destroy()
    }
    webView = null
    val sheet = dialog
    dialog = null
    sheet?.setOnCancelListener(null)
    sheet?.dismiss()
    if (notify && !finished && activity is MainActivity) {
      finished = true
      activity.dispatchYahooLoginResult(JSONObject().put("ok", false).put("cancelled", true).toString())
    }
  }
}
