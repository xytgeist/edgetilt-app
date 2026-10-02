import Foundation
import UIKit

/// Loads team marks shipped inside the Live Activity extension bundle.
/// Prefer this over `AsyncImage` … ActivityKit snapshots often never finish remote loads.
///
/// Dynamic Island compact/minimal silently show a gray square when the source image is larger
/// than the presentation … always pass `maxPointSize` for those regions.
enum TeamLogoBundle {
  /// Returns a bundled logo when we ship one for this sport + abbrev.
  /// - Parameter maxPointSize: Cap the bitmap to this many points (× screen scale). Pass the
  ///   view's frame size for Island compact/minimal; Lock Screen can use the display size too.
  static func uiImage(abbrev: String, sportKey: String, maxPointSize: CGFloat? = nil) -> UIImage? {
    let key = normalizeAbbrev(abbrev)
    guard !key.isEmpty else { return nil }
    guard let folder = sportFolder(for: sportKey) else { return nil }

    for name in candidates(for: key, folder: folder) {
      if let image = loadPNG(named: name, subdirectory: "TeamLogos/\(folder)") {
        return capped(image, maxPointSize: maxPointSize)
      }
      if let image = loadPNG(named: name, subdirectory: folder) {
        return capped(image, maxPointSize: maxPointSize)
      }
    }
    return nil
  }

  static func hasLogo(abbrev: String, sportKey: String) -> Bool {
    uiImage(abbrev: abbrev, sportKey: sportKey, maxPointSize: nil) != nil
  }

  // MARK: - Private

  private static func loadPNG(named name: String, subdirectory: String) -> UIImage? {
    guard
      let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: subdirectory),
      let image = UIImage(contentsOfFile: url.path)
    else { return nil }
    return image
  }

  private static func capped(_ image: UIImage, maxPointSize: CGFloat?) -> UIImage {
    guard let maxPt = maxPointSize, maxPt > 0 else { return image }
    // ActivityKit compares asset pixel size to presentation points × scale. Use 3× as a safe ceiling.
    let maxPx = maxPt * 3
    let w = image.size.width * image.scale
    let h = image.size.height * image.scale
    let longest = max(w, h)
    guard longest > maxPx + 0.5 else { return image }
    let ratio = maxPx / longest
    let outW = max(1, (w * ratio).rounded())
    let outH = max(1, (h * ratio).rounded())
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = false
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: outW, height: outH), format: format)
    return renderer.image { _ in
      image.draw(in: CGRect(x: 0, y: 0, width: outW, height: outH))
    }
  }

  private static func sportFolder(for sportKey: String) -> String? {
    let sk = sportKey.lowercased()
    if sk.contains("ncaaf") || sk.contains("cfb") || sk.contains("college") { return "cfb" }
    if sk.contains("nfl") { return "nfl" }
    if sk.contains("football") { return "nfl" }
    return nil
  }

  private static func normalizeAbbrev(_ raw: String) -> String {
    raw.trimmingCharacters(in: .whitespacesAndNewlines)
      .uppercased()
      .replacingOccurrences(of: "[^A-Z0-9&-]", with: "", options: .regularExpression)
  }

  private static func candidates(for key: String, folder: String) -> [String] {
    if folder == "nfl" {
      switch key {
      case "JAC": return ["JAX", "JAC"]
      case "WSH": return ["WAS", "WSH"]
      case "LAR", "LA": return [key, "LAR"]
      default: return [key]
      }
    }

    if folder == "cfb" {
      let aliases: [String: String] = [
        "WSH": "WASH",
        "WAS": "WASH",
        "TAMU": "TAM",
        "TA&M": "TAM",
        "TEXAM": "TAM",
        "SMISS": "USM",
        "SOMISS": "USM",
        "SOUMISS": "USM",
        "MIOH": "M-OH",
        "MIAOH": "M-OH",
        "MIAMI-OH": "M-OH",
        "MIAOHIO": "M-OH",
        "GA": "UGA",
        "MISSST": "MSST",
        "MISSSTATE": "MSST",
        "OKLA": "OU",
        "OKL": "OU",
        "PIT": "PITT",
        "NCST": "NCSU",
        "FLAST": "FSU",
        "MIAFL": "MIA",
        "HAWAII": "HAW",
        "WASHST": "WSU",
        "MICHST": "MSU",
        "NW": "NU",
        "NWU": "NU",
        "NWEST": "NU",
        "HOWARD": "HOW",
      ]
      if let aliased = aliases[key], aliased != key {
        return [aliased, key]
      }
      return [key]
    }

    return [key]
  }
}
