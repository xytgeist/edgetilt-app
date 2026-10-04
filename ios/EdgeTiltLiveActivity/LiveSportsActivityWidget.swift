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
            sportKey: context.state.sportKey,
            score: context.state.awayScore,
            align: .leading
          )
        }
        DynamicIslandExpandedRegion(.trailing) {
          LiveSportsExpandedSide(
            logoUrl: context.state.homeLogoUrl,
            abbrev: context.state.homeAbbrev,
            sportKey: context.state.sportKey,
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
        // Shared island (CallKit / another Live Activity) shrinks each lobe. Logo+score
        // on both sides overflow … trailing goes empty and leading clips to a lone mark.
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 3) {
            LiveSportsTeamLogo(
              urlString: context.state.awayLogoUrl,
              abbrev: context.state.awayAbbrev,
              sportKey: context.state.sportKey,
              size: 16
            )
            LiveSportsCompactScoreText("\(context.state.awayScore)")
          }
          LiveSportsTeamLogo(
            urlString: context.state.awayLogoUrl,
            abbrev: context.state.awayAbbrev,
            sportKey: context.state.sportKey,
            size: 16
          )
        }
      } compactTrailing: {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 3) {
            LiveSportsCompactScoreText("\(context.state.homeScore)")
            LiveSportsTeamLogo(
              urlString: context.state.homeLogoUrl,
              abbrev: context.state.homeAbbrev,
              sportKey: context.state.sportKey,
              size: 16
            )
          }
          LiveSportsCompactScoreText(context.state.compactScore)
        }
      } minimal: {
        // Shared island uses this circle. Keep a tight mark so the pill does not stretch empty.
        LiveSportsTeamLogo(
          urlString: context.state.awayLogoUrl,
          abbrev: context.state.awayAbbrev,
          sportKey: context.state.sportKey,
          size: 12
        )
      }
      .keylineTint(Color(red: 0.45, green: 0.72, blue: 0.95))
      .widgetURL(context.state.widgetURL)
    }
  }
}

// MARK: - Shared marks

private struct LiveSportsCompactScoreText: View {
  var text: String

  init(_ text: String) {
    self.text = text
  }

  var body: some View {
    Text(text)
      .font(.caption2.weight(.bold).monospacedDigit())
      .foregroundStyle(.white)
      .lineLimit(1)
      .minimumScaleFactor(0.55)
  }
}

private struct LiveSportsTeamLogo: View {
  var urlString: String
  var abbrev: String
  var sportKey: String
  var size: CGFloat = 24

  var body: some View {
    Group {
      if let image = TeamLogoBundle.uiImage(abbrev: abbrev, sportKey: sportKey, maxPointSize: size) {
        Image(uiImage: image)
          .renderingMode(.original)
          .resizable()
          .scaledToFit()
      } else if let url = URL(string: urlString), !urlString.isEmpty {
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
    .clipped()
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
  var sportKey: String
  var score: Int
  var align: LiveSportsSideAlign

  private var hasBundledLogo: Bool {
    TeamLogoBundle.hasLogo(abbrev: abbrev, sportKey: sportKey)
  }

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
      LiveSportsTeamLogo(urlString: logoUrl, abbrev: abbrev, sportKey: sportKey, size: 28)
      if hasBundledLogo || !logoUrl.isEmpty {
        Text(abbrev.isEmpty ? "-" : abbrev)
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(.white.opacity(0.55))
          .lineLimit(1)
      }
    }
  }

  private var scoreText: some View {
    Text("\(score)")
      .font(.title2.weight(.bold).monospacedDigit())
      .foregroundStyle(.white)
  }
}

// MARK: - Lock Screen

private struct LiveSportsLockScreenView: View {
  var state: LiveSportsAttributes.ContentState

  private var possession: String { state.possessionSide }
  private var totalLine: String {
    (state.totalLine ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  var body: some View {
    VStack(spacing: 8) {
      Text("EDGE")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(.white.opacity(0.7))
        .tracking(0.8)
        .frame(maxWidth: .infinity)

      HStack(alignment: .center, spacing: 0) {
        lockTeam(
          logoUrl: state.awayLogoUrl,
          abbrev: state.awayAbbrev,
          sportKey: state.sportKey,
          score: state.awayScore,
          spread: state.awaySpread ?? "",
          ml: state.awayMl ?? "",
          hasBall: possession == "away",
          align: .leading
        )
        Spacer(minLength: 8)
        VStack(spacing: 2) {
          Text(state.clockLine)
            .font(.subheadline.weight(.semibold).monospacedDigit())
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
          if !totalLine.isEmpty {
            Text(totalLine)
              .font(.caption2.weight(.semibold).monospacedDigit())
              .foregroundStyle(.white.opacity(0.7))
              .lineLimit(1)
          }
          if !state.leagueLabel.isEmpty {
            Text(state.leagueLabel)
              .font(.system(size: 9, weight: .medium))
              .foregroundStyle(.white.opacity(0.45))
          }
        }
        Spacer(minLength: 8)
        lockTeam(
          logoUrl: state.homeLogoUrl,
          abbrev: state.homeAbbrev,
          sportKey: state.sportKey,
          score: state.homeScore,
          spread: state.homeSpread ?? "",
          ml: state.homeMl ?? "",
          hasBall: possession == "home",
          align: .trailing
        )
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
  private func lockTeam(
    logoUrl: String,
    abbrev: String,
    sportKey: String,
    score: Int,
    spread: String,
    ml: String,
    hasBall: Bool,
    align: LiveSportsSideAlign
  ) -> some View {
    let showCaption = TeamLogoBundle.hasLogo(abbrev: abbrev, sportKey: sportKey) || !logoUrl.isEmpty
    let spreadTrim = spread.trimmingCharacters(in: .whitespacesAndNewlines)
    let mlTrim = ml.trimmingCharacters(in: .whitespacesAndNewlines)

    HStack(spacing: 8) {
      if align == .leading {
        markColumn(logoUrl: logoUrl, abbrev: abbrev, sportKey: sportKey, showCaption: showCaption, hasBall: hasBall)
        scoreColumn(score: score, spread: spreadTrim, ml: mlTrim, align: .leading)
      } else {
        scoreColumn(score: score, spread: spreadTrim, ml: mlTrim, align: .trailing)
        markColumn(logoUrl: logoUrl, abbrev: abbrev, sportKey: sportKey, showCaption: showCaption, hasBall: hasBall)
      }
    }
  }

  @ViewBuilder
  private func markColumn(
    logoUrl: String,
    abbrev: String,
    sportKey: String,
    showCaption: Bool,
    hasBall: Bool
  ) -> some View {
    VStack(spacing: 3) {
      ZStack(alignment: .topTrailing) {
        LiveSportsTeamLogo(urlString: logoUrl, abbrev: abbrev, sportKey: sportKey, size: 34)
        if hasBall {
          Image(systemName: "football.fill")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(Color.orange)
            .shadow(color: .black.opacity(0.55), radius: 1, y: 0.5)
            .offset(x: 4, y: -4)
            .accessibilityLabel("Possession")
        }
      }
      if showCaption {
        Text(abbrev.isEmpty ? "-" : abbrev)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.white.opacity(0.55))
      }
    }
  }

  @ViewBuilder
  private func scoreColumn(score: Int, spread: String, ml: String, align: LiveSportsSideAlign) -> some View {
    VStack(spacing: 2) {
      if !spread.isEmpty {
        Text(spread)
          .font(.system(size: 11, weight: .semibold).monospacedDigit())
          .foregroundStyle(.white.opacity(0.7))
      }
      Text("\(score)")
        .font(.system(size: 34, weight: .bold).monospacedDigit())
        .foregroundStyle(.white)
      if !ml.isEmpty {
        Text(ml)
          .font(.system(size: 11, weight: .semibold).monospacedDigit())
          .foregroundStyle(.white.opacity(0.65))
      }
    }
    .frame(minWidth: 44, alignment: align == .leading ? .leading : .trailing)
  }
}
