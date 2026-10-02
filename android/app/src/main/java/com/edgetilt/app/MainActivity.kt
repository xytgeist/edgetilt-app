package com.edgetilt.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.view.HapticFeedbackConstants
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
  private lateinit var videoPrep: EdgeVideoPrep
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
    videoPrep = EdgeVideoPrep(this, root)
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
    EdgeCallRing.ensurePhoneAccount(this)
    EdgeCallRing.bindHost(this)

    registerBack()
    val start = intent?.data?.takeIf { EdgeLinks.staysInApp(it) }?.toString() ?: BuildConfig.BASE_URL
    if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
      webView.loadUrl(start)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    val uri = intent.data?.takeIf { EdgeLinks.staysInApp(it) } ?: return
    // Prefer in-page routing when the SPA is already up. A full loadUrl wipes LiveKit /
    // ChatCallProvider mid answer (Answer used to open ?tab=chat&room= this way).
    if (onAppPage && !webView.url.isNullOrBlank()) {
      val target = uri.toString()
      val quoted = JSONObject.quote(target)
      webView.evaluateJavascript(
        "(function(){try{var u=$quoted;if(location.href===u)return;history.replaceState(null,'',u);window.dispatchEvent(new PopStateEvent('popstate'));}catch(e){location.href=u;}})()",
        null,
      )
    } else {
      webView.loadUrl(uri.toString())
    }
  }

  override fun onDestroy() {
    EdgeCallRing.bindHost(null)
    super.onDestroy()
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    webView.saveState(outState)
  }

  override fun onResume() {
    super.onResume()
    EdgeCallRing.bindHost(this)
    webView.onResume()
  }

  override fun onPause() {
    webView.onPause()
    CookieManager.getInstance().flush()
    super.onPause()
  }

  /** Replay / live CallKit-style events into the page (`edge-callkit-*`). */
  fun deliverWindowEvent(name: String, detail: JSONObject) {
    runOnUiThread {
      val safeName = name.replace("'", "")
      val payload = JSONObject.quote(detail.toString())
      webView.evaluateJavascript(
        "(function(){try{var d=JSON.parse($payload);window.dispatchEvent(new CustomEvent('$safeName',{detail:d}));}catch(e){}})()",
        null,
      )
    }
  }

  private fun registerBack() {
    if (Build.VERSION.SDK_INT >= 33) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
        if (videoPrep.cancel()) return@registerOnBackInvokedCallback
        if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
      }
    }
  }

  @Deprecated("Pre-33 back")
  override fun onBackPressed() {
    if (videoPrep.cancel()) return
    if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
  }

  // MARK: - Links

  private inner class ShellClient : WebViewClient() {
    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      onAppPage = EdgeLinks.isAppHost(Uri.parse(url))
      // Full document loads drop JS listeners; buffer call events until callRingWebReady again.
      EdgeCallRing.resetWebReady()
      // A full load drops the web's composer lock count, so drop the native lock with it.
      requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
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
    fun requestLocation() {
      if (onAppPage) runOnUiThread { requestLocationPermission() }
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
    fun share(json: String): Boolean {
      if (!onAppPage) return false
      val chooser = try {
        EdgeShare.chooser(this@MainActivity, JSONObject(json))
      } catch (e: Exception) {
        null
      } ?: return false
      runOnUiThread { startActivity(chooser) }
      return true
    }

    @JavascriptInterface
    fun haptic(style: String) {
      if (onAppPage) runOnUiThread { webView.performHapticFeedback(hapticConstant(style)) }
    }

    @JavascriptInterface
    fun setOrientationLock(lock: String) {
      if (!onAppPage) return
      runOnUiThread {
        // Tablets keep free rotation, like the iPad build.
        if (resources.configuration.smallestScreenWidthDp >= 600) return@runOnUiThread
        requestedOrientation = if (lock == "portrait") {
          ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        } else {
          ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
      }
    }

    @JavascriptInterface
    fun info(): String = JSONObject()
      .put("appId", BuildConfig.APPLICATION_ID)
      .put("version", BuildConfig.VERSION_NAME)
      .put("firebase", EdgePush.firebaseReady(this@MainActivity))
      .put("callRing", true)
      .toString()

    /** Foreground Realtime invite → native ring (same events as FCM). */
    @JavascriptInterface
    fun reportIncomingCall(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("skipped", "off-app").toString()
      val invite = EdgeCallRing.inviteFromJson(json)
        ?: return JSONObject().put("ok", false).put("skipped", "bad-payload").toString()
      return EdgeCallRing.reportIncoming(this@MainActivity, invite).toString()
    }

    @JavascriptInterface
    fun endNativeCall(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).toString()
      return try {
        val o = JSONObject(json.ifBlank { "{}" })
        val callId = o.optString("callId").trim().ifEmpty { null }
        val remote = o.optString("reason") == "remote"
        EdgeCallRing.end(this@MainActivity, callId, remote = remote).toString()
      } catch (_: Exception) {
        JSONObject().put("ok", false).toString()
      }
    }

    /** Flush buffered answer / decline / end after ChatCallProvider listeners are up. */
    @JavascriptInterface
    fun callRingWebReady(): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("replayed", 0).toString()
      return EdgeCallRing.markWebReady(this@MainActivity).toString()
    }
  }

  /** Styles match the IPA's `triggerHaptic`. */
  private fun hapticConstant(style: String): Int = when (style) {
    "light" -> HapticFeedbackConstants.CLOCK_TICK
    "heavy" -> HapticFeedbackConstants.LONG_PRESS
    "success" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
    "warning", "error" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
    else -> HapticFeedbackConstants.VIRTUAL_KEY
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

  private fun requestLocationPermission() {
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) return
    requestPermissions(
      arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
      REQ_LOCATION,
    )
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
      val pick = photoPickerIntent(params) ?: params.createIntent().apply {
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

  /**
   * System photo picker (no storage permission, multi-select) when the input only takes images / videos.
   * Other inputs keep the documents picker.
   */
  private fun photoPickerIntent(params: WebChromeClient.FileChooserParams): Intent? {
    if (Build.VERSION.SDK_INT < 33 || params.isCaptureEnabled) return null
    val types = params.acceptTypes.orEmpty().map { it.trim().lowercase() }.filter { it.isNotEmpty() }
    if (types.isEmpty() || !types.all { it.startsWith("image/") || it.startsWith("video/") }) return null
    val images = types.all { it.startsWith("image/") }
    val videos = types.all { it.startsWith("video/") }
    return Intent(MediaStore.ACTION_PICK_IMAGES).apply {
      if (images) type = "image/*" else if (videos) type = "video/*"
      if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
        putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, minOf(MediaStore.getPickImagesMaxLimit(), PHOTO_PICKER_MAX))
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
    videoPrep.prepare(uris) { callback.onReceiveValue(it) }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, results)
    when (requestCode) {
      REQ_NOTIFY -> {
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
    const val SHELL_UA_TOKEN = "EdgeAndroid/" + BuildConfig.VERSION_NAME
    private const val PHOTO_PICKER_MAX = 20
    private const val REQ_FILES = 41
    private const val REQ_MEDIA = 42
    private const val REQ_GEO = 43
    private const val REQ_NOTIFY = 44
    private const val REQ_LOCATION = 45
  }
}
