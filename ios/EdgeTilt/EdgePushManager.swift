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

  /// Currently active chat room ID in the WKWebView (if any).
  /// Used to suppress in-app system push banners and alert chimes for messages
  /// arriving in the room the user is already viewing.
  var activeChatRoomId: String?

  private override init() {
    super.init()
    if let stored = UserDefaults.standard.string(forKey: tokenDefaultsKey), !stored.isEmpty {
      deviceTokenHex = stored
    }
  }

  func configure() {
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    // Refresh token if already authorized (e.g. relaunch after grant),
    // or request authorization on first launch if not yet determined.
    center.getNotificationSettings { settings in
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
      case .notDetermined:
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
          if granted {
            DispatchQueue.main.async {
              UIApplication.shared.registerForRemoteNotifications()
            }
          }
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

  /// Drop the APNs "X is calling you" card once CallKit owns the invite (or the call
  /// ended). The alert is a sibling of the VoIP push, not the call UI, so answering
  /// CallKit never updates it.
  func removeDeliveredCallInviteNotifications(callId: String?) {
    removeDeliveredCallInviteNotificationsNow(callId: callId)
    // APNs often lands a beat after VoIP. Retract again so the sibling
    // "Edge Chat is calling you" card does not stick under CallKit.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
      self?.removeDeliveredCallInviteNotificationsNow(callId: callId)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
      self?.removeDeliveredCallInviteNotificationsNow(callId: callId)
    }
  }

  private func removeDeliveredCallInviteNotificationsNow(callId: String?) {
    let trimmed = callId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let center = UNUserNotificationCenter.current()
    center.getDeliveredNotifications { notes in
      let ids = notes.compactMap { note -> String? in
        Self.isCallInvite(note.request.content.userInfo, callId: trimmed)
          ? note.request.identifier
          : nil
      }
      if !ids.isEmpty {
        center.removeDeliveredNotifications(withIdentifiers: ids)
      }
    }
    center.getPendingNotificationRequests { requests in
      let ids = requests.compactMap { request -> String? in
        Self.isCallInvite(request.content.userInfo, callId: trimmed)
          ? request.identifier
          : nil
      }
      if !ids.isEmpty {
        center.removePendingNotificationRequests(withIdentifiers: ids)
      }
    }
  }

  private static func isCallInvite(_ userInfo: [AnyHashable: Any], callId: String) -> Bool {
    let eventType = (userInfo["eventType"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let noteCallId = (userInfo["chatCallId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !callId.isEmpty { return noteCallId == callId }
    return eventType == "chat_call_invite"
  }

  private static func extractChatRoomId(from userInfo: [AnyHashable: Any]) -> String? {
    if let r = (userInfo["chatRoomId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty {
      return r
    }
    if let r = (userInfo["chat_room_id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty {
      return r
    }
    if let r = (userInfo["roomId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty {
      return r
    }
    if let deepLink = deepLinkURL(from: userInfo),
       let components = URLComponents(url: deepLink, resolvingAgainstBaseURL: false) {
      if let roomParam = components.queryItems?.first(where: { $0.name == "room" })?.value,
         !roomParam.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return roomParam.trimmingCharacters(in: .whitespacesAndNewlines)
      }
    }
    return nil
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    let userInfo = notification.request.content.userInfo
    let eventType = (userInfo["eventType"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    if eventType == "chat_call_invite" {
      // CallKit is the ring. Showing the APNs banner here stacks a second "is calling
      // you" card that never transitions when the user answers.
      EdgeCallKitManager.shared.handleCallInviteUserInfo(userInfo)
      completionHandler([])
      return
    }
    if eventType == "chat_call_missed" {
      let callId = (userInfo["chatCallId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        ?? (userInfo["chat_call_id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      if let callId, !callId.isEmpty {
        EdgeCallKitManager.shared.endCall(uuidString: nil, callId: callId, reason: "remote") { _ in }
      } else {
        EdgeCallKitManager.shared.endAllCalls()
      }
    }

    // If the user is currently viewing this exact chat room in the foreground,
    // suppress the in-app drop-down notification banner and alert sound.
    if let activeRoom = activeChatRoomId, !activeRoom.isEmpty {
      if let noteRoomId = Self.extractChatRoomId(from: userInfo), noteRoomId == activeRoom {
        NSLog("EdgePushManager: suppressing foreground APNs banner for active chat room \(activeRoom)")
        completionHandler([])
        return
      }
    }

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
