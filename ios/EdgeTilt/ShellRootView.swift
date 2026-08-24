import SwiftUI

struct ShellRootView: View {
  var body: some View {
    // Edge-to-edge like Safari/PWA. WKWebView often reports env(safe-area-inset-*) as 0,
    // so EdgeWebView injects --edge-sat/… and the web uses max(env(), var(--edge-*)).
    EdgeWebView(url: AppConfig.baseURL)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .ignoresSafeArea()
      .background(Color.black)
  }
}
