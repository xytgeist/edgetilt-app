import Foundation
import UIKit
import UserNotifications

/// APNs permission + device token for `requestPushPermission` / `getPushToken`.
/// Token handoff to Edge send path is still coordinated with Windows (DB / Edge Function).
final class EdgePushManager: NSObject, UNUserNotificationCenterDelegate {
  static let shared = EdgePushManager()

  private let tokenDefaultsKey = "edge.apns.deviceToken"
  private let lock = NSLock()
  private var deviceTokenHex: String?

  private override init() {
    super.init()
    if let stored = UserDefaults.standard.string(forKey: tokenDefaultsKey), !stored.isEmpty {
      deviceTokenHex = stored
    }
  }

  func configure() {
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    // Refresh token if already authorized (e.g. relaunch after grant).
    center.getNotificationSettings { settings in
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
      default:
        break
      }
    }
  }

  func requestPermission(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { settings in
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
        completion(.success(["status": "granted"]))
      case .denied:
        completion(.success(["status": "denied"]))
      case .notDetermined:
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
          if let error {
            completion(.failure(error))
            return
          }
          if granted {
            DispatchQueue.main.async {
              UIApplication.shared.registerForRemoteNotifications()
            }
            completion(.success(["status": "granted"]))
          } else {
            completion(.success(["status": "denied"]))
          }
        }
      @unknown default:
        completion(.success(["status": "prompt"]))
      }
    }
  }

  func currentTokenPayload() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    if let token = deviceTokenHex, !token.isEmpty {
      return ["token": token]
    }
    return ["token": NSNull()]
  }

  func didRegister(deviceToken: Data) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    lock.lock()
    deviceTokenHex = hex
    lock.unlock()
    UserDefaults.standard.set(hex, forKey: tokenDefaultsKey)
  }

  func didFailToRegister(error: Error) {
    #if DEBUG
    print("EdgePushManager: register failed: \(error.localizedDescription)")
    #endif
  }

  // Foreground presentation so smoke / test pushes are visible while debugging.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge])
  }
}
