import PhotosUI
import UIKit

/// PHPicker for EdgeiOS. Contract: `docs/ios-native-bridge.md` `pickPhotos`.
enum EdgePhotoPicker {
  private static let hardMax = 40
  private static let maxEdge: CGFloat = 1600

  static func present(
    maxCount: Int,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    DispatchQueue.main.async {
      guard let presenter = topViewController() else {
        completion(.success(["ok": false, "error": "No window to present the picker."]))
        return
      }
      let clamped = max(1, min(maxCount, hardMax))
      var config = PHPickerConfiguration()
      config.filter = .images
      config.selectionLimit = clamped
      config.preferredAssetRepresentationMode = .current
      let session = Session(maxCount: clamped, completion: completion)
      Session.current = session
      let picker = PHPickerViewController(configuration: config)
      picker.delegate = session
      presenter.present(picker, animated: true)
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow)
      ?? scenes.first?.windows.first
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }

  static func encodeJPEG(_ image: UIImage) -> [String: Any]? {
    let rendered = downscale(oriented(image), maxEdge: maxEdge)
    guard let data = rendered.jpegData(compressionQuality: 0.82) else { return nil }
    return [
      "mimeType": "image/jpeg",
      "base64": data.base64EncodedString(),
      "width": Int(rendered.size.width.rounded()),
      "height": Int(rendered.size.height.rounded()),
    ]
  }

  private static func oriented(_ image: UIImage) -> UIImage {
    if image.imageOrientation == .up { return image }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = image.scale
    format.opaque = true
    return UIGraphicsImageRenderer(size: image.size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: image.size))
    }
  }

  private static func downscale(_ image: UIImage, maxEdge: CGFloat) -> UIImage {
    let size = image.size
    let longest = max(size.width, size.height)
    guard longest > maxEdge, longest > 0 else { return image }
    let scale = maxEdge / longest
    let next = CGSize(width: size.width * scale, height: size.height * scale)
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: next, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: next))
    }
  }
}

private final class Session: NSObject, PHPickerViewControllerDelegate {
  static var current: Session?

  private let maxCount: Int
  private let completion: (Result<[String: Any], Error>) -> Void

  init(
    maxCount: Int,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    self.maxCount = maxCount
    self.completion = completion
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true) { [weak self] in
      self?.finish(results: results)
    }
  }

  private func finish(results: [PHPickerResult]) {
    let picked = Array(results.prefix(maxCount))
    if picked.isEmpty {
      completion(.success(["ok": false, "cancelled": true]))
      Session.current = nil
      return
    }

    let group = DispatchGroup()
    let lock = NSLock()
    var slots: [Int: [String: Any]] = [:]

    for (index, result) in picked.enumerated() {
      group.enter()
      result.itemProvider.loadObject(ofClass: UIImage.self) { object, _ in
        defer { group.leave() }
        guard let image = object as? UIImage, let payload = EdgePhotoPicker.encodeJPEG(image) else {
          return
        }
        lock.lock()
        slots[index] = payload
        lock.unlock()
      }
    }

    group.notify(queue: .main) { [completion] in
      let images = (0..<picked.count).compactMap { slots[$0] }
      if images.isEmpty {
        completion(.success(["ok": false, "error": "Could not read those photos."]))
      } else {
        completion(.success(["ok": true, "images": images]))
      }
      Session.current = nil
    }
  }
}
