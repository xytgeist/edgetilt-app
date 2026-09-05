import Foundation

/// Native `chat-calls` Edge client. Lock-screen answer cannot wait for WKWebView.
enum EdgeChatCallsClient {
  enum ClientError: LocalizedError {
    case badResponse(String)

    var errorDescription: String? {
      switch self {
      case .badResponse(let message):
        return message
      }
    }
  }

  struct InvokeResult {
    let payload: [String: Any]
    var token: String? { string("token") }
    var livekitUrl: String? { string("livekit_url") ?? string("livekitUrl") }
    var call: [String: Any]? { payload["call"] as? [String: Any] }
    var callId: String? {
      if let id = string("callId") { return id }
      if let id = call?["id"] as? String, !id.isEmpty { return id }
      return nil
    }

    func string(_ key: String) -> String? {
      guard let raw = payload[key] as? String else { return nil }
      let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
  }

  static func invoke(action: String, body: [String: Any] = [:]) async throws -> InvokeResult {
    try await invokeOnce(action: action, body: body, forceRefresh: false)
  }

  private static func invokeOnce(
    action: String,
    body: [String: Any],
    forceRefresh: Bool
  ) async throws -> InvokeResult {
    let session = try await EdgeAuthSessionStore.validAccessToken(forceRefresh: forceRefresh)
    let base = session.supabaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let url = URL(string: "\(base)/functions/v1/chat-calls") else {
      throw ClientError.badResponse("Invalid supabaseUrl.")
    }

    var payload = body
    payload["action"] = action

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(session.anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: payload)

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    if status == 401, !forceRefresh {
      return try await invokeOnce(action: action, body: body, forceRefresh: true)
    }
    if status < 200 || status >= 300 {
      let message = (json["error"] as? String) ?? String(data: data, encoding: .utf8) ?? "Call request failed."
      throw ClientError.badResponse(message)
    }
    if let error = json["error"] as? String, !error.isEmpty {
      throw ClientError.badResponse(error)
    }
    return InvokeResult(payload: json)
  }

  static func startCall(roomId: String, mediaMode: String) async throws -> InvokeResult {
    try await invoke(action: "start_call", body: [
      "room_id": roomId,
      "media_mode": mediaMode == "video" ? "video" : "audio",
    ])
  }

  static func acceptCall(callId: String) async throws -> InvokeResult {
    try await invoke(action: "accept_call", body: ["call_id": callId])
  }

  static func joinCall(callId: String) async throws -> InvokeResult {
    try await invoke(action: "join_call", body: ["call_id": callId])
  }

  static func leaveCall(callId: String) async throws -> InvokeResult {
    try await invoke(action: "leave_call", body: ["call_id": callId])
  }

  static func declineCall(callId: String) async throws -> InvokeResult {
    try await invoke(action: "decline_call", body: ["call_id": callId])
  }
}
