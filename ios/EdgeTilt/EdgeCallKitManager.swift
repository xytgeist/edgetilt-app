import AVFoundation
import CallKit
import Foundation
import PushKit
import UIKit
import WebKit

/// CallKit + PushKit VoIP for chat calls. Native → JS via CustomEvent on `window`.
final class EdgeCallKitManager: NSObject, CXProviderDelegate, PKPushRegistryDelegate {
  static let shared = EdgeCallKitManager()

  struct CallMeta {
    let callId: String
    let roomId: String
    let hasVideo: Bool
    let callerName: String
  }

  private let provider: CXProvider
  private let callController = CXCallController()
  private var calls: [UUID: CallMeta] = [:]
  private var pushRegistry: PKPushRegistry?
  private weak var webView: WKWebView?
  private var voipTokenHex: String?

  private override init() {
    let config = CXProviderConfiguration(localizedName: "Edge")
    config.supportsVideo = true
    config.maximumCallsPerCallGroup = 1
    config.maximumCallGroups = 1
    config.supportedHandleTypes = [.generic]
    config.includesCallsInRecents = false
    if let icon = UIImage(named: "AppIcon") {
      config.iconTemplateImageData = icon.pngData()
    }
    provider = CXProvider(configuration: config)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  func configure() {
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    pushRegistry = registry
  }

  func attach(webView: WKWebView) {
    self.webView = webView
  }

  func currentVoIPTokenPayload() -> [String: Any] {
    if let token = voipTokenHex, !token.isEmpty {
      return ["token": token]
    }
    return ["token": NSNull()]
  }

  /// JS → native: surface incoming call (foreground Realtime path).
  func reportIncomingCall(
    uuidString: String?,
    callId: String,
    roomId: String,
    handle: String,
    hasVideo: Bool,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let uuid = Self.uuid(from: uuidString) ?? UUID()
    let callerName = handle.trimmingCharacters(in: .whitespacesAndNewlines)
    let meta = CallMeta(
      callId: callId,
      roomId: roomId,
      hasVideo: hasVideo,
      callerName: callerName.isEmpty ? "Incoming call" : callerName
    )
    calls[uuid] = meta

    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: meta.callerName)
    update.localizedCallerName = meta.callerName
    update.hasVideo = hasVideo
    update.supportsDTMF = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false

    provider.reportNewIncomingCall(with: uuid, update: update) { error in
      if let error {
        self.calls.removeValue(forKey: uuid)
        completion(.failure(error))
        return
      }
      EdgeAudioSession.apply(mode: hasVideo ? "voiceChat" : "voiceChatEarpiece") { _ in }
      completion(.success(["ok": true, "uuid": uuid.uuidString.lowercased()]))
    }
  }

  func endCall(uuidString: String?, callId: String?, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    let uuid = resolveUUID(uuidString: uuidString, callId: callId)
    guard let uuid else {
      completion(.success(["ok": false]))
      return
    }
    let action = CXEndCallAction(call: uuid)
    let transaction = CXTransaction(action: action)
    callController.request(transaction) { error in
      if let error {
        completion(.failure(error))
        return
      }
      completion(.success(["ok": true]))
    }
  }

  func endAllCalls() {
    for uuid in Array(calls.keys) {
      provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
      calls.removeValue(forKey: uuid)
    }
  }

  // MARK: - APNs alert path (foreground banner with chat_call_invite metadata)

  func handleCallInviteUserInfo(_ userInfo: [AnyHashable: Any]) {
    let eventType = (userInfo["eventType"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard eventType == "chat_call_invite" else { return }
    let callId = (userInfo["chatCallId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !callId.isEmpty else { return }

    var roomId = ""
    if let urlRaw = userInfo["url"] as? String, let url = URL(string: urlRaw),
       let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
      roomId = components.queryItems?.first(where: { $0.name == "room" })?.value ?? ""
    }

    let title = ((userInfo["aps"] as? [String: Any])?["alert"] as? [String: Any])?["title"] as? String
    let body = ((userInfo["aps"] as? [String: Any])?["alert"] as? [String: Any])?["body"] as? String
    let callerName = String(body ?? title ?? "Incoming call")

    reportIncomingCall(
      uuidString: nil,
      callId: callId,
      roomId: roomId,
      handle: callerName,
      hasVideo: false
    ) { _ in }
  }

  // MARK: - PKPushRegistryDelegate

  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let hex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    voipTokenHex = hex
    UserDefaults.standard.set(hex, forKey: "edge.voip.deviceToken")
    dispatchToWeb(event: "edge-voip-token", detail: ["token": hex])
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    voipTokenHex = nil
    UserDefaults.standard.removeObject(forKey: "edge.voip.deviceToken")
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    let userInfo = payload.dictionaryPayload
    let callId = (userInfo["chatCallId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let roomId = (userInfo["roomId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let callerName = (userInfo["callerName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "Incoming call"
    let hasVideo = (userInfo["hasVideo"] as? Bool) ?? false

    if callId.isEmpty {
      completion()
      return
    }

    reportIncomingCall(
      uuidString: nil,
      callId: callId,
      roomId: roomId,
      handle: callerName,
      hasVideo: hasVideo
    ) { _ in
      completion()
    }
  }

  // MARK: - CXProviderDelegate

  func providerDidReset(_ provider: CXProvider) {
    calls.removeAll()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    if let meta = calls[action.callUUID] {
      dispatchToWeb(
        event: "edge-callkit-answer",
        detail: [
          "uuid": action.callUUID.uuidString.lowercased(),
          "callId": meta.callId,
          "roomId": meta.roomId,
          "hasVideo": meta.hasVideo,
        ]
      )
    }
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    if let meta = calls[action.callUUID] {
      dispatchToWeb(
        event: "edge-callkit-decline",
        detail: [
          "uuid": action.callUUID.uuidString.lowercased(),
          "callId": meta.callId,
          "roomId": meta.roomId,
        ]
      )
    }
    calls.removeValue(forKey: action.callUUID)
    EdgeAudioSession.apply(mode: "default") { _ in }
    action.fulfill()
  }

  func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    action.fail()
  }

  // MARK: - Helpers

  private func resolveUUID(uuidString: String?, callId: String?) -> UUID? {
    if let uuidString, let uuid = Self.uuid(from: uuidString) {
      return uuid
    }
    if let callId, !callId.isEmpty {
      if let hit = calls.first(where: { $0.value.callId == callId })?.key {
        return hit
      }
    }
    return calls.keys.first
  }

  private static func uuid(from raw: String?) -> UUID? {
    guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
      return nil
    }
    return UUID(uuidString: raw)
  }

  private func dispatchToWeb(event: String, detail: [String: Any]) {
    guard let webView else { return }
    guard let data = try? JSONSerialization.data(withJSONObject: detail),
          let json = String(data: data, encoding: .utf8)
    else { return }
    let js = """
    (function(){
      var detail = \(json);
      window.dispatchEvent(new CustomEvent('\(event)', { detail: detail }));
    })();
    """
    DispatchQueue.main.async {
      webView.evaluateJavaScript(js, completionHandler: nil)
    }
  }
}
