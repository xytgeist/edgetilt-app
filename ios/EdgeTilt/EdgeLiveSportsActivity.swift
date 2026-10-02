import ActivityKit
import Foundation
import UIKit

/// Starts / updates / ends the watched-game Live Activity from JS.
/// While a sports Activity is live, bankroll Activities are ended (watched game wins Island).
enum EdgeLiveSportsActivity {
  static func sync(
    payload: [String: Any]?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let watching = payload?["watching"] as? Bool
    let gameId = string(payload?["gameId"])
    let status = string(payload?["status"]).lowercased()

    let shouldEnd =
      watching == false
      || gameId.isEmpty
      || status == "post"
      || status == "final"

    if shouldEnd {
      endAll { ended in
        completion(.success([
          "ok": true,
          "supported": true,
          "ended": ended,
        ]))
      }
      return
    }

    let away = dict(payload?["away"])
    let home = dict(payload?["home"])
    let awayLogoUrl = string(away?["logo"])
    let homeLogoUrl = string(home?["logo"])
    let baseState = LiveSportsAttributes.ContentState(
      gameId: gameId,
      sportKey: string(payload?["sportKey"]),
      awayAbbrev: string(away?["abbrev"]).uppercased(),
      homeAbbrev: string(home?["abbrev"]).uppercased(),
      awayScore: int(away?["score"]),
      homeScore: int(home?["score"]),
      status: status.isEmpty ? "in" : status,
      clock: string(payload?["clock"]),
      period: string(payload?["period"]),
      detail: string(payload?["downDistance"]).isEmpty
        ? string(payload?["detail"])
        : string(payload?["downDistance"]),
      awayLogoData: nil,
      homeLogoData: nil
    )

    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      completion(.success([
        "ok": true,
        "supported": true,
        "disabled": true,
      ]))
      return
    }

    Task {
      // Watched game beats bankroll for Island space.
      await endBankrollActivities()

      let prior = Activity<LiveSportsAttributes>.activities.first?.content.state
      async let awayData = fetchLogoData(awayLogoUrl, fallback: prior?.awayLogoData)
      async let homeData = fetchLogoData(homeLogoUrl, fallback: prior?.homeLogoData)
      let (awayLogo, homeLogo) = await (awayData, homeData)

      var state = baseState
      state.awayLogoData = awayLogo
      state.homeLogoData = homeLogo

      do {
        if let existing = Activity<LiveSportsAttributes>.activities.first {
          await existing.update(ActivityContent(state: state, staleDate: nil))
          completion(.success([
            "ok": true,
            "supported": true,
            "updated": true,
          ]))
          return
        }

        let attributes = LiveSportsAttributes(startedAt: Date())
        _ = try Activity.request(
          attributes: attributes,
          content: ActivityContent(state: state, staleDate: nil),
          pushType: nil
        )
        completion(.success([
          "ok": true,
          "supported": true,
          "started": true,
        ]))
      } catch {
        completion(.success([
          "ok": false,
          "supported": true,
          "error": error.localizedDescription,
        ]))
      }
    }
  }

  static func endFromSignOut() {
    endAll { _ in }
  }

  /// True when a watched-game Activity is showing (bankroll sync should defer).
  static var isActive: Bool {
    !Activity<LiveSportsAttributes>.activities.isEmpty
  }

  private static func endAll(completion: @escaping (Int) -> Void) {
    let activities = Activity<LiveSportsAttributes>.activities
    guard !activities.isEmpty else {
      completion(0)
      return
    }
    Task {
      for activity in activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      completion(activities.count)
    }
  }

  private static func endBankrollActivities() async {
    for activity in Activity<LiveBankrollAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }

  /// Download + shrink team marks so Lock Screen / Island snapshots stay crisp offline.
  private static func fetchLogoData(_ urlString: String, fallback: Data?) async -> Data? {
    let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed), !trimmed.isEmpty else { return fallback }
    do {
      let (data, response) = try await URLSession.shared.data(from: url)
      if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
        return fallback
      }
      guard let image = UIImage(data: data) else { return fallback ?? data }
      return resizedPng(image, maxSide: 96) ?? fallback
    } catch {
      return fallback
    }
  }

  private static func resizedPng(_ image: UIImage, maxSide: CGFloat) -> Data? {
    let w = image.size.width
    let h = image.size.height
    guard w > 0, h > 0 else { return image.pngData() }
    let scale = min(1, maxSide / max(w, h))
    let size = CGSize(width: (w * scale).rounded(), height: (h * scale).rounded())
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = false
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let drawn = renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    return drawn.pngData()
  }

  private static func dict(_ value: Any?) -> [String: Any]? {
    value as? [String: Any]
  }

  private static func string(_ value: Any?) -> String {
    if let s = value as? String { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
    if let n = value as? NSNumber { return n.stringValue }
    return ""
  }

  private static func int(_ value: Any?) -> Int {
    if let i = value as? Int { return i }
    if let n = value as? NSNumber { return n.intValue }
    if let s = value as? String, let i = Int(s) { return i }
    return 0
  }
}
