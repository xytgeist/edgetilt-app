import Foundation
import StoreKit

/// China App Store / MIIT: CallKit must stay inactive (Guideline 5.0).
/// Storefront is the Review signal. Locale is only a first-launch fallback.
enum EdgeChinaAvailability {
  private static let storefrontKey = "edge.lastStorefrontCountry"

  static func persist(countryCode: String) {
    let code = countryCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    guard !code.isEmpty else { return }
    UserDefaults.standard.set(code, forKey: storefrontKey)
  }

  static var lastStorefrontCountry: String {
    (UserDefaults.standard.string(forKey: storefrontKey) ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .uppercased()
  }

  /// SK1 storefront is sync at launch. Persist whatever we get.
  static func refreshFromStoreKit() {
    if let code = SKPaymentQueue.default().storefront?.countryCode, !code.isEmpty {
      persist(countryCode: code)
    }
  }

  static var isChinaStorefront: Bool {
    lastStorefrontCountry == "CHN"
  }

  static var isChinaLocale: Bool {
    let locale = Locale.current
    if locale.region?.identifier.uppercased() == "CN" { return true }
    let id = locale.identifier.uppercased()
    return id.hasSuffix("_CN") || id.hasSuffix("-CN") || id.contains("_CN_") || id.contains("-CN-")
  }

  /// PushKit VoIP + CXProvider stay off when this is false.
  /// iOS 13+ kills the process if a VoIP push is received and CallKit is not reported.
  static var callKitAllowed: Bool {
    if isChinaStorefront { return false }
    if lastStorefrontCountry.isEmpty && isChinaLocale { return false }
    return true
  }
}
