import ActivityKit
import Foundation

/// Starts / updates / ends the slots + poker Live Activity from JS.
enum EdgeLiveBankrollActivity {
  static func sync(
    payload: [String: Any]?,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      completion(.success(["ok": true, "supported": true, "disabled": true]))
      return
    }

    let slots = dict(payload?["slots"])
    let poker = dict(payload?["poker"])
    let slotsId = string(slots?["id"])
    let pokerId = string(poker?["id"])

    if slotsId.isEmpty && pokerId.isEmpty {
      endAll { ended in
        completion(.success([
          "ok": true,
          "supported": true,
          "ended": ended,
        ]))
      }
      return
    }

    let state = LiveBankrollAttributes.ContentState(
      slotsId: slotsId,
      slotsLabel: string(slots?["label"]),
      slotsTimerStart: timerStart(from: slots, running: true),
      pokerId: pokerId,
      pokerLabel: string(poker?["label"]),
      pokerPaused: bool(poker?["paused"]),
      pokerTimerStart: timerStart(from: poker, running: !bool(poker?["paused"]))
    )

    Task {
      do {
        if let existing = Activity<LiveBankrollAttributes>.activities.first {
          await existing.update(
            ActivityContent(state: state, staleDate: nil)
          )
          completion(.success([
            "ok": true,
            "supported": true,
            "updated": true,
          ]))
          return
        }

        let attributes = LiveBankrollAttributes(startedAt: Date())
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

  private static func endAll(completion: @escaping (Int) -> Void) {
    let activities = Activity<LiveBankrollAttributes>.activities
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

  private static func timerStart(from dict: [String: Any]?, running: Bool) -> Date? {
    guard running else { return nil }
    if let elapsed = number(dict?["elapsedSeconds"]), elapsed >= 0 {
      return Date().addingTimeInterval(-elapsed)
    }
    if let start = parseDate(string(dict?["startAt"])), start <= Date() {
      return start
    }
    return Date()
  }

  private static func dict(_ value: Any?) -> [String: Any]? {
    value as? [String: Any]
  }

  private static func string(_ value: Any?) -> String {
    (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }

  private static func bool(_ value: Any?) -> Bool {
    if let flag = value as? Bool { return flag }
    if let number = value as? NSNumber { return number.boolValue }
    if let text = value as? String {
      let lowered = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      return lowered == "1" || lowered == "true" || lowered == "yes"
    }
    return false
  }

  private static func number(_ value: Any?) -> TimeInterval? {
    if let number = value as? NSNumber { return number.doubleValue }
    if let number = value as? Double { return number }
    if let number = value as? Int { return TimeInterval(number) }
    if let text = value as? String, let number = Double(text) { return number }
    return nil
  }

  private static func parseDate(_ raw: String) -> Date? {
    guard !raw.isEmpty else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: raw) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: raw)
  }
}
