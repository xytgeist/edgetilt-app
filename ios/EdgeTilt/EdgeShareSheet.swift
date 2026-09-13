import UIKit

/// System share sheet for EdgeiOS. Contract: `docs/ios-native-bridge.md` `share`.
enum EdgeShareSheet {
  private static let maxImages = 4
  private static let maxDecodedBytes = 8 * 1024 * 1024

  static func present(
    payload: [String: Any]?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    DispatchQueue.main.async {
      guard let presenter = topViewController() else {
        completion(.success(["ok": false, "error": "No window to present the share sheet."]))
        return
      }
      if Session.current != nil {
        completion(.success(["ok": false, "error": "Share sheet already open."]))
        return
      }

      var items: [Any] = []
      var tempFiles: [URL] = []

      if let rawUrl = (payload?["url"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
         !rawUrl.isEmpty,
         let url = URL(string: rawUrl),
         let scheme = url.scheme?.lowercased(),
         scheme == "https" || scheme == "http"
      {
        items.append(url)
      }

      let text = (payload?["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if !text.isEmpty {
        items.append(text)
      }

      let imageRows = payload?["images"] as? [[String: Any]] ?? []
      for row in imageRows.prefix(maxImages) {
        guard let fileURL = writeTempImage(row) else { continue }
        tempFiles.append(fileURL)
        items.append(fileURL)
      }

      guard !items.isEmpty else {
        completion(.success(["ok": false, "error": "Nothing to share."]))
        return
      }

      let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
      if let pop = activity.popoverPresentationController {
        pop.sourceView = presenter.view
        pop.sourceRect = CGRect(
          x: presenter.view.bounds.midX,
          y: presenter.view.bounds.midY,
          width: 1,
          height: 1
        )
        pop.permittedArrowDirections = []
      }

      let session = Session(tempFiles: tempFiles, completion: completion)
      Session.current = session
      activity.completionWithItemsHandler = { _, completed, _, _ in
        session.finish(cancelled: !completed)
      }
      presenter.present(activity, animated: true)
    }
  }

  private static func writeTempImage(_ row: [String: Any]) -> URL? {
    let mime = String(row["mimeType"] as? String ?? "image/jpeg").lowercased()
    guard mime == "image/jpeg" || mime == "image/jpg" || mime == "image/png" else { return nil }
    let raw = (row["base64"] as? String ?? "")
      .replacingOccurrences(of: "\\s", with: "", options: .regularExpression)
    guard !raw.isEmpty, let data = Data(base64Encoded: raw), data.count <= maxDecodedBytes else {
      return nil
    }
    guard UIImage(data: data) != nil else { return nil }
    let ext = mime.contains("png") ? "png" : "jpg"
    let suggested = (row["filename"] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let name = suggested.isEmpty ? "edge-share-\(UUID().uuidString).\(ext)" : suggested
    let safeName = (name as NSString).lastPathComponent
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
    do {
      try data.write(to: url, options: .atomic)
      return url
    } catch {
      return nil
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

private final class Session {
  static var current: Session?

  private let tempFiles: [URL]
  private var completion: ((Result<[String: Any], Error>) -> Void)?

  init(tempFiles: [URL], completion: @escaping (Result<[String: Any], Error>) -> Void) {
    self.tempFiles = tempFiles
    self.completion = completion
  }

  func finish(cancelled: Bool) {
    let done = completion
    completion = nil
    Session.current = nil
    for url in tempFiles {
      try? FileManager.default.removeItem(at: url)
    }
    done?(.success(["ok": true, "cancelled": cancelled]))
  }
}
