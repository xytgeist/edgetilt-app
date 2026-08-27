import AVFoundation
import LiveKit
import UIKit
import WebKit

/// Native LiveKit peer for the IPA. WebKit getUserMedia is out of the call path.
/// Contract: `docs/ios-native-bridge.md` Native LiveKit.
final class EdgeLiveKitCallManager: NSObject, RoomDelegate {
  static let shared = EdgeLiveKitCallManager()

  struct State {
    var callId: String = ""
    var roomId: String = ""
    var connected: Bool = false
    var hasVideo: Bool = false
    var micOn: Bool = true
    var camOn: Bool = false
    var speakerOn: Bool = false
    var remoteCount: Int = 0
    var error: String = ""
    var callPayload: [String: Any]? = nil

    func dictionary() -> [String: Any] {
      var dict: [String: Any] = [
        "callId": callId,
        "roomId": roomId,
        "connected": connected,
        "hasVideo": hasVideo,
        "micOn": micOn,
        "camOn": camOn,
        "speakerOn": speakerOn,
        "remoteCount": remoteCount,
        "error": error,
      ]
      if let call = callPayload { dict["call"] = call }
      return dict
    }
  }

  private let room = Room()
  private var state = State()
  private var connectingCallId: String?
  private var connectTask: Task<State, Error>?
  private var wantsCamera = false
  private var cameraPosition: AVCaptureDevice.Position = .front
  private var overlayInstalled = false
  private var chromeMinimized = false
  private var videoVisible = true
  private weak var webView: WKWebView?

  private let overlay: UIView = {
    let view = UIView()
    view.backgroundColor = UIColor(red: 0.04, green: 0.08, blue: 0.10, alpha: 1)
    view.isHidden = true
    view.isUserInteractionEnabled = false
    return view
  }()

  private let remoteVideoView: VideoView = {
    let view = VideoView()
    view.contentMode = .scaleAspectFill
    view.isUserInteractionEnabled = false
    return view
  }()

  private let localVideoView: VideoView = {
    let view = VideoView()
    view.contentMode = .scaleAspectFill
    view.clipsToBounds = true
    view.layer.cornerRadius = 12
    view.isUserInteractionEnabled = false
    return view
  }()

  private override init() {
    super.init()
    room.add(delegate: self)
    overlay.addSubview(remoteVideoView)
    overlay.addSubview(localVideoView)
  }

  /// CallKit owns AVAudioSession. Disable LiveKit's automatic category swaps.
  func configure() {
    AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
    do {
      try AudioManager.shared.setEngineAvailability(.none)
    } catch {
      // Engine stays default until CallKit didActivate.
    }
  }

  func attach(webView: WKWebView) {
    self.webView = webView
    installOverlayIfNeeded()
  }

  func currentState() -> [String: Any] {
    state.dictionary()
  }

  func isConnected(to callId: String) -> Bool {
    let id = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    return !id.isEmpty && state.callId == id && state.connected
  }

  @discardableResult
  func answerIncoming(callId: String, roomId: String, hasVideo: Bool) async throws -> State {
    try await connect(
      callId: callId,
      roomId: roomId,
      hasVideo: hasVideo,
      action: .accept
    )
  }

  @discardableResult
  func startOutgoing(roomId: String, mediaMode: String, title: String) async throws -> (State, EdgeChatCallsClient.InvokeResult) {
    let hasVideo = mediaMode == "video"
    let started = try await EdgeChatCallsClient.startCall(roomId: roomId, mediaMode: mediaMode)
    let callId = started.callId ?? ""
    guard !callId.isEmpty, let token = started.token, let url = started.livekitUrl else {
      throw EdgeChatCallsClient.ClientError.badResponse("start_call did not return a LiveKit token.")
    }
    EdgeCallKitManager.shared.reportOutgoingCall(
      callId: callId,
      roomId: roomId,
      handle: title.isEmpty ? "Edge call" : title,
      hasVideo: hasVideo
    )
    var next = try await connectRoom(callId: callId, roomId: roomId, hasVideo: hasVideo, url: url, token: token)
    next.callPayload = started.call
    await MainActor.run { self.state.callPayload = started.call }
    return (next, started)
  }

  func hangup(leaveOnServer: Bool) {
    let callId = state.callId
    guard !callId.isEmpty || state.connected || connectTask != nil else { return }
    chromeMinimized = false
    videoVisible = true
    wantsCamera = false
    connectingCallId = nil
    connectTask?.cancel()
    connectTask = nil
    Task {
      if leaveOnServer, !callId.isEmpty {
        _ = try? await EdgeChatCallsClient.leaveCall(callId: callId)
      }
      await room.disconnect()
      await MainActor.run {
        self.clearOverlayTracks()
        self.hideOverlay()
        self.restoreWebViewBackground()
        self.state = State()
        self.dispatchState()
      }
    }
  }

  func setMuted(_ muted: Bool) {
    state.micOn = !muted
    Task {
      try? await room.localParticipant.setMicrophone(enabled: !muted)
      await MainActor.run { self.dispatchState() }
    }
  }

  func setCamera(enabled: Bool?, flip: Bool) {
    if let enabled {
      wantsCamera = enabled
      state.camOn = enabled
    }
    if flip {
      cameraPosition = cameraPosition == .front ? .back : .front
      wantsCamera = true
      state.camOn = true
      state.hasVideo = true
    }
    Task {
      await publishCameraIfNeeded()
      await MainActor.run { self.dispatchState() }
    }
  }

  func setSpeaker(_ speaker: Bool) {
    state.speakerOn = speaker
    EdgeAudioSession.setOutputRoute(speaker: speaker) { _ in }
    dispatchState()
  }

  func setChrome(minimized: Bool?, videoVisible: Bool?) {
    if let minimized { chromeMinimized = minimized }
    if let videoVisible { self.videoVisible = videoVisible }
    updateOverlayVisibility()
  }

  /// CallKit `didActivate` is the lock-screen win: publish the mic against the
  /// already-active session instead of waiting for WKWebView getUserMedia.
  func handleAudioActivated() {
    do {
      try AudioManager.shared.setEngineAvailability(.default)
    } catch {
      // Still try to publish; LiveKit may already be running.
    }
    Task {
      if state.micOn {
        try? await room.localParticipant.setMicrophone(enabled: true)
      }
      await publishCameraIfNeeded()
    }
  }

  func handleAudioDeactivated() {
    do {
      try AudioManager.shared.setEngineAvailability(.none)
    } catch {
      /* ignore */
    }
  }

  func handleDidBecomeActive() {
    Task { await publishCameraIfNeeded() }
  }

  // MARK: - Connect

  private enum JoinAction {
    case accept
    case reuse
  }

  private func connect(callId: String, roomId: String, hasVideo: Bool, action: JoinAction) async throws -> State {
    let id = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else {
      throw EdgeChatCallsClient.ClientError.badResponse("Missing call.")
    }
    if isConnected(to: id) {
      return state
    }
    if let connectTask, connectingCallId == id {
      return try await connectTask.value
    }
    let task = Task<State, Error> {
      let joined: EdgeChatCallsClient.InvokeResult
      switch action {
      case .accept:
        joined = try await EdgeChatCallsClient.acceptCall(callId: id)
      case .reuse:
        joined = try await EdgeChatCallsClient.joinCall(callId: id)
      }
      guard let token = joined.token, let url = joined.livekitUrl else {
        throw EdgeChatCallsClient.ClientError.badResponse("chat-calls did not return a LiveKit token.")
      }
      let resolvedRoom = roomId.isEmpty
        ? String((joined.call?["chat_room_id"] as? String) ?? "")
        : roomId
      let video = hasVideo || String((joined.call?["media_mode"] as? String) ?? "") == "video"
      let next = try await connectRoom(callId: id, roomId: resolvedRoom, hasVideo: video, url: url, token: token)
      var withCall = next
      withCall.callPayload = joined.call
      await MainActor.run {
        self.state.callPayload = joined.call
        EdgeCallKitManager.shared.updateTrackedCall(
          callId: id,
          roomId: resolvedRoom,
          hasVideo: video
        )
      }
      return withCall
    }
    connectingCallId = id
    connectTask = task
    defer {
      if connectingCallId == id {
        connectingCallId = nil
        connectTask = nil
      }
    }
    return try await task.value
  }

  private func connectRoom(
    callId: String,
    roomId: String,
    hasVideo: Bool,
    url: String,
    token: String
  ) async throws -> State {
    state.callId = callId
    state.roomId = roomId
    state.hasVideo = hasVideo
    state.speakerOn = hasVideo
    state.micOn = true
    state.camOn = false
    state.error = ""
    wantsCamera = hasVideo
    cameraPosition = .front
    chromeMinimized = false
    videoVisible = true

    try await room.connect(url: url, token: token)
    state.connected = true
    state.remoteCount = room.remoteParticipants.count
    EdgeCallKitManager.shared.markMediaConnectedLocally()
    EdgeCallKitManager.shared.markOutgoingConnected(callId: callId)
    dispatchState()

    if state.micOn {
      try? await room.localParticipant.setMicrophone(enabled: true)
    }
    await publishCameraIfNeeded()
    await MainActor.run {
      self.installOverlayIfNeeded()
      self.updateOverlayVisibility()
      self.bindExistingTracks()
    }
    return state
  }

  @MainActor
  private func publishCameraIfNeeded() async {
    guard wantsCamera, state.connected else { return }
    guard UIApplication.shared.applicationState == .active else { return }
    do {
      try await room.localParticipant.setCamera(
        enabled: true,
        captureOptions: CameraCaptureOptions(position: cameraPosition)
      )
      state.camOn = true
      state.hasVideo = true
      applyWebViewHole()
      updateOverlayVisibility()
    } catch {
      state.error = error.localizedDescription
    }
    dispatchState()
  }

  // MARK: - Overlay

  private func installOverlayIfNeeded() {
    guard let webView, let parent = webView.superview else { return }
    if overlay.superview != parent {
      parent.insertSubview(overlay, belowSubview: webView)
      overlayInstalled = true
    }
    overlay.translatesAutoresizingMaskIntoConstraints = true
    overlay.frame = parent.bounds
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    layoutVideoViews()
  }

  private func layoutVideoViews() {
    let bounds = overlay.bounds
    remoteVideoView.frame = bounds
    let pipWidth = min(128, max(96, bounds.width * 0.28))
    let pipHeight = pipWidth * 16 / 9
    localVideoView.frame = CGRect(
      x: bounds.width - pipWidth - 16,
      y: bounds.safeAreaInsetsAwareTop + 72,
      width: pipWidth,
      height: pipHeight
    )
  }

  private func updateOverlayVisibility() {
    installOverlayIfNeeded()
    let show = state.connected && state.hasVideo && videoVisible && !chromeMinimized
    overlay.isHidden = !show
    if show {
      applyWebViewHole()
      layoutVideoViews()
    } else if !state.connected || chromeMinimized {
      restoreWebViewBackground()
    }
  }

  private func applyWebViewHole() {
    guard let webView else { return }
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
  }

  private func restoreWebViewBackground() {
    guard let webView else { return }
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.backgroundColor = .black
  }

  private func hideOverlay() {
    overlay.isHidden = true
  }

  private func clearOverlayTracks() {
    remoteVideoView.track = nil
    localVideoView.track = nil
  }

  private func bindExistingTracks() {
    if let local = room.localParticipant.firstCameraPublication?.track as? VideoTrack {
      localVideoView.track = local
    }
    if let remote = firstRemoteVideoTrack() {
      remoteVideoView.track = remote
    }
    layoutVideoViews()
  }

  private func firstRemoteVideoTrack() -> VideoTrack? {
    for participant in room.remoteParticipants.values {
      if let track = participant.firstCameraPublication?.track as? VideoTrack {
        return track
      }
    }
    return nil
  }

  // MARK: - RoomDelegate

  func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldValue: ConnectionState) {
    state.connected = connectionState == .connected
    dispatchState()
  }

  func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
    state.remoteCount = room.remoteParticipants.count
    dispatchState()
  }

  func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
    state.remoteCount = room.remoteParticipants.count
    if remoteVideoView.track != nil {
      DispatchQueue.main.async { [weak self] in
        self?.remoteVideoView.track = self?.firstRemoteVideoTrack()
      }
    }
    dispatchState()
  }

  func room(_ room: Room, participant: LocalParticipant, didPublishTrack publication: LocalTrackPublication) {
    guard let track = publication.track as? VideoTrack else { return }
    DispatchQueue.main.async { [weak self] in
      self?.localVideoView.track = track
      self?.updateOverlayVisibility()
    }
  }

  func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
    guard let track = publication.track as? VideoTrack else { return }
    DispatchQueue.main.async { [weak self] in
      self?.remoteVideoView.track = track
      self?.updateOverlayVisibility()
    }
  }

  // MARK: - Web events

  private func dispatchState() {
    let detail = state.dictionary()
    EdgeCallKitManager.shared.dispatchNativeCallState(detail)
  }
}

private extension CGRect {
  var safeAreaInsetsAwareTop: CGFloat {
    let inset = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)?
      .safeAreaInsets.top ?? 54
    return inset
  }
}
