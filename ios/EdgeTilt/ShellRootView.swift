import SwiftUI

struct ShellRootView: View {
  var body: some View {
    EdgeWebView(url: AppConfig.baseURL)
      .ignoresSafeArea()
      .background(Color.black)
  }
}
