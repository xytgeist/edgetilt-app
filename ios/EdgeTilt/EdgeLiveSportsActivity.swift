import ActivityKit
import Foundation
import UIKit

/// Starts / updates / ends the watched-game Live Activity from JS.
/// While a sports Activity is live, bankroll Activities are ended (watched game wins Island).
/// Background: ActivityKit push tokens (`pushType: .token`) so APNs can update Island / Lock
/// Screen after WKWebView and `beginBackgroundTask` die. Native still polls
/// `lounge-sports-scoreboard` for the short BG window as a fallback.
enum EdgeLiveSportsActivity {
  private static var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
  private static var backgroundPollTask: Task<Void, Never>?
  private static var pushTokenTask: Task<Void, Never>?

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
      stopBackgroundRefresh()
      stopPushTokenListen()
      Task { await unregisterPushToken(gameId: gameId.isEmpty ? nil : gameId) }
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
    // URLs only … ActivityKit ContentState must stay under ~4KB (PNG bytes broke request).
    let state = LiveSportsAttributes.ContentState(
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
      awayLogoUrl: string(away?["logo"]),
      homeLogoUrl: string(home?["logo"]),
      possession: string(payload?["possession"]).lowercased(),
      awaySpread: string(away?["spread"]),
      homeSpread: string(home?["spread"]),
      awayMl: string(away?["ml"]),
      homeMl: string(home?["ml"]),
      totalLine: string(payload?["totalLine"])
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

      do {
        if let existing = Activity<LiveSportsAttributes>.activities.first {
          let merged = mergePreservingLines(incoming: state, previous: existing.content.state)
          await existing.update(ActivityContent(state: merged, staleDate: Date().addingTimeInterval(180)))
          listenForPushToken(existing, gameId: gameId)
          completion(.success([
            "ok": true,
            "supported": true,
            "updated": true,
          ]))
          return
        }

        let attributes = LiveSportsAttributes(startedAt: Date())
        let requested: Activity<LiveSportsAttributes>
        do {
          requested = try Activity.request(
            attributes: attributes,
            content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(180)),
            pushType: .token
          )
        } catch {
          requested = try Activity.request(
            attributes: attributes,
            content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(180)),
            pushType: nil
          )
        }
        listenForPushToken(requested, gameId: gameId)
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
    stopBackgroundRefresh()
    stopPushTokenListen()
    Task { await unregisterPushToken(gameId: nil) }
    endAll { _ in }
  }

  /// Resume token uploads after a cold start while an Activity is already live.
  static func bootstrapPushUpdates() {
    guard let activity = Activity<LiveSportsAttributes>.activities.first else { return }
    listenForPushToken(activity, gameId: activity.content.state.gameId)
  }

  /// True when a watched-game Activity is showing (bankroll sync should defer).
  static var isActive: Bool {
    !Activity<LiveSportsAttributes>.activities.isEmpty
  }

  /// Call from `scenePhase` … keep Island fresh while the phone is locked / app is backgrounded.
  static func handleSceneBecameActive(_ active: Bool) {
    if active {
      stopBackgroundRefresh()
    } else {
      startBackgroundRefresh()
    }
  }

  private static func startBackgroundRefresh() {
    guard isActive else { return }
    stopBackgroundRefresh()
    beginBackgroundTask()
    backgroundPollTask = Task {
      // First tick immediately, then every ~12s while iOS still grants background time.
      while !Task.isCancelled {
        await refreshWatchedGameFromNetwork()
        try? await Task.sleep(nanoseconds: 12_000_000_000)
        if Task.isCancelled { break }
        await MainActor.run { beginBackgroundTask() }
      }
    }
  }

  private static func stopBackgroundRefresh() {
    backgroundPollTask?.cancel()
    backgroundPollTask = nil
    endBackgroundTask()
  }

  private static func beginBackgroundTask() {
    endBackgroundTask()
    backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "EdgeLiveSportsRefresh") {
      stopBackgroundRefresh()
    }
  }

  private static func endBackgroundTask() {
    guard backgroundTaskId != .invalid else { return }
    UIApplication.shared.endBackgroundTask(backgroundTaskId)
    backgroundTaskId = .invalid
  }

  /// Pull the watched game from `lounge-sports-scoreboard` without WKWebView.
  private static func refreshWatchedGameFromNetwork() async {
    guard let activity = Activity<LiveSportsAttributes>.activities.first else {
      await MainActor.run { stopBackgroundRefresh() }
      return
    }
    let gameId = activity.content.state.gameId
    guard !gameId.isEmpty else { return }

    do {
      let session = try await EdgeAuthSessionStore.validAccessToken()
      let base = session.supabaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      guard let url = URL(string: "\(base)/functions/v1/lounge-sports-scoreboard") else { return }

      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue(session.anonKey, forHTTPHeaderField: "apikey")
      request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
      // Active slice is enough for score/clock ticks and cheaper than full slate / detail.
      request.httpBody = try JSONSerialization.data(withJSONObject: ["scope": "active"])

      let (data, response) = try await URLSession.shared.data(for: request)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard status >= 200, status < 300,
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let games = json["games"] as? [[String: Any]],
            let game = games.first(where: { string($0["id"]) == gameId })
      else { return }

      let gameStatus = string(game["status"]).lowercased()
      if gameStatus == "post" || gameStatus == "final" {
        await activity.end(nil, dismissalPolicy: .immediate)
        await MainActor.run { stopBackgroundRefresh() }
        return
      }
      guard gameStatus == "in" else { return }

      let next = contentState(from: game, previous: activity.content.state)
      await activity.update(ActivityContent(state: next, staleDate: Date().addingTimeInterval(180)))
    } catch {
      // Soft-fail … next tick retries; missing Keychain session just waits for foreground JS.
    }
  }

  private static func contentState(
    from game: [String: Any],
    previous: LiveSportsAttributes.ContentState
  ) -> LiveSportsAttributes.ContentState {
    let away = dict(game["away"]) ?? [:]
    let home = dict(game["home"]) ?? [:]
    let live = dict(game["live"]) ?? [:]
    let statusLabel = string(game["status_label"])
    let periodRaw = string(live["period_label"]).isEmpty ? string(live["period"]) : string(live["period_label"])
    let clockRaw = string(live["clock"])
    let clock: String
    let period: String
    if !statusLabel.isEmpty, statusLabel.lowercased() != "live" {
      clock = statusLabel
      period = ""
    } else {
      clock = clockRaw
      period = periodRaw
    }
    let downDistance = string(live["down_distance"]).isEmpty
      ? string(live["downDistance"])
      : string(live["down_distance"])
    let poss = string(live["possession"]).lowercased()
    let possession = (poss == "home" || poss == "away") ? poss : (previous.possession ?? "")

    let awayAbbrev = string(away["abbrev"]).uppercased()
    let homeAbbrev = string(home["abbrev"]).uppercased()
    let awayLogo = string(away["logo"])
    let homeLogo = string(home["logo"])
    let sportKey = string(game["sport_key"])
    let id = string(game["id"])

    let incoming = LiveSportsAttributes.ContentState(
      gameId: id.isEmpty ? previous.gameId : id,
      sportKey: sportKey.isEmpty ? previous.sportKey : sportKey,
      awayAbbrev: awayAbbrev.isEmpty ? previous.awayAbbrev : awayAbbrev,
      homeAbbrev: homeAbbrev.isEmpty ? previous.homeAbbrev : homeAbbrev,
      awayScore: int(away["score"]),
      homeScore: int(home["score"]),
      status: "in",
      clock: clock.isEmpty ? previous.clock : clock,
      period: period,
      detail: downDistance.isEmpty ? previous.detail : downDistance,
      awayLogoUrl: awayLogo.isEmpty ? previous.awayLogoUrl : awayLogo,
      homeLogoUrl: homeLogo.isEmpty ? previous.homeLogoUrl : homeLogo,
      possession: possession,
      awaySpread: formatSpread(away["spread"]),
      homeSpread: formatSpread(home["spread"]),
      awayMl: formatMoneyline(away["ml"]),
      homeMl: formatMoneyline(home["ml"]),
      totalLine: formatTotal(game["total"])
    )
    return mergePreservingLines(incoming: incoming, previous: previous)
  }

  /// Keep the last real spread/ML/O-U when the board briefly sends empty or literal 0.
  private static func mergePreservingLines(
    incoming: LiveSportsAttributes.ContentState,
    previous: LiveSportsAttributes.ContentState
  ) -> LiveSportsAttributes.ContentState {
    var next = incoming
    if blank(next.awaySpread) { next.awaySpread = previous.awaySpread }
    if blank(next.homeSpread) { next.homeSpread = previous.homeSpread }
    if blank(next.awayMl) { next.awayMl = previous.awayMl }
    if blank(next.homeMl) { next.homeMl = previous.homeMl }
    if blank(next.totalLine) { next.totalLine = previous.totalLine }
    if blank(next.possession) { next.possession = previous.possession }
    if next.detail.isEmpty { next.detail = previous.detail }
    if next.clock.isEmpty { next.clock = previous.clock }
    return next
  }

  private static func blank(_ value: String?) -> Bool {
    (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private static func formatSpread(_ value: Any?) -> String {
    guard let n = double(value) else { return "" }
    // Literal 0 is usually a cleared Rundown line mid-game … keep previous via merge.
    if n == 0 { return "" }
    let magnitude = Swift.abs(n)
    let body = magnitude == floor(magnitude) ? String(Int(magnitude)) : String(magnitude)
    return n > 0 ? "+\(body)" : "-\(body)"
  }

  private static func formatMoneyline(_ value: Any?) -> String {
    guard let n = double(value) else { return "" }
    let i = Int(n.rounded())
    if i == 0 { return "" }
    return i > 0 ? "+\(i)" : "\(i)"
  }

  private static func formatTotal(_ value: Any?) -> String {
    guard let n = double(value) else { return "" }
    if n == 0 { return "" }
    let body = n == floor(n) ? String(Int(n)) : String(n)
    return "O/U \(body)"
  }

  private static func listenForPushToken(
    _ activity: Activity<LiveSportsAttributes>,
    gameId: String
  ) {
    guard !gameId.isEmpty else { return }
    pushTokenTask?.cancel()
    pushTokenTask = Task {
      for await tokenData in activity.pushTokenUpdates {
        if Task.isCancelled { break }
        await uploadPushToken(tokenData, gameId: gameId)
      }
    }
  }

  private static func stopPushTokenListen() {
    pushTokenTask?.cancel()
    pushTokenTask = nil
  }

  private static func hexToken(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }

  private static func apnsEnvironmentHint() -> String {
    #if DEBUG
    return "sandbox"
    #else
    return "production"
    #endif
  }

  private static func uploadPushToken(_ tokenData: Data, gameId: String) async {
    let token = hexToken(tokenData)
    guard token.count >= 64 else { return }
    do {
      let session = try await EdgeAuthSessionStore.validAccessToken()
      let base = session.supabaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      guard let url = URL(string: "\(base)/functions/v1/lounge-live-activity-token") else { return }
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue(session.anonKey, forHTTPHeaderField: "apikey")
      request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
      request.httpBody = try JSONSerialization.data(withJSONObject: [
        "token": token,
        "gameId": gameId,
        "watching": true,
        "environment": apnsEnvironmentHint(),
        "bundleId": "com.edgetilt.app",
      ])
      _ = try await URLSession.shared.data(for: request)
    } catch {
      // Soft-fail … next token tick or foreground JS retry.
    }
  }

  private static func unregisterPushToken(gameId: String?) async {
    do {
      let session = try await EdgeAuthSessionStore.validAccessToken()
      let base = session.supabaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      guard let url = URL(string: "\(base)/functions/v1/lounge-live-activity-token") else { return }
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue(session.anonKey, forHTTPHeaderField: "apikey")
      request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
      var body: [String: Any] = ["watching": false]
      if let gameId, !gameId.isEmpty { body["gameId"] = gameId }
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
      _ = try await URLSession.shared.data(for: request)
    } catch {
      /* signed out / no session */
    }
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

  private static func double(_ value: Any?) -> Double? {
    if let d = value as? Double { return d }
    if let i = value as? Int { return Double(i) }
    if let n = value as? NSNumber { return n.doubleValue }
    if let s = value as? String, let d = Double(s.trimmingCharacters(in: .whitespacesAndNewlines)) {
      return d
    }
    return nil
  }
}
