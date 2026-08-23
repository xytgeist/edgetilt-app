import SwiftUI

struct ShellRootView: View {
  var body: some View {
    // Lay out the WebView *inside* the safe area. Our web CSS uses
    // env(safe-area-inset-*), but WKWebView often reports those as 0px when the
    // view draws edge-to-edge under the notch ... post-detail back control ended
    // up under the Dynamic Island. Matching PWA edge-to-edge comes later via
    // native inset injection once env() is trustworthy.
    EdgeWebView(url: AppConfig.baseURL)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.black)
  }
}
