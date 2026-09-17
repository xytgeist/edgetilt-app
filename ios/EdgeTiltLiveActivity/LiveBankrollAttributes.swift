import ActivityKit
import Foundation

/// Shared by the app (start/update/end) and the widget (render).
/// Keep this file in both targets. Do not import app-only types.
struct LiveBankrollAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var slotsId: String
    var slotsLabel: String
    var slotsTimerStart: Date?
    var pokerId: String
    var pokerLabel: String
    var pokerPaused: Bool
    var pokerTimerStart: Date?

    var hasSlots: Bool { !slotsId.isEmpty }
    var hasPoker: Bool { !pokerId.isEmpty }
    var isDual: Bool { hasSlots && hasPoker }

    var compactLabel: String {
      if isDual { return "2" }
      if hasSlots { return Self.short(slotsLabel) }
      if hasPoker { return pokerPaused ? "⏸" : Self.short(pokerLabel) }
      return "LIVE"
    }

    var lockTitle: String {
      if isDual { return "2 live sessions" }
      if hasSlots { return slotsLabel.isEmpty ? "Slots" : slotsLabel }
      if hasPoker { return pokerLabel.isEmpty ? "Poker" : pokerLabel }
      return "Live session"
    }

    var widgetURL: URL {
      Self.liveSessionURL(
        tab: hasPoker && !hasSlots ? "poker-bankroll" : "bankroll",
        pokerSessionId: hasPoker && !hasSlots ? pokerId : nil
      )
    }

    var slotsWidgetURL: URL {
      Self.liveSessionURL(tab: "bankroll", pokerSessionId: nil)
    }

    var pokerWidgetURL: URL {
      Self.liveSessionURL(
        tab: "poker-bankroll",
        pokerSessionId: pokerId.isEmpty ? nil : pokerId
      )
    }

    private static func short(_ label: String) -> String {
      let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.count <= 8 { return trimmed }
      return String(trimmed.prefix(7)) + "…"
    }

    static func liveSessionURL(tab: String, pokerSessionId: String?) -> URL {
      var comps = URLComponents()
      comps.scheme = "edgetilt"
      comps.host = "live-session"
      var items = [URLQueryItem(name: "tab", value: tab)]
      if let pokerSessionId, !pokerSessionId.isEmpty {
        items.append(URLQueryItem(name: "pokerSession", value: pokerSessionId))
      }
      comps.queryItems = items
      return comps.url ?? URL(string: "edgetilt://live-session?tab=bankroll")!
    }
  }

  var startedAt: Date
}
