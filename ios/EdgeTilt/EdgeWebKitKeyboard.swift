import ObjectiveC
import UIKit
import WebKit

/// System WK Done / prev-next accessory is **on by default**.
/// GIF search (and anything else that opts out) calls `setShowsAccessoryBar(false)`.
///
/// Default-on matters: the Sep 12 “opt in on focusin” path set the flag then
/// `reloadInputViews` while the iPhone keyboard was rising, which either clipped
/// the keys to accessory height or made the bar pop in ~200ms late.
/// With the bar already enabled, Auth / Lounge / chat never flip mid-rise.
///
/// The focused view is usually internal `WKContentView`, not `WKWebView`, so a
/// subclass override alone is not enough. Replacing that getter is the same
/// public-API pattern Capacitor uses. Safari / PWA cannot do this.
enum EdgeWebKitKeyboard {
  private static var didInstall = false
  private static var originalAccessoryIMP: IMP?
  private static let accessorySelector = NSSelectorFromString("inputAccessoryView")

  /// On unless GIF (or another caller) opts out. Do not start `false`.
  private(set) static var showsAccessoryBar = true

  static func hideAccessoryBar() {
    guard !didInstall else { return }
    didInstall = true
    guard let cls = NSClassFromString("WKContentView") else { return }
    let selector = accessorySelector
    if let method = class_getInstanceMethod(cls, selector) {
      originalAccessoryIMP = method_getImplementation(method)
    }
    let block: @convention(block) (AnyObject) -> UIView? = { object in
      if showsAccessoryBar, let originalIMP = originalAccessoryIMP {
        typealias Original = @convention(c) (AnyObject, Selector) -> UIView?
        return unsafeBitCast(originalIMP, to: Original.self)(object, selector)
      }
      return nil
    }
    let imp = imp_implementationWithBlock(block)
    _ = class_replaceMethod(cls, selector, imp, "@@:")
  }

  static func setShowsAccessoryBar(_ show: Bool, in webView: WKWebView?) {
    let changed = showsAccessoryBar != show
    showsAccessoryBar = show
    guard changed else { return }

    // Only GIF opt-out / restore hits this. Keyboard is usually already up.
    DispatchQueue.main.async {
      reloadInputViews(in: webView)
    }
  }

  private static func reloadInputViews(in webView: WKWebView?) {
    guard let webView else { return }
    webView.reloadInputViews()
    walk(webView)
  }

  private static func walk(_ view: UIView) {
    let name = String(describing: type(of: view))
    if name.contains("WKContentView") {
      view.reloadInputViews()
    }
    for child in view.subviews {
      walk(child)
    }
  }
}
