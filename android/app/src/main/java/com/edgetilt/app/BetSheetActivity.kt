package com.edgetilt.app

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.window.OnBackInvokedDispatcher
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * In-app browser for Kalshi / Polymarket tickets. Android App Links hand these hosts to the Kalshi / Polymarket
 * apps, which drop the ticket params; a WebView never fires App Links. Mirrors iOS `EdgeBetSheet.swift`.
 * Polymarket gets the site-served `/native/bet-sheet-polymarket.js` auto-tap after the first page load.
 */
class BetSheetActivity : Activity() {
  private lateinit var webView: WebView
  private lateinit var stack: FrameLayout
  private val popups = mutableListOf<WebView>()
  private lateinit var progress: ProgressBar
  private var autoTapSource: String? = null
  private var pageReady = false
  private var autoTapDone = false
  private var initialUrl: Uri = Uri.EMPTY

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    initialUrl = Uri.parse(intent.getStringExtra(EXTRA_URL) ?: run { finish(); return })
    if (!EdgeLinks.isBet(initialUrl)) {
      finish()
      return
    }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
    }
    root.addView(header(), LinearLayout.LayoutParams(-1, dp(52)))
    progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
    root.addView(progress, LinearLayout.LayoutParams(-1, dp(3)))
    stack = FrameLayout(this)
    root.addView(stack, LinearLayout.LayoutParams(-1, 0, 1f))
    webView = newSheetWebView()
    stack.addView(webView, FrameLayout.LayoutParams(-1, -1))
    setContentView(root)
    applySystemInsets(root)

    webView.webViewClient = SheetClient()
    registerBack()
    fetchAutoTapScript()
    webView.loadUrl(initialUrl.toString())
  }

  override fun onPause() {
    CookieManager.getInstance().flush()
    super.onPause()
  }

  override fun onDestroy() {
    popups.forEach { it.destroy() }
    popups.clear()
    if (::webView.isInitialized) webView.destroy()
    super.onDestroy()
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun newSheetWebView(): WebView = WebView(this).apply {
    settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      setSupportMultipleWindows(true)
      javaScriptCanOpenWindowsAutomatically = true
    }
    // Plain Chrome mobile, so the books serve normal mobile web and Google sign-in is allowed.
    EdgeWebViews.presentAsChrome(settings)
    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
    webChromeClient = chromeClient
  }

  /**
   * Auth0 popup logins (Polymarket Google sign-in from a market page) hand the code back through
   * `window.opener.postMessage`, so popups need a real child WebView instead of loading in place.
   */
  private val chromeClient = object : WebChromeClient() {
    override fun onProgressChanged(view: WebView, newProgress: Int) {
      if (view != topWebView()) return
      progress.progress = newProgress
      progress.visibility = if (newProgress >= 100) View.INVISIBLE else View.VISIBLE
    }

    override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
      val popup = newSheetWebView()
      popup.webViewClient = PopupClient()
      popups.add(popup)
      stack.addView(popup, FrameLayout.LayoutParams(-1, -1))
      (resultMsg.obj as WebView.WebViewTransport).webView = popup
      resultMsg.sendToTarget()
      return true
    }

    override fun onCloseWindow(window: WebView) {
      closePopup(window)
    }
  }

  private fun topWebView(): WebView = popups.lastOrNull() ?: webView

  private fun closePopup(popup: WebView) {
    if (!popups.remove(popup)) return
    stack.removeView(popup)
    popup.destroy()
  }

  private fun goBackOrClose() {
    val top = topWebView()
    when {
      top.canGoBack() -> top.goBack()
      top != webView -> closePopup(top)
      else -> finish()
    }
  }

  private fun header(): View {
    val bar = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
    val done = label("Done", Gravity.START or Gravity.CENTER_VERTICAL, bold = true).apply {
      setOnClickListener { finish() }
    }
    val title = label(titleFor(initialUrl), Gravity.CENTER, bold = true).apply { setTextColor(Color.BLACK) }
    val outside = label("Open app", Gravity.END or Gravity.CENTER_VERTICAL, bold = false).apply {
      setOnClickListener {
        val current = webView.url?.let(Uri::parse) ?: initialUrl
        finish()
        EdgeLinks.openOutside(this@BetSheetActivity, current)
      }
    }
    bar.addView(title, FrameLayout.LayoutParams(-1, -1))
    bar.addView(done, FrameLayout.LayoutParams(-2, -1, Gravity.START))
    bar.addView(outside, FrameLayout.LayoutParams(-2, -1, Gravity.END))
    return bar
  }

  private fun label(text: String, gravity: Int, bold: Boolean) = TextView(this).apply {
    this.text = text
    this.gravity = gravity
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    setTextColor(Color.rgb(0, 122, 255))
    if (bold) typeface = Typeface.DEFAULT_BOLD
    setPadding(dp(16), 0, dp(16), 0)
  }

  private fun titleFor(uri: Uri): String {
    val host = uri.host.orEmpty()
    return when {
      host.contains("kalshi") -> "Kalshi"
      host.contains("polymarket") -> "Polymarket"
      else -> host
    }
  }

  private fun fetchAutoTapScript() {
    val host = initialUrl.host.orEmpty()
    if (host != "polymarket.us" && !host.endsWith(".polymarket.us")) return
    thread(name = "bet-sheet-script") {
      val source = try {
        val conn = URL("${BuildConfig.BASE_URL}$POLYMARKET_SCRIPT_PATH").openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.useCaches = false
        try {
          if (conn.responseCode == 200) conn.inputStream.bufferedReader().readText() else null
        } finally {
          conn.disconnect()
        }
      } catch (e: Exception) {
        null
      }
      if (source != null) {
        runOnUiThread {
          autoTapSource = source
          runAutoTapIfReady()
        }
      }
    }
  }

  /** Once per sheet, after the first main-frame finish and once the script has arrived. */
  private fun runAutoTapIfReady() {
    val source = autoTapSource ?: return
    if (!pageReady || autoTapDone || isFinishing) return
    autoTapDone = true
    webView.evaluateJavascript(source, null)
  }

  private inner class SheetClient : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      val uri = request.url
      if (EdgeLinks.isHttp(uri)) return false
      // App-store / tel / mailto / intent: links.
      EdgeLinks.openOutside(this@BetSheetActivity, uri)
      return true
    }

    override fun onPageFinished(view: WebView, url: String) {
      pageReady = true
      runAutoTapIfReady()
    }
  }

  private inner class PopupClient : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      val uri = request.url
      if (EdgeLinks.isHttp(uri)) return false
      EdgeLinks.openOutside(this@BetSheetActivity, uri)
      return true
    }
  }

  private fun registerBack() {
    if (Build.VERSION.SDK_INT >= 33) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
        goBackOrClose()
      }
    }
  }

  @Deprecated("Pre-33 back")
  override fun onBackPressed() {
    goBackOrClose()
  }

  private fun applySystemInsets(root: View) {
    root.setOnApplyWindowInsetsListener { v, insets ->
      if (Build.VERSION.SDK_INT >= 30) {
        val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
        v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      } else {
        @Suppress("DEPRECATION")
        v.setPadding(
          insets.systemWindowInsetLeft,
          insets.systemWindowInsetTop,
          insets.systemWindowInsetRight,
          insets.systemWindowInsetBottom,
        )
      }
      insets
    }
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  companion object {
    const val EXTRA_URL = "url"
    private const val POLYMARKET_SCRIPT_PATH = "/native/bet-sheet-polymarket.js"
  }
}
