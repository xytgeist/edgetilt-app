import AuthenticationServices
import UIKit

/// Native Sign in with Apple. JS hashes the nonce and finishes via Supabase `signInWithIdToken`.
enum EdgeAppleSignIn {
  static func start(
    hashedNonce: String,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    DispatchQueue.main.async {
      Coordinator.shared.start(hashedNonce: hashedNonce, completion: completion)
    }
  }
}

private final class Coordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  static let shared = Coordinator()
  private var completion: ((Result<[String: Any], Error>) -> Void)?

  func start(
    hashedNonce: String,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    if self.completion != nil {
      completion(.success(["ok": false, "error": "Apple sign-in already in progress."]))
      return
    }
    self.completion = completion

    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.fullName, .email]
    let nonce = hashedNonce.trimmingCharacters(in: .whitespacesAndNewlines)
    if !nonce.isEmpty {
      request.nonce = nonce
    }

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) {
      return window
    }
    return scenes.first?.windows.first ?? ASPresentationAnchor()
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard
      let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let tokenData = credential.identityToken,
      let token = String(data: tokenData, encoding: .utf8),
      !token.isEmpty
    else {
      finish(["ok": false, "error": "Apple did not return an identity token."])
      return
    }

    var payload: [String: Any] = [
      "ok": true,
      "identityToken": token,
      "user": credential.user,
    ]
    if let codeData = credential.authorizationCode,
       let code = String(data: codeData, encoding: .utf8),
       !code.isEmpty
    {
      payload["authorizationCode"] = code
    }
    if let email = credential.email, !email.isEmpty {
      payload["email"] = email
    }
    if let name = credential.fullName {
      let parts = [name.givenName, name.familyName]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
      if !parts.isEmpty {
        payload["fullName"] = parts.joined(separator: " ")
      }
    }
    finish(payload)
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    if let err = error as? ASAuthorizationError, err.code == .canceled {
      finish(["ok": false, "cancelled": true])
      return
    }
    finish(["ok": false, "error": error.localizedDescription])
  }

  private func finish(_ payload: [String: Any]) {
    let done = completion
    completion = nil
    done?(.success(payload))
  }
}
