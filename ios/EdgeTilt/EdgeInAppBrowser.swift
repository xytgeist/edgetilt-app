import SafariServices
import UIKit

/// Outside http(s) links open in an `SFSafariViewController` over the app (Done returns to EdgeTilt).
/// Contract: `docs/ios-native-bridge.md` "In-app browser".
///
/// Kalshi / Polymarket keep `EdgeBetSheet`. Stripe and App Store links still go to system Safari / the store:
/// billing returns via universal link, which never fires from inside `SFSafariViewController`.
enum EdgeInAppBrowser {
  private static let systemHosts = [
    "apps.apple.com",
    "itunes.apple.com",
    "testflight.apple.com",
    "checkout.stripe.com",
    "billing.stripe.com",
    "connect.stripe.com",
  ]
  /// `target=_blank` can reach both WebKit delegate paths for one tap.
  private static var lastPresented: (url: URL, at: Date)?

  /// Returns false when the URL is not http(s).
  @discardableResult
  static func open(_ url: URL, completion: ((Bool) -> Void)? = nil) -> Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
      completion?(false)
      return false
    }
    if EdgeBetSheet.handles(url) {
      EdgeBetSheet.present(url: url)
      completion?(true)
      return true
    }
    if opensInSystem(url) {
      openInSystemSafari(url, completion: completion)
      return true
    }
    DispatchQueue.main.async {
      let now = Date()
      if lastPresented?.url == url, now.timeIntervalSince(lastPresented?.at ?? .distantPast) < 1 {
        completion?(true)
        return
      }
      lastPresented = (url, now)
      guard let presenter = topViewController() else {
        UIApplication.shared.open(url, options: [:]) { ok in completion?(ok) }
        return
      }
      let config = SFSafariViewController.Configuration()
      config.barCollapsingEnabled = true
      let controller = SFSafariViewController(url: url, configuration: config)
      controller.dismissButtonStyle = .done
      controller.preferredControlTintColor = .systemCyan
      controller.modalPresentationStyle = .pageSheet
      presenter.present(controller, animated: true)
      completion?(true)
    }
    return true
  }

  static func openInSystemSafari(_ url: URL, completion: ((Bool) -> Void)? = nil) {
    DispatchQueue.main.async {
      UIApplication.shared.open(url, options: [:]) { ok in completion?(ok) }
    }
  }

  private static func opensInSystem(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased() else { return true }
    return systemHosts.contains { host == $0 || host.hasSuffix(".\($0)") }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow)
      ?? scenes.first?.windows.first
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }
}
