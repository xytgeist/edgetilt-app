import SwiftUI
import UIKit
import WebKit

/// Pushes native safe-area insets into the page as CSS vars the web already reads via
/// `max(env(safe-area-inset-*), var(--edge-sat|…))`. WKWebView often reports `env()` as 0
/// (WebKit quirk); Safari/PWA do not need this path.
///
/// Important: SwiftUI `.ignoresSafeArea()` zeroes **the WebView's** `safeAreaInsets`.
/// Always resolve from the window / scene (or SwiftUI geometry), not `webView.safeAreaInsets` alone.
enum EdgeSafeAreaInsets {
  static func resolve(for view: UIView, swiftFallback: EdgeInsets? = nil) -> UIEdgeInsets {
    if let window = view.window {
      let insets = window.safeAreaInsets
      if insets.top > 0.5 || insets.bottom > 0.5 || insets.left > 0.5 || insets.right > 0.5 {
        return insets
      }
    }

    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for window in windowScene.windows where !window.isHidden {
        let insets = window.safeAreaInsets
        if insets.top > 0.5 || insets.bottom > 0.5 || insets.left > 0.5 || insets.right > 0.5 {
          return insets
        }
      }
    }

    if let swiftFallback {
      let converted = UIEdgeInsets(
        top: swiftFallback.top,
        left: swiftFallback.leading,
        bottom: swiftFallback.bottom,
        right: swiftFallback.trailing
      )
      if converted.top > 0.5 || converted.bottom > 0.5 {
        return converted
      }
    }

    // Last resort (often 0 under ignoresSafeArea).
    return view.safeAreaInsets
  }

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
      try {
        window.__EDGE_SAFE_AREA__ = {
          top: \(top),
          right: \(right),
          bottom: \(bottom),
          left: \(left)
        };
      } catch (e) {}
    })();
    """
    webView.evaluateJavaScript(js, completionHandler: nil)
  }

  private static func cssPx(_ value: CGFloat) -> String {
    let rounded = (value * 100).rounded() / 100
    return "\(rounded)px"
  }
}

/// WKWebView that notifies when layout / safe-area may have changed.
final class EdgeInsetAwareWebView: WKWebView {
  var onSafeAreaInsetsChange: (() -> Void)?

  /// Hide the WKWebView Done / prev-next accessory. First responder is often
  /// internal `WKContentView` … `EdgeWebKitKeyboard.hideAccessoryBar()` covers that.
  override var inputAccessoryView: UIView? { nil }

  override var inputAssistantItem: UITextInputAssistantItem {
    let item = super.inputAssistantItem
    item.leadingBarButtonGroups = []
    item.trailingBarButtonGroups = []
    return item
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    onSafeAreaInsetsChange?()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    inputAssistantItem.leadingBarButtonGroups = []
    inputAssistantItem.trailingBarButtonGroups = []
    onSafeAreaInsetsChange?()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    onSafeAreaInsetsChange?()
  }
}
