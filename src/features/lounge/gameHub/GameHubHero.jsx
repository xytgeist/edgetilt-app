import {
  LoungeSportsTeamLogo,
  useLoungeSportsPillWashAndLogos,
} from '../loungeSportsPillPaint.jsx'
import {
  downDistanceLabel,
  fieldPercent,
  formatKickoff,
  liveClockLabel,
  scoreText,
  yardLineLabel,
} from './gameHubFormatters.js'

const FOOTBALL_POSSESSION_ICON = '/sports/nfl/icons/football-possession.png'
const TIMEOUT_SLOTS = 3

function TimeoutDots({ remaining, align = 'left' }) {
  const left = remaining == null ? TIMEOUT_SLOTS : Math.max(0, Math.min(TIMEOUT_SLOTS, Math.round(remaining)))
  return (
    <div
      className={`mt-1.5 flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      aria-label={`${left} timeout${left === 1 ? '' : 's'} remaining`}
    >
      {Array.from({ length: TIMEOUT_SLOTS }, (_, i) => {
        const available = i < left
        return (
          <span
            key={i}
            className={
              available
                ? 'h-1.5 w-1.5 rounded-full bg-white'
                : 'h-1.5 w-1.5 rounded-full border border-white/70 bg-transparent'
            }
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
}

function PossessionFootball({ side }) {
  return (
    <img
      src={FOOTBALL_POSSESSION_ICON}
      alt=""
      aria-hidden="true"
      title={`${side} possession`}
      className="h-[14px] w-[14px] shrink-0 brightness-0 invert drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
    />
  )
}

function FieldViz({ game, live }) {
  if (!String(game.sport_key || '').includes('football')) return null
  if (game.status === 'pre') return null
  const pos = fieldPercent(live)
  const hasLine = pos != null

  // Map 0..100 between the goal lines at mid-turf depth (perspective slants the lines).
  const scrimLeft = hasLine ? 15.4 + (pos / 100) * 68.6 : null

  // First down line
  let firstDownLeft = null
  if (hasLine && live?.down && live?.distance && Number.isFinite(Number(live.distance))) {
    const dist = Number(live.distance)
    const dir = live.possession === 'home' ? -1 : 1
    const targetPos = Math.max(0, Math.min(100, pos + dir * dist))
    firstDownLeft = 15.4 + (targetPos / 100) * 68.6
  }

  return (
    <div data-lounge-game-field className="relative w-full px-1 pb-1 pt-0 sm:px-2">
      <div className="relative w-full overflow-hidden">
        {/* Floating field base graphic */}
        <img
          src="/sports/nfl/gamecast-field-floating.png"
          alt="Gamecast Field"
          className="pointer-events-none block w-full select-none"
        />

        {/* Dynamic overlay plane matching turf bounds on this cutout */}
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{ top: '36.8%', height: '56.7%' }}
        >
          {/* First down line (yellow) */}
          {firstDownLeft != null ? (
            <div
              className="absolute bottom-0 top-0 w-[3px] -translate-x-1/2 bg-yellow-300 drop-shadow-[0_0_6px_rgba(253,224,71,0.9)]"
              style={{ left: `${firstDownLeft}%` }}
            />
          ) : null}

          {/* Line of scrimmage (light blue) */}
          {scrimLeft != null ? (
            <div
              className="absolute bottom-0 top-0 w-[3px] -translate-x-1/2 bg-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.9)]"
              style={{ left: `${scrimLeft}%` }}
            >
              {/* Ball marker */}
              <div className="absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-zinc-950/80 shadow-md">
                <img
                  src={FOOTBALL_POSSESSION_ICON}
                  alt=""
                  className="h-3 w-3 brightness-0 invert"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * One bets bar (away left / home right). Money lives in the side pair `bets·$`
 * under each abbrev … no second rail, no seam tick.
 */
function HeroPublicBetting({ game, splits, awayColor, homeColor }) {
  if (!splits) return null
  // Live: clock / down-distance own the chrome … hide public bets/$ bar.
  if (game?.status === 'in') return null
  const awayBets = Math.max(0, Math.min(100, Number(splits.away_ticket_pct)))
  const homeBets = Math.max(0, Math.min(100, Number(splits.home_ticket_pct)))
  const awayMoney = Math.max(0, Math.min(100, Number(splits.away_handle_pct)))
  const homeMoney = Math.max(0, Math.min(100, Number(splits.home_handle_pct)))
  if ([awayBets, homeBets, awayMoney, homeMoney].some((n) => Number.isNaN(n))) return null

  const moneySkew =
    Math.abs(awayMoney - awayBets) >= 12 || Boolean(splits.is_fade_public)
  const awayTint = awayColor || '#ef4444'
  const homeTint = homeColor || '#22c55e'

  return (
    <div data-lounge-game-hero-splits className="px-4 pb-2.5 pt-0.5">
      <div
        className={`relative h-[7px] overflow-hidden rounded-full bg-black/25 ring-1 ring-inset ${
          moneySkew ? 'ring-amber-300/45' : 'ring-white/15'
        }`}
        title="% of bets"
      >
        <div className="absolute inset-0 flex">
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${awayBets}%`,
              background: `linear-gradient(90deg, ${awayTint}bb, ${awayTint})`,
            }}
          />
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${homeBets}%`,
              background: `linear-gradient(90deg, ${homeTint}, ${homeTint}bb)`,
            }}
          />
        </div>
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0 text-left">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 drop-shadow">
            {game.away?.abbrev}
          </div>
          <div className="mt-0.5 text-[12px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
            {Math.round(awayBets)}
            <span className="mx-0.5 font-semibold text-white/40">·</span>
            <span className={moneySkew ? 'text-amber-200' : 'text-white/75'}>
              {Math.round(awayMoney)}
            </span>
          </div>
        </div>
        <div className="pt-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-white/40">
          <div>{moneySkew ? 'Public · $ split' : 'Public'}</div>
          <div className="mt-0.5 font-medium normal-case tracking-normal text-white/30">bets · $</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 drop-shadow">
            {game.home?.abbrev}
          </div>
          <div className="mt-0.5 text-[12px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
            {Math.round(homeBets)}
            <span className="mx-0.5 font-semibold text-white/40">·</span>
            <span className={moneySkew ? 'text-amber-200' : 'text-white/75'}>
              {Math.round(homeMoney)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * X-style split team-color hero. Same silver gridiron + multiply washes as Lounge
 * post game cards. `topBar` sits inside the wash so colors run under the status row.
 */
export default function GameHubHero({
  game,
  live,
  lastPlay,
  topBar = null,
  splits = null,
}) {
  const { awayColor, homeColor, awayTreatment, homeTreatment } = useLoungeSportsPillWashAndLogos(game)
  const clock = liveClockLabel(game, live)
  const down = downDistanceLabel(live)
  const yard = yardLineLabel(game, live)
  const kickoff = game.status === 'pre' ? formatKickoff(game.commence_time) : ''
  const isFootball = String(game.sport_key || '').includes('football')
  const showLiveChrome = isFootball && game.status === 'in'
  const awayHasBall = showLiveChrome && live?.possession === 'away'
  const homeHasBall = showLiveChrome && live?.possession === 'home'
  const awayTimeouts = showLiveChrome ? (live?.away_timeouts ?? TIMEOUT_SLOTS) : null
  const homeTimeouts = showLiveChrome ? (live?.home_timeouts ?? TIMEOUT_SLOTS) : null

  return (
    <div
      data-lounge-game-hero
      className="relative overflow-hidden"
      style={{
        '--hero-away': awayColor,
        '--hero-home': homeColor,
      }}
    >
      <span data-lounge-game-hero-field aria-hidden="true" />
      <span data-lounge-game-hero-away aria-hidden="true" />
      <span data-lounge-game-hero-home aria-hidden="true" />
      <span data-lounge-game-hero-seam aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-b from-black/15 via-black/28 to-zinc-950" />

      {topBar ? <div className="relative z-[4]">{topBar}</div> : null}

      <div className="relative z-[4] px-4 pb-2 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={52} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold uppercase tracking-wide text-white/80">
                {game.away?.abbrev}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="text-[40px] font-bold leading-none tabular-nums text-white drop-shadow">
                  {scoreText(game.away, game.status)}
                </div>
                {awayHasBall ? <PossessionFootball side="away" /> : null}
              </div>
              {awayTimeouts != null ? <TimeoutDots remaining={awayTimeouts} align="left" /> : null}
            </div>
          </div>

          <div className="flex max-w-[38%] flex-col items-center gap-0.5 px-1 text-center">
            <span
              className={`text-[13px] font-bold tracking-wide ${
                game.status === 'in' ? 'text-rose-300' : 'text-white/85'
              }`}
            >
              {clock}
            </span>
            {down ? <span className="text-[12px] font-semibold text-white/90">{down}</span> : null}
            {yard ? <span className="text-[12px] font-semibold text-white/70">{yard}</span> : null}
            {kickoff ? <span className="text-[11px] font-medium text-white/70">{kickoff}</span> : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
            <LoungeSportsTeamLogo side={game.home} treatment={homeTreatment} size={52} />
            <div className="min-w-0 text-right">
              <div className="truncate text-[13px] font-semibold uppercase tracking-wide text-white/80">
                {game.home?.abbrev}
              </div>
              <div className="flex items-center justify-end gap-1.5">
                {homeHasBall ? <PossessionFootball side="home" /> : null}
                <div className="text-[40px] font-bold leading-none tabular-nums text-white drop-shadow">
                  {scoreText(game.home, game.status)}
                </div>
              </div>
              {homeTimeouts != null ? <TimeoutDots remaining={homeTimeouts} align="right" /> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-[4]">
        <HeroPublicBetting
          game={game}
          splits={splits}
          awayColor={awayColor}
          homeColor={homeColor}
        />
        <FieldViz game={game} live={live} />
      </div>

      {lastPlay ? (
        <div className="relative z-[4] truncate px-4 pb-3 text-[12px] text-white/75">
          <span className="font-semibold uppercase tracking-wide text-white/55">Last play </span>
          {lastPlay}
        </div>
      ) : null}
    </div>
  )
}
