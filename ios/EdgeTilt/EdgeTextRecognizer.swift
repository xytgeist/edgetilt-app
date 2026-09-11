import UIKit
import Vision

/// On-device Vision OCR for EdgeiOS. Contract: `docs/ios-native-bridge.md` `recognizeText`.
enum EdgeTextRecognizer {
  private static let maxDecodedBytes = 8_000_000
  private static let maxEdge: CGFloat = 2000

  static func recognize(
    payload: [String: Any]?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let data = try imageData(from: payload)
        guard let image = UIImage(data: data) else {
          completion(.success(["ok": false, "error": "Could not decode the image."]))
          return
        }
        let prepared = downscale(oriented(image), maxEdge: maxEdge)
        guard let cgImage = prepared.cgImage else {
          completion(.success(["ok": false, "error": "Could not read the image."]))
          return
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["en-US"]
        request.revision = VNRecognizeTextRequestRevision3

        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
        try handler.perform([request])

        let observations = (request.results ?? []).sorted { a, b in
          if abs(a.boundingBox.midY - b.boundingBox.midY) > 0.018 {
            return a.boundingBox.midY > b.boundingBox.midY
          }
          return a.boundingBox.minX < b.boundingBox.minX
        }

        var rows: [[Line]] = []
        for observation in observations {
          guard let candidate = observation.topCandidates(1).first else { continue }
          let line = Line(
            text: candidate.string.trimmingCharacters(in: .whitespacesAndNewlines),
            confidence: candidate.confidence,
            box: observation.boundingBox
          )
          if line.text.isEmpty { continue }
          if let last = rows.last, let first = last.first, abs(first.box.midY - line.box.midY) <= 0.018 {
            rows[rows.count - 1].append(line)
          } else {
            rows.append([line])
          }
        }

        let joinedRows = rows.map { row in
          row.sorted { $0.box.minX < $1.box.minX }
        }
        let lines = joinedRows.flatMap { $0 }
        if lines.isEmpty {
          completion(.success(["ok": false, "error": "No text found."]))
          return
        }

        let text = joinedRows
          .map { $0.map(\.text).joined(separator: " ") }
          .joined(separator: "\n")
        let mean = lines.map(\.confidence).reduce(0, +) / Float(lines.count)

        completion(.success([
          "ok": true,
          "text": text,
          "confidence": Double(mean),
          "lines": lines.map { line -> [String: Any] in
            [
              "text": line.text,
              "confidence": Double(line.confidence),
            ]
          },
        ]))
      } catch {
        completion(.success(["ok": false, "error": error.localizedDescription]))
      }
    }
  }

  private struct Line {
    let text: String
    let confidence: Float
    let box: CGRect
  }

  private static func imageData(from payload: [String: Any]?) throws -> Data {
    let raw = (payload?["imageBase64"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !raw.isEmpty else {
      throw RecognizeError.missingImage
    }
    var encoded = raw
    if let range = encoded.range(of: "base64,") {
      encoded = String(encoded[range.upperBound...])
    }
    encoded = encoded.replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
    guard let data = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters) else {
      throw RecognizeError.badBase64
    }
    guard data.count <= maxDecodedBytes else {
      throw RecognizeError.tooLarge
    }
    return data
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

  private enum RecognizeError: LocalizedError {
    case missingImage
    case badBase64
    case tooLarge

    var errorDescription: String? {
      switch self {
      case .missingImage:
        return "Missing imageBase64."
      case .badBase64:
        return "imageBase64 is not valid."
      case .tooLarge:
        return "Image is too large for on-device OCR."
      }
    }
  }
}
