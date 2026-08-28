import CallKit
import CryptoKit
import Foundation
import UIKit

/// CallKit has no public `CXCallUpdate` photo field. The compact incoming
/// pill / Dynamic Island circle reads undocumented `localizedCallerImageURL`.
/// Set it on the **first** `reportNewIncomingCall` only.
/// Do **not** `reportCall(updated:)` to fill a live incoming ... that tore
/// the pill down last time.
enum EdgeCallKitCallerAvatar {
  private static let cacheFolderName = "edge-callkit-avatars"
  private static let maxBytes = 512 * 1024
  private static let fetchTimeout: TimeInterval = 8

  /// Cached JPEG if we have one, otherwise the https URL. Never waits on
  /// the network. Apple requires the VoIP report immediately.
  static func applyToCallUpdate(_ update: CXCallUpdate, avatarUrl: String?) {
    guard let url = httpsURL(avatarUrl) else { return }
    if let data = cachedData(for: url.absoluteString),
       let file = writeShareableJPEG(data) {
      setLocalizedCallerImageURL(update, file)
      NSLog("EdgeCallKit avatar first-report file:// cached")
      return
    }
    setLocalizedCallerImageURL(update, url)
    NSLog("EdgeCallKit avatar first-report https")
  }

  /// Warm disk for the **next** ring. Do not hook this to a CallKit update.
  static func prefetchToCache(avatarUrl: String?) {
    guard let url = httpsURL(avatarUrl) else { return }
    let key = url.absoluteString
    if cachedData(for: key) != nil { return }
    fetch(url: url) { data in
      guard let data else { return }
      store(data, for: key)
    }
  }

  private static func setLocalizedCallerImageURL(_ update: CXCallUpdate, _ url: URL) {
    let setter = NSSelectorFromString("setLocalizedCallerImageURL:")
    guard update.responds(to: setter) else { return }
    update.perform(setter, with: url)
  }

  /// tmp is more likely to be readable by the CallKit UI process than Caches.
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

  static func httpsURL(_ raw: String?) -> URL? {
    let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !trimmed.isEmpty, trimmed.count <= 2048,
          let url = URL(string: trimmed),
          url.scheme?.lowercased() == "https"
    else { return nil }
    return url
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
