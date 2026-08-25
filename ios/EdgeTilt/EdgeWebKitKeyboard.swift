import ObjectiveC
import UIKit

/// Hide WKWebView's extra bar above the software keyboard (Done / prev-next).
/// The focused view is usually internal `WKContentView`, not `WKWebView`, so a
/// subclass override alone is not enough. Replacing that getter is the same
/// public-API pattern Capacitor uses. Safari / PWA cannot do this.
enum EdgeWebKitKeyboard {
  private static var didInstall = false

  static func hideAccessoryBar() {
    guard !didInstall else { return }
    didInstall = true
    guard let cls = NSClassFromString("WKContentView") else { return }
    let selector = Selector(("inputAccessoryView"))
    let block: @convention(block) (AnyObject) -> UIView? = { _ in nil }
    let imp = imp_implementationWithBlock(block)
    _ = class_replaceMethod(cls, selector, imp, "@@:")
  }
}
