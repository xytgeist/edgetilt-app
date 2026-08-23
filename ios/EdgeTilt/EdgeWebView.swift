import SwiftUI
import WebKit

struct EdgeWebView: UIViewRepresentable {
  let url: URL

  func makeCoordinator() -> EdgeNativeBridge {
    EdgeNativeBridge()
  }

  func makeUIView(context: Context) -> WKWebView {
    let config = context.coordinator.makeConfiguration()
    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.backgroundColor = .black
    context.coordinator.attach(webView: webView)

    // Bust sticky push-sw / caches before first paint so shell ≠ trapped PWA.
    let store = config.websiteDataStore
    EdgeWebsiteDataHygiene.clearServiceWorkersAndCaches(from: store) {
      DispatchQueue.main.async {
        webView.load(URLRequest(url: self.url))
      }
    }
    return webView
  }

  func updateUIView(_ uiView: WKWebView, context: Context) {}
}
