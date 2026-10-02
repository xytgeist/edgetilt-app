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
          LiveSportsExpandedSide(
            logoUrl: context.state.awayLogoUrl,
            abbrev: context.state.awayAbbrev,
            score: context.state.awayScore,
            align: .leading
          )
        }
        DynamicIslandExpandedRegion(.trailing) {
          LiveSportsExpandedSide(
            logoUrl: context.state.homeLogoUrl,
            abbrev: context.state.homeAbbrev,
            score: context.state.homeScore,
            align: .trailing
          )
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 1) {
            Text("EDGE")
              .font(.system(size: 9, weight: .semibold))
              .foregroundStyle(.white.opacity(0.55))
              .tracking(0.6)
            Text(context.state.clockLine)
              .font(.caption.weight(.semibold).monospacedDigit())
              .foregroundStyle(.white)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            if !context.state.leagueLabel.isEmpty {
              Text(context.state.leagueLabel)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.white.opacity(0.45))
            }
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          if !context.state.detail.isEmpty {
            Text(context.state.detail)
              .font(.caption2.weight(.medium))
              .foregroundStyle(.white.opacity(0.65))
              .lineLimit(1)
              .frame(maxWidth: .infinity)
          }
        }
      } compactLeading: {
        HStack(spacing: 4) {
          LiveSportsTeamLogo(urlString: context.state.awayLogoUrl, abbrev: context.state.awayAbbrev, size: 18)
          Text("\(context.state.awayScore)")
            .font(.caption.weight(.bold).monospacedDigit())
            .foregroundStyle(.white)
        }
      } compactTrailing: {
        HStack(spacing: 4) {
          Text("\(context.state.homeScore)")
            .font(.caption.weight(.bold).monospacedDigit())
            .foregroundStyle(.white)
          LiveSportsTeamLogo(urlString: context.state.homeLogoUrl, abbrev: context.state.homeAbbrev, size: 18)
        }
      } minimal: {
        LiveSportsTeamLogo(urlString: context.state.awayLogoUrl, abbrev: context.state.awayAbbrev, size: 14)
      }
      // Soft blue rim … closer to Prime Video Island chrome than our bankroll rose tint.
      .keylineTint(Color(red: 0.45, green: 0.72, blue: 0.95))
      .widgetURL(context.state.widgetURL)
    }
  }
}

// MARK: - Shared marks

private struct LiveSportsTeamLogo: View {
  var urlString: String
  var abbrev: String
  var size: CGFloat = 24

  var body: some View {
    Group {
      if let url = URL(string: urlString), !urlString.isEmpty {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image):
            image
              .resizable()
              .scaledToFit()
          default:
            abbrevBadge
          }
        }
      } else {
        abbrevBadge
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  private var abbrevBadge: some View {
    Text(abbrev.isEmpty ? "?" : String(abbrev.prefix(3)))
      .font(.system(size: max(8, size * 0.34), weight: .bold))
      .foregroundStyle(.white.opacity(0.9))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Circle().fill(Color.white.opacity(0.14)))
  }
}

private enum LiveSportsSideAlign {
  case leading
  case trailing
}

private struct LiveSportsExpandedSide: View {
  var logoUrl: String
  var abbrev: String
  var score: Int
  var align: LiveSportsSideAlign

  var body: some View {
    HStack(spacing: 6) {
      if align == .leading {
        markStack
        scoreText
      } else {
        scoreText
        markStack
      }
    }
  }

  private var markStack: some View {
    VStack(spacing: 2) {
      LiveSportsTeamLogo(urlString: logoUrl, abbrev: abbrev, size: 28)
      Text(abbrev.isEmpty ? "—" : abbrev)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(.white.opacity(0.55))
        .lineLimit(1)
    }
  }

  private var scoreText: some View {
    Text("\(score)")
      .font(.title2.weight(.bold).monospacedDigit())
      .foregroundStyle(.white)
  }
}

// MARK: - Lock Screen (Prime-style board)

private struct LiveSportsLockScreenView: View {
  var state: LiveSportsAttributes.ContentState

  var body: some View {
    VStack(spacing: 8) {
      Text("EDGE")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(.white.opacity(0.7))
        .tracking(0.8)
        .frame(maxWidth: .infinity)

      HStack(alignment: .center, spacing: 0) {
        lockTeam(logoUrl: state.awayLogoUrl, abbrev: state.awayAbbrev, score: state.awayScore, align: .leading)
        Spacer(minLength: 8)
        VStack(spacing: 2) {
          Text(state.clockLine)
            .font(.subheadline.weight(.semibold).monospacedDigit())
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
          if !state.leagueLabel.isEmpty {
            Text(state.leagueLabel)
              .font(.caption2.weight(.medium))
              .foregroundStyle(.white.opacity(0.45))
          }
        }
        Spacer(minLength: 8)
        lockTeam(logoUrl: state.homeLogoUrl, abbrev: state.homeAbbrev, score: state.homeScore, align: .trailing)
      }

      if !state.detail.isEmpty {
        Text(state.detail)
          .font(.caption2.weight(.medium))
          .foregroundStyle(.white.opacity(0.55))
          .lineLimit(1)
          .frame(maxWidth: .infinity)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .activityBackgroundTint(Color.black)
  }

  @ViewBuilder
  private func lockTeam(logoUrl: String, abbrev: String, score: Int, align: LiveSportsSideAlign) -> some View {
    HStack(spacing: 8) {
      if align == .leading {
        VStack(spacing: 3) {
          LiveSportsTeamLogo(urlString: logoUrl, abbrev: abbrev, size: 34)
          Text(abbrev.isEmpty ? "—" : abbrev)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white.opacity(0.55))
        }
        Text("\(score)")
          .font(.system(size: 34, weight: .bold).monospacedDigit())
          .foregroundStyle(.white)
      } else {
        Text("\(score)")
          .font(.system(size: 34, weight: .bold).monospacedDigit())
          .foregroundStyle(.white)
        VStack(spacing: 3) {
          LiveSportsTeamLogo(urlString: logoUrl, abbrev: abbrev, size: 34)
          Text(abbrev.isEmpty ? "—" : abbrev)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white.opacity(0.55))
        }
      }
    }
  }
}
