import ActivityKit
import SwiftUI
import WidgetKit

struct LiveBankrollActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveBankrollAttributes.self) { context in
      LiveBankrollLockScreenView(state: context.state)
        .widgetURL(context.state.widgetURL)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          LiveBankrollBrandMark(state: context.state, size: 36)
        }
        DynamicIslandExpandedRegion(.trailing) {
          LiveBankrollExpandedTimer(state: context.state)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            Text("EDGE")
              .font(.caption.weight(.heavy))
              .foregroundStyle(.white)
            Text(context.state.isDual ? "2 live" : context.state.lockTitle)
              .font(.caption2.weight(.medium))
              .foregroundStyle(.white.opacity(0.72))
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          LiveBankrollExpandedRows(state: context.state)
        }
      } compactLeading: {
        // Tight leading tile (YouTube-style). Keep under ~24pt so the
        // island does not stretch edge-to-edge around the camera cutout.
        LiveBankrollBrandMark(state: context.state, size: 20)
      } compactTrailing: {
        LiveBankrollCompactTrailing(state: context.state)
      } minimal: {
        LiveBankrollBrandMark(state: context.state, size: 14, minimal: true)
      }
      .keylineTint(LiveBankrollPalette.keyline(for: context.state))
      .widgetURL(context.state.widgetURL)
    }
  }
}

// MARK: - Palette

private enum LiveBankrollPalette {
  static let slots = Color(red: 0.20, green: 0.84, blue: 0.45)
  static let poker = Color(red: 0.18, green: 0.78, blue: 0.72)
  static let dual = Color(red: 0.22, green: 0.85, blue: 0.88)
  static let paused = Color(red: 0.98, green: 0.75, blue: 0.35)

  static func accent(for state: LiveBankrollAttributes.ContentState) -> Color {
    if state.hasSlots && state.hasPoker { return dual }
    if state.hasSlots { return slots }
    if state.pokerPaused { return paused }
    return poker
  }

  static func keyline(for state: LiveBankrollAttributes.ContentState) -> Color {
    accent(for: state)
  }
}

// MARK: - Compact

/// Elapsed clock we own. Do **not** use `Text(timerInterval:showsHours: false)` …
/// that API only renders the seconds field and rolls at 59s (looked like 0:24 forever).
/// Custom format stays narrow (`5:00`, then `1:05:00` only after an hour).
private struct LiveBankrollElapsedText: View {
  var start: Date
  var font: Font

  var body: some View {
    TimelineView(.periodic(from: start, by: 1)) { context in
      Text(Self.format(from: start, to: context.date))
        .font(font)
        .monospacedDigit()
        .foregroundStyle(.white)
        .multilineTextAlignment(.trailing)
    }
  }

  static func format(from start: Date, to now: Date) -> String {
    let total = max(0, Int(now.timeIntervalSince(start)))
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    let seconds = total % 60
    if hours > 0 {
      return String(format: "%d:%02d:%02d", hours, minutes, seconds)
    }
    return String(format: "%d:%02d", minutes, seconds)
  }
}

/// Rounded tile with session glyph ... denser than a lonely 10pt dot.
private struct LiveBankrollBrandMark: View {
  var state: LiveBankrollAttributes.ContentState
  var size: CGFloat
  var minimal: Bool = false

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
        .fill(LiveBankrollPalette.accent(for: state).opacity(minimal ? 1 : 0.22))
      if minimal {
        Circle()
          .fill(LiveBankrollPalette.accent(for: state))
          .frame(width: size * 0.42, height: size * 0.42)
      } else {
        Image(systemName: symbolName)
          .font(.system(size: size * 0.52, weight: .bold))
          .foregroundStyle(LiveBankrollPalette.accent(for: state))
      }
    }
    .frame(width: size, height: size)
    .accessibilityLabel(state.lockTitle)
  }

  private var symbolName: String {
    if state.hasSlots && state.hasPoker { return "square.on.square.fill" }
    if state.hasSlots { return "dice.fill" }
    if state.pokerPaused { return "pause.fill" }
    return "suit.spade.fill"
  }
}

private struct LiveBankrollCompactTrailing: View {
  var state: LiveBankrollAttributes.ContentState

  var body: some View {
    Group {
      if state.isDual {
        HStack(spacing: 3) {
          LiveBankrollPulseBars(tint: LiveBankrollPalette.dual, compact: true)
          Text("2")
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
        }
      } else if state.pokerPaused && !state.hasSlots {
        Image(systemName: "pause.fill")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(LiveBankrollPalette.paused)
      } else if let start = state.slotsTimerStart ?? state.pokerTimerStart {
        LiveBankrollElapsedText(
          start: start,
          font: .system(size: 12, weight: .semibold, design: .rounded)
        )
      } else {
        LiveBankrollPulseBars(tint: LiveBankrollPalette.accent(for: state), compact: true)
      }
    }
  }
}

/// Tiny equalizer so the compact island feels alive (YouTube-style trailing).
private struct LiveBankrollPulseBars: View {
  var tint: Color
  var compact: Bool

  var body: some View {
    TimelineView(.animation(minimumInterval: 0.18, paused: false)) { context in
      let t = context.date.timeIntervalSinceReferenceDate
      HStack(alignment: .center, spacing: compact ? 1.5 : 2) {
        ForEach(0..<3, id: \.self) { i in
          Capsule()
            .fill(tint)
            .frame(width: compact ? 2 : 2.5, height: barHeight(index: i, time: t))
        }
      }
      .frame(width: compact ? 10 : 14, height: compact ? 12 : 16, alignment: .center)
    }
  }

  private func barHeight(index: Int, time: TimeInterval) -> CGFloat {
    let phase = time * 5.2 + Double(index) * 1.1
    let wave = (sin(phase) + 1) * 0.5
    let minH: CGFloat = compact ? 3 : 4
    let maxH: CGFloat = compact ? 11 : 15
    return minH + CGFloat(wave) * (maxH - minH)
  }
}

// MARK: - Expanded / Lock

private struct LiveBankrollExpandedTimer: View {
  var state: LiveBankrollAttributes.ContentState

  var body: some View {
    if state.isDual {
      HStack(spacing: 6) {
        LiveBankrollPulseBars(tint: LiveBankrollPalette.dual, compact: false)
        Text("2")
          .font(.title3.weight(.bold))
          .foregroundStyle(.white)
      }
    } else if let start = state.slotsTimerStart ?? state.pokerTimerStart {
      LiveBankrollElapsedText(
        start: start,
        font: .title3.weight(.semibold)
      )
    } else if state.pokerPaused {
      Text("Paused")
        .font(.caption.weight(.semibold))
        .foregroundStyle(LiveBankrollPalette.paused)
    }
  }
}

private struct LiveBankrollExpandedRows: View {
  var state: LiveBankrollAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if state.hasSlots {
        Link(destination: state.slotsWidgetURL) {
          LiveBankrollRow(
            tint: LiveBankrollPalette.slots,
            symbol: "dice.fill",
            title: state.slotsLabel.isEmpty ? "Slots" : state.slotsLabel,
            timerStart: state.slotsTimerStart,
            paused: false
          )
        }
      }
      if state.hasPoker {
        Link(destination: state.pokerWidgetURL) {
          LiveBankrollRow(
            tint: state.pokerPaused ? LiveBankrollPalette.paused : LiveBankrollPalette.poker,
            symbol: state.pokerPaused ? "pause.fill" : "suit.spade.fill",
            title: state.pokerLabel.isEmpty ? "Poker" : state.pokerLabel,
            timerStart: state.pokerTimerStart,
            paused: state.pokerPaused
          )
        }
      }
    }
  }
}

private struct LiveBankrollRow: View {
  var tint: Color
  var symbol: String
  var title: String
  var timerStart: Date?
  var paused: Bool

  var body: some View {
    HStack(spacing: 8) {
      ZStack {
        RoundedRectangle(cornerRadius: 5, style: .continuous)
          .fill(tint.opacity(0.22))
          .frame(width: 22, height: 22)
        Image(systemName: symbol)
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(tint)
      }
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
      Spacer(minLength: 8)
      if paused {
        Text("Paused")
          .font(.caption.weight(.semibold))
          .foregroundStyle(tint)
      } else if let timerStart {
        LiveBankrollElapsedText(
          start: timerStart,
          font: .subheadline.weight(.semibold)
        )
      }
    }
  }
}

private struct LiveBankrollLockScreenView: View {
  var state: LiveBankrollAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        LiveBankrollBrandMark(state: state, size: 28)
        VStack(alignment: .leading, spacing: 1) {
          Text("EDGE")
            .font(.caption.weight(.heavy))
            .foregroundStyle(.white)
          Text(state.isDual ? "2 live sessions" : "Live session")
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.65))
        }
        Spacer(minLength: 8)
        if !state.isDual, let start = state.slotsTimerStart ?? state.pokerTimerStart {
          LiveBankrollElapsedText(
            start: start,
            font: .title3.weight(.semibold)
          )
        } else if state.isDual {
          LiveBankrollPulseBars(tint: LiveBankrollPalette.dual, compact: false)
        }
      }
      LiveBankrollExpandedRows(state: state)
    }
    .padding(16)
    .activityBackgroundTint(Color.black.opacity(0.55))
    .activitySystemActionForegroundColor(.white)
  }
}
