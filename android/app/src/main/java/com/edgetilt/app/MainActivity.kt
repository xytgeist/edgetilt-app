package com.edgetilt.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject

/** Loads the live site (no bundled web build), like the iOS WKWebView shell. */
class MainActivity : Activity() {
  private lateinit var webView: WebView
  private var fileCallback: ValueCallback<Array<Uri>>? = null
  private var pendingMediaRequest: PermissionRequest? = null
  private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
  /** The JS bridge only answers while the main frame is on our own site (not Supabase / Google auth hops). */
  @Volatile private var onAppPage = false

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    webView = WebView(this).apply { setBackgroundColor(Color.BLACK) }
    root.addView(webView, FrameLayout.LayoutParams(-1, -1))
    setContentView(root)
    applySystemInsets(root)

    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      mediaPlaybackRequiresUserGesture = false
      // target=_blank / window.open navigate this view, so shouldOverrideUrlLoading can route them.
      setSupportMultipleWindows(false)
      mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      allowFileAccess = false
    }
    EdgeWebViews.presentAsChrome(webView.settings, SHELL_UA_TOKEN)
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
    webView.webViewClient = ShellClient()
    webView.webChromeClient = ShellChrome()
    webView.setDownloadListener { url, _, _, _, _ -> EdgeLinks.openOutside(this, Uri.parse(url)) }
    webView.addJavascriptInterface(Bridge(), "EdgeAndroid")
    EdgePush.refreshToken(this)
    if (savedInstanceState == null) askPermissionsOnFirstLaunch()

    registerBack()
    val start = intent?.data?.takeIf { EdgeLinks.staysInApp(it) }?.toString() ?: BuildConfig.BASE_URL
    if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
      webView.loadUrl(start)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    intent.data?.takeIf { EdgeLinks.staysInApp(it) }?.let { webView.loadUrl(it.toString()) }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    webView.saveState(outState)
  }

  override fun onResume() {
    super.onResume()
    webView.onResume()
  }

  override fun onPause() {
    webView.onPause()
    CookieManager.getInstance().flush()
    super.onPause()
  }

  private fun registerBack() {
    if (Build.VERSION.SDK_INT >= 33) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
        if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
      }
    }
  }

  @Deprecated("Pre-33 back")
  override fun onBackPressed() {
    if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
  }

  // MARK: - Links

  private inner class ShellClient : WebViewClient() {
    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      onAppPage = EdgeLinks.isAppHost(Uri.parse(url))
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      if (!request.isForMainFrame) return false
      val uri = request.url
      return when {
        EdgeLinks.isBet(uri) -> {
          EdgeLinks.openBetSheet(this@MainActivity, uri)
          true
        }
        EdgeLinks.staysInApp(uri) -> false
        else -> {
          EdgeLinks.openOutside(this@MainActivity, uri)
          true
        }
      }
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
      recreate()
      return true
    }
  }

  // MARK: - JS bridge (`src/utils/edgeAndroid.js`)

  private inner class Bridge {
    @JavascriptInterface
    fun pushStatus(): String = if (onAppPage) EdgePush.status(this@MainActivity) else "prompt"

    @JavascriptInterface
    fun pushToken(): String = if (onAppPage) EdgePush.token(this@MainActivity) else ""

    @JavascriptInterface
    fun requestPush() {
      if (onAppPage) runOnUiThread { requestPushPermission() }
    }

    @JavascriptInterface
    fun openAppSettings() {
      if (!onAppPage) return
      runOnUiThread {
        startActivity(
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
        )
      }
    }

    @JavascriptInterface
    fun info(): String = JSONObject()
      .put("appId", BuildConfig.APPLICATION_ID)
      .put("version", BuildConfig.VERSION_NAME)
      .put("firebase", EdgePush.firebaseReady(this@MainActivity))
      .toString()
  }

  private fun requestPushPermission() {
    EdgePush.refreshToken(this)
    if (Build.VERSION.SDK_INT >= 33 && EdgePush.status(this) == "prompt") {
      EdgePush.markAsked(this)
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
    } else {
      dispatchPushStatus()
    }
  }

  /** Same up-front ask as the IPA (push + location at launch), once per install so we never nag. */
  private fun askPermissionsOnFirstLaunch() {
    val prefs = getSharedPreferences(SHELL_PREFS, MODE_PRIVATE)
    if (prefs.getBoolean(KEY_LAUNCH_ASKED, false)) return
    prefs.edit().putBoolean(KEY_LAUNCH_ASKED, true).apply()
    val wanted = buildList {
      if (Build.VERSION.SDK_INT >= 33 && EdgePush.status(this@MainActivity) == "prompt") {
        EdgePush.markAsked(this@MainActivity)
        add(Manifest.permission.POST_NOTIFICATIONS)
      }
      if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
      }
    }
    if (wanted.isNotEmpty()) requestPermissions(wanted.toTypedArray(), REQ_LAUNCH)
  }

  private fun dispatchPushStatus() {
    val status = EdgePush.status(this)
    webView.evaluateJavascript(
      "window.dispatchEvent(new CustomEvent('edge-android-push',{detail:{status:'$status'}}))",
      null,
    )
  }

  // MARK: - Uploads, camera / mic, location

  private inner class ShellChrome : WebChromeClient() {
    // Default poster is a gray Android glyph over every <video> until its first frame.
    override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

    override fun onShowFileChooser(
      view: WebView,
      callback: ValueCallback<Array<Uri>>,
      params: FileChooserParams,
    ): Boolean {
      fileCallback?.onReceiveValue(null)
      fileCallback = callback
      val pick = params.createIntent().apply {
        if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      }
      return try {
        startActivityForResult(pick, REQ_FILES)
        true
      } catch (e: Exception) {
        fileCallback = null
        false
      }
    }

    override fun onPermissionRequest(request: PermissionRequest) {
      runOnUiThread {
        val missing = mediaPermissionsFor(request.resources).filter {
          checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
          request.grant(request.resources)
        } else {
          pendingMediaRequest?.deny()
          pendingMediaRequest = request
          requestPermissions(missing.toTypedArray(), REQ_MEDIA)
        }
      }
    }

    override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
      if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
        callback.invoke(origin, true, false)
      } else {
        pendingGeo = origin to callback
        requestPermissions(
          arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
          REQ_GEO,
        )
      }
    }
  }

  private fun mediaPermissionsFor(resources: Array<String>): List<String> = buildList {
    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in resources) add(Manifest.permission.CAMERA)
    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in resources) add(Manifest.permission.RECORD_AUDIO)
  }

  @Deprecated("Platform Activity result")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQ_FILES) {
      super.onActivityResult(requestCode, resultCode, data)
      return
    }
    val callback = fileCallback ?: return
    fileCallback = null
    if (resultCode != RESULT_OK || data == null) {
      callback.onReceiveValue(null)
      return
    }
    val clip = data.clipData
    val uris = if (clip != null) {
      Array(clip.itemCount) { clip.getItemAt(it).uri }
    } else {
      WebChromeClient.FileChooserParams.parseResult(resultCode, data) ?: emptyArray()
    }
    callback.onReceiveValue(uris)
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, results)
    when (requestCode) {
      REQ_NOTIFY, REQ_LAUNCH -> {
        EdgePush.refreshToken(this)
        dispatchPushStatus()
      }
      REQ_MEDIA -> {
        val request = pendingMediaRequest ?: return
        pendingMediaRequest = null
        val granted = request.resources.filter { res ->
          mediaPermissionsFor(arrayOf(res)).all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
        }
        if (granted.isEmpty()) request.deny() else request.grant(granted.toTypedArray())
      }
      REQ_GEO -> {
        val (origin, callback) = pendingGeo ?: return
        pendingGeo = null
        val ok = results.any { it == PackageManager.PERMISSION_GRANTED }
        callback.invoke(origin, ok, false)
      }
    }
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

  companion object {
    /** Web can detect the shell by this token (like `EdgeiOS/` on iOS). */
    const val SHELL_UA_TOKEN = "EdgeAndroid/1.0.0"
    private const val REQ_FILES = 41
    private const val REQ_MEDIA = 42
    private const val REQ_GEO = 43
    private const val REQ_NOTIFY = 44
    private const val REQ_LAUNCH = 45
    private const val SHELL_PREFS = "edge_shell"
    private const val KEY_LAUNCH_ASKED = "launch_permissions_asked"
  }
}
