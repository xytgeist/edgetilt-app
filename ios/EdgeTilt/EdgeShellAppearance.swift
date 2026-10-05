import UIKit

/// In-app light/dark from the web (`html.light`).
/// Only the **main** window's `overrideUserInterfaceStyle` flips, so the Duo
/// status dock / wifi glyph match. WKWebView stays on dark traits.
/// Do not paint window/webview backgrounds. Do not walk every scene window
/// (bet sheet / Safari / pickers). Do not drive SwiftUI `preferredColorScheme`.
final class EdgeShellAppearance {
  static let shared = EdgeShellAppearance()
  private static let defaultsKey = "edge.shell.colorScheme"

  private(set) var isDark: Bool
  private weak var mainWindow: UIWindow?

  private init() {
    if let raw = UserDefaults.standard.string(forKey: Self.defaultsKey) {
      isDark = raw != "light"
    } else {
      isDark = true
    }
  }

  func attachMainWindow(_ window: UIWindow?) {
    guard let window else { return }
    mainWindow = window
    applyToMainWindow()
  }

  /// `scheme` is `light` or `dark` (resolved). Anything else stays dark.
  func apply(scheme: String) {
    let raw = scheme.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let nextDark = raw != "light"
    UserDefaults.standard.set(nextDark ? "dark" : "light", forKey: Self.defaultsKey)
    let paint = {
      self.isDark = nextDark
      self.applyToMainWindow()
    }
    if Thread.isMainThread {
      paint()
    } else {
      DispatchQueue.main.async(execute: paint)
    }
  }

  func applyToMainWindow() {
    mainWindow?.overrideUserInterfaceStyle = isDark ? .dark : .light
  }

  /// Keep Edge WKWebViews on dark traits so a light window cannot bleach the page.
  static func lockWebKitDark(_ view: UIView) {
    view.overrideUserInterfaceStyle = .dark
  }
}
