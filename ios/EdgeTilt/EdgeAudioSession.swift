import AVFoundation
import Foundation

/// AVAudioSession modes for LiveKit / Lounge media. Contract: `docs/ios-native-bridge.md` `setAudioSession`.
enum EdgeAudioSession {
  static func apply(mode: String) throws {
    let session = AVAudioSession.sharedInstance()
    switch mode {
    case "playback":
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
    case "voiceChat":
      try session.setCategory(
        .playAndRecord,
        mode: .voiceChat,
        options: [.allowBluetoothHFP, .defaultToSpeaker]
      )
      try session.setActive(true)
    case "default":
      try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
      try session.setActive(false, options: [.notifyOthersOnDeactivation])
    default:
      throw EdgeAudioSessionError.unknownMode(mode)
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
