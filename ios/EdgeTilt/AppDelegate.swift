import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    EdgePushManager.shared.configure()
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
