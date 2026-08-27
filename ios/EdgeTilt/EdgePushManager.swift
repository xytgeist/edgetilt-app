import Foundation
import UIKit
import UserNotifications
import WebKit

/// APNs permission + device token + notification-tap deep links.
/// Tap loads payload `url` in the existing WKWebView (no new EdgeNative method).
final class EdgePushManager: NSObject, UNUserNotificationCenterDelegate {
  static let shared = EdgePushManager()

  private let tokenDefaultsKey = "edge.apns.deviceToken"
  private let lock = NSLock()
  private var deviceTokenHex: String?
  private weak var webView: WKWebView?
  /// Cold start / tap before the WebView has finished its first load setup.
  private var pendingDeepLinkURL: URL?
  private var readyForDeepLinks = false

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

  /// Called from the shell WebView coordinator once WKWebView exists (before first load).
  func attach(webView: WKWebView) {
    DispatchQueue.main.async {
      self.webView = webView
      self.readyForDeepLinks = false
    }
  }

  /// After SW hygiene + first `load` is scheduled. Flushes any pending tap URL.
  func markReadyForDeepLinks() {
    DispatchQueue.main.async {
      self.readyForDeepLinks = true
      if let pending = self.pendingDeepLinkURL {
        self.pendingDeepLinkURL = nil
        self.webView?.load(URLRequest(url: pending))
      }
    }
  }

  /// Prefer a pending notification URL for the shell's first navigation (cold start).
  func consumePendingDeepLinkURL() -> URL? {
    assert(Thread.isMainThread)
    let url = pendingDeepLinkURL
    pendingDeepLinkURL = nil
    return url
  }

  /// Launch-options / tap path. Safe to call before WebView is ready.
  func handleNotificationUserInfo(_ userInfo: [AnyHashable: Any]) {
    guard let url = Self.deepLinkURL(from: userInfo) else { return }
    DispatchQueue.main.async {
      self.openDeepLink(url)
    }
  }

  /// Read-only status. Never prompts. `prompt` = notDetermined / unknown.
  func permissionStatus(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      completion(.success(["status": Self.statusString(for: settings.authorizationStatus)]))
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

  private static func statusString(for status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized, .provisional, .ephemeral:
      return "granted"
    case .denied:
      return "denied"
    case .notDetermined:
      return "prompt"
    @unknown default:
      return "prompt"
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

  private func openDeepLink(_ url: URL) {
    if readyForDeepLinks, let webView {
      webView.load(URLRequest(url: url))
    } else {
      pendingDeepLinkURL = url
    }
  }

  /// Only https URLs on our live-site host (test or prod config). Relative paths resolve against `AppConfig.baseURL`.
  static func deepLinkURL(from userInfo: [AnyHashable: Any]) -> URL? {
    let raw: String?
    if let s = userInfo["url"] as? String {
      raw = s
    } else if let s = userInfo["url"] as? NSString {
      raw = s as String
    } else {
      raw = nil
    }
    guard var href = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !href.isEmpty else {
      return nil
    }

    if href.hasPrefix("/") {
      guard var components = URLComponents(url: AppConfig.baseURL, resolvingAgainstBaseURL: false) else {
        return nil
      }
      let parts = href.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
      components.path = String(parts[0])
      components.query = parts.count > 1 ? String(parts[1]) : nil
      guard let absolute = components.url else { return nil }
      href = absolute.absoluteString
    }

    guard let url = URL(string: href),
          let scheme = url.scheme?.lowercased(),
          scheme == "https",
          let host = url.host?.lowercased()
    else {
      return nil
    }

    let allowed = allowedDeepLinkHosts()
    guard allowed.contains(host) else { return nil }
    return url
  }

  private static func allowedDeepLinkHosts() -> Set<String> {
    var hosts: Set<String> = []
    if let h = AppConfig.baseURL.host?.lowercased() {
      hosts.insert(h)
    }
    // Both shells may receive absolute urls stamped for either origin during dual-env smoke.
    hosts.insert("lvslotpro.com")
    hosts.insert("www.lvslotpro.com")
    hosts.insert("edgetilt.com")
    hosts.insert("www.edgetilt.com")
    return hosts
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    EdgeCallKitManager.shared.handleCallInviteUserInfo(notification.request.content.userInfo)
    completionHandler([.banner, .sound, .badge])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    handleNotificationUserInfo(response.notification.request.content.userInfo)
    completionHandler()
  }
}
