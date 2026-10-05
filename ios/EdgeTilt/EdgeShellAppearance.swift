import Combine
import SwiftUI
import UIKit

/// In-app light/dark from the web (`html.light`), not iOS Settings.
/// Duo status dock / wifi glyph follow `preferredColorScheme` + window `overrideUserInterfaceStyle`.
final class EdgeShellAppearance: ObservableObject {
  static let shared = EdgeShellAppearance()
  private static let defaultsKey = "edge.shell.colorScheme"

  @Published private(set) var isDark: Bool

  var colorScheme: ColorScheme { isDark ? .dark : .light }
  var background: Color { isDark ? Color.black : Color.white }
  var uiBackground: UIColor { isDark ? .black : .white }

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
      NotificationCenter.default.post(name: .edgeShellAppearanceDidChange, object: nil)
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
        window.backgroundColor = uiBackground
      }
    }
  }
}

extension Notification.Name {
  static let edgeShellAppearanceDidChange = Notification.Name("edge.shell.appearanceDidChange")
}
