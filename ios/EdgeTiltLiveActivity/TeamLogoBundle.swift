import Foundation
import UIKit

/// Loads team marks shipped inside the Live Activity extension bundle.
/// Prefer this over `AsyncImage` … ActivityKit snapshots often never finish remote loads.
enum TeamLogoBundle {
  /// Returns a bundled logo when we ship one for this sport + abbrev.
  static func uiImage(abbrev: String, sportKey: String) -> UIImage? {
    let key = normalizeAbbrev(abbrev)
    guard !key.isEmpty else { return nil }
    guard let folder = sportFolder(for: sportKey) else { return nil }

    for name in candidates(for: key) {
      if let image = loadPNG(named: name, subdirectory: "TeamLogos/\(folder)") {
        return image
      }
      // Some folder-resource layouts flatten one level.
      if let image = loadPNG(named: name, subdirectory: folder) {
        return image
      }
    }
    return nil
  }

  static func hasLogo(abbrev: String, sportKey: String) -> Bool {
    uiImage(abbrev: abbrev, sportKey: sportKey) != nil
  }

  // MARK: - Private

  private static func loadPNG(named name: String, subdirectory: String) -> UIImage? {
    guard
      let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: subdirectory),
      let image = UIImage(contentsOfFile: url.path)
    else { return nil }
    return image
  }

  private static func sportFolder(for sportKey: String) -> String? {
    let sk = sportKey.lowercased()
    if sk.contains("nfl") { return "nfl" }
    // American football without college markers → treat as NFL (board often sends "football").
    if sk.contains("football"),
       !sk.contains("ncaaf"),
       !sk.contains("college"),
       !sk.contains("cfb") {
      return "nfl"
    }
    return nil
  }

  private static func normalizeAbbrev(_ raw: String) -> String {
    raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
  }

  /// Prefer board abbrev, then known ESPN/Sleeper aliases we ship under a different file name.
  private static func candidates(for key: String) -> [String] {
    switch key {
    case "JAC": return ["JAX", "JAC"]
    case "WSH": return ["WAS", "WSH"]
    case "LAR", "LA": return [key, "LAR"]
    default: return [key]
    }
  }
}
