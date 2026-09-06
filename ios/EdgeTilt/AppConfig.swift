import Foundation

enum AppConfig {
  static let shellVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.4.75"
  static let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"

  #if EDGE_ENV_PROD
  static let environment = "prod"
  static let baseURL = URL(string: "https://edgetilt.com")!
  #else
  static let environment = "test"
  static let baseURL = URL(string: "https://lvslotpro.com")!
  #endif

  /// Appended to the default WKWebView user agent. Web detects `EdgeiOS/`.
  static var userAgentToken: String { "EdgeiOS/\(shellVersion)" }
}
