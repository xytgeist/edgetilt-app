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
        // ~26pt circle reads on the Island; keep layout frame fixed so breath
        // scale cannot stretch the pill edge-to-edge.
        LiveBankrollBrandMark(state: context.state, size: 26)
      } compactTrailing: {
        LiveBankrollCompactTrailing(state: context.state)
      } minimal: {
        LiveBankrollBrandMark(state: context.state, size: 16, minimal: true)
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

// MARK: - Timer

/// System-updating stopwatch. Do not use custom `TimelineView` clocks in Live
/// Activities ... they freeze at the first frame (stuck `0:00`). Do not use
/// `Text(timerInterval:showsHours: false)` ... that rolls at 59s.
///
/// `Text(..., style: .timer)` reserves a huge intrinsic width (full-bleed Island).
/// Always clamp with a fixed trailing frame.
private struct LiveBankrollElapsedText: View {
  var start: Date
  var font: Font
  var pausedTone: Bool = false
  /// Compact Island trailing budget (~m:ss). Expanded / lock can be wider.
  var maxWidth: CGFloat = 44

  var body: some View {
    Text(start, style: .timer)
      .font(font)
      .monospacedDigit()
      .foregroundStyle(pausedTone ? LiveBankrollPalette.paused : .white)
      .multilineTextAlignment(.trailing)
      .lineLimit(1)
      .minimumScaleFactor(0.65)
      .frame(width: maxWidth, alignment: .trailing)
  }
}

// MARK: - Compact leading mark

/// Circular accent behind glyph. Breaths while live; freezes when paused.
/// Slots uses a white die with black pips (not SF `dice.fill`).
private struct LiveBankrollBrandMark: View {
  var state: LiveBankrollAttributes.ContentState
  var size: CGFloat
  var minimal: Bool = false

  private var isPaused: Bool {
    state.pokerPaused && state.hasPoker && !state.hasSlots
  }

  private var useWhiteDice: Bool {
    state.hasSlots && !state.hasPoker
  }

  var body: some View {
    TimelineView(.animation(minimumInterval: isPaused ? 60 : 0.35, paused: isPaused)) { context in
      let pulse = isPaused ? 1.0 : breath(at: context.date)
      ZStack {
        Circle()
          .fill(LiveBankrollPalette.accent(for: state).opacity(minimal ? 1 : 0.22 + 0.48 * pulse))
          .scaleEffect(minimal || isPaused ? 1 : 0.82 + 0.22 * pulse)
        if !minimal {
          Group {
            if useWhiteDice {
              LiveBankrollWhiteDice(size: size * 0.72)
            } else {
              Image(systemName: symbolName)
                .font(.system(size: size * 0.62, weight: .bold))
                .foregroundStyle(Color.black)
            }
          }
          .scaleEffect(isPaused ? 1 : 0.94 + 0.08 * pulse)
        }
      }
      .frame(width: size, height: size)
      .clipped()
    }
    .frame(width: size, height: size)
    .accessibilityLabel(state.lockTitle)
  }

  private var symbolName: String {
    if state.hasSlots && state.hasPoker { return "square.on.square.fill" }
    return "suit.spade.fill"
  }

  private func breath(at date: Date) -> CGFloat {
    let phase = date.timeIntervalSinceReferenceDate * 2.8
    return CGFloat((sin(phase) + 1) * 0.5)
  }
}

private struct LiveBankrollWhiteDice: View {
  var size: CGFloat

  var body: some View {
    let pip = size * 0.12
    let offset = size * 0.22
    ZStack {
      RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
        .fill(Color.white)
        .frame(width: size, height: size)
      ForEach(Array(pipCenters.enumerated()), id: \.offset) { _, point in
        Circle()
          .fill(Color.black)
          .frame(width: pip, height: pip)
          .offset(x: point.x * offset, y: point.y * offset)
      }
    }
    .frame(width: size, height: size)
  }

  /// Five-pip face.
  private var pipCenters: [CGPoint] {
    [
      CGPoint(x: -1, y: -1),
      CGPoint(x: 1, y: -1),
      CGPoint(x: 0, y: 0),
      CGPoint(x: -1, y: 1),
      CGPoint(x: 1, y: 1),
    ]
  }
}

private struct LiveBankrollCompactTrailing: View {
  var state: LiveBankrollAttributes.ContentState

  var body: some View {
    if state.isDual {
      Text("2")
        .font(.system(size: 12, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
    } else if let start = state.primaryTimerStart {
      LiveBankrollElapsedText(
        start: start,
        font: .system(size: 12, weight: .semibold, design: .rounded),
        pausedTone: state.pokerPaused && state.hasPoker && !state.hasSlots,
        maxWidth: 44
      )
    }
  }
}

// MARK: - Expanded / Lock

private struct LiveBankrollExpandedTimer: View {
  var state: LiveBankrollAttributes.ContentState

  var body: some View {
    if state.isDual {
      Text("2")
        .font(.title3.weight(.bold))
        .foregroundStyle(.white)
    } else if let start = state.primaryTimerStart {
      LiveBankrollElapsedText(
        start: start,
        font: .title3.weight(.semibold),
        pausedTone: state.pokerPaused && state.hasPoker && !state.hasSlots,
        maxWidth: 72
      )
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
            symbol: nil,
            useWhiteDice: true,
            title: state.slotsLabel.isEmpty ? "Slots" : state.slotsLabel,
            timerStart: state.slotsTimerStart,
            pausedTone: false,
            subtitle: nil
          )
        }
      }
      if state.hasPoker {
        Link(destination: state.pokerWidgetURL) {
          LiveBankrollRow(
            tint: state.pokerPaused ? LiveBankrollPalette.paused : LiveBankrollPalette.poker,
            symbol: "suit.spade.fill",
            useWhiteDice: false,
            title: state.pokerLabel.isEmpty ? "Poker" : state.pokerLabel,
            timerStart: state.pokerTimerStart,
            pausedTone: state.pokerPaused,
            subtitle: state.pokerPaused ? "Paused" : nil
          )
        }
      }
    }
  }
}

private struct LiveBankrollRow: View {
  var tint: Color
  var symbol: String?
  var useWhiteDice: Bool
  var title: String
  var timerStart: Date?
  var pausedTone: Bool
  var subtitle: String?

  var body: some View {
    HStack(spacing: 8) {
      ZStack {
        Circle()
          .fill(tint.opacity(0.28))
          .frame(width: 22, height: 22)
        if useWhiteDice {
          LiveBankrollWhiteDice(size: 14)
        } else if let symbol {
          Image(systemName: symbol)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(Color.black)
        }
      }
      VStack(alignment: .leading, spacing: 1) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
        if let subtitle {
          Text(subtitle)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tint)
        }
      }
      Spacer(minLength: 8)
      if let timerStart {
        LiveBankrollElapsedText(
          start: timerStart,
          font: .subheadline.weight(.semibold),
          pausedTone: pausedTone,
          maxWidth: 56
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
        if !state.isDual, let start = state.primaryTimerStart {
          LiveBankrollElapsedText(
            start: start,
            font: .title3.weight(.semibold),
            pausedTone: state.pokerPaused && state.hasPoker && !state.hasSlots,
            maxWidth: 72
          )
        } else if state.isDual {
          Text("2")
            .font(.title3.weight(.bold))
            .foregroundStyle(.white)
        }
      }
      LiveBankrollExpandedRows(state: state)
    }
    .padding(16)
    .activityBackgroundTint(Color.black.opacity(0.55))
    .activitySystemActionForegroundColor(.white)
  }
}
