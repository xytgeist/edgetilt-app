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
    var remoteHasVideo: Bool = false
    var micOn: Bool = true
    var camOn: Bool = false
    var speakerOn: Bool = false
    var remoteCount: Int = 0
    var error: String = ""
    var callPayload: [String: Any]? = nil
    /// LiveKit roster for web chrome (group voice grid + speaking halo).
    var participants: [[String: Any]] = []

    func dictionary() -> [String: Any] {
      var dict: [String: Any] = [
        "callId": callId,
        "roomId": roomId,
        "connected": connected,
        "hasVideo": hasVideo,
        "remoteHasVideo": remoteHasVideo,
        "micOn": micOn,
        "camOn": camOn,
        "speakerOn": speakerOn,
        "remoteCount": remoteCount,
        "error": error,
        "participants": participants,
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
  private var isLocalMainStream = false
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

  private lazy var overlayTapGesture = UITapGestureRecognizer(target: self, action: #selector(handleOverlayTapped))
  private lazy var overlayPanGesture = UIPanGestureRecognizer(target: self, action: #selector(handleOverlayPanned(_:)))
  private var overlayMiniFrame: CGRect?
  private let outgoingRingback = EdgeOutgoingRingback()
  private var waitingForRemoteAnswer = false
  private var speakingIdentities = Set<String>()
  private var videoTiles: [String: EdgeCallParticipantTile] = [:]
  private var displayNameByIdentity: [String: String] = [:]
  private var avatarURLByIdentity: [String: String] = [:]
  private var avatarImageByIdentity: [String: UIImage] = [:]

  private override init() {
    super.init()
    room.add(delegate: self)
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
    // CallKit does not play PSTN ringback for generic CXHandle. Play ours until
    // the first remote joins. Start before start_call so the caller hears a tone
    // during the network wait... restart after connect when the session settles.
    beginOutgoingRingback()
    do {
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
      if waitingForRemoteAnswer, room.remoteParticipants.isEmpty {
        outgoingRingback.start()
      } else {
        stopOutgoingRingback()
      }
      return (next, started)
    } catch {
      stopOutgoingRingback()
      throw error
    }
  }

  func hangup(leaveOnServer: Bool) {
    stopOutgoingRingback()
    speakingIdentities.removeAll()
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
        self.displayNameByIdentity.removeAll()
        self.avatarURLByIdentity.removeAll()
        self.avatarImageByIdentity.removeAll()
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
      do {
        try await room.localParticipant.setMicrophone(enabled: !muted)
      } catch {
        NSLog("EdgeLiveKit setMicrophone failed: \(error.localizedDescription)")
      }
      await MainActor.run { self.dispatchState() }
    }
  }

  func setCamera(enabled: Bool?, flip: Bool) {
    if let enabled {
      wantsCamera = enabled
      state.camOn = enabled
      state.hasVideo = enabled || (firstRemoteVideoTrack() != nil)
    }
    if flip {
      cameraPosition = cameraPosition == .front ? .back : .front
      wantsCamera = true
      state.camOn = true
      state.hasVideo = true
    }
    Task {
      if wantsCamera {
        if flip, let cameraTrack = (room.localParticipant.firstCameraPublication?.track as? LocalVideoTrack),
           let capturer = cameraTrack.capturer as? CameraCapturer {
          do {
            _ = try await capturer.switchCameraPosition()
          } catch {
            await publishCameraIfNeeded()
          }
        } else {
          await publishCameraIfNeeded()
        }
      } else {
        try? await room.localParticipant.setCamera(enabled: false)
        await MainActor.run {
          self.refreshVideoFlags()
          self.syncVideoTiles()
          self.updateOverlayVisibility()
        }
      }
      await MainActor.run { self.dispatchState() }
    }
  }

  func setStreamFocus(isLocalMain: Bool) {
    self.isLocalMainStream = isLocalMain
    DispatchQueue.main.async {
      UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseInOut]) {
        self.layoutVideoViews()
      }
    }
    dispatchState()
  }

  func setSpeaker(_ speaker: Bool) {
    state.speakerOn = speaker
    EdgeAudioSession.setOutputRoute(speaker: speaker) { _ in }
    dispatchState()
  }

  func setChrome(minimized: Bool?, videoVisible: Bool?, participantAvatars: [[String: Any]]? = nil) {
    if let minimized { chromeMinimized = minimized }
    if let videoVisible { self.videoVisible = videoVisible }
    if let rows = participantAvatars {
      applyParticipantAvatars(rows)
    }
    updateOverlayVisibility()
    syncVideoTilesOnMain()
  }

  /// CallKit `didActivate` is the lock-screen win: publish the mic against the
  /// already-active session instead of waiting for WKWebView getUserMedia.
  func handleAudioActivated() {
    do {
      try AudioManager.shared.setEngineAvailability(.default)
    } catch {
      // Still try to publish; LiveKit may already be running.
    }
    if waitingForRemoteAnswer {
      outgoingRingback.start()
    }
    Task {
      if state.micOn {
        try? await room.localParticipant.setMicrophone(enabled: true)
      }
      await publishCameraIfNeeded()
      if waitingForRemoteAnswer {
        await MainActor.run { self.outgoingRingback.start() }
      }
    }
  }

  func handleAudioDeactivated() {
    outgoingRingback.stop()
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
    refreshRoster()
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
      bindExistingTracks()
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
      overlay.addGestureRecognizer(overlayTapGesture)
      overlay.addGestureRecognizer(overlayPanGesture)
    }
  }

  private func layoutVideoViews() {
    let people = orderedParticipants()
    let bounds = overlay.bounds
    for (id, tile) in videoTiles where !people.contains(where: { $0.id == id }) {
      tile.isHidden = true
    }
    guard !people.isEmpty else { return }

    if chromeMinimized {
      layoutMinimizedTiles(people, bounds: bounds)
      return
    }
    if people.count <= 2 {
      layoutDuoTiles(people, bounds: bounds)
      return
    }
    layoutGridTiles(people, bounds: bounds)
  }

  private func layoutDuoTiles(_ people: [(id: String, isLocal: Bool)], bounds: CGRect) {
    let localId = people.first(where: { $0.isLocal })?.id
    let remoteId = people.first(where: { !$0.isLocal })?.id
    let mainId: String
    if people.count == 1 {
      mainId = people[0].id
    } else if isLocalMainStream, let localId {
      mainId = localId
    } else {
      mainId = remoteId ?? people[0].id
    }
    let pipWidth = min(128, max(96, bounds.width * 0.28))
    let pipHeight = pipWidth * 16 / 9
    let pipFrame = CGRect(
      x: bounds.width - pipWidth - 16,
      y: bounds.height - pipHeight - 148,
      width: pipWidth,
      height: pipHeight
    )
    for person in people {
      guard let tile = videoTiles[person.id] else { continue }
      tile.isHidden = false
      if person.id == mainId {
        tile.frame = bounds
        tile.applyChrome(cornerRadius: 0, pip: false)
      } else {
        tile.frame = pipFrame
        tile.applyChrome(cornerRadius: 14, pip: true)
        overlay.bringSubviewToFront(tile)
      }
    }
  }

  private func layoutMinimizedTiles(_ people: [(id: String, isLocal: Bool)], bounds: CGRect) {
    if people.count <= 2 {
      layoutDuoTiles(people, bounds: bounds)
      if let localId = people.first(where: { $0.isLocal })?.id, people.count > 1 {
        videoTiles[localId]?.frame = CGRect(
          x: bounds.width - 32 - 6,
          y: bounds.height - 46 - 6,
          width: 32,
          height: 46
        )
        videoTiles[localId]?.applyChrome(cornerRadius: 6, pip: true)
        if let tile = videoTiles[localId] {
          overlay.bringSubviewToFront(tile)
        }
      }
      return
    }
    layoutGridTiles(people, bounds: bounds, compact: true)
  }

  private func layoutGridTiles(
    _ people: [(id: String, isLocal: Bool)],
    bounds: CGRect,
    compact: Bool = false
  ) {
    let cols = people.count <= 4 ? 2 : 3
    let rows = Int(ceil(Double(people.count) / Double(cols)))
    let gap: CGFloat = compact ? 3 : 8
    let inset = compact
      ? UIEdgeInsets(top: 4, left: 4, bottom: 4, right: 4)
      : UIEdgeInsets(
          top: bounds.safeAreaInsetsAwareTop + 56,
          left: 12,
          bottom: 148,
          right: 12
        )
    let area = bounds.inset(by: inset)
    let cellW = max(48, (area.width - gap * CGFloat(cols - 1)) / CGFloat(cols))
    let cellH = max(64, (area.height - gap * CGFloat(rows - 1)) / CGFloat(rows))
    for (index, person) in people.enumerated() {
      guard let tile = videoTiles[person.id] else { continue }
      let col = index % cols
      let row = index / cols
      tile.isHidden = false
      tile.frame = CGRect(
        x: area.minX + CGFloat(col) * (cellW + gap),
        y: area.minY + CGFloat(row) * (cellH + gap),
        width: cellW,
        height: cellH
      )
      tile.applyChrome(cornerRadius: 16, pip: false)
    }
  }

  private func updateOverlayVisibility() {
    installOverlayIfNeeded()
    guard let webView, let parent = webView.superview else { return }

    // Chrome `videoVisible` is the video-call stage. Show tiles even when every
    // camera is off so avatars still fill the grid.
    let isVideoCall = state.connected && videoVisible
    if !isVideoCall {
      overlay.isHidden = true
      restoreWebViewBackground()
      return
    }

    if chromeMinimized {
      // Show as floating mini video in front of web view (WhatsApp style)
      restoreWebViewBackground()
      parent.bringSubviewToFront(overlay)
      overlay.isHidden = false
      overlay.isUserInteractionEnabled = true
      overlay.layer.cornerRadius = 16
      overlay.layer.masksToBounds = true
      overlay.layer.borderColor = UIColor.white.withAlphaComponent(0.25).cgColor
      overlay.layer.borderWidth = 1.5
      overlay.layer.shadowColor = UIColor.black.cgColor
      overlay.layer.shadowOpacity = 0.6
      overlay.layer.shadowRadius = 14
      overlay.layer.shadowOffset = CGSize(width: 0, height: 8)

      let width: CGFloat = 112
      let height: CGFloat = 160
      let bottomInset = parent.safeAreaInsets.bottom + 68 // comfortably above tab bar
      let defaultFrame = CGRect(
        x: 16,
        y: parent.bounds.height - height - bottomInset,
        width: width,
        height: height
      )
      overlay.frame = overlayMiniFrame ?? defaultFrame
      layoutVideoViews()
    } else {
      // Fullscreen video behind transparent web view hole
      parent.insertSubview(overlay, belowSubview: webView)
      overlay.frame = parent.bounds
      overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      overlay.layer.cornerRadius = 0
      overlay.layer.borderWidth = 0
      overlay.layer.shadowOpacity = 0
      overlay.isUserInteractionEnabled = false
      overlay.isHidden = false
      applyWebViewHole()
      layoutVideoViews()
    }
  }

  @objc private func handleOverlayTapped() {
    guard chromeMinimized else { return }
    EdgeCallKitManager.shared.dispatchNativeCallEvent(
      event: "edge-native-call-expand",
      detail: ["callId": state.callId]
    )
  }

  @objc private func handleOverlayPanned(_ gesture: UIPanGestureRecognizer) {
    guard chromeMinimized, let parent = overlay.superview else { return }
    let translation = gesture.translation(in: parent)
    var center = overlay.center
    center.x += translation.x
    center.y += translation.y

    let halfWidth = overlay.bounds.width / 2
    let halfHeight = overlay.bounds.height / 2
    let topMin = parent.safeAreaInsets.top + halfHeight + 8
    let bottomMax = parent.bounds.height - parent.safeAreaInsets.bottom - halfHeight - 56
    let leftMin = halfWidth + 12
    let rightMax = parent.bounds.width - halfWidth - 12

    center.x = min(rightMax, max(leftMin, center.x))
    center.y = min(bottomMax, max(topMin, center.y))
    overlay.center = center
    gesture.setTranslation(.zero, in: parent)

    if gesture.state == .ended || gesture.state == .cancelled {
      let snapLeft = center.x < parent.bounds.width / 2
      let targetX = snapLeft ? leftMin : rightMax
      UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut]) {
        self.overlay.center.x = targetX
      } completion: { _ in
        self.overlayMiniFrame = self.overlay.frame
      }
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
    for tile in videoTiles.values {
      tile.videoView.track = nil
      tile.removeFromSuperview()
    }
    videoTiles.removeAll()
  }

  private func bindExistingTracks() {
    refreshVideoFlags()
    syncVideoTiles()
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
    refreshRoster()
    if waitingForRemoteAnswer {
      stopOutgoingRingback()
    }
    syncVideoTilesOnMain()
    dispatchState()
  }

  func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
    refreshRoster()
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.refreshVideoFlags()
      self.syncVideoTiles()
      self.updateOverlayVisibility()
      self.dispatchState()
    }
  }

  func room(_ room: Room, didUpdateSpeakingParticipants participants: [Participant]) {
    speakingIdentities = Set(
      participants.compactMap { participant in
        let id = identityString(participant)
        guard !id.isEmpty, participant.isSpeaking else { return nil }
        return id
      }
    )
    refreshRoster()
    syncVideoTilesOnMain()
    dispatchState()
  }

  func room(_ room: Room, participant: LocalParticipant, didPublishTrack publication: LocalTrackPublication) {
    guard publication.track is VideoTrack else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.state.camOn = true
      self.state.hasVideo = true
      self.syncVideoTiles()
      self.updateOverlayVisibility()
      self.dispatchState()
    }
  }

  func room(_ room: Room, participant: LocalParticipant, didUnpublishTrack publication: LocalTrackPublication) {
    guard publication.kind == .video else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.state.camOn = false
      self.refreshVideoFlags()
      self.syncVideoTiles()
      self.updateOverlayVisibility()
      self.dispatchState()
    }
  }

  func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
    guard publication.track is VideoTrack else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.state.remoteHasVideo = true
      self.state.hasVideo = true
      self.state.speakerOn = true
      EdgeAudioSession.setOutputRoute(speaker: true) { _ in }
      self.syncVideoTiles()
      self.updateOverlayVisibility()
      self.dispatchState()
    }
  }

  func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
    guard publication.kind == .video else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.refreshVideoFlags()
      self.syncVideoTiles()
      self.updateOverlayVisibility()
      self.dispatchState()
    }
  }

  // MARK: - Web events

  private func dispatchState() {
    let detail = state.dictionary()
    EdgeCallKitManager.shared.dispatchNativeCallState(detail)
  }

  private func identityString(_ participant: Participant) -> String {
    participant.identity?.stringValue.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }

  private func refreshRoster() {
    state.remoteCount = room.remoteParticipants.count
    var rows: [[String: Any]] = []
    func append(_ participant: Participant, isLocal: Bool) {
      let id = identityString(participant)
      if id.isEmpty { return }
      rows.append([
        "identity": id,
        "name": participant.name ?? "",
        "isLocal": isLocal,
        "isSpeaking": participant.isSpeaking || speakingIdentities.contains(id),
        "hasVideo": cameraTrack(for: participant) != nil,
      ])
    }
    append(room.localParticipant, isLocal: true)
    for remote in room.remoteParticipants.values {
      append(remote, isLocal: false)
    }
    state.participants = rows
  }

  private func orderedParticipants() -> [(id: String, isLocal: Bool)] {
    var rows: [(id: String, isLocal: Bool)] = []
    let localId = identityString(room.localParticipant)
    if !localId.isEmpty {
      rows.append((localId, true))
    }
    for remote in room.remoteParticipants.values {
      let id = identityString(remote)
      if !id.isEmpty {
        rows.append((id, false))
      }
    }
    return rows
  }

  private func cameraTrack(for participant: Participant) -> VideoTrack? {
    guard let publication = participant.firstCameraPublication else { return nil }
    if publication.isMuted { return nil }
    return publication.track as? VideoTrack
  }

  private func refreshVideoFlags() {
    let localTrack = cameraTrack(for: room.localParticipant)
    state.camOn = localTrack != nil
    state.remoteHasVideo = room.remoteParticipants.values.contains { cameraTrack(for: $0) != nil }
    state.hasVideo = state.camOn || state.remoteHasVideo
  }

  private func syncVideoTilesOnMain() {
    if Thread.isMainThread {
      syncVideoTiles()
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.syncVideoTiles()
      }
    }
  }

  private func syncVideoTiles() {
    let people = orderedParticipants()
    let liveIds = Set(people.map(\.id))
    for (id, tile) in videoTiles where !liveIds.contains(id) {
      tile.videoView.track = nil
      tile.removeFromSuperview()
      videoTiles.removeValue(forKey: id)
    }
    for person in people {
      let tile: EdgeCallParticipantTile
      if let existing = videoTiles[person.id] {
        tile = existing
      } else {
        tile = EdgeCallParticipantTile(identity: person.id)
        overlay.addSubview(tile)
        videoTiles[person.id] = tile
      }
      let participant: Participant?
      if person.isLocal {
        participant = room.localParticipant
      } else {
        participant = room.remoteParticipants.values.first { identityString($0) == person.id }
      }
      guard let participant else { continue }
      let liveName = person.isLocal ? "You" : (participant.name ?? "")
      let name = displayNameByIdentity[person.id] ?? (liveName.isEmpty ? String(person.id.prefix(8)) : liveName)
      if displayNameByIdentity[person.id] == nil, !liveName.isEmpty {
        displayNameByIdentity[person.id] = liveName
      }
      let track = cameraTrack(for: participant)
      tile.apply(
        track: track,
        name: name,
        avatar: avatarImageByIdentity[person.id],
        speaking: speakingIdentities.contains(person.id),
        showName: people.count > 2 || track == nil
      )
    }
    refreshVideoFlags()
    layoutVideoViews()
  }

  private func applyParticipantAvatars(_ rows: [[String: Any]]) {
    for row in rows {
      let id = (row["identity"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if id.isEmpty { continue }
      if let name = row["name"] as? String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
          displayNameByIdentity[id] = trimmed
        }
      }
      if let url = row["avatarUrl"] as? String {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { continue }
        if avatarURLByIdentity[id] != trimmed {
          avatarURLByIdentity[id] = trimmed
          avatarImageByIdentity.removeValue(forKey: id)
          loadAvatar(identity: id, urlString: trimmed)
        }
      }
    }
  }

  private func loadAvatar(identity: String, urlString: String) {
    guard let url = URL(string: urlString) else { return }
    URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let data, let image = UIImage(data: data) else { return }
      DispatchQueue.main.async {
        guard let self else { return }
        self.avatarImageByIdentity[identity] = image
        self.syncVideoTiles()
      }
    }.resume()
  }

  private func beginOutgoingRingback() {
    waitingForRemoteAnswer = true
    outgoingRingback.start()
  }

  private func stopOutgoingRingback() {
    waitingForRemoteAnswer = false
    outgoingRingback.stop()
  }
}

/// Dual-tone ringback for the IPA caller. CallKit reports `connectedAt` as soon
/// as the local LiveKit room is up (needed for `didActivate` / mic), so the OS
/// never plays PSTN-style ringback. This tone runs until the first remote joins.
private final class EdgeOutgoingRingback {
  private var player: AVAudioPlayer?
  private var timer: Timer?
  private var playing = false
  private static let toneData: Data = EdgeOutgoingRingback.makeToneWav(durationSeconds: 2.0)

  func start() {
    let run: () -> Void = { [weak self] in
      guard let self else { return }
      self.stopLocked()
      self.playing = true
      self.playBurst()
    }
    if Thread.isMainThread {
      run()
    } else {
      DispatchQueue.main.async { run() }
    }
  }

  func stop() {
    let run: () -> Void = { [weak self] in
      guard let self else { return }
      self.stopLocked()
    }
    if Thread.isMainThread {
      run()
    } else {
      DispatchQueue.main.async { run() }
    }
  }

  private func stopLocked() {
    playing = false
    timer?.invalidate()
    timer = nil
    player?.stop()
    player = nil
  }

  private func playBurst() {
    guard playing else { return }
    do {
      let next = try AVAudioPlayer(data: Self.toneData)
      next.volume = 0.45
      next.prepareToPlay()
      next.play()
      player = next
    } catch {
      NSLog("EdgeOutgoingRingback play failed: \(error.localizedDescription)")
    }
    timer = Timer.scheduledTimer(withTimeInterval: 6.0, repeats: false) { [weak self] _ in
      self?.playBurst()
    }
  }

  private static func makeToneWav(durationSeconds: Double) -> Data {
    let sampleRate = 44100
    let count = max(1, Int(durationSeconds * Double(sampleRate)))
    var samples = [Int16](repeating: 0, count: count)
    let twoPi = 2.0 * Double.pi
    for i in 0..<count {
      let t = Double(i) / Double(sampleRate)
      let fadeIn = min(1.0, Double(i) / 3500.0)
      let fadeOut = min(1.0, Double(count - i) / 5300.0)
      let fade = min(fadeIn, fadeOut)
      let mix = sin(twoPi * 440.0 * t) + sin(twoPi * 480.0 * t)
      let amp = 0.22 * fade * mix
      let clipped = max(-1.0, min(1.0, amp))
      samples[i] = Int16(clipped * Double(Int16.max))
    }
    var data = Data()
    func appendASCII(_ value: String) {
      data.append(contentsOf: value.utf8)
    }
    func appendU32(_ value: UInt32) {
      var le = value.littleEndian
      Swift.withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
    }
    func appendU16(_ value: UInt16) {
      var le = value.littleEndian
      Swift.withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
    }
    let dataSize = UInt32(count * 2)
    appendASCII("RIFF")
    appendU32(36 + dataSize)
    appendASCII("WAVE")
    appendASCII("fmt ")
    appendU32(16)
    appendU16(1)
    appendU16(1)
    appendU32(UInt32(sampleRate))
    appendU32(UInt32(sampleRate * 2))
    appendU16(2)
    appendU16(16)
    appendASCII("data")
    appendU32(dataSize)
    samples.withUnsafeBytes { data.append(contentsOf: $0) }
    return data
  }
}

/// One person on the native video overlay: LiveKit camera or avatar/initials.
private final class EdgeCallParticipantTile: UIView {
  let identity: String
  let videoView: VideoView = {
    let view = VideoView()
    view.contentMode = .scaleAspectFill
    view.isUserInteractionEnabled = false
    return view
  }()

  private let avatarCircle = UIView()
  private let avatarImageView = UIImageView()
  private let initialLabel = UILabel()
  private let nameLabel = UILabel()

  init(identity: String) {
    self.identity = identity
    super.init(frame: .zero)
    clipsToBounds = true
    backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.12, alpha: 1)
    isUserInteractionEnabled = false
    addSubview(videoView)
    avatarCircle.backgroundColor = UIColor(white: 0.2, alpha: 0.95)
    avatarCircle.clipsToBounds = true
    addSubview(avatarCircle)
    avatarImageView.contentMode = .scaleAspectFill
    avatarImageView.clipsToBounds = true
    avatarCircle.addSubview(avatarImageView)
    initialLabel.textAlignment = .center
    initialLabel.textColor = .white
    initialLabel.font = .systemFont(ofSize: 28, weight: .bold)
    avatarCircle.addSubview(initialLabel)
    nameLabel.textColor = UIColor.white.withAlphaComponent(0.92)
    nameLabel.font = .systemFont(ofSize: 12, weight: .semibold)
    nameLabel.textAlignment = .center
    nameLabel.lineBreakMode = .byTruncatingTail
    addSubview(nameLabel)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func applyChrome(cornerRadius: CGFloat, pip: Bool) {
    layer.cornerRadius = cornerRadius
    layer.masksToBounds = true
    nameLabel.font = .systemFont(ofSize: pip ? 0 : 12, weight: .semibold)
  }

  func apply(track: VideoTrack?, name: String, avatar: UIImage?, speaking: Bool, showName: Bool) {
    videoView.track = track
    let hasTrack = track != nil
    videoView.isHidden = !hasTrack
    avatarCircle.isHidden = hasTrack
    nameLabel.text = name
    nameLabel.isHidden = !showName || name.isEmpty
    if let avatar {
      avatarImageView.image = avatar
      avatarImageView.isHidden = false
      initialLabel.isHidden = true
    } else {
      avatarImageView.image = nil
      avatarImageView.isHidden = true
      initialLabel.isHidden = false
      let initial = name.trimmingCharacters(in: .whitespacesAndNewlines)
      initialLabel.text = initial.isEmpty ? "?" : String(initial.prefix(1)).uppercased()
    }
    layer.borderWidth = speaking ? 3 : (hasTrack ? 0 : 1)
    layer.borderColor = speaking
      ? UIColor.systemGreen.cgColor
      : UIColor.white.withAlphaComponent(0.12).cgColor
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    videoView.frame = bounds
    let avatarSize = min(bounds.width, bounds.height) * (bounds.height < 80 ? 0.55 : 0.42)
    avatarCircle.bounds = CGRect(x: 0, y: 0, width: avatarSize, height: avatarSize)
    let nameOffset: CGFloat = nameLabel.isHidden ? 0 : 8
    avatarCircle.center = CGPoint(x: bounds.midX, y: bounds.midY - nameOffset)
    avatarCircle.layer.cornerRadius = avatarSize / 2
    avatarImageView.frame = avatarCircle.bounds
    avatarImageView.layer.cornerRadius = avatarSize / 2
    initialLabel.frame = avatarCircle.bounds
    initialLabel.font = .systemFont(ofSize: max(14, avatarSize * 0.38), weight: .bold)
    nameLabel.frame = CGRect(x: 8, y: bounds.height - 22, width: max(0, bounds.width - 16), height: 16)
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
