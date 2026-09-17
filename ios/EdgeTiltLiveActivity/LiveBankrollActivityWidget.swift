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
        // Keep under the leading lobe so the circle isn't clipped by the Island.
        LiveBankrollBrandMark(state: context.state, size: 22)
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

/// Circular accent behind glyph. Live pulse via SF Symbol effects (TimelineView
/// breath does not run on the Island / Lock Screen). Slots uses a white die;
/// poker / dual uses a four-suit cluster.
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

  private var shouldPulse: Bool {
    !minimal && !isPaused
  }

  var body: some View {
    let circleSize = size * (minimal ? 1 : 0.86)
    ZStack {
      Image(systemName: "circle.fill")
        .font(.system(size: circleSize))
        .foregroundStyle(LiveBankrollPalette.accent(for: state).opacity(minimal ? 1 : 0.38))
        .symbolEffect(.pulse, options: .repeating.speed(0.7), isActive: shouldPulse)
      if !minimal {
        if useWhiteDice {
          // Custom die isn't an SF Symbol … pulse comes from the circle behind it.
          LiveBankrollWhiteDice(size: size * 0.62)
        } else {
          // Suit cluster is multi-Image … pulse comes from the circle behind it.
          LiveBankrollSuitCluster(size: size * 0.72)
        }
      }
    }
    .frame(width: size, height: size)
    .accessibilityLabel(state.lockTitle)
  }
}

/// Black spade · red heart · green club · blue diamond, slightly overlapping.
private struct LiveBankrollSuitCluster: View {
  var size: CGFloat

  private struct SuitSpec {
    let name: String
    let color: Color
    let dx: CGFloat
    let dy: CGFloat
  }

  private var suits: [SuitSpec] {
    let o = size * 0.16
    return [
      SuitSpec(name: "suit.spade.fill", color: .black, dx: -o, dy: -o * 0.85),
      SuitSpec(name: "suit.heart.fill", color: Color(red: 0.92, green: 0.22, blue: 0.28), dx: o, dy: -o * 0.85),
      SuitSpec(name: "suit.club.fill", color: Color(red: 0.18, green: 0.72, blue: 0.38), dx: -o, dy: o * 0.85),
      SuitSpec(name: "suit.diamond.fill", color: Color(red: 0.22, green: 0.48, blue: 0.98), dx: o, dy: o * 0.85),
    ]
  }

  var body: some View {
    let glyph = size * 0.46
    ZStack {
      ForEach(Array(suits.enumerated()), id: \.offset) { _, suit in
        Image(systemName: suit.name)
          .font(.system(size: glyph, weight: .bold))
          .foregroundStyle(suit.color)
          .shadow(color: .black.opacity(0.35), radius: 0.6, x: 0, y: 0.4)
          .offset(x: suit.dx, y: suit.dy)
      }
    }
    .frame(width: size, height: size)
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
    // One session = one row. The old header (EDGE + timer) stacked on
    // ExpandedRows printed the same clock twice on the Lock Screen banner.
    VStack(alignment: .leading, spacing: 8) {
      if state.isDual {
        Text("EDGE")
          .font(.caption.weight(.heavy))
          .foregroundStyle(.white)
      }
      LiveBankrollExpandedRows(state: state)
    }
    .padding(16)
    .activityBackgroundTint(Color.black.opacity(0.55))
    .activitySystemActionForegroundColor(.white)
  }
}
