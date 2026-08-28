import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // PushKit must exist before didFinishLaunching returns. A VoIP wake from
    // terminated delivers the payload only after the registry is up. Do this
    // before LiveKit / web / location work.
    EdgeCallKitManager.shared.startPushRegistryIfNeeded()
    EdgePushManager.shared.configure()
    EdgeCallKitManager.shared.configure()
    EdgeLiveKitCallManager.shared.configure()
    EdgeLocationManager.shared.configure()
    EdgeLocationManager.shared.ensureWhenInUseAuthorization()
    EdgeAudioSession.ensurePlaybackUnlessVoiceChat()
    EdgeWebKitKeyboard.hideAccessoryBar()
    if let remote = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
      EdgePushManager.shared.handleNotificationUserInfo(remote)
    }
    return true
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    EdgeAudioSession.ensurePlaybackUnlessVoiceChat()
    EdgeCallKitManager.shared.handleDidBecomeActive()
  }

  func applicationProtectedDataDidBecomeAvailable(_ application: UIApplication) {
    EdgeCallKitManager.shared.handleDeviceUnlocked()
  }

  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    let eventType = (userInfo["eventType"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    if eventType == "chat_call_missed" {
      let callId = (userInfo["chatCallId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        ?? (userInfo["chat_call_id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      if let callId, !callId.isEmpty {
        EdgeCallKitManager.shared.endCall(uuidString: nil, callId: callId, reason: "remote") { _ in
          completionHandler(.newData)
        }
      } else {
        EdgeCallKitManager.shared.endAllCalls()
        completionHandler(.newData)
      }
      return
    }
    completionHandler(.noData)
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    EdgePushManager.shared.didRegister(deviceToken: deviceToken)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    EdgePushManager.shared.didFailToRegister(error: error)
  }
}
