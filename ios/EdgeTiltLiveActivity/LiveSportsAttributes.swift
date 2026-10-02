import ActivityKit
import Foundation

/// Watched-game Live Activity (Dynamic Island + Lock Screen).
/// Shared by the app and the widget extension. Do not import app-only types.
struct LiveSportsAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var gameId: String
    var sportKey: String
    var awayAbbrev: String
    var homeAbbrev: String
    var awayScore: Int
    var homeScore: Int
    var status: String
    var clock: String
    var period: String
    var detail: String
    /// Resized PNG bytes from the main app (Lock Screen / Island cannot rely on network).
    var awayLogoData: Data?
    var homeLogoData: Data?

    var compactScore: String {
      "\(awayScore)-\(homeScore)"
    }

    var matchup: String {
      let a = awayAbbrev.isEmpty ? "AWAY" : awayAbbrev
      let h = homeAbbrev.isEmpty ? "HOME" : homeAbbrev
      return "\(a) @ \(h)"
    }

    /// Center clock line … e.g. `1st 4:21` / `Q3 10:33` / `Halftime`.
    var clockLine: String {
      let p = period.trimmingCharacters(in: .whitespacesAndNewlines)
      let c = clock.trimmingCharacters(in: .whitespacesAndNewlines)
      if !c.isEmpty {
        // status_label often already has period + clock ("Q1 4:21").
        if p.isEmpty || c.localizedCaseInsensitiveContains(p) || c.contains(" ") {
          return c
        }
        return "\(Self.displayPeriod(p)) \(c)"
      }
      if !p.isEmpty { return Self.displayPeriod(p) }
      let st = status.trimmingCharacters(in: .whitespacesAndNewlines)
      return st.isEmpty ? "LIVE" : st.uppercased()
    }

    var leagueLabel: String {
      let sk = sportKey.lowercased()
      if sk.contains("ncaaf") || sk.contains("college") || sk.contains("cfb") { return "CFB" }
      if sk.contains("nfl") { return "NFL" }
      if sk.contains("football") { return "NFL" }
      return ""
    }

    var statusLine: String {
      let bits = [clockLine, detail]
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
      if bits.isEmpty { return status.uppercased() }
      return bits.joined(separator: " · ")
    }

    var widgetURL: URL {
      var comps = URLComponents()
      comps.scheme = "edgetilt"
      comps.host = "live-game"
      comps.queryItems = [URLQueryItem(name: "id", value: gameId)]
      return comps.url ?? URL(string: "edgetilt://live-game")!
    }

    private static func displayPeriod(_ raw: String) -> String {
      let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      if t.isEmpty { return t }
      if let n = Int(t) {
        switch n {
        case 1: return "1st"
        case 2: return "2nd"
        case 3: return "3rd"
        case 4: return "4th"
        case 5: return "OT"
        default: return "\(n)"
        }
      }
      return t
    }
  }

  var startedAt: Date
}
