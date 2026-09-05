import UIKit
import WebKit

/// JS ↔ Swift bridge. Contract: `docs/ios-native-bridge.md`
final class EdgeNativeBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
  private weak var webView: WKWebView?
  private let messageHandlerName = "edgeNative"
  /// Fired after each main-frame navigation finish (safe-area re-inject, etc.).
  var onDidFinishNavigation: (() -> Void)?

  func attach(webView: WKWebView) {
    self.webView = webView
  }

  func makeConfiguration() -> WKWebViewConfiguration {
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    config.defaultWebpagePreferences.allowsContentJavaScript = true

    let controller = config.userContentController
    controller.add(self, name: messageHandlerName)
    controller.addUserScript(
      WKUserScript(
        source: Self.bridgeBootstrapScript,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
      )
    )
    return config
  }

  // MARK: - WKScriptMessageHandler

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard message.name == messageHandlerName,
          let body = message.body as? [String: Any],
          let id = body["id"] as? String,
          let method = body["method"] as? String
    else { return }

    let payload = body["payload"] as? [String: Any]
    handle(method: method, payload: payload) { [weak self] result in
      self?.resolve(id: id, result: result)
    }
  }

  private func handle(
    method: String,
    payload: [String: Any]?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    switch method {
    case "getInfo":
      completion(.success([
        "shellVersion": AppConfig.shellVersion,
        "build": AppConfig.buildNumber,
        "environment": AppConfig.environment,
        // Matches EdgeTilt.entitlements aps-environment (production for TestFlight / App Store).
        "apsEnvironment": "production",
        "ua": AppConfig.userAgentToken,
      ]))
    case "openInSafari":
      guard let urlString = payload?["url"] as? String,
            let url = URL(string: urlString),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https"
      else {
        completion(.success(["ok": false]))
        return
      }
      DispatchQueue.main.async {
        UIApplication.shared.open(url, options: [:]) { ok in
          completion(.success(["ok": ok]))
        }
      }
    case "openAppSettings":
      DispatchQueue.main.async {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
          completion(.success(["ok": false]))
          return
        }
        UIApplication.shared.open(url, options: [:]) { ok in
          completion(.success(["ok": ok]))
        }
      }
    case "bustServiceWorker":
      bustServiceWorker(completion: completion)
    case "getPushPermissionStatus":
      EdgePushManager.shared.permissionStatus(completion: completion)
    case "requestPushPermission":
      EdgePushManager.shared.requestPermission(completion: completion)
    case "getPushToken":
      completion(.success(EdgePushManager.shared.currentTokenPayload()))
    case "setAudioSession":
      let mode = (payload?["mode"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      EdgeAudioSession.apply(mode: mode) { result in
        switch result {
        case .success:
          completion(.success(["ok": true]))
        case .failure(let error):
          completion(.failure(error))
        }
      }
    case "setAudioRoute":
      let route = (payload?["route"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
      EdgeAudioSession.setOutputRoute(speaker: route == "speaker") { result in
        switch result {
        case .success:
          completion(.success(["ok": true, "route": route == "speaker" ? "speaker" : "earpiece"]))
        case .failure(let error):
          completion(.failure(error))
        }
      }
    case "triggerHaptic":
      let style = (payload?["style"] as? String) ?? "light"
      EdgeHaptics.trigger(style: style)
      completion(.success(["ok": true]))
    case "getCallKitCapabilities":
      completion(.success(["supported": true, "voipPush": true]))
    case "preloadAvatar":
      let avatarUrl = (payload?["avatarUrl"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      EdgeCallKitCallerAvatar.prefetchToCache(avatarUrl: avatarUrl)
      completion(.success(["ok": true]))
    case "setActiveChatRoom":
      let roomId = (payload?["roomId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      EdgePushManager.shared.activeChatRoomId = (roomId?.isEmpty == false) ? roomId : nil
      completion(.success(["ok": true]))
    case "reportIncomingCall":
      let callId = (payload?["callId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let roomId = (payload?["roomId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let handle = (payload?["handle"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "Incoming call"
      let hasVideo = (payload?["hasVideo"] as? Bool) ?? false
      let uuid = payload?["uuid"] as? String
      let avatarUrl = (payload?["avatarUrl"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !callId.isEmpty else {
        completion(.success(["ok": false]))
        return
      }
      EdgeCallKitManager.shared.reportIncomingCall(
        uuidString: uuid,
        callId: callId,
        roomId: roomId,
        handle: handle,
        hasVideo: hasVideo,
        avatarUrl: avatarUrl?.isEmpty == false ? avatarUrl : nil,
        completion: completion
      )
    case "endNativeCall":
      EdgeCallKitManager.shared.endCall(
        uuidString: payload?["uuid"] as? String,
        callId: payload?["callId"] as? String,
        reason: payload?["reason"] as? String,
        completion: completion
      )
    case "getVoIPPushToken":
      completion(.success(EdgeCallKitManager.shared.currentVoIPTokenPayload()))
    case "callKitWebReady":
      EdgeCallKitManager.shared.markWebReady(completion: completion)
    case "callKitDidConnect":
      EdgeCallKitManager.shared.markMediaConnected(completion: completion)
    case "setAuthSession":
      setAuthSession(payload: payload, completion: completion)
    case "clearAuthSession":
      EdgeAuthSessionStore.clear()
      completion(.success(["ok": true]))
    case "startNativeCall":
      startNativeCall(payload: payload, completion: completion)
    case "acceptNativeCall":
      acceptNativeCall(payload: payload, completion: completion)
    case "setNativeCallMute":
      let muted = (payload?["muted"] as? Bool) ?? false
      EdgeLiveKitCallManager.shared.setMuted(muted)
      EdgeCallKitManager.shared.setMuted(muted: muted)
      completion(.success(["ok": true, "muted": muted]))
    case "setNativeCallCamera":
      let enabled = payload?["enabled"] as? Bool
      let flip = (payload?["flip"] as? Bool) ?? false
      EdgeLiveKitCallManager.shared.setCamera(enabled: enabled, flip: flip)
      completion(.success(["ok": true, "enabled": enabled ?? true]))
    case "setNativeCallSpeaker":
      let speaker = (payload?["speaker"] as? Bool) ?? false
      EdgeLiveKitCallManager.shared.setSpeaker(speaker)
      completion(.success(["ok": true, "speaker": speaker]))
    case "setNativeCallChrome":
      EdgeLiveKitCallManager.shared.setChrome(
        minimized: payload?["minimized"] as? Bool,
        videoVisible: payload?["videoVisible"] as? Bool,
        participantAvatars: payload?["participantAvatars"] as? [[String: Any]],
        controlsHidden: payload?["controlsHidden"] as? Bool
      )
      completion(.success(["ok": true]))
    case "setNativeCallStreamFocus":
      // WKWebView postMessage turns JS true into NSNumber. `as? Bool` misses it
      // and the 2-person swap stays stuck on the remote.
      let isLocalMain =
        Self.payloadFlag(payload, "isLocalMain") || Self.payloadFlag(payload, "localMain")
      let focusedIdentity = payload?["focusedIdentity"] as? String
      let quadFocus = payload?["quadFocus"] as? Bool
      EdgeLiveKitCallManager.shared.setStreamFocus(
        isLocalMain: isLocalMain,
        focusedIdentity: focusedIdentity,
        quadFocus: quadFocus
      )
      completion(.success([
        "ok": true,
        "isLocalMain": isLocalMain,
        "focusedIdentity": focusedIdentity ?? "",
        "quadFocus": quadFocus ?? false,
      ]))
    case "getNativeCallState":
      completion(.success(EdgeLiveKitCallManager.shared.currentState()))
    case "dismissKeyboard":
      EdgeCallKitManager.shared.dismissWebKeyboard()
      completion(.success(["ok": true]))
    case "getStoreProducts":
      guard #available(iOS 15.0, *) else {
        completion(.failure(EdgeStoreKitError.unavailable))
        return
      }
      let ids = payload?["productIds"] as? [String] ?? []
      EdgeStoreKitManager.shared.fetchProducts(productIds: ids, completion: completion)
    case "purchaseStoreProduct":
      guard #available(iOS 15.0, *) else {
        completion(.failure(EdgeStoreKitError.unavailable))
        return
      }
      let productId = (payload?["productId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      guard !productId.isEmpty else {
        completion(.success(["ok": false, "status": "invalid_product"]))
        return
      }
      EdgeStoreKitManager.shared.purchase(
        productId: productId,
        appAccountToken: payload?["appAccountToken"] as? String,
        completion: completion
      )
    case "restoreStorePurchases":
      guard #available(iOS 15.0, *) else {
        completion(.failure(EdgeStoreKitError.unavailable))
        return
      }
      EdgeStoreKitManager.shared.restore(completion: completion)
    case "manageStoreSubscriptions":
      guard #available(iOS 15.0, *) else {
        completion(.failure(EdgeStoreKitError.unavailable))
        return
      }
      EdgeStoreKitManager.shared.showManageSubscriptions(completion: completion)
    default:
      completion(.failure(BridgeError.unknownMethod(method)))
    }
  }

  private func setAuthSession(
    payload: [String: Any]?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let access = (payload?["accessToken"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let refresh = (payload?["refreshToken"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let supabaseUrl = (payload?["supabaseUrl"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let anonKey = (payload?["anonKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let expiresAt = (payload?["expiresAt"] as? TimeInterval)
      ?? (payload?["expiresAt"] as? Int).map { TimeInterval($0) }
      ?? 0
    guard !access.isEmpty, !refresh.isEmpty, !supabaseUrl.isEmpty, !anonKey.isEmpty else {
      EdgeAuthSessionStore.clear()
      completion(.success(["ok": false]))
      return
    }
    do {
      try EdgeAuthSessionStore.save(
        EdgeAuthSessionStore.Session(
          accessToken: access,
          refreshToken: refresh,
          expiresAt: expiresAt,
          supabaseUrl: supabaseUrl,
          anonKey: anonKey
        )
      )
      completion(.success(["ok": true]))
    } catch {
      completion(.failure(error))
    }
  }

  private func startNativeCall(
    payload: [String: Any]?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let roomId = (payload?["roomId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let mediaMode = (payload?["mediaMode"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "audio"
    let title = (payload?["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "Chat call"
    guard !roomId.isEmpty else {
      completion(.success(["ok": false, "error": "Missing room."]))
      return
    }
    Task {
      do {
        let (state, started) = try await EdgeLiveKitCallManager.shared.startOutgoing(
          roomId: roomId,
          mediaMode: mediaMode,
          title: title
        )
        var result: [String: Any] = state.dictionary()
        result["ok"] = true
        if let token = started.token { result["token"] = token }
        if let url = started.livekitUrl { result["livekitUrl"] = url }
        if let call = started.call { result["call"] = call }
        if let callId = started.callId { result["callId"] = callId }
        completion(.success(result))
      } catch {
        completion(.success(["ok": false, "error": error.localizedDescription]))
      }
    }
  }

  private func acceptNativeCall(
    payload: [String: Any]?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let callId = (payload?["callId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let roomId = (payload?["roomId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let hasVideo = (payload?["hasVideo"] as? Bool) ?? false
    guard !callId.isEmpty else {
      completion(.success(["ok": false, "error": "Missing call."]))
      return
    }
    if EdgeLiveKitCallManager.shared.isConnected(to: callId) {
      var result = EdgeLiveKitCallManager.shared.currentState()
      result["ok"] = true
      result["alreadyConnected"] = true
      completion(.success(result))
      return
    }
    EdgeCallKitManager.shared.requestAnswerIfNeeded(callId: callId)
    Task {
      do {
        let state = try await EdgeLiveKitCallManager.shared.answerIncoming(
          callId: callId,
          roomId: roomId,
          hasVideo: hasVideo
        )
        var result = state.dictionary()
        result["ok"] = true
        completion(.success(result))
      } catch {
        completion(.success(["ok": false, "error": error.localizedDescription]))
      }
    }
  }

  private func bustServiceWorker(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    guard let webView else {
      completion(.success(["ok": false]))
      return
    }
    DispatchQueue.main.async {
      webView.evaluateJavaScript(EdgeWebsiteDataHygiene.unregisterScript) { result, error in
        if let error {
          completion(.failure(error))
          return
        }
        if let dict = result as? [String: Any] {
          completion(.success(dict))
        } else {
          completion(.success(["ok": true]))
        }
      }
    }
  }

  private func resolve(id: String, result: Result<[String: Any], Error>) {
    guard let webView else { return }
    let js: String
    switch result {
    case .success(let value):
      guard let data = try? JSONSerialization.data(withJSONObject: value),
            let json = String(data: data, encoding: .utf8)
      else { return }
      js = "window.EdgeNative && window.EdgeNative._resolve(\(Self.jsString(id)), \(json));"
    case .failure(let error):
      let message = Self.jsString(error.localizedDescription)
      js = "window.EdgeNative && window.EdgeNative._reject(\(Self.jsString(id)), \(message));"
    }
    DispatchQueue.main.async {
      webView.evaluateJavaScript(js, completionHandler: nil)
    }
  }

  // MARK: - Navigation / UA / media capture

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    decisionHandler(.allow)
  }

  @available(iOS 15.0, *)
  func webView(
    _ webView: WKWebView,
    requestMediaCapturePermissionFor origin: WKSecurityOrigin,
    initiatedByFrame frame: WKFrameInfo,
    type: WKMediaCaptureType,
    decisionHandler: @escaping (WKPermissionDecision) -> Void
  ) {
    decisionHandler(.grant)
  }

  /// Grant webpage geolocation when app-level When In Use is already authorized.
  @available(iOS 15.0, *)
  func webView(
    _ webView: WKWebView,
    requestGeolocationPermissionFor origin: WKSecurityOrigin,
    initiatedByFrame frame: WKFrameInfo,
    decisionHandler: @escaping (WKPermissionDecision) -> Void
  ) {
    if EdgeLocationManager.shared.webViewMayGrantGeolocation() {
      decisionHandler(.grant)
    } else {
      decisionHandler(.deny)
    }
  }

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    applyCustomUserAgent(to: webView)
    // Listeners die with the outgoing page; JS re-marks after it reinstalls them.
    EdgeCallKitManager.shared.invalidateWebReady()
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    applyCustomUserAgent(to: webView)
    onDidFinishNavigation?()
  }

  private func applyCustomUserAgent(to webView: WKWebView) {
    webView.evaluateJavaScript("navigator.userAgent") { [weak webView] result, _ in
      guard let webView,
            let base = result as? String
      else { return }
      let token = AppConfig.userAgentToken
      if base.contains("EdgeiOS/") {
        if webView.customUserAgent != base {
          webView.customUserAgent = base
        }
        return
      }
      webView.customUserAgent = "\(base) \(token)"
    }
  }

  /// JS `true` arrives as NSNumber via `postMessage`. `as? Bool` returns nil.
  private static func payloadFlag(_ payload: [String: Any]?, _ key: String) -> Bool {
    guard let raw = payload?[key] else { return false }
    if let flag = raw as? Bool { return flag }
    if let number = raw as? NSNumber { return number.boolValue }
    if let text = raw as? String {
      let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      return trimmed == "true" || trimmed == "1" || trimmed == "yes"
    }
    return false
  }

  // MARK: - Bootstrap script

  private static let bridgeBootstrapScript = """
  (function () {
    if (window.EdgeNative) return;
    var pending = {};
    function call(method, payload) {
      return new Promise(function (resolve, reject) {
        var id = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
        pending[id] = { resolve: resolve, reject: reject };
        try {
          window.webkit.messageHandlers.edgeNative.postMessage({
            id: id,
            method: method,
            payload: payload == null ? null : payload
          });
        } catch (err) {
          delete pending[id];
          reject(err);
        }
      });
    }
    window.EdgeNative = {
      getInfo: function () { return call('getInfo', null); },
      openInSafari: function (payload) { return call('openInSafari', payload || {}); },
      openAppSettings: function () { return call('openAppSettings', null); },
      getPushPermissionStatus: function () {
        return call('getPushPermissionStatus', null);
      },
      requestPushPermission: function () {
        return call('requestPushPermission', null);
      },
      getPushToken: function () {
        return call('getPushToken', null);
      },
      setAudioSession: function (payload) {
        return call('setAudioSession', payload || {});
      },
      setAudioRoute: function (payload) {
        return call('setAudioRoute', payload || {});
      },
      triggerHaptic: function (payload) {
        return call('triggerHaptic', payload || {});
      },
      getCallKitCapabilities: function () {
        return call('getCallKitCapabilities', null);
      },
      reportIncomingCall: function (payload) {
        return call('reportIncomingCall', payload || {});
      },
      endNativeCall: function (payload) {
        return call('endNativeCall', payload || {});
      },
      getVoIPPushToken: function () {
        return call('getVoIPPushToken', null);
      },
      callKitWebReady: function () {
        return call('callKitWebReady', null);
      },
      callKitDidConnect: function () {
        return call('callKitDidConnect', null);
      },
      setAuthSession: function (payload) {
        return call('setAuthSession', payload || {});
      },
      clearAuthSession: function () {
        return call('clearAuthSession', null);
      },
      startNativeCall: function (payload) {
        return call('startNativeCall', payload || {});
      },
      acceptNativeCall: function (payload) {
        return call('acceptNativeCall', payload || {});
      },
      setNativeCallMute: function (payload) {
        return call('setNativeCallMute', payload || {});
      },
      setNativeCallCamera: function (payload) {
        return call('setNativeCallCamera', payload || {});
      },
      setNativeCallSpeaker: function (payload) {
        return call('setNativeCallSpeaker', payload || {});
      },
      setNativeCallChrome: function (payload) {
        return call('setNativeCallChrome', payload || {});
      },
      setNativeCallStreamFocus: function (payload) {
        return call('setNativeCallStreamFocus', payload || {});
      },
      getNativeCallState: function () {
        return call('getNativeCallState', null);
      },
      dismissKeyboard: function () {
        return call('dismissKeyboard', null);
      },
      getStoreProducts: function (payload) {
        return call('getStoreProducts', payload || {});
      },
      purchaseStoreProduct: function (payload) {
        return call('purchaseStoreProduct', payload || {});
      },
      restoreStorePurchases: function () {
        return call('restoreStorePurchases', null);
      },
      manageStoreSubscriptions: function () {
        return call('manageStoreSubscriptions', null);
      },
      bustServiceWorker: function () {
        return call('bustServiceWorker', null);
      },
      _resolve: function (id, value) {
        var entry = pending[id];
        if (!entry) return;
        delete pending[id];
        entry.resolve(value);
      },
      _reject: function (id, message) {
        var entry = pending[id];
        if (!entry) return;
        delete pending[id];
        entry.reject(new Error(message || 'native error'));
      }
    };
  })();
  """

  private static func jsString(_ value: String) -> String {
    let escaped = value
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
      .replacingOccurrences(of: "\n", with: "\\n")
      .replacingOccurrences(of: "\r", with: "\\r")
    return "\"\(escaped)\""
  }

  private enum BridgeError: LocalizedError {
    case unknownMethod(String)
    var errorDescription: String? {
      switch self {
      case .unknownMethod(let name):
        return "Unknown EdgeNative method: \(name)"
      }
    }
  }
}
