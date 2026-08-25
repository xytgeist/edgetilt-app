import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    EdgePushManager.shared.configure()
    EdgeAudioSession.ensurePlaybackUnlessVoiceChat()
    EdgeWebKitKeyboard.hideAccessoryBar()
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
