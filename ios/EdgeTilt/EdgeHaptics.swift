import UIKit

/// UIKit haptics for EdgeiOS shell. Contract: `docs/ios-native-bridge.md` `triggerHaptic`.
enum EdgeHaptics {
  static func trigger(style: String) {
    DispatchQueue.main.async {
      switch style.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
      case "medium":
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
      case "heavy":
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
      case "success":
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      case "warning":
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
      case "error":
        UINotificationFeedbackGenerator().notificationOccurred(.error)
      default:
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
      }
    }
  }
}
