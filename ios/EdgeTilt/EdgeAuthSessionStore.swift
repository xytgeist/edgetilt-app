import Foundation
import Security

/// Keychain JWT so lock-screen CallKit answer can POST `chat-calls` without WKWebView.
/// Contract: `docs/ios-native-bridge.md` `setAuthSession`.
enum EdgeAuthSessionStore {
  private static let service = "com.edgetilt.app.auth-session"
  private static let account = "supabase"

  struct Session: Codable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: TimeInterval
    var supabaseUrl: String
    var anonKey: String
  }

  enum StoreError: LocalizedError {
    case missing
    case refreshFailed(String)

    var errorDescription: String? {
      switch self {
      case .missing:
        return "Sign in on this phone before answering a call."
      case .refreshFailed(let message):
        return message
      }
    }
  }

  static func save(_ session: Session) throws {
    let data = try JSONEncoder().encode(session)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(add as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw StoreError.refreshFailed("Could not store the sign-in session.")
    }
  }

  static func load() -> Session? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return try? JSONDecoder().decode(Session.self, from: data)
  }

  static func clear() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }

  /// Returns a usable access token, refreshing via Supabase when `expiresAt` is close.
  static func validAccessToken() async throws -> Session {
    guard var session = load() else { throw StoreError.missing }
    let now = Date().timeIntervalSince1970
    if session.expiresAt - now > 60, !session.accessToken.isEmpty {
      return session
    }
    session = try await refresh(session)
    try save(session)
    return session
  }

  private static func refresh(_ session: Session) async throws -> Session {
    let base = session.supabaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let url = URL(string: "\(base)/auth/v1/token?grant_type=refresh_token") else {
      throw StoreError.refreshFailed("Invalid supabaseUrl.")
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(session.anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(session.anonKey)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "refresh_token": session.refreshToken,
    ])

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status >= 200, status < 300 else {
      let body = String(data: data, encoding: .utf8) ?? ""
      throw StoreError.refreshFailed("Session expired. Open Edge and sign in again. (\(status) \(body))")
    }
    guard
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let access = json["access_token"] as? String,
      !access.isEmpty
    else {
      throw StoreError.refreshFailed("Could not refresh the sign-in session.")
    }
    let refreshToken = (json["refresh_token"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let expiresAt: TimeInterval
    if let raw = json["expires_at"] as? TimeInterval {
      expiresAt = raw
    } else if let raw = json["expires_at"] as? Int {
      expiresAt = TimeInterval(raw)
    } else if let expiresIn = json["expires_in"] as? TimeInterval {
      expiresAt = Date().timeIntervalSince1970 + expiresIn
    } else if let expiresIn = json["expires_in"] as? Int {
      expiresAt = Date().timeIntervalSince1970 + TimeInterval(expiresIn)
    } else {
      expiresAt = Date().timeIntervalSince1970 + 3600
    }
    return Session(
      accessToken: access,
      refreshToken: (refreshToken?.isEmpty == false ? refreshToken! : session.refreshToken),
      expiresAt: expiresAt,
      supabaseUrl: session.supabaseUrl,
      anonKey: session.anonKey
    )
  }
}
