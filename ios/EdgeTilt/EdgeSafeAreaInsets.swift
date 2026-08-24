import UIKit
import WebKit

/// Pushes native safe-area insets into the page as CSS vars the web already reads via
/// `max(env(safe-area-inset-*), var(--edge-sat|…))`. WKWebView often reports `env()` as 0
/// (WebKit quirk); Safari/PWA do not need this path.
enum EdgeSafeAreaInsets {
  static func apply(_ insets: UIEdgeInsets, to webView: WKWebView) {
    let top = max(0, insets.top)
    let right = max(0, insets.right)
    let bottom = max(0, insets.bottom)
    let left = max(0, insets.left)
    let js = """
    (function () {
      var d = document.documentElement;
      if (!d) return;
      d.style.setProperty('--edge-sat', '\(Self.cssPx(top))');
      d.style.setProperty('--edge-sar', '\(Self.cssPx(right))');
      d.style.setProperty('--edge-sab', '\(Self.cssPx(bottom))');
      d.style.setProperty('--edge-sal', '\(Self.cssPx(left))');
      d.classList.add('edge-ios-shell');
    })();
    """
    webView.evaluateJavaScript(js, completionHandler: nil)
  }

  private static func cssPx(_ value: CGFloat) -> String {
    let rounded = (value * 100).rounded() / 100
    return "\(rounded)px"
  }
}

/// WKWebView that notifies when system safe-area insets change (rotation, Island, etc.).
final class EdgeInsetAwareWebView: WKWebView {
  var onSafeAreaInsetsChange: ((UIEdgeInsets) -> Void)?

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    onSafeAreaInsetsChange?(safeAreaInsets)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    onSafeAreaInsetsChange?(safeAreaInsets)
  }
}
