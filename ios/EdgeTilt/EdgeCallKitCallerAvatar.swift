import CallKit
import CryptoKit
import Foundation
import Intents
import UIKit

/// CallKit has no public `CXCallUpdate` photo field. The compact incoming
/// pill / Dynamic Island circle reads undocumented `localizedCallerImageURL`.
/// Intent donate is extra and does not paint that circle.
enum EdgeCallKitCallerAvatar {
  private static let cacheFolderName = "edge-callkit-avatars"
  private static let maxBytes = 512 * 1024
  private static let fetchTimeout: TimeInterval = 8

  /// Put the photo on the CallKit update **before** `reportNewIncomingCall`.
  /// The compact pill / Dynamic Island reads `localizedCallerImageURL`.
  /// That setter is not in the public header as of iOS 27. Intent donate
  /// does not paint this circle.
  static func applyToCallUpdate(_ update: CXCallUpdate, avatarUrl: String?) {
    guard let url = httpsURL(avatarUrl) else { return }
    if let data = cachedData(for: url.absoluteString),
       let file = writeShareableJPEG(data) {
      setLocalizedCallerImageURL(update, file)
      return
    }
    setLocalizedCallerImageURL(update, url)
  }

  /// Donate whatever we can synchronously (URL + disk cache) **before**
  /// `reportNewIncomingCall`. Do not wait on the network here... Apple
  /// requires the VoIP report to happen immediately.
  static func donateNow(handle: String, displayName: String, avatarUrl: String?) {
    guard let url = httpsURL(avatarUrl) else { return }
    donate(handle: handle, displayName: displayName, image: INImage(url: url))
    if let data = cachedData(for: url.absoluteString), let image = inImage(from: data) {
      donate(handle: handle, displayName: displayName, image: image)
    }
  }

  /// Fetch (or reuse cache) and donate JPEG bytes. Do not use `onReady` to
  /// `reportCall(updated:)` on a live incoming... that kills the pill.
  static func fetchAndDonate(
    handle: String,
    displayName: String,
    avatarUrl: String?,
    onReady: (() -> Void)? = nil
  ) {
    guard let url = httpsURL(avatarUrl) else { return }
    let key = url.absoluteString
    if let data = cachedData(for: key), inImage(from: data) != nil {
      onReady?()
      return
    }
    fetch(url: url) { data in
      guard let data, let image = inImage(from: data) else { return }
      store(data, for: key)
      donate(handle: handle, displayName: displayName, image: image)
      onReady?()
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

  private static func donate(handle: String, displayName: String, image: INImage?) {
    let trimmedHandle = handle.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedHandle.isEmpty else { return }
    let personHandle = INPersonHandle(value: trimmedHandle, type: .unknown)
    let person = INPerson(
      personHandle: personHandle,
      nameComponents: nil,
      displayName: displayName,
      image: image,
      contactIdentifier: nil,
      customIdentifier: trimmedHandle
    )
    let intent = INStartCallIntent(
      callRecordFilter: nil,
      callRecordToCallBack: nil,
      audioRoute: .unknown,
      destinationType: .normal,
      contacts: [person],
      callCapability: .audioCall
    )
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate { error in
      if let error {
        NSLog("EdgeCallKit avatar donate failed: \(error.localizedDescription)")
      }
    }
  }

  private static func httpsURL(_ raw: String?) -> URL? {
    let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !trimmed.isEmpty, let url = URL(string: trimmed), url.scheme?.lowercased() == "https" else {
      return nil
    }
    return url
  }

  private static func inImage(from data: Data) -> INImage? {
    guard !data.isEmpty else { return nil }
    if let prepared = jpegAvatarData(from: data) {
      return INImage(imageData: prepared)
    }
    return INImage(imageData: data)
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
