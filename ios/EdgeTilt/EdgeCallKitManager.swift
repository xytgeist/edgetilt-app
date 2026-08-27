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
  /// True only once JS has installed its CallKit listeners for the current page.
  private var webReady = false
  private var pendingWebEvents: [(event: String, detail: [String: Any])] = []
  private static let maxPendingWebEvents = 8
  private var callBackgroundTask: UIBackgroundTaskIdentifier = .invalid
  private var mediaConnected = false
  private var answeredUUIDs: Set<UUID> = []
  /// Answer happened while the phone was locked / backgrounded. On unlock we
  /// reveal the in-app live call screen. We cannot unlock the device ourselves.
  private var pendingCallReveal = false

  /// True while CallKit is tracking at least one invite/call. The web view uses
  /// this to skip SW hygiene on a VoIP cold start so the page can load before
  /// the user answers from the lock screen.
  var hasTrackedCalls: Bool { !calls.isEmpty }

  private override init() {
    // Call UI name comes from CFBundleDisplayName ("Edge").
    let config = CXProviderConfiguration()
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
    EdgeLiveKitCallManager.shared.configure()
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    pushRegistry = registry
  }

  func attach(webView: WKWebView) {
    self.webView = webView
  }

  /// JS → native: `ChatCallProvider` has its answer/decline listeners installed.
  /// A VoIP push can wake us from terminated, so an answer often happens before the
  /// web layer exists. Events buffered until now are replayed here; without this the
  /// CustomEvent landed on a page with no listener and the answer was lost, leaving
  /// CallKit showing an answered call the web app never joined.
  func markWebReady(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    webReady = true
    let replay = pendingWebEvents
    pendingWebEvents = []
    for item in replay {
      evaluateWebEvent(event: item.event, detail: item.detail)
    }
    completion(.success(["ok": true, "replayed": replay.count]))
  }

  /// JS → native: native LiveKit Room connected. CallKit fulfill is not this.
  func markMediaConnected(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    mediaConnected = true
    completion(.success(["ok": true]))
  }

  func markMediaConnectedLocally() {
    mediaConnected = true
  }

  /// Unlock / foreground is when iOS will allow a useful camera. Mic already
  /// published from CallKit didActivate. If the answer was from the lock screen,
  /// this is also when we can show the in-app live call chrome.
  func handleDidBecomeActive() {
    EdgeLiveKitCallManager.shared.handleDidBecomeActive()
    revealInAppCallIfNeeded()
  }

  /// iOS will not let us unlock the phone. After the user unlocks (or iOS
  /// brings Edge forward), open the chat room + full call modal.
  func revealInAppCallIfNeeded() {
    guard pendingCallReveal else { return }
    pendingCallReveal = false
    let native = EdgeLiveKitCallManager.shared.currentState()
    let meta = calls.values.first
    let callId = ((native["callId"] as? String) ?? meta?.callId ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !callId.isEmpty else { return }
    let roomId = ((native["roomId"] as? String) ?? meta?.roomId ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let hasVideo = (native["hasVideo"] as? Bool) ?? meta?.hasVideo ?? false
    dispatchToWeb(
      event: "edge-native-call-reveal",
      detail: [
        "callId": callId,
        "roomId": roomId,
        "hasVideo": hasVideo,
        "openRoom": true,
      ]
    )
  }

  func dispatchNativeCallState(_ detail: [String: Any]) {
    dispatchToWeb(event: "edge-native-call-state", detail: detail)
  }

  /// A new page load tears down the listeners, so stop dispatching until JS re-marks.
  func invalidateWebReady() {
    webReady = false
  }

  /// Keep the process (and WKWebView JS) alive long enough to load + join after a
  /// lock-screen answer. `voip` alone does not keep us runnable once the push is
  /// handled; `audio` + this task is what lets LiveKit connect while locked.
  func beginCallBackgroundTask() {
    if callBackgroundTask != .invalid { return }
    callBackgroundTask = UIApplication.shared.beginBackgroundTask(withName: "edge.callkit") { [weak self] in
      self?.endCallBackgroundTask()
    }
  }

  func endCallBackgroundTask() {
    guard callBackgroundTask != .invalid else { return }
    UIApplication.shared.endBackgroundTask(callBackgroundTask)
    callBackgroundTask = .invalid
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
    let trimmedCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    // One invite reaches us up to three ways: web Realtime (`ChatCallProvider`), the
    // foreground APNs alert banner (`willPresent`), and the PushKit VoIP ring. The
    // sender emits both an alert and a VoIP push for `chat_call_invite`, so without
    // this every path minted its own UUID and CallKit saw unrelated calls for one
    // invite. `endCall` resolves a single UUID, so the extras stranded on screen.
    if !trimmedCallId.isEmpty,
       let existing = calls.first(where: { $0.value.callId == trimmedCallId })?.key {
      EdgePushManager.shared.removeDeliveredCallInviteNotifications(callId: trimmedCallId)
      completion(.success(["ok": true, "uuid": existing.uuidString.lowercased(), "deduped": true]))
      return
    }
    let uuid = Self.uuid(from: uuidString) ?? UUID()
    let callerName = Self.sanitizedCallerName(handle)
    let meta = CallMeta(
      callId: trimmedCallId,
      roomId: roomId,
      hasVideo: hasVideo,
      callerName: callerName
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
      // CallKit is now the ring UI. Drop the sibling APNs "X is calling you" card so
      // it does not sit on the lock screen / banner after the user answers.
      EdgePushManager.shared.removeDeliveredCallInviteNotifications(callId: trimmedCallId)
      self.beginCallBackgroundTask()
      completion(.success(["ok": true, "uuid": uuid.uuidString.lowercased()]))
    }
  }

  func endCall(
    uuidString: String?,
    callId: String?,
    reason: String?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let uuid = resolveUUID(uuidString: uuidString, callId: callId)
    guard let uuid else {
      completion(.success(["ok": false]))
      return
    }
    // Remote hangup must not go through CXEndCallAction. That path looks like a
    // local decline and can re-enter JS. reportCall(.remoteEnded) is the CallKit
    // API for "the other side hung up" and is what actually clears a lock-screen
    // in-call UI when the web session is already gone.
    if reason == "remote" {
      EdgeLiveKitCallManager.shared.hangup(leaveOnServer: false)
      provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
      calls.removeValue(forKey: uuid)
      answeredUUIDs.remove(uuid)
      mediaConnected = false
      pendingCallReveal = false
      if calls.isEmpty { endCallBackgroundTask() }
      EdgeAudioSession.apply(mode: "default") { _ in }
      completion(.success(["ok": true]))
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
    answeredUUIDs.removeAll()
    mediaConnected = false
    pendingCallReveal = false
    EdgeLiveKitCallManager.shared.hangup(leaveOnServer: false)
    endCallBackgroundTask()
  }

  /// Outgoing in-app IPA calls also go through CallKit so `didActivate` fires.
  func reportOutgoingCall(callId: String, roomId: String, handle: String, hasVideo: Bool) {
    let trimmedCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmedCallId.isEmpty,
       let existing = calls.first(where: { $0.value.callId == trimmedCallId })?.key {
      answeredUUIDs.insert(existing)
      return
    }
    let uuid = UUID()
    let callerName = Self.sanitizedCallerName(handle)
    calls[uuid] = CallMeta(
      callId: trimmedCallId,
      roomId: roomId,
      hasVideo: hasVideo,
      callerName: callerName
    )
    answeredUUIDs.insert(uuid)
    beginCallBackgroundTask()
    let start = CXStartCallAction(call: uuid, handle: CXHandle(type: .generic, value: callerName))
    start.isVideo = hasVideo
    callController.request(CXTransaction(action: start)) { [weak self] error in
      guard let self, error == nil else { return }
      self.provider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
    }
  }

  func markOutgoingConnected(callId: String) {
    let trimmed = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let uuid = calls.first(where: { $0.value.callId == trimmed })?.key else { return }
    provider.reportOutgoingCall(with: uuid, connectedAt: Date())
    mediaConnected = true
  }

  func requestAnswerIfNeeded(callId: String) {
    let trimmed = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let uuid = calls.first(where: { $0.value.callId == trimmed })?.key else { return }
    if answeredUUIDs.contains(uuid) { return }
    callController.request(CXTransaction(action: CXAnswerCallAction(call: uuid))) { _ in }
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
    answeredUUIDs.removeAll()
    mediaConnected = false
    pendingCallReveal = false
    EdgeLiveKitCallManager.shared.hangup(leaveOnServer: false)
    endCallBackgroundTask()
  }

  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    answeredUUIDs.insert(action.callUUID)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    beginCallBackgroundTask()
    mediaConnected = false
    answeredUUIDs.insert(action.callUUID)
    if let meta = calls[action.callUUID] {
      let detail: [String: Any] = [
        "uuid": action.callUUID.uuidString.lowercased(),
        "callId": meta.callId,
        "roomId": meta.roomId,
        "hasVideo": meta.hasVideo,
        "nativeMedia": true,
      ]
      // Native room starts now. Web only needs this event for chrome.
      Task {
        do {
          _ = try await EdgeLiveKitCallManager.shared.answerIncoming(
            callId: meta.callId,
            roomId: meta.roomId,
            hasVideo: meta.hasVideo
          )
        } catch {
          self.dispatchToWeb(
            event: "edge-native-call-state",
            detail: [
              "callId": meta.callId,
              "connected": false,
              "error": error.localizedDescription,
            ]
          )
        }
      }
      dispatchToWeb(event: "edge-callkit-answer", detail: detail)
      EdgePushManager.shared.removeDeliveredCallInviteNotifications(callId: meta.callId)
      // Locked / background answer: we cannot unlock the phone. Remember to
      // open the in-app live call screen the moment Edge becomes active.
      if UIApplication.shared.applicationState != .active {
        pendingCallReveal = true
      }
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
      EdgePushManager.shared.removeDeliveredCallInviteNotifications(callId: meta.callId)
      EdgeLiveKitCallManager.shared.hangup(leaveOnServer: true)
    }
    calls.removeValue(forKey: action.callUUID)
    answeredUUIDs.remove(action.callUUID)
    mediaConnected = false
    pendingCallReveal = false
    EdgeAudioSession.apply(mode: "default") { _ in }
    endCallBackgroundTask()
    action.fulfill()
  }

  func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    action.fail()
  }

  /// CallKit owns activation. Native LiveKit publishes the mic here ... that is
  /// the lock-screen two-way call. Do not point this at WKWebView capture.
  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    let hasVideo = calls.values.contains { $0.hasVideo }
    EdgeAudioSession.apply(mode: hasVideo ? "voiceChat" : "voiceChatEarpiece") { _ in }
    EdgeLiveKitCallManager.shared.handleAudioActivated()
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    EdgeLiveKitCallManager.shared.handleAudioDeactivated()
    guard calls.isEmpty else { return }
    EdgeAudioSession.apply(mode: "default") { _ in }
  }

  // MARK: - Helpers

  private func resolveUUID(uuidString: String?, callId: String?) -> UUID? {
    if let uuidString, let uuid = Self.uuid(from: uuidString) {
      return uuid
    }
    let trimmedCallId = callId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !trimmedCallId.isEmpty {
      // Named a specific call, so never fall through to an arbitrary one: hanging up
      // call B must not tear down call A. `endAllCalls()` is the blanket teardown.
      return calls.first(where: { $0.value.callId == trimmedCallId })?.key
    }
    return calls.keys.first
  }

  /// VoIP `callerName` is currently the full APNs body ("Theo Mac is calling you"),
  /// not the actor name. CallKit uses that as `localizedCallerName`, so the banner
  /// never "changes" after answer … the sentence *is* the name. Strip the phrase.
  static func sanitizedCallerName(_ raw: String) -> String {
    var name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    let suffixes = [" is calling you", " is calling"]
    for suffix in suffixes {
      if let range = name.range(of: suffix, options: [.anchored, .backwards, .caseInsensitive]) {
        name = String(name[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        break
      }
    }
    return name.isEmpty ? "Incoming call" : name
  }

  private static func uuid(from raw: String?) -> UUID? {
    guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
      return nil
    }
    return UUID(uuidString: raw)
  }

  private func dispatchToWeb(event: String, detail: [String: Any]) {
    guard webReady, webView != nil else {
      if pendingWebEvents.count >= Self.maxPendingWebEvents {
        pendingWebEvents.removeFirst()
      }
      pendingWebEvents.append((event: event, detail: detail))
      return
    }
    evaluateWebEvent(event: event, detail: detail)
  }

  private func evaluateWebEvent(event: String, detail: [String: Any]) {
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
