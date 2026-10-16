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
import org.json.JSONArray
import org.json.JSONObject

/**
 * CBS Fantasy login in its own WebView. Password is never read.
 * Completes with window event [EVENT]. CBS cookies are cleared afterward so the
 * main WebView is not left signed into CBS.
 */
object EdgeCbsLogin {
  const val EVENT = "edge-android-cbs-login"
  private const val LOGIN_URL =
    "https://www.cbssports.com/login?redirectUrl=https%3A%2F%2Fwww.cbssports.com%2Ffantasy%2Fgames%2Fmy-teams%2F"
  private const val MY_TEAMS = "https://www.cbssports.com/fantasy/games/my-teams/"
  private const val CHROME_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  private val mainHandler = Handler(Looper.getMainLooper())
  private var dialog: Dialog? = null
  private var webView: WebView? = null
  private var poll: Runnable? = null
  private var finished = false
  private var openedMyTeams = false
  private var openedLeague = false
  private var myTeamsScans = 0

  fun start(activity: Activity): JSONObject {
    if (activity !is MainActivity) {
      return JSONObject().put("ok", false).put("error", "Could not open CBS login.")
    }
    activity.runOnUiThread { present(activity) }
    return JSONObject().put("ok", true).put("started", true)
  }

  private fun present(activity: MainActivity) {
    dismiss(activity, notify = false)
    finished = false
    openedMyTeams = false
    openedLeague = false
    myTeamsScans = 0

    val cookies = CookieManager.getInstance()
    cookies.setAcceptCookie(true)

    val root = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
    }
    val cancel = Button(activity).apply {
      text = "Cancel"
      setOnClickListener { finish(activity, ok = false, cancelled = true, token = null, leagues = emptyList(), error = null) }
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

      override fun onPageStarted(v: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
        v?.evaluateJavascript(HOOK, null)
      }

      override fun onPageFinished(v: WebView?, url: String?) {
        harvest(activity)
      }
    }
    view.loadUrl(LOGIN_URL)

    root.addView(cancel, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    root.addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

    val sheet = EdgeBottomDialog.show(activity, root) {
      finish(activity, ok = false, cancelled = true, token = null, leagues = emptyList(), error = null)
    }
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
    val view = webView ?: return
    val loggedIn = CookieManager.getInstance().getCookie("https://www.cbssports.com")?.contains("pid=") == true
    view.evaluateJavascript(SCAN) { raw ->
      if (finished) return@evaluateJavascript
      val parsed = parseScan(raw)
      val url = view.url.orEmpty()
      val onLogin = url.contains("/login")
      if (loggedIn && onLogin && !openedMyTeams) {
        openedMyTeams = true
        view.loadUrl(MY_TEAMS)
        return@evaluateJavascript
      }
      if (url.contains("/fantasy/games/my-teams")) myTeamsScans += 1
      if (parsed.first.isEmpty() && parsed.second.isNotEmpty() && !openedLeague && myTeamsScans > 0) {
        openedLeague = true
        val first = parsed.second.first()
        val dest = if (first.all { it.isDigit() }) {
          "https://www.cbssports.com/fantasy/football/league/$first/"
        } else {
          "https://$first.football.cbssports.com/"
        }
        view.loadUrl(dest)
        return@evaluateJavascript
      }
      val ready = parsed.first.length >= 16 && (parsed.second.isNotEmpty() || myTeamsScans >= 2)
      if (ready) {
        mainHandler.post {
          finish(activity, ok = true, cancelled = false, token = parsed.first, leagues = parsed.second, error = null)
        }
      } else if (loggedIn && myTeamsScans >= 4 && parsed.first.isEmpty() && parsed.second.isEmpty()) {
        mainHandler.post {
          finish(activity, ok = false, cancelled = false, token = null, leagues = emptyList(), error = "No CBS football league showed up on My Teams.")
        }
      }
    }
  }

  private fun parseScan(raw: String?): Pair<String, List<String>> {
    val text = raw?.trim()?.removeSurrounding("\"")?.replace("\\\"", "\"") ?: return "" to emptyList()
    return try {
      val json = JSONObject(text)
      val token = json.optString("token")
      val arr = json.optJSONArray("leagues") ?: JSONArray()
      val leagues = buildList {
        for (i in 0 until arr.length()) {
          val id = arr.optString(i).trim()
          if (id.isNotEmpty()) add(id)
        }
      }
      token to leagues
    } catch (_: Exception) {
      "" to emptyList()
    }
  }

  private fun finish(
    activity: MainActivity,
    ok: Boolean,
    cancelled: Boolean,
    token: String?,
    leagues: List<String>,
    error: String?,
  ) {
    if (finished) return
    finished = true
    poll?.let { mainHandler.removeCallbacks(it) }
    poll = null
    if (ok) clearCbsCookies()
    val payload = JSONObject().put("ok", ok).put("cancelled", cancelled)
    if (!error.isNullOrBlank()) payload.put("error", error)
    if (ok && token != null) {
      payload.put("access_token", token)
      payload.put("league_ids", JSONArray(leagues))
    }
    activity.dispatchCbsLoginResult(payload.toString())
    dismiss(activity, notify = false)
  }

  private fun clearCbsCookies() {
    val cm = CookieManager.getInstance()
    val urls = listOf("https://www.cbssports.com", "https://cbssports.com")
    for (url in urls) {
      val jar = cm.getCookie(url) ?: continue
      for (part in jar.split(";")) {
        val name = part.substringBefore("=").trim()
        if (name.isEmpty()) continue
        cm.setCookie(url, "$name=; Max-Age=0; Path=/; Domain=.cbssports.com")
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
      activity.dispatchCbsLoginResult(JSONObject().put("ok", false).put("cancelled", true).toString())
    }
  }

  private const val HOOK = """
    (function(){
      if (window.__edgeCbsHook) return;
      window.__edgeCbsHook = true;
      window.__edgeCbs = window.__edgeCbs || { token: '', leagues: [] };
      function take(url, auth) {
        try {
          var u = String(url || '');
          var m = u.match(/[?&]access_token=([^&]+)/);
          if (m && m[1]) window.__edgeCbs.token = decodeURIComponent(m[1]);
          var authText = String(auth || '');
          if (authText.toLowerCase().indexOf('bearer ') === 0) window.__edgeCbs.token = authText.slice(7).trim();
        } catch (e) {}
      }
      var orig = window.fetch;
      if (orig) {
        window.fetch = function(input, init) {
          try {
            var url = typeof input === 'string' ? input : (input && input.url);
            var headers = init && init.headers;
            var auth = headers && (headers.Authorization || headers.authorization);
            take(url, auth);
          } catch (e) {}
          return orig.apply(this, arguments);
        };
      }
      var open = XMLHttpRequest.prototype.open;
      var setHeader = XMLHttpRequest.prototype.setRequestHeader;
      XMLHttpRequest.prototype.open = function(method, url) { this.__edgeUrl = url; return open.apply(this, arguments); };
      XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (String(name).toLowerCase() === 'authorization') take(this.__edgeUrl, value);
        else take(this.__edgeUrl, '');
        return setHeader.apply(this, arguments);
      };
    })();
  """

  private const val SCAN = """
    (function(){
      var bag = window.__edgeCbs || { token: '', leagues: [] };
      var html = document.documentElement ? document.documentElement.innerHTML : '';
      var found = html.match(/var token = "([^"]+)"/) || html.match(/access_token["'\s:=]+["']([A-Za-z0-9._~%-]{16,})/);
      if (found && found[1] && !bag.token) bag.token = found[1];
      var ids = bag.leagues ? bag.leagues.slice() : [];
      var links = document.querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].href || '';
        var sub = href.match(/https?:\/\/([a-z0-9-]+)\.football\.cbssports\.com/i);
        if (sub && sub[1] && sub[1] !== 'www') ids.push(sub[1]);
        var num = href.match(/\/fantasy\/football\/league\/(\d+)/i);
        if (num && num[1]) ids.push(num[1]);
      }
      var seen = {};
      var leagues = [];
      for (var j = 0; j < ids.length; j++) {
        if (!ids[j] || seen[ids[j]]) continue;
        seen[ids[j]] = true;
        leagues.push(ids[j]);
        if (leagues.length >= 20) break;
      }
      bag.leagues = leagues;
      window.__edgeCbs = bag;
      return JSON.stringify({ token: bag.token || '', leagues: leagues });
    })()
  """
}
