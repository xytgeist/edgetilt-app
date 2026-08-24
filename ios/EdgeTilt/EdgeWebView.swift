import SwiftUI
import WebKit

struct EdgeWebView: UIViewRepresentable {
  let url: URL

  func makeCoordinator() -> Coordinator {
    Coordinator(url: url)
  }

  func makeUIView(context: Context) -> EdgeInsetAwareWebView {
    let config = context.coordinator.bridge.makeConfiguration()
    let webView = EdgeInsetAwareWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator.bridge
    webView.uiDelegate = context.coordinator.bridge
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.backgroundColor = .black
    context.coordinator.bridge.attach(webView: webView)
    context.coordinator.attach(webView: webView)

    let store = config.websiteDataStore
    EdgeWebsiteDataHygiene.clearServiceWorkersAndCaches(from: store) {
      DispatchQueue.main.async {
        webView.load(URLRequest(url: context.coordinator.url))
      }
    }
    return webView
  }

  func updateUIView(_ uiView: EdgeInsetAwareWebView, context: Context) {
    context.coordinator.pushSafeAreaInsets(from: uiView)
  }

  final class Coordinator: NSObject {
    let url: URL
    let bridge = EdgeNativeBridge()
    private weak var webView: EdgeInsetAwareWebView?
    private var lastInsets: UIEdgeInsets = .init(top: -1, left: -1, bottom: -1, right: -1)

    init(url: URL) {
      self.url = url
    }

    func attach(webView: EdgeInsetAwareWebView) {
      self.webView = webView
      webView.onSafeAreaInsetsChange = { [weak self] insets in
        self?.applyIfNeeded(insets)
      }
      // Navigation finish also re-applies (SPA document may reset inline styles rarely).
      bridge.onDidFinishNavigation = { [weak self] in
        guard let self, let webView = self.webView else { return }
        self.applyIfNeeded(webView.safeAreaInsets, force: true)
      }
    }

    func pushSafeAreaInsets(from webView: EdgeInsetAwareWebView) {
      applyIfNeeded(webView.safeAreaInsets)
    }

    private func applyIfNeeded(_ insets: UIEdgeInsets, force: Bool = false) {
      guard let webView else { return }
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
