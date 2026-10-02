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

    var compactScore: String {
      "\(awayScore)-\(homeScore)"
    }

    var matchup: String {
      let a = awayAbbrev.isEmpty ? "AWAY" : awayAbbrev
      let h = homeAbbrev.isEmpty ? "HOME" : homeAbbrev
      return "\(a) @ \(h)"
    }

    var statusLine: String {
      let bits = [period, clock, detail]
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
  }

  var startedAt: Date
}
