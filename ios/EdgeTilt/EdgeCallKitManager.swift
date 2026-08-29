import AVFoundation
import CallKit
import CryptoKit
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
    let avatarUrl: String?
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
  /// CallKit actually accepted `reportNewIncomingCall`. Dedupe only against these.
  /// A JS report that is still in-flight (or already failed) must not block VoIP.
  private var acceptedIncomingUUIDs: Set<UUID> = []
  /// True from the start of a PushKit callback until that wake's CallKit report
  /// finishes. A VoIP wake can look `.active` long enough for JS to steal the
  /// report. Completing PushKit without `reportNewIncomingCall` is how iOS
  /// then delays or drops later VoIP.
  private var voipPushInFlight = false
  /// Answer happened while the phone was locked / backgrounded. Stay true until
  /// we have actually become active and told web to open chat + chrome.
  private var pendingCallReveal = false
  private var didRevealCallThisAnswer = false
  private var unlockObserversInstalled = false
  private var lastSceneActivationAt: Date?
  private var unlockPollTimer: Timer?

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
    if let stored = UserDefaults.standard.string(forKey: "edge.voip.deviceToken"), !stored.isEmpty {
      voipTokenHex = stored
    }
  }

  /// Create the VoIP registry first. iOS delivers a terminated-state wake only
  /// after this exists. Safe to call more than once.
  func startPushRegistryIfNeeded() {
    if pushRegistry != nil { return }
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    pushRegistry = registry
    NSLog("EdgeCallKit PushKit registry started")
  }

  func configure() {
    startPushRegistryIfNeeded()
    EdgeLiveKitCallManager.shared.configure()
    installUnlockObservers()
  }

  /// Unlock often does **not** activate the app (home screen / CallKit UI stays).
  /// `protectedDataDidBecomeAvailable` is the unlock signal even while we stay
  /// backgrounded. Then we request the scene so Edge actually comes forward.
  private func installUnlockObservers() {
    if unlockObserversInstalled { return }
    unlockObserversInstalled = true
    let center = NotificationCenter.default
    center.addObserver(
      forName: UIApplication.protectedDataDidBecomeAvailableNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleDeviceUnlocked()
    }
    center.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleDidBecomeActive()
    }
    center.addObserver(
      forName: UIScene.didActivateNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleDidBecomeActive()
    }
    center.addObserver(
      forName: UIApplication.willEnterForegroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleDidBecomeActive()
    }
    // protectedData often stays available after the first unlock of the boot,
    // so it does not fire on later unlocks. SpringBoard lockstate does.
    // Darwin notify has no payload here ... we try on every lock/unlock flip.
    // Activate is ignored while the device stays locked.
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let manager = Unmanaged<EdgeCallKitManager>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
          manager.handleDeviceUnlocked()
        }
      },
      "com.apple.springboard.lockstate" as CFString,
      nil,
      .deliverImmediately
    )
  }

  func attach(webView: WKWebView) {
    self.webView = webView
  }

  /// CallKit / in-call chrome owns the screen. Drop any WKWebView keyboard.
  func dismissWebKeyboard() {
    let resign = {
      self.webView?.endEditing(true)
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder),
        to: nil,
        from: nil,
        for: nil
      )
    }
    if Thread.isMainThread {
      resign()
    } else {
      DispatchQueue.main.async(execute: resign)
    }
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
    // Page just became ready after a lock-screen answer. Replay may have been
    // empty if becomeActive never ran (Edge stayed in the background).
    if pendingCallReveal || (hasTrackedCalls && !answeredUUIDs.isEmpty && !didRevealCallThisAnswer) {
      pendingCallReveal = true
      revealInAppCallIfNeeded(force: true)
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
    revealInAppCallIfNeeded(force: false)
  }

  /// Device unlocked while we may still be backgrounded. Ask iOS to show Edge.
  func handleDeviceUnlocked() {
    guard !answeredUUIDs.isEmpty else { return }
    pendingCallReveal = true
    activateCallScene()
    startUnlockPoll()
    if UIApplication.shared.applicationState == .active {
      revealInAppCallIfNeeded(force: false)
    }
  }

  /// iOS will not let us unlock the phone. After unlock we request our scene,
  /// then tell web to open the chat room + full call chrome.
  func revealInAppCallIfNeeded(force: Bool) {
    guard pendingCallReveal || force else { return }
    if !force, UIApplication.shared.applicationState != .active {
      activateCallScene()
      return
    }
    let snapshot = revealSnapshot()
    guard !snapshot.callId.isEmpty else { return }
    let isActive = UIApplication.shared.applicationState == .active
    // Mount chrome in the background if the page just became ready, but do
    // **not** clear pendingReveal ... that is what unlock uses to bring Edge forward.
    if isActive {
      pendingCallReveal = false
      didRevealCallThisAnswer = true
      stopUnlockPoll()
    } else {
      pendingCallReveal = true
      startUnlockPoll()
    }
    dismissWebKeyboard()
    dispatchToWeb(
      event: "edge-native-call-reveal",
      detail: [
        "callId": snapshot.callId,
        "roomId": snapshot.roomId,
        "hasVideo": snapshot.hasVideo,
        "openRoom": true,
      ]
    )
  }

  func updateTrackedCall(callId: String, roomId: String, hasVideo: Bool?) {
    let trimmed = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let uuid = calls.first(where: { $0.value.callId == trimmed })?.key,
          let old = calls[uuid]
    else { return }
    let nextRoom = roomId.trimmingCharacters(in: .whitespacesAndNewlines)
    let resolvedRoom = nextRoom.isEmpty ? old.roomId : nextRoom
    calls[uuid] = CallMeta(
      callId: old.callId,
      roomId: resolvedRoom,
      hasVideo: hasVideo ?? old.hasVideo,
      callerName: old.callerName,
      avatarUrl: old.avatarUrl
    )
    let roomFilled = old.roomId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !resolvedRoom.isEmpty
    if roomFilled, pendingCallReveal || didRevealCallThisAnswer {
      pendingCallReveal = true
      didRevealCallThisAnswer = false
      if UIApplication.shared.applicationState == .active {
        revealInAppCallIfNeeded(force: true)
      } else {
        activateCallScene()
      }
    }
  }

  private func revealSnapshot() -> (callId: String, roomId: String, hasVideo: Bool) {
    let native = EdgeLiveKitCallManager.shared.currentState()
    let meta = calls.values.first
    let callId = ((native["callId"] as? String) ?? meta?.callId ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let roomId = ((native["roomId"] as? String) ?? meta?.roomId ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let hasVideo = (native["hasVideo"] as? Bool) ?? meta?.hasVideo ?? false
    return (callId, roomId, hasVideo)
  }

  /// Bring the existing WKWebView scene forward after a lock-screen / background answer.
  /// `protectedDataDidBecomeAvailable` often does **not** fire after the first unlock
  /// of the boot (data stays available while locked), so we also poll this until
  /// we actually become `.active`.
  private func activateCallScene() {
    if let last = lastSceneActivationAt, Date().timeIntervalSince(last) < 0.7 {
      return
    }
    lastSceneActivationAt = Date()
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let scene = scenes.first(where: { $0.activationState != .unattached }) ?? scenes.first {
      let options = UIScene.ActivationRequestOptions()
      options.requestingScene = scene
      UIApplication.shared.requestSceneSessionActivation(
        scene.session,
        userActivity: nil,
        options: options,
        errorHandler: nil
      )
      scene.windows.first(where: \.isKeyWindow)?.makeKeyAndVisible()
    } else {
      // Cold VoIP launch: no scene yet. Ask iOS to create the one WindowGroup.
      UIApplication.shared.requestSceneSessionActivation(
        nil,
        userActivity: nil,
        options: nil,
        errorHandler: nil
      )
    }
    if let url = URL(string: "edgetilt://call") {
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
  }

  private func startUnlockPoll() {
    if unlockPollTimer != nil { return }
    unlockPollTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
      guard let self else { return }
      guard self.pendingCallReveal, !self.answeredUUIDs.isEmpty else {
        self.stopUnlockPoll()
        return
      }
      if UIApplication.shared.applicationState == .active {
        self.stopUnlockPoll()
        self.revealInAppCallIfNeeded(force: false)
        return
      }
      self.activateCallScene()
    }
    if let timer = unlockPollTimer {
      RunLoop.main.add(timer, forMode: .common)
    }
  }

  private func stopUnlockPoll() {
    unlockPollTimer?.invalidate()
    unlockPollTimer = nil
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

  /// Surface an incoming CallKit call.
  /// `fromPushKit` is the only legal reporter when the app is not `.active`.
  func reportIncomingCall(
    uuidString: String?,
    callId: String,
    roomId: String,
    handle: String,
    hasVideo: Bool,
    avatarUrl: String? = nil,
    fromPushKit: Bool = false,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let trimmedCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    let appState = UIApplication.shared.applicationState
    // Backgrounded WKWebView still gets Realtime. JS then calls this, iOS
    // rejects reportNewIncomingCall outside a VoIP callback, and our callId
    // dedupe made the real PushKit report a no-op. Force-quit still worked
    // (no JS). Backgrounded received nothing.
    // A VoIP wake can also look `.active` for a beat. Do not let JS report
    // during that window ... PushKit must be the one that calls
    // reportNewIncomingCall, or iOS treats the wake as a violation.
    if !fromPushKit {
      if voipPushInFlight {
        NSLog("EdgeCallKit skip JS/APNs: voip in flight callId=\(trimmedCallId) state=\(Self.applicationStateLabel(appState))")
        EdgeCallKitCallerAvatar.prefetchToCache(avatarUrl: avatarUrl)
        completion(.success(["ok": true, "skipped": "voip-in-flight"]))
        return
      }
      if appState != .active {
        NSLog("EdgeCallKit skip JS/APNs: not active (\(Self.applicationStateLabel(appState))) callId=\(trimmedCallId)")
        EdgeCallKitCallerAvatar.prefetchToCache(avatarUrl: avatarUrl)
        completion(.success(["ok": true, "skipped": "background"]))
        return
      }
    }
    // One invite reaches us up to three ways: web Realtime (`ChatCallProvider`), the
    // foreground APNs alert banner (`willPresent`), and the PushKit VoIP ring.
    // Dedupe only after CallKit accepted the first report. PushKit must still
    // call reportNewIncomingCall on this wake if nothing was accepted yet.
    if !trimmedCallId.isEmpty,
       let existing = calls.first(where: { $0.value.callId == trimmedCallId })?.key {
      if acceptedIncomingUUIDs.contains(existing) {
        if fromPushKit {
          // Same invite, already on CallKit. Still must call
          // reportNewIncomingCall in this wake or iOS starts dropping VoIP.
          NSLog("EdgeCallKit PushKit: re-report accepted callId=\(trimmedCallId) uuid=\(existing.uuidString)")
          let replay = CXCallUpdate()
          if let meta = calls[existing] {
            replay.remoteHandle = CXHandle(type: .generic, value: meta.callerName)
            replay.localizedCallerName = meta.callerName
            replay.hasVideo = meta.hasVideo
            replay.supportsDTMF = false
            replay.supportsHolding = false
            replay.supportsGrouping = false
            replay.supportsUngrouping = false
            // Avatar setter is parked. Anything before this report can
            // blacklist the install if it throws.
          }
          provider.reportNewIncomingCall(with: existing, update: replay) { error in
            if let error {
              NSLog("EdgeCallKit PushKit re-report: \(error.localizedDescription)")
            }
            EdgePushManager.shared.removeDeliveredCallInviteNotifications(callId: trimmedCallId)
            completion(.success(["ok": true, "uuid": existing.uuidString.lowercased(), "deduped": true]))
          }
          return
        }
        NSLog("EdgeCallKit dedupe accepted callId=\(trimmedCallId) uuid=\(existing.uuidString)")
        EdgePushManager.shared.removeDeliveredCallInviteNotifications(callId: trimmedCallId)
        // Do not reportCall(updated:) here. That tore the live pill down.
        EdgeCallKitCallerAvatar.prefetchToCache(avatarUrl: avatarUrl)
        completion(.success(["ok": true, "uuid": existing.uuidString.lowercased(), "deduped": true]))
        return
      }
      if fromPushKit {
        // JS/APNs inserted a row that CallKit never accepted. Completing this
        // wake without a report is how iOS delays the next VoIP. Drop the
        // leftover and report for real.
        NSLog("EdgeCallKit PushKit: dropping unaccepted leftover \(existing.uuidString) for \(trimmedCallId)")
        provider.reportCall(with: existing, endedAt: Date(), reason: .failed)
        calls.removeValue(forKey: existing)
        acceptedIncomingUUIDs.remove(existing)
      }
    }
    let uuid = Self.uuid(from: uuidString) ?? UUID()
    let callerName = Self.sanitizedCallerName(handle)
    let resolvedAvatar = EdgeCallKitCallerAvatar.httpsURL(avatarUrl)?.absoluteString
    let meta = CallMeta(
      callId: trimmedCallId,
      roomId: roomId,
      hasVideo: hasVideo,
      callerName: callerName,
      avatarUrl: resolvedAvatar
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
    // Safe avatar attachment via Objective-C @try/@catch wrapper.
    // If a cached local JPEG exists on disk, it applies it to localizedCallerImageURL.
    // If not (or if iOS rejects the selector), it catches cleanly and proceeds with name/handle.
    EdgeCallKitCallerAvatar.applyToCallUpdate(update, avatarUrl: resolvedAvatar)

    NSLog("EdgeCallKit reportNewIncomingCall uuid=\(uuid.uuidString) callId=\(trimmedCallId) fromPushKit=\(fromPushKit) state=\(Self.applicationStateLabel(appState))")
    provider.reportNewIncomingCall(with: uuid, update: update) { error in
      if let error {
        NSLog("EdgeCallKit reportNewIncomingCall failed: \(error.localizedDescription) uuid=\(uuid.uuidString) callId=\(trimmedCallId) fromPushKit=\(fromPushKit)")
        self.calls.removeValue(forKey: uuid)
        self.acceptedIncomingUUIDs.remove(uuid)
        completion(.failure(error))
        return
      }
      NSLog("EdgeCallKit reportNewIncomingCall accepted uuid=\(uuid.uuidString) callId=\(trimmedCallId) fromPushKit=\(fromPushKit)")
      self.acceptedIncomingUUIDs.insert(uuid)
      EdgeCallKitCallerAvatar.prefetchToCache(avatarUrl: resolvedAvatar)
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
      if !calls.isEmpty {
        endAllCalls()
      }
      completion(.success(["ok": true]))
      return
    }
    // Remote hangup must not go through CXEndCallAction. That path looks like a
    // local decline and can re-enter JS. reportCall(.remoteEnded / .unanswered) is the CallKit
    // API for "the other side hung up" and is what actually clears a lock-screen
    // in-call UI when the web session is already gone.
    if reason == "remote" {
      EdgeLiveKitCallManager.shared.hangup(leaveOnServer: false)
      let wasAnswered = answeredUUIDs.contains(uuid)
      calls.removeValue(forKey: uuid)
      answeredUUIDs.remove(uuid)
      acceptedIncomingUUIDs.remove(uuid)
      mediaConnected = false
      pendingCallReveal = false
      didRevealCallThisAnswer = false
      stopUnlockPoll()
      provider.reportCall(with: uuid, endedAt: Date(), reason: wasAnswered ? .remoteEnded : .unanswered)
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
    for (uuid, _) in calls {
      let wasAnswered = answeredUUIDs.contains(uuid)
      provider.reportCall(with: uuid, endedAt: Date(), reason: wasAnswered ? .remoteEnded : .unanswered)
    }
    calls.removeAll()
    answeredUUIDs.removeAll()
    acceptedIncomingUUIDs.removeAll()
    voipPushInFlight = false
    mediaConnected = false
    pendingCallReveal = false
    didRevealCallThisAnswer = false
    stopUnlockPoll()
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
      callerName: callerName,
      avatarUrl: nil
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

    let avatarUrl = (userInfo["avatarUrl"] as? String)
      ?? (userInfo["avatar_url"] as? String)
    reportIncomingCall(
      uuidString: nil,
      callId: callId,
      roomId: roomId,
      handle: callerName,
      hasVideo: false,
      avatarUrl: avatarUrl
    ) { _ in }
  }

  // MARK: - PKPushRegistryDelegate

  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let hex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    voipTokenHex = hex
    UserDefaults.standard.set(hex, forKey: "edge.voip.deviceToken")
    NSLog("EdgeCallKit PushKit token updated len=\(hex.count)")
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
    voipPushInFlight = true
    let userInfo = payload.dictionaryPayload
    let keys = userInfo.keys.map { String(describing: $0) }.sorted().joined(separator: ",")
    let callId = Self.payloadString(userInfo, keys: ["chatCallId", "chat_call_id", "callId"])
    let roomId = Self.payloadString(userInfo, keys: ["roomId", "room_id", "room"])
    let callerName = Self.payloadString(userInfo, keys: ["callerName", "caller_name"])
    let avatarUrl = Self.payloadString(userInfo, keys: ["avatarUrl", "avatar_url"])
    let hasVideo = (userInfo["hasVideo"] as? Bool) ?? false
    let eventType = Self.payloadString(userInfo, keys: ["eventType", "event_type", "event"])
    let state = Self.applicationStateLabel(UIApplication.shared.applicationState)
    NSLog("EdgeCallKit PushKit received type=\(eventType.isEmpty ? "invite" : eventType) callId=\(callId.isEmpty ? "<empty>" : callId) roomId=\(roomId) caller=\(callerName) hasVideo=\(hasVideo) avatar=\(avatarUrl.isEmpty ? "<none>" : "yes") state=\(state) keys=\(keys)")

    // iOS 13+ strict policy: Every PushKit VoIP wake MUST report a new incoming call
    // to CXProvider immediately, or iOS will crash the app and blacklist VoIP pushes.
    // Cancellations and missed calls arrive via standard APNs background/alert notifications.
    reportIncomingCall(
      uuidString: nil,
      callId: callId,
      roomId: roomId,
      handle: callerName.isEmpty ? "Incoming call" : callerName,
      hasVideo: hasVideo,
      avatarUrl: avatarUrl.isEmpty ? nil : avatarUrl,
      fromPushKit: true
    ) { result in
      switch result {
      case .success(let payload):
        NSLog("EdgeCallKit PushKit report finished ok payload=\(payload)")
      case .failure(let error):
        NSLog("EdgeCallKit PushKit report failed: \(error.localizedDescription)")
      }
      self.voipPushInFlight = false
      completion()
    }
  }

  // MARK: - CXProviderDelegate

  func providerDidReset(_ provider: CXProvider) {
    calls.removeAll()
    answeredUUIDs.removeAll()
    acceptedIncomingUUIDs.removeAll()
    voipPushInFlight = false
    mediaConnected = false
    pendingCallReveal = false
    didRevealCallThisAnswer = false
    stopUnlockPoll()
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
    dismissWebKeyboard()
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
          action.fulfill()
        } catch {
          self.dispatchToWeb(
            event: "edge-native-call-state",
            detail: [
              "callId": meta.callId,
              "connected": false,
              "error": error.localizedDescription,
            ]
          )
          // If answering failed (e.g. caller canceled / call expired / 409),
          // fail the CXAnswerCallAction and tear down CallKit immediately.
          action.fail()
          self.endCall(uuidString: action.callUUID.uuidString, callId: meta.callId, reason: "remote") { _ in }
        }
      }
      dispatchToWeb(event: "edge-callkit-answer", detail: detail)
      EdgePushManager.shared.removeDeliveredCallInviteNotifications(callId: meta.callId)
      // Locked / background answer: we cannot unlock the phone. Remember to
      // open the in-app live call screen the moment Edge becomes active.
      if UIApplication.shared.applicationState != .active {
        pendingCallReveal = true
        activateCallScene()
        startUnlockPoll()
      }
    } else {
      action.fail()
    }
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
    acceptedIncomingUUIDs.remove(action.callUUID)
    mediaConnected = false
    pendingCallReveal = false
    didRevealCallThisAnswer = false
    stopUnlockPoll()
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
    if let uuidString, let uuid = Self.uuid(from: uuidString), calls.keys.contains(uuid) {
      return uuid
    }
    let trimmedCallId = callId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !trimmedCallId.isEmpty {
      if let matched = calls.first(where: { $0.value.callId.caseInsensitiveCompare(trimmedCallId) == .orderedSame })?.key {
        return matched
      }
      if let uuidMatch = Self.uuid(from: trimmedCallId), calls.keys.contains(uuidMatch) {
        return uuidMatch
      }
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

  private static func applicationStateLabel(_ state: UIApplication.State) -> String {
    switch state {
    case .active: return "active"
    case .inactive: return "inactive"
    case .background: return "background"
    @unknown default: return "unknown"
    }
  }

  private static func payloadString(_ userInfo: [AnyHashable: Any], keys: [String]) -> String {
    for key in keys {
      if let value = userInfo[key] as? String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
      }
    }
    return ""
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

@_silgen_name("EdgeCallKitApplyCallerImageURL")
private func EdgeCallKitApplyCallerImageURL(_ update: CXCallUpdate, _ url: NSURL) -> Bool

/// Lives in this file so Xcode cannot drop it from the target. CallKit has no
/// public photo field. The Island circle reads `localizedCallerImageURL`.
/// Set it on the **first** `reportNewIncomingCall` only. Never
/// `reportCall(updated:)` to fill a live incoming.
enum EdgeCallKitCallerAvatar {
  private static let cacheFolderName = "edge-callkit-avatars"
  private static let maxBytes = 512 * 1024
  private static let fetchTimeout: TimeInterval = 8

  /// Safely apply cached local JPEG to CallKit incoming update via Objective-C helper.
  static func applyToCallUpdate(_ update: CXCallUpdate, avatarUrl: String?) {
    guard let source = httpsURL(avatarUrl),
          let data = localJPEGData(for: source),
          let file = writeShareableJPEG(data)
    else { return }
    if EdgeCallKitApplyCallerImageURL(update, file as NSURL) {
      NSLog("EdgeCallKit avatar first-report file://")
    } else {
      NSLog("EdgeCallKit avatar apply failed, reporting without photo")
    }
  }

  /// Warm disk for the **next** ring. Do not hook this to a CallKit update.
  static func prefetchToCache(avatarUrl: String?) {
    guard let url = httpsURL(avatarUrl) else { return }
    let key = url.absoluteString
    if cachedData(for: key) != nil { return }
    fetch(url: url) { data in
      guard let data else { return }
      store(data, for: key)
      NSLog("EdgeCallKit avatar cached")
    }
  }

  static func httpsURL(_ raw: String?) -> URL? {
    let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !trimmed.isEmpty, trimmed.count <= 2048,
          let url = URL(string: trimmed),
          url.scheme?.lowercased() == "https"
    else { return nil }
    return url
  }

  private static func localJPEGData(for url: URL) -> Data? {
    if let data = cachedData(for: url.absoluteString) { return data }
    let request = URLRequest(url: url)
    if let cached = URLCache.shared.cachedResponse(for: request)?.data,
       !cached.isEmpty,
       cached.count <= maxBytes {
      return jpegAvatarData(from: cached) ?? cached
    }
    return nil
  }

  private static func writeShareableJPEG(_ data: Data) -> URL? {
    let jpeg = jpegAvatarData(from: data) ?? data
    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent("edge-callkit-avatar-\(UUID().uuidString).jpg")
    do {
      try jpeg.write(to: file, options: .atomic)
      return file
    } catch {
      return nil
    }
  }

  private static func jpegAvatarData(from data: Data) -> Data? {
    guard let image = UIImage(data: data) else { return nil }
    let maxSide: CGFloat = 256
    let longest = max(image.size.width, image.size.height)
    let scaled: UIImage
    if longest > maxSide, longest > 0 {
      let scale = maxSide / longest
      let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      let renderer = UIGraphicsImageRenderer(size: size)
      scaled = renderer.image { _ in
        image.draw(in: CGRect(origin: .zero, size: size))
      }
    } else {
      scaled = image
    }
    return scaled.jpegData(compressionQuality: 0.82)
  }

  private static func cacheDirectory() -> URL? {
    guard let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
      return nil
    }
    let dir = root.appendingPathComponent(cacheFolderName, isDirectory: true)
    if !FileManager.default.fileExists(atPath: dir.path) {
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    return dir
  }

  private static func cacheFile(for avatarUrl: String) -> URL? {
    let digest = SHA256.hash(data: Data(avatarUrl.utf8))
    let name = digest.map { String(format: "%02x", $0) }.joined()
    return cacheDirectory()?.appendingPathComponent("\(name).jpg")
  }

  private static func cachedData(for avatarUrl: String) -> Data? {
    guard let file = cacheFile(for: avatarUrl),
          let data = try? Data(contentsOf: file),
          !data.isEmpty,
          data.count <= maxBytes
    else { return nil }
    return data
  }

  private static func store(_ data: Data, for avatarUrl: String) {
    guard data.count <= maxBytes, let file = cacheFile(for: avatarUrl) else { return }
    try? data.write(to: file, options: .atomic)
  }

  private static func fetch(url: URL, completion: @escaping (Data?) -> Void) {
    var request = URLRequest(url: url)
    request.timeoutInterval = fetchTimeout
    request.cachePolicy = .returnCacheDataElseLoad
    URLSession.shared.dataTask(with: request) { data, response, _ in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard (200...299).contains(status), let data, !data.isEmpty, data.count <= maxBytes else {
        DispatchQueue.main.async { completion(nil) }
        return
      }
      let prepared = jpegAvatarData(from: data) ?? data
      DispatchQueue.main.async { completion(prepared) }
    }.resume()
  }
}
