import SwiftUI

struct ShellRootView: View {
  var body: some View {
    // Edge-to-edge like Safari/PWA. GeometryReader still exposes real safe-area
    // insets even when the WebView ignoresSafeArea (UIView insets are often 0).
    GeometryReader { proxy in
      EdgeWebView(url: AppConfig.baseURL, swiftSafeArea: proxy.safeAreaInsets)
        .frame(width: proxy.size.width, height: proxy.size.height)
    }
    .ignoresSafeArea()
    .background(Color.black)
  }
}
