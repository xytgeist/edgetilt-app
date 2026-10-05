import SwiftUI

@main
struct EdgeTiltApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      ShellRootView()
        .background(Color.black)
        .onAppear {
          EdgeShellAppearance.shared.applyToWindows()
          EdgeLiveSportsActivity.bootstrapPushUpdates()
        }
        .onChange(of: scenePhase) { _, phase in
          EdgeLiveSportsActivity.handleSceneBecameActive(phase == .active)
          if phase == .active {
            EdgeShellAppearance.shared.applyToWindows()
            EdgeCallKitManager.shared.handleDidBecomeActive()
          }
        }
        .onOpenURL { url in
          if url.scheme?.lowercased() == "https" {
            EdgePushManager.shared.handleUniversalLink(url)
            return
          }
          if url.scheme?.lowercased() == "edgetilt" {
            EdgeCallKitManager.shared.handleDidBecomeActive()
            EdgePushManager.shared.handleCustomSchemeLink(url)
          }
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { userActivity in
          guard let url = userActivity.webpageURL else { return }
          EdgePushManager.shared.handleUniversalLink(url)
        }
    }
  }
}
