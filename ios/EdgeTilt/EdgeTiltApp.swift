import SwiftUI

@main
struct EdgeTiltApp: App {
  var body: some Scene {
    WindowGroup {
      ShellRootView()
        .background(Color.black)
        .preferredColorScheme(.dark)
    }
  }
}
