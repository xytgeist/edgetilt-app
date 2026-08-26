import UIKit

/// UIKit haptics for EdgeiOS shell. Contract: `docs/ios-native-bridge.md` `triggerHaptic`.
/// Reuses prepared generators ... creating one per tap exhausts CHHapticEngine channels and stalls touches.
enum EdgeHaptics {
  private static let light = UIImpactFeedbackGenerator(style: .light)
  private static let medium = UIImpactFeedbackGenerator(style: .medium)
  private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
  private static let notification = UINotificationFeedbackGenerator()

  private static var lastFireMs: TimeInterval = 0
  private static let minGapMs: TimeInterval = 0.05

  static func trigger(style: String) {
    let now = ProcessInfo.processInfo.systemUptime
    guard now - lastFireMs >= minGapMs else { return }
    lastFireMs = now

    let normalized = style.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    DispatchQueue.main.async {
      switch normalized {
      case "medium":
        medium.prepare()
        medium.impactOccurred()
      case "heavy":
        heavy.prepare()
        heavy.impactOccurred()
      case "success":
        notification.prepare()
        notification.notificationOccurred(.success)
      case "warning":
        notification.prepare()
        notification.notificationOccurred(.warning)
      case "error":
        notification.prepare()
        notification.notificationOccurred(.error)
      default:
        light.prepare()
        light.impactOccurred()
      }
    }
  }
}
