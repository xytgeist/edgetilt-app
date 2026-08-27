import SwiftUI

@main
struct EdgeTiltApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      ShellRootView()
        .background(Color.black)
        .preferredColorScheme(.dark)
        .onChange(of: scenePhase) { _, phase in
          if phase == .active {
            EdgeCallKitManager.shared.handleDidBecomeActive()
          }
        }
        .onOpenURL { url in
          if url.scheme?.lowercased() == "edgetilt" {
            EdgeCallKitManager.shared.handleDidBecomeActive()
          }
        }
    }
  }
}
