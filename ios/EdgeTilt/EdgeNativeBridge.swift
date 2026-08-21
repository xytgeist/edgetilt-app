import UIKit
import WebKit

/// JS ↔ Swift bridge. Contract: `docs/ios-native-bridge.md`
final class EdgeNativeBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
  private weak var webView: WKWebView?
  private let messageHandlerName = "edgeNative"

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
    default:
      completion(.failure(BridgeError.unknownMethod(method)))
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

  // MARK: - Navigation / UA

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    applyCustomUserAgent(to: webView)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    applyCustomUserAgent(to: webView)
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
      requestPushPermission: function () {
        return Promise.reject(new Error('not implemented'));
      },
      getPushToken: function () {
        return Promise.reject(new Error('not implemented'));
      },
      setAudioSession: function () {
        return Promise.reject(new Error('not implemented'));
      },
      bustServiceWorker: function () {
        return Promise.reject(new Error('not implemented'));
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
