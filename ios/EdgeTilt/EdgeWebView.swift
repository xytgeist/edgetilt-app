import SwiftUI
import WebKit

struct EdgeWebView: UIViewRepresentable {
  let url: URL

  func makeCoordinator() -> EdgeNativeBridge {
    EdgeNativeBridge()
  }

  func makeUIView(context: Context) -> WKWebView {
    let webView = WKWebView(frame: .zero, configuration: context.coordinator.makeConfiguration())
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.backgroundColor = .black
    context.coordinator.attach(webView: webView)
    webView.load(URLRequest(url: url))
    return webView
  }

  func updateUIView(_ uiView: WKWebView, context: Context) {}
}
