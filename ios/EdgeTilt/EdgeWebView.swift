import SwiftUI
import WebKit

struct EdgeWebView: UIViewRepresentable {
  let url: URL
  /// SwiftUI geometry safe-area (still correct when this view ignoresSafeArea).
  var swiftSafeArea: EdgeInsets = EdgeInsets()

  func makeCoordinator() -> Coordinator {
    Coordinator(url: url)
  }

  func makeUIView(context: Context) -> EdgeInsetAwareWebView {
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
    context.coordinator.attach(webView: webView)

    let store = config.websiteDataStore
    let loadNow = {
      let url = EdgePushManager.shared.consumePendingDeepLinkURL() ?? context.coordinator.url
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
    return webView
  }

  func updateUIView(_ uiView: EdgeInsetAwareWebView, context: Context) {
    context.coordinator.swiftSafeArea = swiftSafeArea
    context.coordinator.pushSafeAreaInsets(from: uiView, force: false)
    EdgeLiveKitCallManager.shared.attach(webView: uiView)
  }

  final class Coordinator: NSObject {
    let url: URL
    let bridge = EdgeNativeBridge()
    private weak var webView: EdgeInsetAwareWebView?
    private var lastInsets: UIEdgeInsets = .init(top: -1, left: -1, bottom: -1, right: -1)
    var swiftSafeArea: EdgeInsets = EdgeInsets()

    init(url: URL) {
      self.url = url
    }

    func attach(webView: EdgeInsetAwareWebView) {
      self.webView = webView
      EdgePushManager.shared.attach(webView: webView)
      EdgeCallKitManager.shared.attach(webView: webView)
      EdgeLiveKitCallManager.shared.attach(webView: webView)
      webView.onSafeAreaInsetsChange = { [weak self] in
        guard let self, let webView = self.webView else { return }
        self.pushSafeAreaInsets(from: webView, force: false)
      }
      bridge.onDidFinishNavigation = { [weak self] in
        guard let self, let webView = self.webView else { return }
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
    }
  }
}
