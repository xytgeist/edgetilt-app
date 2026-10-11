import AuthenticationServices
import UIKit

/// In-app OAuth via `ASWebAuthenticationSession` (Gameday-style).
/// Contract: `docs/ios-native-bridge.md` → `startWebAuthSession`.
enum EdgeWebAuthSession {
  private static var activeSession: ASWebAuthenticationSession?
  private static var contextProvider = ContextProvider()

  /// Present an auth sheet. Completes when the flow hits `callbackScheme://…` or the user cancels.
  static func start(
    url: URL,
    callbackScheme: String,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    DispatchQueue.main.async {
      // One session at a time … cancel any prior sheet.
      activeSession?.cancel()
      activeSession = nil

      let scheme = callbackScheme.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !scheme.isEmpty else {
        completion(.success(["ok": false, "error": "callbackScheme required"]))
        return
      }

      let session = ASWebAuthenticationSession(
        url: url,
        callbackURLScheme: scheme
      ) { callbackURL, error in
        activeSession = nil
        if let error {
          let ns = error as NSError
          if ns.domain == ASWebAuthenticationSessionError.errorDomain,
             ns.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
            completion(.success(["ok": false, "cancelled": true]))
            return
          }
          completion(.success([
            "ok": false,
            "error": error.localizedDescription,
          ]))
          return
        }
        guard let callbackURL else {
          completion(.success(["ok": false, "error": "No callback URL"]))
          return
        }
        completion(.success([
          "ok": true,
          "url": callbackURL.absoluteString,
        ]))
      }

      // Non-ephemeral so Yahoo 2FA / Fantasy app handoff can reuse Safari cookies (Gameday).
      session.prefersEphemeralWebBrowserSession = false
      session.presentationContextProvider = contextProvider
      activeSession = session

      if !session.start() {
        activeSession = nil
        completion(.success(["ok": false, "error": "Could not start auth session"]))
      }
    }
  }

  private final class ContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      if let key = scenes.flatMap(\.windows).first(where: \.isKeyWindow) {
        return key
      }
      if let any = scenes.first?.windows.first {
        return any
      }
      return ASPresentationAnchor()
    }
  }
}
