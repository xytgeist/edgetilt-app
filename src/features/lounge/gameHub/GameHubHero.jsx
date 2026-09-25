import {
  LoungeSportsTeamLogo,
  useLoungeSportsPillWashAndLogos,
} from '../loungeSportsPillPaint.jsx'
import {
  CORNER_PYLONS,
  ENDZONE_COORDS,
  resolveEndzoneDesign,
} from './gameHubEndzone.js'
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
      className={`mt-0.5 flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      aria-label={`${left} timeout${left === 1 ? '' : 's'} remaining`}
    >
      {Array.from({ length: TIMEOUT_SLOTS }, (_, i) => {
        const available = i < left
        return (
          <span
            key={i}
            className={
              available
                ? 'h-1 w-3 rounded-[1px] bg-white'
                : 'h-1 w-3 rounded-[1px] border border-white/55 bg-transparent'
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

// Inbound hash marks on either side of the middle of the field (yards 1 to 99, excluding multiples of 5)
// Top hash row: y=281..288 (above midfield logo), Bottom hash row: y=380..389 (below midfield logo)
const INBOUND_HASH_MARKS = (() => {
  const marks = []
  const tTop1 = (281.0 - 191.0) / 287.0
  const tTop2 = (288.0 - 191.0) / 287.0
  const tBot1 = (380.0 - 191.0) / 287.0
  const tBot2 = (389.0 - 191.0) / 287.0

  for (let p = 1; p < 100; p++) {
    if (p % 5 === 0) continue
    const xTop = 239.0 + (p / 100.0) * 784.0
    const xBot = 161.0 + (p / 100.0) * 937.0

    // Top hash mark
    marks.push({
      key: `t-${p}`,
      x1: (xTop * (1 - tTop1) + xBot * tTop1).toFixed(1),
      y1: '281',
      x2: (xTop * (1 - tTop2) + xBot * tTop2).toFixed(1),
      y2: '288',
      strokeWidth: '1.4',
      opacity: '0.65',
    })

    // Bottom hash mark
    marks.push({
      key: `b-${p}`,
      x1: (xTop * (1 - tBot1) + xBot * tBot1).toFixed(1),
      y1: '380',
      x2: (xTop * (1 - tBot2) + xBot * tBot2).toFixed(1),
      y2: '389',
      strokeWidth: '1.6',
      opacity: '0.70',
    })
  }
  return marks
})()

// Numbers strictly on the 10-yard lines: 10, 20, 30, 40, 50, 40, 30, 20, 10
// Near row equidistant between middle of hash mark (y=384.5) and sideline (y=478): y=431.25
const Y_NUM_NEAR = 431.25
const T_NUM_NEAR = (Y_NUM_NEAR - 191) / (478 - 191)

const Y_NUM_FAR = 236
const T_NUM_FAR = (Y_NUM_FAR - 191) / (478 - 191)

// 3D vertical foreshortening factors for ground-painted turf text
const SY_NUM_NEAR = 0.58
const SY_NUM_FAR = 0.54

const YARD_MARKERS_CONFIG = [
  { p: 10, label: '10', dir: 'left' },
  { p: 20, label: '20', dir: 'left' },
  { p: 30, label: '30', dir: 'left' },
  { p: 40, label: '40', dir: 'left' },
  { p: 50, label: '50', dir: 'none' },
  { p: 60, label: '40', dir: 'right' },
  { p: 70, label: '30', dir: 'right' },
  { p: 80, label: '20', dir: 'right' },
  { p: 90, label: '10', dir: 'right' },
]

// Near sideline yard markers (bottom of field) projected flat on 3D turf:
// Horizontal baseline parallel to sideline, vertical strokes sheared to match yard line slant
const YARD_MARKERS_NEAR = YARD_MARKERS_CONFIG.map(({ p, label, dir }) => {
  const xTop = 239.0 + (p / 100.0) * 784.0
  const xBot = 161.0 + (p / 100.0) * 937.0
  const x = xTop * (1 - T_NUM_NEAR) + xBot * T_NUM_NEAR
  const skewAngle = -Math.atan2(xTop - xBot, 287.0) * (180 / Math.PI)
  return { p, label, dir, x, skewAngle }
})

// Far sideline yard markers (opposite/top of field) projected flat on 3D turf:
// Flipped 180 (facing sideline), horizontal baseline, sheared along yard line slant
const YARD_MARKERS_FAR = YARD_MARKERS_CONFIG.map(({ p, label, dir }) => {
  const xTop = 239.0 + (p / 100.0) * 784.0
  const xBot = 161.0 + (p / 100.0) * 937.0
  const x = xTop * (1 - T_NUM_FAR) + xBot * T_NUM_FAR
  const skewAngle = -Math.atan2(xTop - xBot, 287.0) * (180 / Math.PI)
  return { p, label, dir, x, skewAngle }
})

function FieldViz({ game, live, awayColor, homeColor }) {
  const sportKey = String(game?.sport_key || '').toLowerCase()
  const isFootball = sportKey.includes('football') || (!sportKey && Boolean(game?.away && game?.home))
  if (!isFootball) return null

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

  const homeLogoSrc = game?.home?.logo || (game?.home?.abbrev ? `/sports/nfl/logos/${game.home.abbrev}.png` : '')
  const awayEndzone = resolveEndzoneDesign(game?.away, awayColor, 'left')
  const homeEndzone = resolveEndzoneDesign(game?.home, homeColor, 'right')

  return (
    <div data-lounge-game-field className="relative w-full px-1 pb-0 pt-0 sm:px-1.5">
      <div className="relative w-full overflow-hidden">
        {/* Layer 1: Floating field base graphic */}
        <img
          src="/sports/nfl/gamecast-field-floating.png?v=629"
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
            <filter id="text-shadow-sm" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.85" />
            </filter>
            {/* Endzone lighting gradients */}
            <linearGradient id="ez-away-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={awayEndzone.gradSheen} stopOpacity="0.84" />
              <stop offset="45%" stopColor={awayEndzone.gradMid} stopOpacity="0.78" />
              <stop offset="100%" stopColor={awayEndzone.gradDeep} stopOpacity="0.86" />
            </linearGradient>
            <linearGradient id="ez-home-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={homeEndzone.gradSheen} stopOpacity="0.84" />
              <stop offset="45%" stopColor={homeEndzone.gradMid} stopOpacity="0.78" />
              <stop offset="100%" stopColor={homeEndzone.gradDeep} stopOpacity="0.86" />
            </linearGradient>
          </defs>

          {/* Endzone Turf Washes */}
          <path d={ENDZONE_COORDS.left.paintPath} fill="url(#ez-away-grad)" />
          <path d={ENDZONE_COORDS.right.paintPath} fill="url(#ez-home-grad)" />

          {/* Away Endzone Mascot Wordmark (Left) */}
          {awayEndzone.glyphs?.map((g, idx) => (
            <g key={`away-glyph-${idx}`} transform={g.transform}>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="none"
                stroke="#000000"
                strokeWidth="8"
                strokeLinejoin="round"
                fontFamily="Impact, 'Arial Black', sans-serif"
                fontSize={awayEndzone.fontSize}
                fontWeight="900"
                opacity="0.95"
              >
                {g.char}
              </text>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="none"
                stroke={awayEndzone.textStroke}
                strokeWidth="4.5"
                strokeLinejoin="round"
                fontFamily="Impact, 'Arial Black', sans-serif"
                fontSize={awayEndzone.fontSize}
                fontWeight="900"
              >
                {g.char}
              </text>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill={awayEndzone.textFill}
                stroke={awayEndzone.isGoldText ? '#ffffff' : 'none'}
                strokeWidth={awayEndzone.isGoldText ? '1' : '0'}
                fontFamily="Impact, 'Arial Black', sans-serif"
                fontSize={awayEndzone.fontSize}
                fontWeight="900"
              >
                {g.char}
              </text>
            </g>
          ))}

          {/* Home Endzone Mascot Wordmark (Right) */}
          {homeEndzone.glyphs?.map((g, idx) => (
            <g key={`home-glyph-${idx}`} transform={g.transform}>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="none"
                stroke="#000000"
                strokeWidth="8"
                strokeLinejoin="round"
                fontFamily="Impact, 'Arial Black', sans-serif"
                fontSize={homeEndzone.fontSize}
                fontWeight="900"
                opacity="0.95"
              >
                {g.char}
              </text>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="none"
                stroke={homeEndzone.textStroke}
                strokeWidth="4.5"
                strokeLinejoin="round"
                fontFamily="Impact, 'Arial Black', sans-serif"
                fontSize={homeEndzone.fontSize}
                fontWeight="900"
              >
                {g.char}
              </text>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill={homeEndzone.textFill}
                stroke={homeEndzone.isGoldText ? '#ffffff' : 'none'}
                strokeWidth={homeEndzone.isGoldText ? '1' : '0'}
                fontFamily="Impact, 'Arial Black', sans-serif"
                fontSize={homeEndzone.fontSize}
                fontWeight="900"
              >
                {g.char}
              </text>
            </g>
          ))}

          {/* Field Sidelines (Continuous boundary lines running full length through both end zones) */}
          <line x1="168" y1="191" x2="1096" y2="191" stroke="#ffffff" strokeWidth="2.2" strokeOpacity="0.85" />
          <line x1="68" y1="478" x2="1193" y2="478" stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.85" />

          {/* End Lines (Out of bounds lines framing the back of each end zone) */}
          <line x1="168" y1="191" x2="68" y2="478" stroke="#ffffff" strokeWidth="3.0" strokeOpacity="0.95" />
          <line x1="1096" y1="191" x2="1193" y2="478" stroke="#ffffff" strokeWidth="3.0" strokeOpacity="0.95" />

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

          {/* Inbound hash marks on either side of the middle of the field */}
          {INBOUND_HASH_MARKS.map(({ key, x1, y1, x2, y2, strokeWidth, opacity }) => (
            <line
              key={key}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#ffffff"
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
            />
          ))}

          {/* Numbers strictly on the 10-yard lines: Far Sideline (opposite side, flipped upside down & laid flat on 3D turf) */}
          {YARD_MARKERS_FAR.map(({ p, label, dir, x, skewAngle }) => (
            <g
              key={`far-${p}`}
              filter="url(#text-shadow-sm)"
              transform={`translate(${x.toFixed(1)}, ${Y_NUM_FAR}) rotate(180) skewX(${skewAngle.toFixed(2)}) scale(1, ${SY_NUM_FAR})`}
            >
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fillOpacity="0.88"
                fontFamily="'Arial Black', Impact, sans-serif"
                fontSize="26"
                fontWeight="900"
                letterSpacing="0.8"
              >
                {label}
              </text>
              {dir === 'left' ? (
                <polygon
                  points="26,0 19,-5 19,5"
                  fill="#ffffff"
                  fillOpacity="0.85"
                />
              ) : null}
              {dir === 'right' ? (
                <polygon
                  points="-26,0 -19,-5 -19,5"
                  fill="#ffffff"
                  fillOpacity="0.85"
                />
              ) : null}
            </g>
          ))}

          {/* Numbers strictly on the 10-yard lines: Near Sideline (laid flat on 3D turf) */}
          {YARD_MARKERS_NEAR.map(({ p, label, dir, x, skewAngle }) => (
            <g
              key={`near-${p}`}
              filter="url(#text-shadow)"
              transform={`translate(${x.toFixed(1)}, ${Y_NUM_NEAR}) skewX(${skewAngle.toFixed(2)}) scale(1, ${SY_NUM_NEAR})`}
            >
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fillOpacity="0.92"
                fontFamily="'Arial Black', Impact, sans-serif"
                fontSize="34"
                fontWeight="900"
                letterSpacing="1.2"
              >
                {label}
              </text>
              {dir === 'left' ? (
                <polygon
                  points="-33,0 -25,-6 -25,6"
                  fill="#ffffff"
                  fillOpacity="0.88"
                />
              ) : null}
              {dir === 'right' ? (
                <polygon
                  points="33,0 25,-6 25,6"
                  fill="#ffffff"
                  fillOpacity="0.88"
                />
              ) : null}
            </g>
          ))}

          {/* Midfield Home Logo (perspective flattened on the 50-yd line, painted on top of yard lines with slight transparency) */}
          {homeLogoSrc ? (
            <g transform="translate(628.7, 334.5) scale(1, 0.72) translate(-628.7, -334.5)">
              <image
                href={homeLogoSrc}
                x={628.7 - 72}
                y={334.5 - 72}
                width="144"
                height="144"
                preserveAspectRatio="xMidYMid meet"
                opacity="0.8"
              />
            </g>
          ) : null}

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

          {/* Corner Pylons (Fluorescent Orange at the 8 end zone corners with perspective scaling) */}
          {CORNER_PYLONS.map(({ key, x, y, isNear }) => {
            const w = isNear ? 4.5 : 3.2
            const h = isNear ? 13 : 9.5
            return (
              <g key={key}>
                {/* 3D ground shadow cast to the right/back */}
                <ellipse
                  cx={x + 1}
                  cy={y + 1}
                  rx={isNear ? 4 : 2.8}
                  ry={isNear ? 1.8 : 1.2}
                  fill="#000000"
                  opacity="0.55"
                />
                {/* Pylon upright body */}
                <rect
                  x={x - w / 2}
                  y={y - h}
                  width={w}
                  height={h}
                  fill="#ff5500"
                  stroke="#b83000"
                  strokeWidth="0.5"
                  rx="0.5"
                />
                {/* Front vertical highlight sheen */}
                <line
                  x1={x}
                  y1={y - h + 1}
                  x2={x}
                  y2={y - 1}
                  stroke="#ffaa44"
                  strokeWidth={isNear ? 1.2 : 0.8}
                  strokeOpacity="0.75"
                />
                {/* Top cap */}
                <ellipse
                  cx={x}
                  cy={y - h}
                  rx={w / 2}
                  ry={isNear ? 1.2 : 0.8}
                  fill="#ff8833"
                />
              </g>
            )
          })}
        </svg>

        {/* Layer 3: Foreground Goalposts Overlay (prevents endzone paint from tinting uprights/pads) */}
        <img
          src="/sports/nfl/gamecast-goalposts-overlay.png?v=629"
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

/** Flip back on when we want the public bets/$ bar under the scoreboard again. */
const SHOW_HERO_PUBLIC_SPLITS = false

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

  const isFinal = game.status === 'post'
  const awayScoreN = Number(game.away?.score)
  const homeScoreN = Number(game.home?.score)
  const scoresComparable =
    isFinal && Number.isFinite(awayScoreN) && Number.isFinite(homeScoreN)
  const awayScoreDim = scoresComparable && awayScoreN < homeScoreN
  const homeScoreDim = scoresComparable && homeScoreN < awayScoreN
  const lastPlayText = String(lastPlay || '').trim()
  const showField = isFootball && game.status === 'in'

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

      {showField ? (
        /* Condensed scoreboard only while the 3D field is up: logo | score mid-gap | status | … */
        <div className="relative z-[4] px-3 pb-1 pt-1">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex shrink-0 flex-col items-start">
                <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={40} />
                <div className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-white/80">
                  {game.away?.abbrev}
                </div>
                {awayTimeouts != null ? <TimeoutDots remaining={awayTimeouts} align="left" /> : null}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                <div
                  className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                    awayScoreDim ? 'text-white/45' : 'text-white'
                  }`}
                >
                  {scoreText(game.away, game.status)}
                </div>
                {awayHasBall ? <PossessionFootball side="away" /> : null}
              </div>
            </div>

            <div className="flex max-w-[36%] shrink-0 flex-col items-center gap-0 px-1 text-center">
              <span
                className={`text-[12px] font-bold tracking-wide ${
                  game.status === 'in' ? 'text-rose-300' : 'text-white/85'
                }`}
              >
                {clock}
              </span>
              {down ? <span className="text-[11px] font-semibold leading-tight text-white/90">{down}</span> : null}
              {yard ? <span className="text-[11px] font-semibold leading-tight text-white/70">{yard}</span> : null}
              {kickoff ? <span className="text-[10px] font-medium leading-tight text-white/70">{kickoff}</span> : null}
            </div>

            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                {homeHasBall ? <PossessionFootball side="home" /> : null}
                <div
                  className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                    homeScoreDim ? 'text-white/45' : 'text-white'
                  }`}
                >
                  {scoreText(game.home, game.status)}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <LoungeSportsTeamLogo side={game.home} treatment={homeTreatment} size={40} />
                <div className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-white/80">
                  {game.home?.abbrev}
                </div>
                {homeTimeouts != null ? <TimeoutDots remaining={homeTimeouts} align="right" /> : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Roomier pre/post scoreboard: logo stacked over abbrev + large score */
        <div className="relative z-[4] px-4 pb-3 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={52} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold uppercase tracking-wide text-white/80">
                  {game.away?.abbrev}
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`text-[40px] font-bold leading-none tabular-nums drop-shadow ${
                      awayScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
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
                  <div
                    className={`text-[40px] font-bold leading-none tabular-nums drop-shadow ${
                      homeScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.home, game.status)}
                  </div>
                </div>
                {homeTimeouts != null ? <TimeoutDots remaining={homeTimeouts} align="right" /> : null}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-[4]">
        {SHOW_HERO_PUBLIC_SPLITS ? (
          <HeroPublicBetting
            game={game}
            splits={splits}
            awayColor={awayColor}
            homeColor={homeColor}
          />
        ) : null}
        {showField ? (
          <div className="relative">
            <FieldViz
              game={game}
              live={live}
              awayColor={awayColor}
              homeColor={homeColor}
            />
            {lastPlayText ? (
              <div
                data-lounge-game-last-play
                className="pointer-events-none absolute inset-x-2 bottom-2 z-[5] overflow-hidden rounded-xl border border-white/15 bg-black/55 px-3 py-2 shadow-lg backdrop-blur-md"
              >
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                    Last play
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-white/90">
                  {lastPlayText}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="h-2" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
