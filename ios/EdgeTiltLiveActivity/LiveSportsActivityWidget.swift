import ActivityKit
import SwiftUI
import WidgetKit

struct LiveSportsActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveSportsAttributes.self) { context in
      LiveSportsLockScreenView(state: context.state)
        .widgetURL(context.state.widgetURL)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.awayAbbrev.isEmpty ? "AWAY" : context.state.awayAbbrev)
              .font(.caption.weight(.heavy))
              .foregroundStyle(.white)
            Text("\(context.state.awayScore)")
              .font(.title3.weight(.bold).monospacedDigit())
              .foregroundStyle(.white)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 2) {
            Text(context.state.homeAbbrev.isEmpty ? "HOME" : context.state.homeAbbrev)
              .font(.caption.weight(.heavy))
              .foregroundStyle(.white)
            Text("\(context.state.homeScore)")
              .font(.title3.weight(.bold).monospacedDigit())
              .foregroundStyle(.white)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            Text("EDGE")
              .font(.caption2.weight(.heavy))
              .foregroundStyle(.white.opacity(0.7))
            Text(context.state.statusLine)
              .font(.caption2.weight(.semibold))
              .foregroundStyle(.white.opacity(0.85))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(context.state.matchup)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white.opacity(0.75))
            .frame(maxWidth: .infinity)
        }
      } compactLeading: {
        Text(context.state.compactScore)
          .font(.caption.weight(.bold).monospacedDigit())
          .foregroundStyle(.white)
      } compactTrailing: {
        Text(context.state.clock.isEmpty ? context.state.period : context.state.clock)
          .font(.caption2.weight(.semibold).monospacedDigit())
          .foregroundStyle(.white.opacity(0.9))
          .lineLimit(1)
          .frame(maxWidth: 52, alignment: .trailing)
      } minimal: {
        Text(context.state.compactScore)
          .font(.system(size: 10, weight: .bold).monospacedDigit())
          .foregroundStyle(.white)
      }
      .keylineTint(Color(red: 0.98, green: 0.35, blue: 0.42))
      .widgetURL(context.state.widgetURL)
    }
  }
}

private struct LiveSportsLockScreenView: View {
  var state: LiveSportsAttributes.ContentState

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(state.matchup)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
        Text(state.compactScore)
          .font(.title2.weight(.bold).monospacedDigit())
        Text(state.statusLine)
          .font(.caption2.weight(.medium))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      Text("EDGE")
        .font(.caption.weight(.heavy))
        .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .activityBackgroundTint(Color.black.opacity(0.85))
  }
}
