import SwiftUI

@main
struct EdgeTiltApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  var body: some Scene {
    WindowGroup {
      ShellRootView()
        .background(Color.black)
        .preferredColorScheme(.dark)
    }
  }
}
