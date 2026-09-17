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
          VStack(alignment: .leading, spacing: 4) {
            Text("EDGE")
              .font(.caption.weight(.heavy))
              .foregroundStyle(.white)
            Text(context.state.isDual ? "Live sessions" : "Live session")
              .font(.caption2)
              .foregroundStyle(.white.opacity(0.7))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if context.state.isDual {
            Text("2")
              .font(.title3.weight(.bold))
              .foregroundStyle(.white)
          } else if let start = context.state.slotsTimerStart ?? context.state.pokerTimerStart {
            Text(timerInterval: start...Date.distantFuture, countsDown: false)
              .font(.title3.monospacedDigit().weight(.semibold))
              .foregroundStyle(.white)
              .multilineTextAlignment(.trailing)
              .frame(minWidth: 64, alignment: .trailing)
              .monospacedDigit()
          } else if context.state.pokerPaused {
            Text("Paused")
              .font(.caption.weight(.semibold))
              .foregroundStyle(Color(red: 0.98, green: 0.75, blue: 0.35))
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          LiveBankrollExpandedRows(state: context.state)
        }
      } compactLeading: {
        LiveBankrollDot(
          slots: context.state.hasSlots,
          poker: context.state.hasPoker,
          paused: context.state.pokerPaused && !context.state.hasSlots
        )
      } compactTrailing: {
        if context.state.isDual {
          Text("2")
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
        } else if let start = context.state.slotsTimerStart ?? context.state.pokerTimerStart {
          Text(timerInterval: start...Date.distantFuture, countsDown: false)
            .font(.caption.monospacedDigit().weight(.semibold))
            .foregroundStyle(.white)
            .frame(minWidth: 36, alignment: .trailing)
            .minimumScaleFactor(0.7)
        } else {
          Text(context.state.compactLabel)
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
            .minimumScaleFactor(0.7)
        }
      } minimal: {
        LiveBankrollDot(
          slots: context.state.hasSlots,
          poker: context.state.hasPoker,
          paused: context.state.pokerPaused && !context.state.hasSlots
        )
      }
      .widgetURL(context.state.widgetURL)
    }
  }
}

private struct LiveBankrollDot: View {
  var slots: Bool
  var poker: Bool
  var paused: Bool

  var body: some View {
    Circle()
      .fill(color)
      .frame(width: 10, height: 10)
      .opacity(paused ? 0.85 : 1)
  }

  private var color: Color {
    if slots && poker { return Color(red: 0.22, green: 0.85, blue: 0.88) }
    if slots { return Color(red: 0.20, green: 0.84, blue: 0.45) }
    if paused { return Color(red: 0.98, green: 0.75, blue: 0.35) }
    return Color(red: 0.18, green: 0.78, blue: 0.72)
  }
}

private struct LiveBankrollExpandedRows: View {
  var state: LiveBankrollAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if state.hasSlots {
        Link(destination: state.slotsWidgetURL) {
          LiveBankrollRow(
            tint: Color(red: 0.20, green: 0.84, blue: 0.45),
            title: state.slotsLabel.isEmpty ? "Slots" : state.slotsLabel,
            timerStart: state.slotsTimerStart,
            paused: false
          )
        }
      }
      if state.hasPoker {
        Link(destination: state.pokerWidgetURL) {
          LiveBankrollRow(
            tint: state.pokerPaused
              ? Color(red: 0.98, green: 0.75, blue: 0.35)
              : Color(red: 0.18, green: 0.78, blue: 0.72),
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
  var title: String
  var timerStart: Date?
  var paused: Bool

  var body: some View {
    HStack(spacing: 8) {
      Circle()
        .fill(tint)
        .frame(width: 8, height: 8)
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
        Text(timerInterval: timerStart...Date.distantFuture, countsDown: false)
          .font(.subheadline.monospacedDigit().weight(.semibold))
          .foregroundStyle(.white)
          .multilineTextAlignment(.trailing)
      }
    }
  }
}

private struct LiveBankrollLockScreenView: View {
  var state: LiveBankrollAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("EDGE")
          .font(.caption.weight(.heavy))
        Spacer()
        Text(state.isDual ? "2 live" : "Live")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
      }
      LiveBankrollExpandedRows(state: state)
    }
    .padding(16)
    .activityBackgroundTint(Color.black.opacity(0.55))
    .activitySystemActionForegroundColor(.white)
  }
}
