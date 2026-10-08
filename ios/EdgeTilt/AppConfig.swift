import Foundation

enum AppConfig {
  static let shellVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.4.96"
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

  /// Hardware id (`iPhone19,4` = Duo). Simulator uses `SIMULATOR_MODEL_IDENTIFIER`.
  static var modelIdentifier: String {
    if let sim = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"], !sim.isEmpty {
      return sim
    }
    var info = utsname()
    uname(&info)
    var machine = info.machine
    return withUnsafeBytes(of: &machine) { raw in
      guard let ptr = raw.baseAddress?.assumingMemoryBound(to: CChar.self) else { return "unknown" }
      return String(cString: ptr)
    }
  }

  static var isIPhoneDuo: Bool { modelIdentifier == "iPhone19,4" }
}
