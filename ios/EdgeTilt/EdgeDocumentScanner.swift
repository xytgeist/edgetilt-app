import UIKit
import VisionKit

/// VisionKit document camera for EdgeiOS. Contract: `docs/ios-native-bridge.md` `scanDocument`.
enum EdgeDocumentScanner {
  static func present(
    maxPages: Int,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    DispatchQueue.main.async {
      guard VNDocumentCameraViewController.isSupported else {
        completion(.success([
          "ok": false,
          "unsupported": true,
          "error": "Document camera is not available on this device.",
        ]))
        return
      }
      guard let presenter = topViewController() else {
        completion(.success(["ok": false, "error": "No window to present the scanner."]))
        return
      }
      let clamped = max(1, min(maxPages, 8))
      let session = Session(maxPages: clamped, completion: completion)
      Session.current = session
      let scanner = VNDocumentCameraViewController()
      scanner.delegate = session
      presenter.present(scanner, animated: true)
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
}

private final class Session: NSObject, VNDocumentCameraViewControllerDelegate {
  static var current: Session?

  private let maxPages: Int
  private let completion: (Result<[String: Any], Error>) -> Void

  init(
    maxPages: Int,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    self.maxPages = maxPages
    self.completion = completion
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFinishWith scan: VNDocumentCameraScan
  ) {
    controller.dismiss(animated: true) { [weak self] in
      self?.finish(scan: scan)
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true) { [weak self] in
      self?.completion(.success(["ok": false, "cancelled": true]))
      Session.current = nil
    }
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFailWithError error: Error
  ) {
    controller.dismiss(animated: true) { [weak self] in
      self?.completion(.success(["ok": false, "error": error.localizedDescription]))
      Session.current = nil
    }
  }

  private func finish(scan: VNDocumentCameraScan) {
    let count = min(scan.pageCount, maxPages)
    var images: [[String: Any]] = []
    for index in 0..<count {
      let image = scan.imageOfPage(at: index)
      if let payload = encodeJPEG(image) {
        images.append(payload)
      }
    }
    if images.isEmpty {
      completion(.success(["ok": false, "error": "Could not read the scanned page."]))
    } else {
      completion(.success(["ok": true, "images": images]))
    }
    Session.current = nil
  }

  private func encodeJPEG(_ image: UIImage) -> [String: Any]? {
    let maxEdge: CGFloat = 2000
    let rendered = downscale(image, maxEdge: maxEdge)
    guard let data = rendered.jpegData(compressionQuality: 0.85) else { return nil }
    return [
      "mimeType": "image/jpeg",
      "base64": data.base64EncodedString(),
      "width": Int(rendered.size.width.rounded()),
      "height": Int(rendered.size.height.rounded()),
    ]
  }

  private func downscale(_ image: UIImage, maxEdge: CGFloat) -> UIImage {
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
