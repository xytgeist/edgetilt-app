import AVFoundation
import Foundation

/// AVAudioSession modes for LiveKit / Lounge media. Contract: `docs/ios-native-bridge.md` `setAudioSession`.
enum EdgeAudioSession {
  static func apply(mode: String, completion: ((Result<Void, Error>) -> Void)? = nil) {
    let session = AVAudioSession.sharedInstance()
    do {
      switch mode {
      case "playback":
        try session.setCategory(.playback, mode: .default, options: [])
        setActive(true, completion: completion)
      case "voiceChat":
        try session.setCategory(
          .playAndRecord,
          mode: .voiceChat,
          options: [.allowBluetoothHFP, .defaultToSpeaker]
        )
        setActive(true, completion: completion)
      case "voiceChatEarpiece":
        try session.setCategory(
          .playAndRecord,
          mode: .voiceChat,
          options: [.allowBluetoothHFP]
        )
        try session.overrideOutputAudioPort(.none)
        setActive(true, completion: completion)
      case "default":
        try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        setActive(false, options: [.notifyOthersOnDeactivation], completion: completion)
      default:
        completion?(.failure(EdgeAudioSessionError.unknownMode(mode)))
      }
    } catch {
      completion?(.failure(error))
    }
  }

  /// Route PlayAndRecord output during an active call.
  static func setOutputRoute(speaker: Bool, completion: ((Result<Void, Error>) -> Void)? = nil) {
    let session = AVAudioSession.sharedInstance()
    let run = {
      do {
        try session.overrideOutputAudioPort(speaker ? .speaker : .none)
        finish(completion, .success(()))
      } catch {
        finish(completion, .failure(error))
      }
    }
    if Thread.isMainThread {
      DispatchQueue.global(qos: .userInitiated).async(execute: run)
    } else {
      run()
    }
  }

  /// `video.muted = false` is actually audible. Skip when a call owns `.playAndRecord`.
  static func ensurePlaybackUnlessVoiceChat() {
    let session = AVAudioSession.sharedInstance()
    if session.category == .playAndRecord { return }
    apply(mode: "playback") { _ in }
  }

  /// `setActive` on the main thread can stall UI (Xcode hang risk). Activate off-main.
  private static func setActive(
    _ active: Bool,
    options: AVAudioSession.SetActiveOptions = [],
    completion: ((Result<Void, Error>) -> Void)?
  ) {
    let session = AVAudioSession.sharedInstance()
    let run = {
      do {
        try session.setActive(active, options: options)
        finish(completion, .success(()))
      } catch {
        finish(completion, .failure(error))
      }
    }
    if Thread.isMainThread {
      DispatchQueue.global(qos: .userInitiated).async(execute: run)
    } else {
      run()
    }
  }

  private static func finish(
    _ completion: ((Result<Void, Error>) -> Void)?,
    _ result: Result<Void, Error>
  ) {
    guard let completion else { return }
    if Thread.isMainThread {
      completion(result)
    } else {
      DispatchQueue.main.async { completion(result) }
    }
  }
}

private enum EdgeAudioSessionError: LocalizedError {
  case unknownMode(String)
  var errorDescription: String? {
    switch self {
    case .unknownMode(let mode):
      return "Unknown audio session mode: \(mode)"
    }
  }
}
