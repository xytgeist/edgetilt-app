import ObjectiveC
import UIKit
import WebKit

/// Default: hide WKWebView's extra bar above the software keyboard (Done / prev-next).
/// GIF picker and most compose fields stay clean. W-2G tax fields opt back into
/// the **system** accessory via `setShowsAccessoryBar`.
///
/// The focused view is usually internal `WKContentView`, not `WKWebView`, so a
/// subclass override alone is not enough. Replacing that getter is the same
/// public-API pattern Capacitor uses. Safari / PWA cannot do this.
enum EdgeWebKitKeyboard {
  private static var didInstall = false
  private static var originalAccessoryIMP: IMP?
  private static let accessorySelector = NSSelectorFromString("inputAccessoryView")

  private(set) static var showsAccessoryBar = false

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
    showsAccessoryBar = show
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
