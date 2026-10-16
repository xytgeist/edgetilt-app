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
import java.net.URLDecoder

/**
 * ESPN Fantasy login in its own WebView. Chrome Custom Tabs cannot read cookies, and the
 * app WebView must not navigate to ESPN. Password is never read. Completes with
 * window event [EVENT].
 */
object EdgeEspnLogin {
  const val EVENT = "edge-android-espn-login"
  private const val LOGIN_URL = "https://www.espn.com/login"
  private const val CHROME_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  private val mainHandler = Handler(Looper.getMainLooper())
  private var dialog: Dialog? = null
  private var webView: WebView? = null
  private var poll: Runnable? = null
  private var finished = false

  fun start(activity: Activity): JSONObject {
    if (activity !is MainActivity) {
      return JSONObject().put("ok", false).put("error", "Could not open ESPN login.")
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
      setOnClickListener { finish(activity, ok = false, cancelled = true, espnS2 = null, swid = null) }
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
        harvest(activity)
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

    val sheet = Dialog(activity, android.R.style.Theme_DeviceDefault_Light_NoActionBar)
    sheet.setContentView(root)
    sheet.setCancelable(true)
    sheet.setOnCancelListener { finish(activity, ok = false, cancelled = true, espnS2 = null, swid = null) }
    sheet.show()
    dialog = sheet
    webView = view

    val tick = object : Runnable {
      override fun run() {
        if (finished) return
        harvest(activity)
        mainHandler.postDelayed(this, 1000L)
      }
    }
    poll = tick
    mainHandler.postDelayed(tick, 1000L)
  }

  private fun harvest(activity: MainActivity) {
    if (finished) return
    val session = readSession() ?: return
    mainHandler.post {
      finish(activity, ok = true, cancelled = false, espnS2 = session.first, swid = session.second)
    }
  }

  private fun readSession(): Pair<String, String>? {
    val jar = listOf(
      "https://www.espn.com",
      "https://fantasy.espn.com",
      "https://espn.com",
    ).mapNotNull { CookieManager.getInstance().getCookie(it) }.joinToString("; ")
    if (jar.isBlank()) return null
    val map = HashMap<String, String>()
    for (part in jar.split(";")) {
      val piece = part.trim()
      val eq = piece.indexOf('=')
      if (eq <= 0) continue
      map[piece.substring(0, eq)] = piece.substring(eq + 1)
    }
    val s2 = map["espn_s2"]?.trim().orEmpty()
    if (s2.length < 20) return null
    var swid = map["SWID"] ?: map["swid"] ?: return null
    swid = try {
      URLDecoder.decode(swid, "UTF-8")
    } catch (_: Exception) {
      swid
    }.trim()
    val bare = swid.removePrefix("{").removeSuffix("}")
    if (bare.length < 8) return null
    val wrapped = if (swid.startsWith("{")) swid else "{$bare}"
    return s2 to wrapped
  }

  private fun finish(
    activity: MainActivity,
    ok: Boolean,
    cancelled: Boolean,
    espnS2: String?,
    swid: String?,
  ) {
    if (finished) return
    finished = true
    poll?.let { mainHandler.removeCallbacks(it) }
    poll = null
    if (ok) clearEspnCookies()
    val payload = JSONObject().put("ok", ok).put("cancelled", cancelled)
    if (ok && espnS2 != null && swid != null) {
      payload.put("espn_s2", espnS2).put("swid", swid)
    }
    activity.dispatchEspnLoginResult(payload.toString())
    dismiss(activity, notify = false)
  }

  private fun clearEspnCookies() {
    val cm = CookieManager.getInstance()
    val expired = listOf(
      "espn_s2=; Max-Age=0; Path=/; Domain=.espn.com",
      "SWID=; Max-Age=0; Path=/; Domain=.espn.com",
    )
    for (url in listOf("https://www.espn.com", "https://fantasy.espn.com", "https://espn.com")) {
      for (cookie in expired) cm.setCookie(url, cookie)
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
      activity.dispatchEspnLoginResult(JSONObject().put("ok", false).put("cancelled", true).toString())
    }
  }
}
