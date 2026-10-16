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
import android.webkit.WebResourceResponse
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
  private lateinit var edgeVideo: EdgeVideoNative
  private lateinit var edgeDocumentScanner: EdgeDocumentScanner
  private var pendingMediaRequest: PermissionRequest? = null
  private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
  /** The JS bridge only answers while the main frame is on our own site (not Supabase / Google auth hops). */
  @Volatile private var onAppPage = false
  /**
   * Live-session tab from notif tap. Applied after SPA mount (auth may not be ready yet …
   * [pokeLiveSessionOpen] retries `edge-live-session-open`).
   */
  @Volatile private var pendingLiveSessionTab: String? = null

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    webView = WebView(this).apply { setBackgroundColor(Color.BLACK) }
    root.addView(webView, FrameLayout.LayoutParams(-1, -1))
    setContentView(root)
    videoPrep = EdgeVideoPrep(this, root)
    edgeVideo = EdgeVideoNative(this) { event, detail -> deliverWindowEvent(event, detail) }
    edgeDocumentScanner = EdgeDocumentScanner(this) { event, detail -> deliverWindowEvent(event, detail) }
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
    // Custom Tabs OAuth return (edgetilt://…) must not load as the WebView start URL.
    if (EdgeWebAuth.handleCallback(this, intent?.data)) {
      if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
        webView.loadUrl(BuildConfig.BASE_URL)
      }
      return
    }
    // Deep link / live-session notif: never let WebView.restoreState win (would reopen Lounge).
    val handoff = resolveIncomingUri(intent)
    if (handoff != null) {
      pendingLiveSessionTab = liveSessionTab(intent, handoff)
      webView.loadUrl(handoff.toString())
      return
    }
    if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
      webView.loadUrl(BuildConfig.BASE_URL)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (EdgeWebAuth.handleCallback(this, intent.data)) return
    val uri = resolveIncomingUri(intent) ?: return
    // Prefer in-page routing when the SPA is already up. A full loadUrl wipes LiveKit /
    // ChatCallProvider mid answer (Answer used to open ?tab=chat&room= this way).
    if (onAppPage && !webView.url.isNullOrBlank()) {
      navigateSpaInPlace(uri, liveSessionTab(intent, uri))
    } else {
      pendingLiveSessionTab = liveSessionTab(intent, uri)
      webView.loadUrl(uri.toString())
    }
  }

  /**
   * VIEW intent → https SPA URI, or null.
   * Live-session notif (1.3.12+): https `/?tab=` + [EdgeLiveBankroll.EXTRA_OPEN_TAB].
   * Still maps legacy `edgetilt://live-session` if an old PendingIntent is alive.
   */
  private fun resolveIncomingUri(intent: Intent?): Uri? {
    if (intent == null) return null
    val data = intent.data
    if (data != null) {
      val mapped =
        EdgeLinks.appLinkLoadUri(data)
          ?: data.takeIf { EdgeLinks.staysInApp(it) }
          ?: data.takeIf { EdgeLinks.isEdgeCustomScheme(it) }?.let { EdgeLinks.httpsFromCustomScheme(it) }
      if (mapped != null) return mapped
    }
    val tab = intent.getStringExtra(EdgeLiveBankroll.EXTRA_OPEN_TAB)?.trim().orEmpty()
    if (tab == "bankroll" || tab == "poker-bankroll") {
      return spaTabUri(tab)
    }
    return null
  }

  private fun spaTabUri(tab: String): Uri =
    Uri.parse(BuildConfig.BASE_URL.trimEnd('/') + "/").buildUpon()
      .appendQueryParameter("tab", tab)
      .build()

  private fun liveSessionTab(intent: Intent?, uri: Uri): String? {
    val fromExtra = intent?.getStringExtra(EdgeLiveBankroll.EXTRA_OPEN_TAB)?.trim().orEmpty()
    if (fromExtra == "bankroll" || fromExtra == "poker-bankroll") return fromExtra
    val fromQuery = uri.getQueryParameter("tab")?.trim().orEmpty()
    return when (fromQuery) {
      "bankroll", "poker-bankroll" -> fromQuery
      else -> null
    }
  }

  /** Warm path: replaceState + popstate (worked on 1.3.9) plus live-session poke retries. */
  private fun navigateSpaInPlace(uri: Uri, liveTab: String?) {
    val quoted = JSONObject.quote(uri.toString())
    val poke =
      if (liveTab != null) {
        pendingLiveSessionTab = null
        pokeLiveSessionOpenJs(liveTab)
      } else {
        ""
      }
    webView.evaluateJavascript(
      "(function(){try{var u=$quoted;if(location.href!==u){history.replaceState(null,'',u);window.dispatchEvent(new PopStateEvent('popstate'));}$poke}catch(e){location.href=u;}})()",
      null,
    )
  }

  /** Retries until AppShell auth is ready (openLive*Bankroll no-ops early). */
  private fun pokeLiveSessionOpenJs(tab: String): String {
    val quoted = JSONObject.quote(tab)
    return "var tab=$quoted,n=0;function poke(){try{window.dispatchEvent(new CustomEvent('edge-live-session-open',{detail:{tab:tab}}));}catch(e){}if(++n<20)setTimeout(poke,500);}poke();"
  }

  private fun flushPendingLiveSessionOpen() {
    val tab = pendingLiveSessionTab ?: return
    if (!onAppPage) return
    pendingLiveSessionTab = null
    webView.evaluateJavascript("(function(){try{${pokeLiveSessionOpenJs(tab)}}catch(e){}})()", null)
  }

  /** Deliver Custom Tabs OAuth result to JS (`edge-android-webauth`). */
  fun dispatchWebAuthResult(detailJson: String) {
    val quoted = JSONObject.quote(detailJson)
    webView.evaluateJavascript(
      "(function(){try{var d=JSON.parse($quoted);window.dispatchEvent(new CustomEvent('${EdgeWebAuth.EVENT}',{detail:d}));}catch(e){}})()",
      null,
    )
  }

  /** Deliver CBS login-sheet session to JS (`edge-android-cbs-login`). Do not log [detailJson]. */
  fun dispatchCbsLoginResult(detailJson: String) {
    val quoted = JSONObject.quote(detailJson)
    webView.evaluateJavascript(
      "(function(){try{var d=JSON.parse($quoted);window.dispatchEvent(new CustomEvent('${EdgeCbsLogin.EVENT}',{detail:d}));}catch(e){}})()",
      null,
    )
  }

  /** Deliver ESPN login-sheet cookies to JS (`edge-android-espn-login`). Do not log [detailJson]. */
  fun dispatchEspnLoginResult(detailJson: String) {
    val quoted = JSONObject.quote(detailJson)
    webView.evaluateJavascript(
      "(function(){try{var d=JSON.parse($quoted);window.dispatchEvent(new CustomEvent('${EdgeEspnLogin.EVENT}',{detail:d}));}catch(e){}})()",
      null,
    )
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
    EdgeWebAuth.onHostResume(this)
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

    override fun onPageFinished(view: WebView, url: String) {
      onAppPage = EdgeLinks.isAppHost(Uri.parse(url))
      // SPA listeners are up … deliver queued live-session notif open (iOS Island parity).
      flushPendingLiveSessionOpen()
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

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
      return edgeVideo.intercept(request) ?: super.shouldInterceptRequest(view, request)
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

    /**
     * Live slots / poker session ongoing notification (iOS ActivityKit twin).
     * JSON `{ slots?, poker? }` … empty / null ids clears. Tap → `edgetilt://live-session`.
     */
    @JavascriptInterface
    fun syncLiveBankrollActivity(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return try {
        EdgeLiveBankroll.sync(this@MainActivity, json.ifBlank { "{}" }).toString()
      } catch (e: Exception) {
        JSONObject().put("ok", false).put("error", e.message ?: "failed").toString()
      }
    }

    /** In-call earpiece ↔ speakerphone (`AudioManager`). JSON `{ route: 'speaker' | 'earpiece' }`. */
    @JavascriptInterface
    fun setAudioRoute(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).toString()
      return try {
        val o = JSONObject(json.ifBlank { "{}" })
        val route = o.optString("route").trim().lowercase()
        val speaker = route == "speaker" || route == "speakerphone"
        EdgeCallRing.setSpeakerphone(this@MainActivity, speaker).toString()
      } catch (_: Exception) {
        JSONObject().put("ok", false).toString()
      }
    }

    /**
     * Chrome Custom Tabs OAuth (Google / Yahoo). JSON `{ url, callbackScheme? }`.
     * Completes with window event `edge-android-webauth` `{ ok, url?, cancelled?, error? }`.
     */
    @JavascriptInterface
    fun startWebAuthSession(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return try {
        val o = JSONObject(json.ifBlank { "{}" })
        val url = o.optString("url").trim()
        val scheme = o.optString("callbackScheme").trim().ifEmpty { "edgetilt" }
        val latch = java.util.concurrent.CountDownLatch(1)
        var result = JSONObject().put("ok", false)
        runOnUiThread {
          result = EdgeWebAuth.start(this@MainActivity, url, scheme)
          latch.countDown()
        }
        latch.await(8, java.util.concurrent.TimeUnit.SECONDS)
        result.toString()
      } catch (e: Exception) {
        JSONObject().put("ok", false).put("error", e.message ?: "failed").toString()
      }
    }

    /**
     * ESPN Fantasy login sheet. Returns `{ ok, started }` immediately.
     * Completes with window event `edge-android-espn-login` `{ ok, cancelled?, espn_s2?, swid? }`.
     */
    /**
     * CBS Fantasy login sheet. Returns `{ ok, started }` immediately.
     * Completes with window event `edge-android-cbs-login`.
     */
    @JavascriptInterface
    fun startCbsFantasyLogin(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return try {
        EdgeCbsLogin.start(this@MainActivity).toString()
      } catch (e: Exception) {
        JSONObject().put("ok", false).put("error", e.message ?: "failed").toString()
      }
    }

    @JavascriptInterface
    fun startEspnFantasyLogin(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return try {
        EdgeEspnLogin.start(this@MainActivity).toString()
      } catch (e: Exception) {
        JSONObject().put("ok", false).put("error", e.message ?: "failed").toString()
      }
    }

    /** Lounge/Chat native video pick. Completes via `edge-android-video-result`. */
    @JavascriptInterface
    fun pickEdgeVideo(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return edgeVideo.pick(json.ifBlank { "{}" })
    }

    @JavascriptInterface
    fun exportEdgeVideo(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return edgeVideo.export(json.ifBlank { "{}" })
    }

    @JavascriptInterface
    fun uploadEdgeVideoTus(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return edgeVideo.uploadTus(json.ifBlank { "{}" })
    }

    @JavascriptInterface
    fun uploadEdgeVideoPut(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return edgeVideo.uploadPut(json.ifBlank { "{}" })
    }

    @JavascriptInterface
    fun cancelEdgeVideo(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).toString()
      return edgeVideo.cancel(json.ifBlank { "{}" })
    }

    /** ML Kit document scanner. Completes via `edge-android-scan-result`. */
    @JavascriptInterface
    fun scanDocument(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return edgeDocumentScanner.scan(json.ifBlank { "{}" })
    }

    /** On-device Latin OCR (sync JSON). IPA twin `recognizeText`. */
    @JavascriptInterface
    fun recognizeText(json: String): String {
      if (!onAppPage) return JSONObject().put("ok", false).put("error", "off-app").toString()
      return EdgeTextRecognizer.recognize(json.ifBlank { "{}" })
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
    if (requestCode == EdgeVideoNative.REQ_PICK) {
      edgeVideo.onPickResult(resultCode, data)
      return
    }
    if (requestCode == EdgeDocumentScanner.REQ_SCAN) {
      edgeDocumentScanner.onScanResult(resultCode, data)
      return
    }
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
