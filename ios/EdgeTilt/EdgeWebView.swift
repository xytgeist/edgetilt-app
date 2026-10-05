import SwiftUI
import UIKit
import WebKit

/// Last in-app SPA URL so a scene remake after a long background does not
/// `load(edgetilt.com/)` and dump the user out of a game hub.
enum EdgeLastSpaURL {
  private static let defaultsKey = "edge.webkit.lastSpaUrl"

  static func persist(_ url: URL?) {
    guard let url, let allowed = allowed(url) else { return }
    UserDefaults.standard.set(allowed.absoluteString, forKey: defaultsKey)
  }

  static func restore() -> URL? {
    guard let raw = UserDefaults.standard.string(forKey: defaultsKey),
          let url = URL(string: raw)
    else { return nil }
    return allowed(url)
  }

  /// True on lvslotpro / edgetilt (incl. `/auth/` callbacks). False on Google OAuth etc.
  static func isAppHost(_ url: URL?) -> Bool {
    guard let url else { return true }
    let s = url.absoluteString.lowercased()
    if s.isEmpty || s == "about:blank" { return true }
    guard let host = url.host?.lowercased() else { return false }
    guard let baseHost = AppConfig.baseURL.host?.lowercased() else { return false }
    return host == baseHost
      || host == "www.\(baseHost)"
      || host.hasSuffix(".\(baseHost)")
      || host == "edgetilt.com"
      || host == "www.edgetilt.com"
      || host == "lvslotpro.com"
      || host == "www.lvslotpro.com"
  }

  private static func allowed(_ url: URL) -> URL? {
    let next = EdgePushManager.canonicalWebURL(fromUniversalLink: url)
    guard let host = next.host?.lowercased(),
          let baseHost = AppConfig.baseURL.host?.lowercased()
    else { return nil }
    let ok = host == baseHost
      || host == "www.\(baseHost)"
      || host.hasSuffix(".\(baseHost)")
      || host == "edgetilt.com"
      || host == "www.edgetilt.com"
      || host == "lvslotpro.com"
      || host == "www.lvslotpro.com"
    guard ok else { return nil }
    let path = next.path.lowercased()
    if path.hasPrefix("/auth/") { return nil }
    return next
  }
}

final class EdgeWebChromeView: UIView {
  let webView: EdgeInsetAwareWebView

  init(webView: EdgeInsetAwareWebView) {
    self.webView = webView
    super.init(frame: .zero)
    backgroundColor = .black
    webView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(webView)
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: topAnchor),
      webView.leadingAnchor.constraint(equalTo: leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: trailingAnchor),
      webView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  required init?(coder: NSCoder) { nil }
}

struct EdgeWebView: UIViewRepresentable {
  let url: URL
  /// SwiftUI geometry safe-area (still correct when this view ignoresSafeArea).
  var swiftSafeArea: EdgeInsets = EdgeInsets()

  func makeCoordinator() -> Coordinator {
    Coordinator(url: url)
  }

  func makeUIView(context: Context) -> EdgeWebChromeView {
    let config = context.coordinator.bridge.makeConfiguration()
    let webView = EdgeInsetAwareWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator.bridge
    webView.uiDelegate = context.coordinator.bridge
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.keyboardDismissMode = .interactive
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.backgroundColor = .black
    #if DEBUG
    // Required on iOS 16.4+ for Mac Safari → Develop → [device] to list this WKWebView.
    if #available(iOS 16.4, *) {
      webView.isInspectable = true
    }
    #endif
    context.coordinator.bridge.attach(webView: webView)
    let chrome = EdgeWebChromeView(webView: webView)
    context.coordinator.attach(webView: webView, chrome: chrome)

    let store = config.websiteDataStore
    let loadNow = {
      let url = EdgePushManager.shared.consumePendingDeepLinkURL()
        ?? EdgeLastSpaURL.restore()
        ?? context.coordinator.url
      NSLog("EdgeWebView load \(url.absoluteString)")
      webView.load(URLRequest(url: url))
      EdgePushManager.shared.markReadyForDeepLinks()
    }
    // A VoIP wake already has a CallKit call tracked. Waiting on SW hygiene here
    // is how a lock-screen answer fulfills CallKit before the page even starts.
    if EdgeCallKitManager.shared.hasTrackedCalls {
      loadNow()
    } else {
      EdgeWebsiteDataHygiene.clearServiceWorkersAndCaches(from: store) {
        DispatchQueue.main.async {
          loadNow()
        }
      }
    }
    return chrome
  }

  func updateUIView(_ uiView: EdgeWebChromeView, context: Context) {
    context.coordinator.swiftSafeArea = swiftSafeArea
    context.coordinator.pushSafeAreaInsets(from: uiView.webView, force: false)
    EdgeLiveKitCallManager.shared.attach(webView: uiView.webView)
  }

  final class Coordinator: NSObject {
    let url: URL
    let bridge = EdgeNativeBridge()
    private weak var webView: EdgeInsetAwareWebView?
    private weak var chrome: EdgeWebChromeView?
    private var lastInsets: UIEdgeInsets = .init(top: -1, left: -1, bottom: -1, right: -1)
    var swiftSafeArea: EdgeInsets = EdgeInsets()
    private var backgroundObserver: NSObjectProtocol?
    private var offsiteBackButton: UIButton?
    private var offsiteBackTop: NSLayoutConstraint?
    private var offsiteBackLeading: NSLayoutConstraint?

    init(url: URL) {
      self.url = url
    }

    deinit {
      if let backgroundObserver {
        NotificationCenter.default.removeObserver(backgroundObserver)
      }
    }

    func attach(webView: EdgeInsetAwareWebView, chrome: EdgeWebChromeView) {
      self.webView = webView
      self.chrome = chrome
      EdgePushManager.shared.attach(webView: webView)
      EdgeCallKitManager.shared.attach(webView: webView)
      EdgeLiveKitCallManager.shared.attach(webView: webView)
      installOffsiteBackButton(on: chrome)
      webView.onSafeAreaInsetsChange = { [weak self] in
        guard let self, let webView = self.webView else { return }
        self.pushSafeAreaInsets(from: webView, force: false)
      }
      backgroundObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        guard let webView = self?.webView else { return }
        webView.evaluateJavaScript("String(location.href || '')") { result, _ in
          if let href = result as? String, let url = URL(string: href) {
            EdgeLastSpaURL.persist(url)
          } else {
            EdgeLastSpaURL.persist(webView.url)
          }
        }
      }
      bridge.onNavigationUrl = { [weak self] url in
        self?.setOffsiteBackVisible(!EdgeLastSpaURL.isAppHost(url))
      }
      bridge.onDidFinishNavigation = { [weak self] in
        guard let self, let webView = self.webView else { return }
        self.setOffsiteBackVisible(!EdgeLastSpaURL.isAppHost(webView.url))
        self.pushSafeAreaInsets(from: webView, force: true)
        // WebKit sometimes paints before our first inject sticks; nudge twice.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
          guard let self, let webView = self.webView else { return }
          self.pushSafeAreaInsets(from: webView, force: true)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
          guard let self, let webView = self.webView else { return }
          self.pushSafeAreaInsets(from: webView, force: true)
        }
      }
    }

    private func installOffsiteBackButton(on chrome: EdgeWebChromeView) {
      var config = UIButton.Configuration.filled()
      config.title = "Back"
      config.image = UIImage(systemName: "chevron.left")
      config.imagePadding = 6
      config.baseForegroundColor = .white
      config.baseBackgroundColor = UIColor.black.withAlphaComponent(0.72)
      config.cornerStyle = .capsule
      config.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 16)
      let button = UIButton(configuration: config)
      button.accessibilityLabel = "Back"
      button.translatesAutoresizingMaskIntoConstraints = false
      button.isHidden = true
      button.addTarget(self, action: #selector(leaveOffsiteAuth), for: .touchUpInside)
      chrome.addSubview(button)
      let leading = button.leadingAnchor.constraint(equalTo: chrome.leadingAnchor, constant: 12)
      let top = button.topAnchor.constraint(equalTo: chrome.topAnchor, constant: 12)
      NSLayoutConstraint.activate([
        leading,
        top,
      ])
      offsiteBackButton = button
      offsiteBackLeading = leading
      offsiteBackTop = top
    }

    @objc private func leaveOffsiteAuth() {
      guard let webView else { return }
      if let item = webView.backForwardList.backList.last(where: { EdgeLastSpaURL.isAppHost($0.url) }) {
        webView.go(to: item)
        return
      }
      let url = EdgeLastSpaURL.restore() ?? AppConfig.baseURL
      webView.load(URLRequest(url: url))
    }

    private func setOffsiteBackVisible(_ visible: Bool) {
      guard let button = offsiteBackButton else { return }
      button.isHidden = !visible
      if visible, let chrome {
        chrome.bringSubviewToFront(button)
      }
    }

    func pushSafeAreaInsets(from webView: EdgeInsetAwareWebView, force: Bool) {
      let insets = EdgeSafeAreaInsets.resolve(for: webView, swiftFallback: swiftSafeArea)
      applyIfNeeded(insets, to: webView, force: force)
    }

    private func applyIfNeeded(_ insets: UIEdgeInsets, to webView: WKWebView, force: Bool) {
      if !force,
         abs(insets.top - lastInsets.top) < 0.25,
         abs(insets.left - lastInsets.left) < 0.25,
         abs(insets.bottom - lastInsets.bottom) < 0.25,
         abs(insets.right - lastInsets.right) < 0.25
      {
        return
      }
      lastInsets = insets
      EdgeSafeAreaInsets.apply(insets, to: webView)
      offsiteBackLeading?.constant = insets.left + 12
      offsiteBackTop?.constant = insets.top + 8
    }
  }
}
