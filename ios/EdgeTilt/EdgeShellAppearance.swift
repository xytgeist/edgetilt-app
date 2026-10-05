import UIKit

/// In-app light/dark from the web (`html.light`).
/// Window `overrideUserInterfaceStyle` flips the Duo status dock.
/// WKWebView stays on dark traits so a scheme change cannot blank the page.
final class EdgeShellAppearance {
  static let shared = EdgeShellAppearance()
  private static let defaultsKey = "edge.shell.colorScheme"

  private(set) var isDark: Bool

  private init() {
    if let raw = UserDefaults.standard.string(forKey: Self.defaultsKey) {
      isDark = raw != "light"
    } else {
      isDark = true
    }
  }

  /// `scheme` is `light` or `dark` (resolved). Anything else stays dark.
  func apply(scheme: String) {
    let raw = scheme.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let nextDark = raw != "light"
    UserDefaults.standard.set(nextDark ? "dark" : "light", forKey: Self.defaultsKey)
    let paint = {
      self.isDark = nextDark
      self.applyToWindows()
    }
    if Thread.isMainThread {
      paint()
    } else {
      DispatchQueue.main.async(execute: paint)
    }
  }

  func applyToWindows() {
    let style: UIUserInterfaceStyle = isDark ? .dark : .light
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for window in windowScene.windows {
        window.overrideUserInterfaceStyle = style
      }
    }
  }
}
