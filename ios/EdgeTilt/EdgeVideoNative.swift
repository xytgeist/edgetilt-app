import AVFoundation
import PhotosUI
import UIKit
import UniformTypeIdentifiers
import WebKit

/// IPA video pick, trim/crop export, and upload. Contract: `docs/ios-native-bridge.md`.
/// The web crop modal stays the UI. This file only replaces ffmpeg.wasm + the JS tus body on the IPA.

private enum EdgeVideoLimits {
  /// Omitted payload fields keep the pre-cap IPA behavior so a cached web bundle cannot jump ahead.
  static let legacySourceBytes: Int64 = 1_500_000_000
  static let legacyUploadBytes: Int64 = 200 * 1024 * 1024
  static let legacyClipSeconds: Double = 60.35
  static let legacyStreamMaxDurationSeconds = 75
  /// Hard ceiling. Matches Edge Pro (20 minutes, 8 GB). JS cannot ask for more.
  static let absoluteMaxSourceBytes: Int64 = 8 * 1024 * 1024 * 1024
  static let absoluteMaxUploadBytes: Int64 = 8 * 1024 * 1024 * 1024
  static let absoluteMaxClipSeconds: Double = 1200.35
  static let absoluteStreamMaxDurationSeconds = 1215
  /// Cloudflare rejects a single tus PATCH above 200 MB. Larger files go out in 100 MB pieces.
  static let cfSingleRequestMaxBytes: Int64 = 200 * 1024 * 1024
  static let cfChunkBytes: Int64 = 100 * 1024 * 1024
  static let cfMinChunkBytes: Int64 = 5_242_880
  static let cfChunkUnit: Int64 = 262_144

  static func positiveInt64(_ raw: Any?) -> Int64? {
    if let n = raw as? Int64, n > 0 { return n }
    if let n = raw as? Int, n > 0 { return Int64(n) }
    if let n = raw as? NSNumber, n.int64Value > 0 { return n.int64Value }
    if let n = raw as? Double, n > 0, n <= Double(Int64.max) { return Int64(n) }
    if let s = raw as? String, let n = Int64(s), n > 0 { return n }
    return nil
  }

  static func resolvedSourceBytes(_ payload: [String: Any]?) -> Int64 {
    min(positiveInt64(payload?["maxSourceBytes"]) ?? legacySourceBytes, absoluteMaxSourceBytes)
  }

  static func resolvedUploadBytes(_ payload: [String: Any]?) -> Int64 {
    min(positiveInt64(payload?["maxUploadBytes"]) ?? legacyUploadBytes, absoluteMaxUploadBytes)
  }

  static func resolvedClipSeconds(_ payload: [String: Any]?) -> Double {
    let raw = payload?["maxClipSeconds"]
    let parsed: Double? = {
      if let n = raw as? Double, n > 0 { return n }
      if let n = raw as? NSNumber, n.doubleValue > 0 { return n.doubleValue }
      if let s = raw as? String, let n = Double(s), n > 0 { return n }
      return nil
    }()
    return min(parsed ?? legacyClipSeconds, absoluteMaxClipSeconds)
  }

  static func resolvedStreamDuration(_ payload: [String: Any]?) -> Int {
    let raw = positiveInt64(payload?["streamMaxDurationSeconds"]) ?? Int64(legacyStreamMaxDurationSeconds)
    return Int(min(raw, Int64(absoluteStreamMaxDurationSeconds)))
  }

  static func durationLabel(_ seconds: Double) -> String {
    let whole = Int(seconds.rounded(.down))
    let minutes = whole / 60
    let remain = whole % 60
    if whole > 0 && whole < 120 && remain == 0 { return "\(whole) seconds" }
    if remain == 0 { return minutes == 1 ? "1 minute" : "\(minutes) minutes" }
    return String(format: "%d:%02d", minutes, remain)
  }

  /// Non-final chunks stay ≥ 5 MB and a multiple of 256 KiB. The last chunk can be shorter.
  static func nextChunkLength(offset: Int64, total: Int64) -> Int64 {
    let left = total - offset
    if offset == 0 && left <= cfSingleRequestMaxBytes { return left }
    if left <= cfChunkBytes { return left }
    var take = cfChunkBytes
    let after = left - take
    if after > 0 && after < cfMinChunkBytes {
      take = ((left - cfMinChunkBytes) / cfChunkUnit) * cfChunkUnit
      if take < cfMinChunkBytes { take = cfMinChunkBytes }
    }
    return min(take, left)
  }
}

enum EdgeVideoEvents {
  static weak var webView: WKWebView?

  static func post(phase: String, progress: Double, assetId: String) {
    guard let webView else { return }
    let clamped = min(1, max(0, progress))
    let js = """
    (function(){
      window.dispatchEvent(new CustomEvent('edge-native-video-progress', { detail: {
        phase: \(jsString(phase)),
        progress: \(clamped),
        assetId: \(jsString(assetId))
      }}));
    })();
    """
    DispatchQueue.main.async {
      webView.evaluateJavaScript(js, completionHandler: nil)
    }
  }

  private static func jsString(_ value: String) -> String {
    let escaped = value
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
      .replacingOccurrences(of: "\n", with: "\\n")
    return "\"\(escaped)\""
  }
}

struct EdgeVideoAsset {
  let id: String
  let fileURL: URL
  var byteSize: Int64
  var originalFilename: String = ""
}

final class EdgeVideoStore {
  static let shared = EdgeVideoStore()

  private let lock = NSLock()
  private var assets: [String: EdgeVideoAsset] = [:]
  private let directory: URL

  private init() {
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    directory = caches.appendingPathComponent("edge-videos", isDirectory: true)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  func sweepStaleFiles() {
    let cutoff = Date().addingTimeInterval(-6 * 60 * 60)
    guard let names = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) else {
      return
    }
    for url in names {
      let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
      if date < cutoff {
        try? FileManager.default.removeItem(at: url)
      }
    }
  }

  func insertCopy(of source: URL, preferredExtension: String, originalFilename: String = "", maxSourceBytes: Int64) throws -> EdgeVideoAsset {
    let id = UUID().uuidString.lowercased()
    let ext = preferredExtension.isEmpty ? "mov" : preferredExtension
    let dest = directory.appendingPathComponent("\(id).\(ext)")
    if FileManager.default.fileExists(atPath: dest.path) {
      try FileManager.default.removeItem(at: dest)
    }
    try FileManager.default.copyItem(at: source, to: dest)
    let size = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.int64Value ?? 0
    if size <= 0 {
      try? FileManager.default.removeItem(at: dest)
      throw EdgeVideoError.unreadable
    }
    if size > maxSourceBytes {
      try? FileManager.default.removeItem(at: dest)
      throw EdgeVideoError.tooLarge
    }
    let asset = EdgeVideoAsset(
      id: id,
      fileURL: dest,
      byteSize: size,
      originalFilename: originalFilename
    )
    lock.lock()
    assets[id] = asset
    lock.unlock()
    return asset
  }

  func adoptExportedFile(_ url: URL, byteSize: Int64) throws -> EdgeVideoAsset {
    let id = UUID().uuidString.lowercased()
    let dest = directory.appendingPathComponent("\(id).mp4")
    if FileManager.default.fileExists(atPath: dest.path) {
      try FileManager.default.removeItem(at: dest)
    }
    try FileManager.default.moveItem(at: url, to: dest)
    let asset = EdgeVideoAsset(id: id, fileURL: dest, byteSize: byteSize)
    lock.lock()
    assets[id] = asset
    lock.unlock()
    return asset
  }

  func asset(id: String) -> EdgeVideoAsset? {
    lock.lock()
    defer { lock.unlock() }
    if let known = assets[id] { return known }
    let folder = directory
    let matches = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
    guard let url = matches.first(where: { $0.deletingPathExtension().lastPathComponent == id }) else {
      return nil
    }
    let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
    let recovered = EdgeVideoAsset(id: id, fileURL: url, byteSize: size)
    assets[id] = recovered
    return recovered
  }

  func fileURL(id: String) -> URL? {
    asset(id: id)?.fileURL
  }
}

enum EdgeVideoError: LocalizedError {
  case cancelled
  case unreadable
  case tooLarge
  case tooLong(String)
  case exportFailed(String)
  case uploadFailed(String)
  case notSignedIn

  var errorDescription: String? {
    switch self {
    case .cancelled:
      return "Cancelled."
    case .unreadable:
      return "Could not open that video."
    case .tooLarge:
      return "That video is too large to import. Pick a shorter clip."
    case .tooLong(let message):
      return message
    case .exportFailed(let message):
      return message.isEmpty ? "Could not prepare that video." : message
    case .uploadFailed(let message):
      return message.isEmpty ? "Video upload failed. Try again." : message
    case .notSignedIn:
      return "You must be signed in to post a video."
    }
  }
}

final class EdgeVideoSchemeHandler: NSObject, WKURLSchemeHandler {
  private let lock = NSLock()
  private var stopped = Set<ObjectIdentifier>()

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    let key = ObjectIdentifier(urlSchemeTask)
    guard let url = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(EdgeVideoError.unreadable)
      return
    }
    let accept = (urlSchemeTask.request.value(forHTTPHeaderField: "Accept") ?? "").lowercased()
    if accept.contains("image/") && !accept.contains("video/") {
      urlSchemeTask.didFailWithError(EdgeVideoError.unreadable)
      return
    }
    let assetId = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let fileURL = EdgeVideoStore.shared.fileURL(id: assetId) else {
      urlSchemeTask.didFailWithError(EdgeVideoError.unreadable)
      return
    }
    let fileSize = (try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? NSNumber)?.intValue ?? 0
    guard fileSize > 0 else {
      urlSchemeTask.didFailWithError(EdgeVideoError.unreadable)
      return
    }

    var start = 0
    var end = fileSize - 1
    var status = 200
    if let range = urlSchemeTask.request.value(forHTTPHeaderField: "Range") {
      if let parsed = Self.parseRange(range, total: fileSize) {
        start = parsed.start
        end = parsed.end
        status = 206
      } else {
        let headers = ["Content-Range": "bytes */\(fileSize)"]
        if let response = HTTPURLResponse(url: url, statusCode: 416, httpVersion: "HTTP/1.1", headerFields: headers) {
          urlSchemeTask.didReceive(response)
          urlSchemeTask.didFinish()
        } else {
          urlSchemeTask.didFailWithError(EdgeVideoError.unreadable)
        }
        return
      }
    }

    let length = end - start + 1
    var headers = [
      "Content-Type": Self.mimeType(for: fileURL),
      "Accept-Ranges": "bytes",
      "Content-Length": String(length),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    ]
    if status == 206 {
      headers["Content-Range"] = "bytes \(start)-\(end)/\(fileSize)"
    }
    guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else {
      urlSchemeTask.didFailWithError(EdgeVideoError.unreadable)
      return
    }
    urlSchemeTask.didReceive(response)

    do {
      let handle = try FileHandle(forReadingFrom: fileURL)
      defer { try? handle.close() }
      try handle.seek(toOffset: UInt64(start))
      var remaining = length
      while remaining > 0 {
        if isStopped(key) { return }
        let chunk = min(remaining, 256 * 1024)
        let data = handle.readData(ofLength: chunk)
        if data.isEmpty { break }
        if isStopped(key) { return }
        urlSchemeTask.didReceive(data)
        remaining -= data.count
      }
      if isStopped(key) { return }
      urlSchemeTask.didFinish()
    } catch {
      if isStopped(key) { return }
      urlSchemeTask.didFailWithError(error)
    }
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    lock.lock()
    stopped.insert(ObjectIdentifier(urlSchemeTask))
    lock.unlock()
  }

  private func isStopped(_ key: ObjectIdentifier) -> Bool {
    lock.lock()
    let flag = stopped.contains(key)
    lock.unlock()
    return flag
  }

  private static func mimeType(for url: URL) -> String {
    switch url.pathExtension.lowercased() {
    case "mp4", "m4v":
      return "video/mp4"
    case "mov":
      return "video/quicktime"
    default:
      return "application/octet-stream"
    }
  }

  private static func parseRange(_ header: String, total: Int) -> (start: Int, end: Int)? {
    let raw = header.trimmingCharacters(in: .whitespacesAndNewlines)
    guard raw.lowercased().hasPrefix("bytes=") else { return nil }
    let spec = String(raw.dropFirst(6)).split(separator: ",", maxSplits: 1).first.map(String.init) ?? ""
    let parts = spec.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
    guard parts.count == 2 else { return nil }
    if parts[0].isEmpty {
      guard let suffix = Int(parts[1]), suffix > 0 else { return nil }
      let len = min(suffix, total)
      return (total - len, total - 1)
    }
    guard let start = Int(parts[0]), start >= 0, start < total else { return nil }
    let end = parts[1].isEmpty ? total - 1 : min(Int(parts[1]) ?? (total - 1), total - 1)
    guard end >= start else { return nil }
    return (start, end)
  }
}

enum EdgeVideoPicker {
  static func present(payload: [String: Any]?, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    DispatchQueue.main.async {
      guard let presenter = topViewController() else {
        completion(.success(["ok": false, "error": "No window to present the picker."]))
        return
      }
      var config = PHPickerConfiguration()
      config.filter = .videos
      config.selectionLimit = 1
      config.preferredAssetRepresentationMode = .current
      let session = Session(maxSourceBytes: EdgeVideoLimits.resolvedSourceBytes(payload), completion: completion)
      Session.current = session
      let picker = PHPickerViewController(configuration: config)
      picker.delegate = session
      presenter.present(picker, animated: true)
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }

  private final class Session: NSObject, PHPickerViewControllerDelegate {
    static var current: Session?
    private let maxSourceBytes: Int64
    private let completion: (Result<[String: Any], Error>) -> Void
    private var didFinish = false

    init(maxSourceBytes: Int64, completion: @escaping (Result<[String: Any], Error>) -> Void) {
      self.maxSourceBytes = maxSourceBytes
      self.completion = completion
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      picker.dismiss(animated: true) { [weak self] in
        self?.finish(results: results)
      }
    }

    private func finish(results: [PHPickerResult]) {
      guard let result = results.first else {
        complete(.success(["ok": false, "cancelled": true]))
        return
      }
      let provider = result.itemProvider
      let type = Self.movieType(for: provider)
      provider.loadFileRepresentation(forTypeIdentifier: type) { [weak self] url, error in
        guard let self else { return }
        if let error {
          self.complete(.failure(error))
          return
        }
        guard let url else {
          self.complete(.failure(EdgeVideoError.unreadable))
          return
        }
        do {
          let ext = url.pathExtension.isEmpty ? "mov" : url.pathExtension
          let stored = try EdgeVideoStore.shared.insertCopy(
            of: url,
            preferredExtension: ext,
            originalFilename: url.lastPathComponent,
            maxSourceBytes: self.maxSourceBytes
          )
          Task {
            let probed = await EdgeVideoProbe.probe(url: stored.fileURL)
            var payload: [String: Any] = [
              "ok": true,
              "assetId": stored.id,
              "previewUrl": "edge-video://local/\(stored.id)",
              "byteSize": stored.byteSize,
              "duration": probed.duration,
              "width": probed.width,
              "height": probed.height,
            ]
            if let poster = probed.posterJpegBase64 {
              payload["posterJpegBase64"] = poster
            }
            self.complete(.success(payload))
          }
        } catch {
          self.complete(.failure(error))
        }
      }
    }

    private func complete(_ result: Result<[String: Any], Error>) {
      guard !didFinish else { return }
      didFinish = true
      completion(result)
      Self.current = nil
    }

    private static func movieType(for provider: NSItemProvider) -> String {
      let types = [UTType.movie.identifier, UTType.mpeg4Movie.identifier, UTType.video.identifier]
      return types.first(where: { provider.hasItemConformingToTypeIdentifier($0) }) ?? UTType.movie.identifier
    }
  }
}

private enum EdgeVideoProbe {
  struct Result {
    var duration: Double
    var width: Int
    var height: Int
    var posterJpegBase64: String?
  }

  static func probe(url: URL) async -> Result {
    let asset = AVURLAsset(url: url)
    var duration = 0.0
    var width = 0
    var height = 0
    if let seconds = try? await asset.load(.duration).seconds, seconds.isFinite, seconds > 0 {
      duration = seconds
    }
    if let track = try? await asset.loadTracks(withMediaType: .video).first {
      let natural = (try? await track.load(.naturalSize)) ?? .zero
      let transform = (try? await track.load(.preferredTransform)) ?? .identity
      let display = Self.displaySize(natural: natural, transform: transform)
      width = Int(display.width.rounded())
      height = Int(display.height.rounded())
    }
    var poster: String?
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 960, height: 960)
    let time = CMTime(seconds: min(0.15, max(0, duration)), preferredTimescale: 600)
    if let cg = try? generator.copyCGImage(at: time, actualTime: nil),
       let jpeg = UIImage(cgImage: cg).jpegData(compressionQuality: 0.82) {
      poster = jpeg.base64EncodedString()
    }
    return Result(duration: duration, width: width, height: height, posterJpegBase64: poster)
  }

  static func displaySize(natural: CGSize, transform: CGAffineTransform) -> CGSize {
    let rect = CGRect(origin: .zero, size: natural).applying(transform)
    return CGSize(width: abs(rect.width), height: abs(rect.height))
  }
}

enum EdgeVideoExporter {
  private static var activeSession: AVAssetExportSession?
  private static let sessionLock = NSLock()

  static func cancel() {
    sessionLock.lock()
    let session = activeSession
    sessionLock.unlock()
    session?.cancelExport()
  }

  static func export(payload: [String: Any]?) async throws -> [String: Any] {
    let assetId = string(payload?["assetId"])
    guard let source = EdgeVideoStore.shared.asset(id: assetId) else {
      throw EdgeVideoError.unreadable
    }
    let asset = AVURLAsset(url: source.fileURL)
    let videoTracks = try await asset.loadTracks(withMediaType: .video)
    guard let videoTrack = videoTracks.first else {
      throw EdgeVideoError.unreadable
    }
    let full = try await asset.load(.duration).seconds
    let startSec = min(max(0, double(payload?["startSec"]) ?? 0), max(0, full))
    var endSec = double(payload?["endSec"]) ?? full
    if !endSec.isFinite || endSec <= startSec { endSec = full }
    endSec = min(endSec, full)
    let maxClipSeconds = EdgeVideoLimits.resolvedClipSeconds(payload)
    let maxUploadBytes = EdgeVideoLimits.resolvedUploadBytes(payload)
    if endSec - startSec > maxClipSeconds {
      throw EdgeVideoError.tooLong("Video must be \(EdgeVideoLimits.durationLabel(maxClipSeconds)) or shorter.")
    }
    let clip = CMTimeRange(
      start: CMTime(seconds: startSec, preferredTimescale: 600),
      duration: CMTime(seconds: max(0.1, endSec - startSec), preferredTimescale: 600)
    )
    EdgeVideoEvents.post(phase: "checking", progress: 0.05, assetId: assetId)

    let natural = try await videoTrack.load(.naturalSize)
    let preferred = try await videoTrack.load(.preferredTransform)
    let display = EdgeVideoProbe.displaySize(natural: natural, transform: preferred)
    let crop = cropRect(payload?["cropPx"], display: display, intrinsicWidth: double(payload?["intrinsicWidth"]) ?? Double(display.width), intrinsicHeight: double(payload?["intrinsicHeight"]) ?? Double(display.height))

    if canPassthrough(
      source: source,
      full: full,
      startSec: startSec,
      endSec: endSec,
      crop: crop,
      display: display,
      videoTrackCount: videoTracks.count,
      maxUploadBytes: maxUploadBytes
    ) {
      return [
        "ok": true,
        "passthrough": true,
        "assetId": assetId,
        "sourceAssetId": assetId,
        "byteSize": source.byteSize,
        "previewUrl": "edge-video://local/\(assetId)",
      ]
    }

    let composition = AVMutableComposition()
    guard let compVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw EdgeVideoError.exportFailed("Could not prepare that video.")
    }
    try compVideo.insertTimeRange(clip, of: videoTrack, at: .zero)
    if let audioTrack = try await asset.loadTracks(withMediaType: .audio).first,
       let compAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
      try? compAudio.insertTimeRange(clip, of: audioTrack, at: .zero)
    }

    let videoComposition = AVMutableVideoComposition()
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideo)
    let upright = preferred.concatenating(CGAffineTransform(translationX: -CGRect(origin: .zero, size: natural).applying(preferred).origin.x, y: -CGRect(origin: .zero, size: natural).applying(preferred).origin.y))

    if let crop {
      let yUp = display.height - crop.origin.y - crop.height
      let cropped = upright.concatenating(CGAffineTransform(translationX: -crop.origin.x, y: -yUp))
      layer.setTransform(cropped, at: .zero)
      videoComposition.renderSize = CGSize(width: even(crop.width), height: even(crop.height))
    } else {
      layer.setTransform(upright, at: .zero)
      videoComposition.renderSize = CGSize(width: even(display.width), height: even(display.height))
    }
    instruction.layerInstructions = [layer]
    videoComposition.instructions = [instruction]
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

    let outURL = FileManager.default.temporaryDirectory.appendingPathComponent("edge-export-\(UUID().uuidString.lowercased()).mp4")
    if FileManager.default.fileExists(atPath: outURL.path) {
      try? FileManager.default.removeItem(at: outURL)
    }
    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPreset1920x1080) else {
      throw EdgeVideoError.exportFailed("Could not prepare that video.")
    }
    session.outputURL = outURL
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true
    session.videoComposition = videoComposition
    sessionLock.lock()
    activeSession = session
    sessionLock.unlock()

    let progressTask = Task {
      while !Task.isCancelled {
        let value = Double(session.progress)
        EdgeVideoEvents.post(phase: "encoding", progress: value, assetId: assetId)
        if session.status != .waiting && session.status != .exporting && session.status != .unknown { break }
        try? await Task.sleep(nanoseconds: 200_000_000)
      }
    }
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      session.exportAsynchronously {
        cont.resume()
      }
    }
    progressTask.cancel()
    sessionLock.lock()
    if activeSession === session { activeSession = nil }
    sessionLock.unlock()

    switch session.status {
    case .completed:
      break
    case .cancelled:
      try? FileManager.default.removeItem(at: outURL)
      throw EdgeVideoError.cancelled
    default:
      try? FileManager.default.removeItem(at: outURL)
      throw EdgeVideoError.exportFailed(session.error?.localizedDescription ?? "Could not prepare that video.")
    }

    let size = (try? FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as? NSNumber)?.int64Value ?? 0
    if size <= 0 || size > maxUploadBytes {
      try? FileManager.default.removeItem(at: outURL)
      throw EdgeVideoError.tooLarge
    }
    let stored = try EdgeVideoStore.shared.adoptExportedFile(outURL, byteSize: size)
    EdgeVideoEvents.post(phase: "encoding", progress: 1, assetId: assetId)
    return [
      "ok": true,
      "assetId": stored.id,
      "sourceAssetId": assetId,
      "byteSize": size,
      "previewUrl": "edge-video://local/\(stored.id)",
    ]
  }

  private static let screenRecordingSizes: Set<String> = [
    "1170x2532", "2532x1170",
    "1179x2556", "2556x1179",
    "1284x2778", "2778x1284",
    "1290x2796", "2796x1290",
    "1320x2868", "2868x1320",
    "1080x2340", "2340x1080",
    "1125x2436", "2436x1125",
    "1242x2688", "2688x1242",
  ]

  /// Untouched normal clips upload as picked. Re-encode only for a trim, a crop,
  /// a `.mov` / spatial / screen recording, or a file over the viewer's upload cap.
  private static func canPassthrough(
    source: EdgeVideoAsset,
    full: Double,
    startSec: Double,
    endSec: Double,
    crop: CGRect?,
    display: CGSize,
    videoTrackCount: Int,
    maxUploadBytes: Int64
  ) -> Bool {
    if crop != nil { return false }
    if startSec > 0.25 { return false }
    if full.isFinite, full - endSec > 0.35 { return false }
    if videoTrackCount > 1 { return false }
    if source.byteSize > maxUploadBytes { return false }
    if source.fileURL.pathExtension.lowercased() == "mov" { return false }
    let name = source.originalFilename
    if name.range(of: "screen\\s*record|rpreplay|simulator\\s*screen", options: [.regularExpression, .caseInsensitive]) != nil {
      return false
    }
    let key = "\(Int(display.width.rounded()))x\(Int(display.height.rounded()))"
    if screenRecordingSizes.contains(key) { return false }
    return true
  }

  private static func cropRect(_ raw: Any?, display: CGSize, intrinsicWidth: Double, intrinsicHeight: Double) -> CGRect? {
    guard let dict = raw as? [String: Any] else { return nil }
    let iw = intrinsicWidth > 1 ? intrinsicWidth : Double(display.width)
    let ih = intrinsicHeight > 1 ? intrinsicHeight : Double(display.height)
    guard iw > 1, ih > 1, display.width > 1, display.height > 1 else { return nil }
    let scaleX = display.width / CGFloat(iw)
    let scaleY = display.height / CGFloat(ih)
    let x = CGFloat(double(dict["x"]) ?? 0) * scaleX
    let y = CGFloat(double(dict["y"]) ?? 0) * scaleY
    let w = CGFloat(double(dict["w"]) ?? 0) * scaleX
    let h = CGFloat(double(dict["h"]) ?? 0) * scaleY
    guard w > 2, h > 2 else { return nil }
    let rect = CGRect(x: x, y: y, width: w, height: h).integral
    let bounds = CGRect(origin: .zero, size: display)
    let fitted = rect.intersection(bounds)
    if fitted.width < 2 || fitted.height < 2 { return nil }
    if abs(fitted.minX) < 2 && abs(fitted.minY) < 2 && abs(fitted.width - display.width) < 4 && abs(fitted.height - display.height) < 4 {
      return nil
    }
    return fitted
  }

  private static func even(_ value: CGFloat) -> CGFloat {
    var n = floor(value)
    if n < 2 { n = 2 }
    if Int(n) % 2 != 0 { n -= 1 }
    return n
  }

  private static func double(_ raw: Any?) -> Double? {
    if let n = raw as? Double { return n }
    if let n = raw as? NSNumber { return n.doubleValue }
    if let s = raw as? String { return Double(s) }
    return nil
  }

  private static func string(_ raw: Any?) -> String {
    (raw as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }
}

final class EdgeVideoUploader: NSObject, URLSessionDelegate, URLSessionTaskDelegate, URLSessionDataDelegate {
  static let shared = EdgeVideoUploader()
  static let backgroundSessionIdentifier = "com.edgetilt.edge-video-upload"

  var backgroundEventsCompletion: (() -> Void)?

  func reconnectBackgroundSession() {
    _ = session
  }

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: Self.backgroundSessionIdentifier)
    config.isDiscretionary = false
    config.sessionSendsLaunchEvents = true
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  private final class Waiter {
    var continuation: CheckedContinuation<Void, Error>?
    var assetId = ""
    var byteSize: Int64 = 0
    var sentBefore: Int64 = 0
  }

  private let lock = NSLock()
  private var waiters: [Int: Waiter] = [:]
  private var activeTask: URLSessionUploadTask?

  func cancel() {
    lock.lock()
    let task = activeTask
    lock.unlock()
    task?.cancel()
  }

  func uploadTus(payload: [String: Any]?) async throws -> [String: Any] {
    let assetId = Self.string(payload?["assetId"])
    guard let stored = EdgeVideoStore.shared.asset(id: assetId) else {
      throw EdgeVideoError.unreadable
    }
    let token = Self.string(payload?["accessToken"])
    let supabaseURL = Self.string(payload?["supabaseUrl"]).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let anonKey = Self.string(payload?["anonKey"])
    guard !token.isEmpty, !supabaseURL.isEmpty, !anonKey.isEmpty else {
      throw EdgeVideoError.notSignedIn
    }
    let maxUploadBytes = EdgeVideoLimits.resolvedUploadBytes(payload)
    if stored.byteSize > maxUploadBytes {
      throw EdgeVideoError.tooLarge
    }
    let created = try await createTus(
      fileSize: stored.byteSize,
      token: token,
      supabaseURL: supabaseURL,
      anonKey: anonKey,
      streamMaxDurationSeconds: EdgeVideoLimits.resolvedStreamDuration(payload)
    )
    try await patchFile(stored.fileURL, location: created.location, assetId: assetId, byteSize: stored.byteSize)
    EdgeVideoEvents.post(phase: "upload", progress: 1, assetId: assetId)
    return ["ok": true, "streamVideoUid": created.uid, "assetId": assetId]
  }

  func uploadPut(payload: [String: Any]?) async throws -> [String: Any] {
    let assetId = Self.string(payload?["assetId"])
    guard let stored = EdgeVideoStore.shared.asset(id: assetId) else {
      throw EdgeVideoError.unreadable
    }
    guard let uploadURL = URL(string: Self.string(payload?["uploadURL"])) else {
      throw EdgeVideoError.uploadFailed("Could not start the upload.")
    }
    var request = URLRequest(url: uploadURL)
    request.httpMethod = "PUT"
    request.setValue(Self.string(payload?["contentType"]).isEmpty ? "video/mp4" : Self.string(payload?["contentType"]), forHTTPHeaderField: "Content-Type")
    let cache = Self.string(payload?["cacheControl"])
    if !cache.isEmpty {
      request.setValue(cache, forHTTPHeaderField: "Cache-Control")
    }
    try await send(request: request, fileURL: stored.fileURL, assetId: assetId, byteSize: stored.byteSize)
    EdgeVideoEvents.post(phase: "upload", progress: 1, assetId: assetId)
    return ["ok": true, "assetId": assetId]
  }

  private struct TusCreate {
    var location: URL
    var uid: String
  }

  private func createTus(fileSize: Int64, token: String, supabaseURL: String, anonKey: String, streamMaxDurationSeconds: Int) async throws -> TusCreate {
    guard let url = URL(string: "\(supabaseURL)/functions/v1/lounge-cf-stream-tus-create") else {
      throw EdgeVideoError.uploadFailed("Could not start the upload.")
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
    request.setValue(String(fileSize), forHTTPHeaderField: "Upload-Length")
    request.setValue(Self.tusMetadata(streamMaxDurationSeconds: streamMaxDurationSeconds), forHTTPHeaderField: "Upload-Metadata")
    request.setValue("0", forHTTPHeaderField: "Content-Length")
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw EdgeVideoError.uploadFailed("Could not start the upload.")
    }
    if http.statusCode == 401 || http.statusCode == 403 {
      throw EdgeVideoError.notSignedIn
    }
    guard (200...299).contains(http.statusCode) else {
      throw EdgeVideoError.uploadFailed(Self.message(from: data, status: http.statusCode))
    }
    let uid = (http.value(forHTTPHeaderField: "stream-media-id") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard uid.range(of: "^[0-9a-fA-F]{32}$", options: .regularExpression) != nil else {
      throw EdgeVideoError.uploadFailed("Video upload finished but the service did not return a video id.")
    }
    guard let locationHeader = http.value(forHTTPHeaderField: "Location"),
          let location = URL(string: locationHeader, relativeTo: url)?.absoluteURL else {
      throw EdgeVideoError.uploadFailed("Could not start the upload.")
    }
    return TusCreate(location: location, uid: uid)
  }

  private func patchFile(_ fileURL: URL, location: URL, assetId: String, byteSize: Int64) async throws {
    if byteSize <= EdgeVideoLimits.cfSingleRequestMaxBytes {
      var request = URLRequest(url: location)
      request.httpMethod = "PATCH"
      request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
      request.setValue("0", forHTTPHeaderField: "Upload-Offset")
      request.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
      try await send(request: request, fileURL: fileURL, assetId: assetId, byteSize: byteSize, sentBefore: 0)
      return
    }
    var offset: Int64 = 0
    while offset < byteSize {
      let length = EdgeVideoLimits.nextChunkLength(offset: offset, total: byteSize)
      let slice = try Self.sliceFile(fileURL, offset: offset, length: length)
      defer { try? FileManager.default.removeItem(at: slice) }
      var request = URLRequest(url: location)
      request.httpMethod = "PATCH"
      request.setValue("1.0.0", forHTTPHeaderField: "Tus-Resumable")
      request.setValue(String(offset), forHTTPHeaderField: "Upload-Offset")
      request.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
      try await send(request: request, fileURL: slice, assetId: assetId, byteSize: byteSize, sentBefore: offset)
      offset += length
    }
  }

  private static func sliceFile(_ fileURL: URL, offset: Int64, length: Int64) throws -> URL {
    let dest = FileManager.default.temporaryDirectory.appendingPathComponent("edge-tus-\(UUID().uuidString.lowercased()).part")
    if FileManager.default.fileExists(atPath: dest.path) {
      try? FileManager.default.removeItem(at: dest)
    }
    let input = try FileHandle(forReadingFrom: fileURL)
    defer { try? input.close() }
    try input.seek(toOffset: UInt64(offset))
    FileManager.default.createFile(atPath: dest.path, contents: nil)
    let output = try FileHandle(forWritingTo: dest)
    defer { try? output.close() }
    var remaining = length
    while remaining > 0 {
      let n = Int(min(Int64(1024 * 1024), remaining))
      let data = input.readData(ofLength: n)
      if data.isEmpty { break }
      output.write(data)
      remaining -= Int64(data.count)
    }
    if remaining != 0 {
      try? FileManager.default.removeItem(at: dest)
      throw EdgeVideoError.uploadFailed("Could not read that video.")
    }
    return dest
  }

  private func send(request: URLRequest, fileURL: URL, assetId: String, byteSize: Int64, sentBefore: Int64 = 0) async throws {
    let task = session.uploadTask(with: request, fromFile: fileURL)
    let waiter = Waiter()
    waiter.assetId = assetId
    waiter.byteSize = byteSize
    waiter.sentBefore = sentBefore
    lock.lock()
    waiters[task.taskIdentifier] = waiter
    activeTask = task
    lock.unlock()
    let app = UIApplication.shared
    var backgroundId: UIBackgroundTaskIdentifier = .invalid
    backgroundId = app.beginBackgroundTask(withName: "edge-video-upload") {
      app.endBackgroundTask(backgroundId)
    }
    defer {
      if backgroundId != .invalid {
        app.endBackgroundTask(backgroundId)
      }
    }
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      lock.lock()
      waiter.continuation = continuation
      lock.unlock()
      task.resume()
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
    lock.lock()
    let waiter = waiters[task.taskIdentifier]
    lock.unlock()
    guard let waiter else { return }
    let total = waiter.byteSize > 0 ? waiter.byteSize : totalBytesExpectedToSend
    let sent = waiter.sentBefore + totalBytesSent
    let progress = total > 0 ? Double(sent) / Double(total) : 0
    EdgeVideoEvents.post(phase: "upload", progress: progress, assetId: waiter.assetId)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    lock.lock()
    let waiter = waiters.removeValue(forKey: task.taskIdentifier)
    if activeTask?.taskIdentifier == task.taskIdentifier { activeTask = nil }
    lock.unlock()
    guard let waiter else { return }
    if let error {
      let ns = error as NSError
      if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled {
        waiter.continuation?.resume(throwing: EdgeVideoError.cancelled)
      } else {
        waiter.continuation?.resume(throwing: EdgeVideoError.uploadFailed("Video upload failed. Try again."))
      }
      return
    }
    let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 0 || (200...299).contains(status) {
      waiter.continuation?.resume()
    } else {
      waiter.continuation?.resume(throwing: EdgeVideoError.uploadFailed("Video upload failed (\(status))."))
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      self.backgroundEventsCompletion?()
      self.backgroundEventsCompletion = nil
    }
  }

  private static func message(from data: Data, status: Int) -> String {
    if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let error = obj["error"] as? String {
      let trimmed = error.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty { return trimmed }
    }
    return "Video upload failed (\(status))."
  }

  private static func tusMetadata(streamMaxDurationSeconds: Int) -> String {
    let expiry = ISO8601DateFormatter()
    expiry.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let stamp = expiry.string(from: Date().addingTimeInterval(6 * 60 * 60))
    let pairs = [
      ("name", "video.mp4"),
      ("maxDurationSeconds", String(streamMaxDurationSeconds)),
      ("expiry", stamp),
    ]
    return pairs.map { key, value in
      let b64 = Data(value.utf8).base64EncodedString()
      return "\(key) \(b64)"
    }.joined(separator: ",")
  }

  private static func string(_ raw: Any?) -> String {
    (raw as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }
}
