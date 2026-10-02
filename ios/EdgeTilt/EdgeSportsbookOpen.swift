import UIKit

/// Opens sportsbook URLs from the game hub. Hard Rock Bet's https site is a
/// download interstitial ... prefer the native app / App Store instead of SFSafari.
enum EdgeSportsbookOpen {
  static let hardRockAppStoreURL = URL(string: "https://apps.apple.com/app/id1572525917")!
  static let hardRockSchemes = ["hardrockbet://"]

  static func open(
    url: URL,
    book: String?,
    completion: @escaping (_ ok: Bool, _ via: String) -> Void
  ) {
    if isHardRock(book: book, url: url) {
      openHardRock(preferred: url, completion: completion)
      return
    }
    EdgeInAppBrowser.open(url) { ok in
      completion(ok, ok ? "inApp" : "failed")
    }
  }

  private static func isHardRock(book: String?, url: URL) -> Bool {
    let key = String(book ?? "")
      .lowercased()
      .replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression)
    if key == "hardrock" || key == "hardrockbet" { return true }
    let host = (url.host ?? "").lowercased()
    return host == "hardrock.bet"
      || host.hasSuffix(".hardrock.bet")
      || host.contains("hardrockbet")
  }

  private static func isHardRockHomepage(_ url: URL) -> Bool {
    let host = (url.host ?? "").lowercased()
    guard host == "hardrock.bet" || host.hasSuffix(".hardrock.bet") else { return false }
    var path = url.path
    while path.hasSuffix("/") { path = String(path.dropLast()) }
    if path.isEmpty { path = "/" }
    return path == "/" || path == "/download" || path == "/app"
  }

  private static func openHardRock(
    preferred: URL,
    completion: @escaping (_ ok: Bool, _ via: String) -> Void
  ) {
    DispatchQueue.main.async {
      // Odds API deep links may universal-link into the app when not the marketing homepage.
      if !isHardRockHomepage(preferred),
         let scheme = preferred.scheme?.lowercased(),
         scheme == "http" || scheme == "https"
      {
        UIApplication.shared.open(preferred, options: [:]) { ok in
          if ok {
            completion(true, "universal")
            return
          }
          openHardRockAppOrStore(completion: completion)
        }
        return
      }
      openHardRockAppOrStore(completion: completion)
    }
  }

  private static func openHardRockAppOrStore(
    completion: @escaping (_ ok: Bool, _ via: String) -> Void
  ) {
    func tryScheme(at index: Int) {
      if index >= hardRockSchemes.count {
        UIApplication.shared.open(hardRockAppStoreURL, options: [:]) { ok in
          completion(ok, ok ? "appStore" : "failed")
        }
        return
      }
      guard let appURL = URL(string: hardRockSchemes[index]) else {
        tryScheme(at: index + 1)
        return
      }
      UIApplication.shared.open(appURL, options: [:]) { ok in
        if ok {
          completion(true, "appScheme")
          return
        }
        tryScheme(at: index + 1)
      }
    }
    tryScheme(at: 0)
  }
}
