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

// 21 yard lines (every 5 yards from 0 to 100, including goal lines)
const YARD_LINES = Array.from({ length: 21 }, (_, i) => {
  const p = i * 5
  const isGoal = p === 0 || p === 100
  const isMajor = p % 10 === 0
  const xTop = 239.0 + (p / 100.0) * 784.0
  const xBot = 161.0 + (p / 100.0) * 937.0
  return { p, isGoal, isMajor, xTop, xBot }
})

// Numbers strictly on the 10-yard lines: 10, 20, 30, 40, 50, 40, 30, 20, 10
const Y_NUM = 446
const T_NUM = (Y_NUM - 191) / (478 - 191)

const YARD_MARKERS = [
  { p: 10, label: '10', dir: 'left' },
  { p: 20, label: '20', dir: 'left' },
  { p: 30, label: '30', dir: 'left' },
  { p: 40, label: '40', dir: 'left' },
  { p: 50, label: '50', dir: 'none' },
  { p: 60, label: '40', dir: 'right' },
  { p: 70, label: '30', dir: 'right' },
  { p: 80, label: '20', dir: 'right' },
  { p: 90, label: '10', dir: 'right' },
].map(({ p, label, dir }) => {
  const xTop = 239.0 + (p / 100.0) * 784.0
  const xBot = 161.0 + (p / 100.0) * 937.0
  const x = xTop * (1 - T_NUM) + xBot * T_NUM
  return { p, label, dir, x }
})

function FieldViz({ game, live, awayColor, homeColor }) {
  if (!String(game.sport_key || '').includes('football')) return null
  if (game.status === 'pre') return null
  const pos = fieldPercent(live)
  const hasLine = pos != null

  // Calibrated 3D field coordinates (viewBox="0 0 1266 533")
  // Left Goal Line: top=(239.0, 191), bot=(161.0, 478)
  // Right Goal Line: top=(1023.0, 191), bot=(1098.0, 478)
  const scrimTop = hasLine ? 239.0 + (pos / 100) * 784.0 : null
  const scrimBot = hasLine ? 161.0 + (pos / 100) * 937.0 : null
  const scrimMidX = hasLine ? (scrimTop + scrimBot) / 2 : null

  // First down line
  let firstDownTop = null
  let firstDownBot = null
  if (hasLine && live?.down && live?.distance && Number.isFinite(Number(live.distance))) {
    const dist = Number(live.distance)
    const dir = live.possession === 'home' ? -1 : 1
    const targetPos = Math.max(0, Math.min(100, pos + dir * dist))
    firstDownTop = 239.0 + (targetPos / 100) * 784.0
    firstDownBot = 161.0 + (targetPos / 100) * 937.0
  }

  const awayTint = awayColor || '#ef4444'
  const homeTint = homeColor || '#22c55e'
  const awayAbbrev = game.away?.abbrev || ''
  const homeAbbrev = game.home?.abbrev || ''
  const homeLogoSrc = game.home?.logo || ''

  return (
    <div data-lounge-game-field className="relative w-full px-1 pb-1 pt-0 sm:px-2">
      <div className="relative w-full overflow-hidden">
        {/* Layer 1: Floating field base graphic */}
        <img
          src="/sports/nfl/gamecast-field-floating.png?v=612"
          alt="Gamecast Field"
          className="pointer-events-none block w-full select-none"
        />

        {/* Layer 2: Dynamic SVG overlay plane matching 3D field coordinates */}
        <svg
          viewBox="0 0 1266 533"
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="glow-scrim" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-1st" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="text-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Away Endzone Paint (rounded 6-segment path) */}
          <path
            d="M 239 191 L 168 191 Q 150 193 147 197 L 56 469 Q 58 477 68 478 L 161 478 Z"
            fill={awayTint}
            fillOpacity="0.82"
            style={{ mixBlendMode: 'multiply' }}
          />

          {/* Away Endzone Wordmark / Abbreviation */}
          {awayAbbrev ? (
            <g transform="translate(150, 335) skewY(-15) scale(1, 0.85)">
              <text
                x="0"
                y="11"
                textAnchor="middle"
                fill="#ffffff"
                fillOpacity="0.92"
                fontFamily="Impact, Arial Black, sans-serif"
                fontSize={awayAbbrev.length > 3 ? '32' : '42'}
                letterSpacing="3"
                filter="url(#text-shadow)"
              >
                {awayAbbrev}
              </text>
            </g>
          ) : null}

          {/* Home Endzone Paint (rounded 6-segment path) */}
          <path
            d="M 1023 191 L 1096 191 Q 1113 193 1116 197 L 1208 469 Q 1205 477 1193 478 L 1098 478 Z"
            fill={homeTint}
            fillOpacity="0.82"
            style={{ mixBlendMode: 'multiply' }}
          />

          {/* Home Endzone Wordmark / Abbreviation */}
          {homeAbbrev ? (
            <g transform="translate(1115, 335) skewY(15) scale(1, 0.85)">
              <text
                x="0"
                y="11"
                textAnchor="middle"
                fill="#ffffff"
                fillOpacity="0.92"
                fontFamily="Impact, Arial Black, sans-serif"
                fontSize={homeAbbrev.length > 3 ? '32' : '42'}
                letterSpacing="3"
                filter="url(#text-shadow)"
              >
                {homeAbbrev}
              </text>
            </g>
          ) : null}

          {/* Midfield Home Logo (perspective flattened on the 50-yd line) */}
          {homeLogoSrc ? (
            <g transform="translate(628.7, 334.5) scale(1, 0.72) translate(-628.7, -334.5)">
              <image
                href={homeLogoSrc}
                x={628.7 - 38}
                y={334.5 - 38}
                width="76"
                height="76"
                preserveAspectRatio="xMidYMid meet"
                opacity="0.85"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }}
              />
            </g>
          ) : null}

          {/* Outer Field Perimeter: Sidelines & Endlines */}
          <line x1="168" y1="191" x2="1096" y2="191" stroke="#ffffff" strokeWidth="2.2" strokeOpacity="0.85" />
          <line x1="68" y1="478" x2="1193" y2="478" stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.85" />
          <line x1="168" y1="191" x2="68" y2="478" stroke="#ffffff" strokeWidth="2.2" strokeOpacity="0.80" />
          <line x1="1096" y1="191" x2="1193" y2="478" stroke="#ffffff" strokeWidth="2.2" strokeOpacity="0.80" />

          {/* 21 Yard Lines (every 5 yards from 0 to 100, including Goal Lines) */}
          {YARD_LINES.map(({ p, isGoal, isMajor, xTop, xBot }) => (
            <line
              key={p}
              x1={xTop.toFixed(1)}
              y1="191"
              x2={xBot.toFixed(1)}
              y2="478"
              stroke="#ffffff"
              strokeWidth={isGoal ? '3.0' : isMajor ? '2.2' : '1.5'}
              strokeOpacity={isGoal ? '0.95' : isMajor ? '0.85' : '0.60'}
            />
          ))}

          {/* Numbers strictly on the 10-yard lines */}
          {YARD_MARKERS.map(({ p, label, dir, x }) => (
            <g key={p} filter="url(#text-shadow)">
              <text
                x={x.toFixed(1)}
                y="450"
                textAnchor="middle"
                fill="#ffffff"
                fillOpacity="0.90"
                fontFamily="'Arial Black', Impact, sans-serif"
                fontSize="20"
                fontWeight="900"
                letterSpacing="1"
              >
                {label}
              </text>
              {dir === 'left' ? (
                <polygon
                  points={`${(x - 25).toFixed(1)},444 ${(x - 19).toFixed(1)},440 ${(x - 19).toFixed(1)},448`}
                  fill="#ffffff"
                  fillOpacity="0.85"
                />
              ) : null}
              {dir === 'right' ? (
                <polygon
                  points={`${(x + 25).toFixed(1)},444 ${(x + 19).toFixed(1)},440 ${(x + 19).toFixed(1)},448`}
                  fill="#ffffff"
                  fillOpacity="0.85"
                />
              ) : null}
            </g>
          ))}

          {/* First down line (yellow) */}
          {firstDownTop != null && firstDownBot != null ? (
            <line
              x1={firstDownTop}
              y1={191}
              x2={firstDownBot}
              y2={478}
              stroke="#fde047"
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#glow-1st)"
            />
          ) : null}

          {/* Line of scrimmage (light blue) */}
          {scrimTop != null && scrimBot != null ? (
            <g>
              <line
                x1={scrimTop}
                y1={191}
                x2={scrimBot}
                y2={478}
                stroke="#38bdf8"
                strokeWidth="3.5"
                strokeLinecap="round"
                filter="url(#glow-scrim)"
              />
              {/* Ball marker at mid-depth on scrimmage line */}
              <circle
                cx={scrimMidX}
                cy={334.5}
                r={10.5}
                fill="#09090b"
                stroke="#ffffff"
                strokeWidth="1.5"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
              />
              <image
                href={FOOTBALL_POSSESSION_ICON}
                x={scrimMidX - 7}
                y={334.5 - 7}
                width="14"
                height="14"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </g>
          ) : null}
        </svg>

        {/* Layer 3: Foreground Goalposts Overlay (prevents endzone paint from tinting uprights/pads) */}
        <img
          src="/sports/nfl/gamecast-goalposts-overlay.png?v=612"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 block h-full w-full select-none"
        />
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
        <FieldViz
          game={game}
          live={live}
          awayColor={awayColor}
          homeColor={homeColor}
        />
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
