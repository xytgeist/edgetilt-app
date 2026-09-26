import { useEffect, useId, useRef, useState } from 'react'
import {
  LoungeSportsTeamLogo,
  useLoungeSportsPillWashAndLogos,
} from '../loungeSportsPillPaint.jsx'
import { formatLoungeSportsMoneyline } from '../LoungeGameScorePill.jsx'
import { hubTeamLabel } from '../loungeSportsMatch.js'
import { openExternalUrl } from '../../../utils/edgeNative.js'
import {
  CORNER_PYLONS,
  ENDZONE_COORDS,
  resolveEndzoneDesign,
} from './gameHubEndzone.js'
import GameHubRushFigure from './GameHubRushFigure.jsx'
import GameHubCatchFigure from './GameHubCatchFigure.jsx'
import { resolveTeamKit } from './gameHubFigureColors.js'
import {
  CATCH_HANDS_LOCAL,
  CATCH_VIEWBOX_H,
  CATCH_VIEWBOX_W,
} from './gameHubCatchPieces.js'
import {
  attackDirection,
  downDistanceLabel,
  fieldCenterBanner,
  fieldPercent,
  isFieldOrientationFlipped,
  liveClockLabel,
  matchRushPlayer,
  parseFieldGoalPlay,
  parsePassPlay,
  parseRushPlay,
  playTextIsTouchdown,
  resolveFigureJersey,
  resolvePlayAnimationPercents,
  scoreText,
  yardLineLabel,
} from './gameHubFormatters.js'

/** RB slide duration (start LOS → gain yardage). */
const RUSH_RUN_MS = 1100
/** Hold RB at end of run before he exits. */
const RUSH_HOLD_MS = 2000
/** LOS + 1st-down line slide duration (starts as soon as RB exits). */
const RUSH_LINES_MS = 700
/** Pause after lines settle before the ball returns on the new LOS. */
const RUSH_BALL_DELAY_MS = 1000
const RUSH_TOTAL_MS =
  RUSH_RUN_MS + RUSH_HOLD_MS + RUSH_LINES_MS + RUSH_BALL_DELAY_MS

/** WR/TE slide duration (prior LOS → catch spot). */
const CATCH_RUN_MS = 1250
/** Hold WR at catch spot before he exits (mirrors RB hold). */
const CATCH_HOLD_MS = RUSH_HOLD_MS
/** LOS + 1st-down line slide after WR exits. */
const CATCH_LINES_MS = RUSH_LINES_MS
/** Pause after lines settle before LOS ball returns. */
const CATCH_BALL_DELAY_MS = RUSH_BALL_DELAY_MS
const CATCH_TOTAL_MS =
  CATCH_RUN_MS + CATCH_HOLD_MS + CATCH_LINES_MS + CATCH_BALL_DELAY_MS
/** WR path progress before the football leaves the LOS on its arc. */
const CATCH_BALL_LAUNCH_AT = 0.25

/** TD: pause after landing before TOUCHDOWN label. */
const CATCH_TD_PRE_LABEL_MS = 1000
/** TD: figure + ball + TOUCHDOWN label hold. */
const CATCH_TD_CELEBRATE_MS = 3000
/** TD: label-only hold after figure/ball removed. */
const CATCH_TD_LABEL_TAIL_MS = 2000
/** TD: LOS + 1st-down fade-out duration (no line slide). */
const CATCH_TD_LINES_FADE_MS = 600
const CATCH_TD_TOTAL_MS =
  CATCH_RUN_MS + CATCH_TD_PRE_LABEL_MS + CATCH_TD_CELEBRATE_MS + CATCH_TD_LABEL_TAIL_MS
/** Rush TD celebrate timeline (same phases as pass TD, keyed off RUSH_RUN_MS). */
const RUSH_TD_TOTAL_MS =
  RUSH_RUN_MS + CATCH_TD_PRE_LABEL_MS + CATCH_TD_CELEBRATE_MS + CATCH_TD_LABEL_TAIL_MS

/** Field-goal kick: plant upright, then a real parabola (rise → fall) through the uprights. */
const FG_HOLD_MS = 420
/** Overall hang time … placekicks feel slow vs a pass; keep the ball readable. */
const FG_FLIGHT_BASE_MS = 2400
const FG_BOUNCE_MS = 880
const FG_BALL_SIZE = 30
/** End-over-end revolutions over the full flight (path t 0→1). */
const FG_TUMBLE_REVS = 20
/**
 * Path apex (t=0.5) lands at this fraction of flight time.
 * Below 0.5 → snappy takeoff, then a steadier hang after the top.
 */
const FG_APEX_TIME = 0.34
/**
 * Takeoff slope vs descent cruise (df/du). >1 = snappy plant; must stay
 * monotonic on the Hermite rise (m0+m1 ≤ 3·Δpath ≈ 1.5 in v-space).
 */
const FG_TAKEOFF_SLOPE_MULT = 2.35

/**
 * Goalpost uprights from gamecast-goalposts-overlay.png (viewBox 1266×533).
 * `uLo` / `uHi` = screen-left / screen-right upright X.
 */
const FG_POSTS = {
  left: { uLo: 96, uHi: 136, centerX: 116, crossbarY: 208 },
  right: { uLo: 1128, uHi: 1164, centerX: 1146, crossbarY: 208 },
}

const RUSH_Y = 334.5
const RUSH_FIG_W = 124
const RUSH_FIG_H = 144

/** Kick spot percent: 7 yards behind LOS, or from FG distance (kick = FG − 10 from goal line). */
function resolveFgKickPercent({ fgYards, possessionSide, livePos, flipped }) {
  const attackDir = attackDirection(possessionSide, flipped)
  const goalPct = attackDir > 0 ? 100 : 0
  const y = Number(fgYards)
  if (Number.isFinite(y) && y >= 18 && y <= 75) {
    // Official FG yards ≈ kick-to-posts; posts sit 10 yd past the goal line.
    const fromGoal = y - 10
    return Math.max(2, Math.min(98, goalPct - attackDir * fromGoal))
  }
  if (livePos != null && Number.isFinite(Number(livePos))) {
    return Math.max(2, Math.min(98, Number(livePos) - attackDir * 7))
  }
  // Midfield-ish fallback for tap-to-replay with no LOS.
  return Math.max(2, Math.min(98, goalPct - attackDir * 35))
}

/**
 * Stylistic loft in SVG px. Short chips loft higher; long attempts flatten
 * (NFL placekicks still ~40–45° launch, but the apex sits lower relative to range).
 */
function fgStyleLiftFromYards(yards) {
  const abs = Math.abs(Number(yards) || 40)
  const t = Math.min(1, Math.max(0, (abs - 18) / 40))
  return 145 - t * 95
}

/**
 * True projectile-style parabola on a chord (SVG y grows down).
 * Peak lift at mid-flight … ball rises then falls back toward the landing spot.
 */
function fgParabolaPoint(start, end, lift, t) {
  const u = Math.max(0, Math.min(1, t))
  return {
    x: lerp(start.x, end.x, u),
    y: lerp(start.y, end.y, u) - 4 * lift * u * (1 - u),
  }
}

/**
 * Map linear flight time → path t.
 * Snappy plant into the apex, then cruise on the way down.
 * Rise is Hermite so slope matches the linear descent at t=0.5 … avoids the
 * old easeOutQuad dead-stop then jerk at the top.
 */
function fgFlightPathT(u) {
  const x = Math.max(0, Math.min(1, u))
  const apexU = FG_APEX_TIME
  const descentDu = 0.5 / (1 - apexU)
  if (x <= apexU) {
    const v = x / apexU
    // Tangents in v-space (df/dv = (df/du) · apexU).
    const m0 = descentDu * apexU * FG_TAKEOFF_SLOPE_MULT
    const m1 = descentDu * apexU
    const v2 = v * v
    const v3 = v2 * v
    // Cubic Hermite: p0=0 → p1=0.5, C1 into the descent segment.
    return (v3 - 2 * v2 + v) * m0 + (-2 * v3 + 3 * v2) * 0.5 + (v3 - v2) * m1
  }
  return 0.5 + 0.5 * ((x - apexU) / (1 - apexU))
}

/** Minimum apex so the ball is still above the crossbar when it crosses the posts. */
function fgLiftToClearPosts(start, land, postsX, clearY) {
  const dx = land.x - start.x
  if (Math.abs(dx) < 1) return 80
  const t = (postsX - start.x) / dx
  if (t <= 0.05 || t >= 0.95) return 80
  const chordY = lerp(start.y, land.y, t)
  const denom = 4 * t * (1 - t)
  if (denom < 0.05) return 80
  return Math.max(48, (chordY - clearY) / denom)
}
function fieldTopXFromPercent(p) {
  return 239.0 + (p / 100) * 784.0
}

function fieldBotXFromPercent(p) {
  return 161.0 + (p / 100) * 937.0
}

function fieldMidXFromPercent(p) {
  return (fieldTopXFromPercent(p) + fieldBotXFromPercent(p)) / 2
}

function firstDownPercentFromLive(live, scrimPct, flipped = false) {
  if (
    scrimPct == null ||
    !live?.down ||
    live?.distance == null ||
    !Number.isFinite(Number(live.distance))
  ) {
    return null
  }
  const dist = Number(live.distance)
  const dir = attackDirection(live.possession, flipped)
  return Math.max(0, Math.min(100, scrimPct + dir * dist))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function quadBezier(p0, p1, p2, t) {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  }
}

/** Map WR path progress → ball flight 0..1 (ball sits until CATCH_BALL_LAUNCH_AT). */
function catchBallFlightProgress(wrProgress) {
  const p = Number(wrProgress)
  if (!Number.isFinite(p) || p < CATCH_BALL_LAUNCH_AT) return 0
  return Math.min(1, (p - CATCH_BALL_LAUNCH_AT) / (1 - CATCH_BALL_LAUNCH_AT))
}

/**
 * Arc apex lift in field SVG units from pass yardage.
 * ~5 yd stays low; ~50 yd (and beyond) climbs hard.
 */
function catchArcLiftFromYards(yards) {
  const abs = Math.abs(Number(yards) || 0)
  const t = Math.min(1, abs / 50)
  return 22 + t * 138
}

/** World-space catch-hand point for a placed WR figure (top-left origin). */
function catchHandsWorld(figLeft, figTop, facing, figW, figH) {
  // GameHubCatchFigure uses default SVG meet (uniform scale + center). Do not
  // stretch-map viewBox → slot or the ball will miss the gloves on X.
  const scale = Math.min(figW / CATCH_VIEWBOX_W, figH / CATCH_VIEWBOX_H)
  const padX = (figW - CATCH_VIEWBOX_W * scale) / 2
  const padY = (figH - CATCH_VIEWBOX_H * scale) / 2
  const lx = facing < 0 ? CATCH_VIEWBOX_W - CATCH_HANDS_LOCAL.x : CATCH_HANDS_LOCAL.x
  return {
    x: figLeft + padX + lx * scale,
    y: figTop + padY + CATCH_HANDS_LOCAL.y * scale,
  }
}

function possessionKit(live, game, awayColor, homeColor) {
  const possHome = live?.possession === 'home'
  const side = possHome ? game?.home : game?.away
  const primary = String(
    (possHome ? homeColor : awayColor) || side?.color || '#b91c1c'
  )
  let secondary = String(side?.color2 || '')
  if (!secondary || secondary.toLowerCase() === primary.toLowerCase()) {
    secondary = '#fafafa'
  }
  const sideAbbrev = String(side?.abbrev || '')
  const resolved = resolveTeamKit(sideAbbrev, primary, secondary)
  return {
    primary,
    secondary,
    helmetColor: resolved.helmetColor,
    pantsColor: resolved.pantsColor,
    tightsColor: resolved.tightsColor,
    sideAbbrev,
  }
}

const TIMEOUT_SLOTS = 3
/** NFL athletic block; CFB uses Graduate (college slab) loaded in index.html. */
const ENDZONE_FONT_NFL = "Impact, 'Arial Black', sans-serif"
const ENDZONE_FONT_CFB = "Graduate, Impact, 'Arial Black', serif"

function isCfbSport(sportKey) {
  return String(sportKey || '').includes('ncaaf')
}

function TimeoutDots({ remaining, align = 'left' }) {
  const left = remaining == null ? TIMEOUT_SLOTS : Math.max(0, Math.min(TIMEOUT_SLOTS, Math.round(remaining)))
  const justify =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <div
      className={`mt-2 flex items-center gap-1 ${justify}`}
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

/**
 * Inline American football … pointed leather oval with stripes + laces.
 * `tone`: field (brown 3D) | chalk (white, scoreboard possession).
 */
function AmericanFootballMark({
  tone = 'field',
  size = 28,
  rotate = -28,
  className = '',
  title,
}) {
  const uid = useId().replace(/:/g, '')
  const leatherId = `fb-leather-${uid}`
  const depthId = `fb-depth-${uid}`
  const sheenId = `fb-sheen-${uid}`
  const clipId = `fb-clip-${uid}`
  const isChalk = tone === 'chalk'
  const body =
    'M-12 0 C-11.2 -2.8 -8.6 -6.5 0 -6.5 C8.6 -6.5 11.2 -2.8 12 0 C11.2 2.8 8.6 6.5 0 6.5 C-8.6 6.5 -11.2 2.8 -12 0 Z'
  return (
    <svg
      viewBox="-15 -11 30 24"
      width={size}
      height={size * (24 / 30)}
      overflow="visible"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={leatherId} x1="18%" y1="8%" x2="88%" y2="92%">
          {isChalk ? (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="48%" stopColor="#f4f4f5" />
              <stop offset="100%" stopColor="#a1a1aa" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#d4a574" />
              <stop offset="22%" stopColor="#b8733d" />
              <stop offset="55%" stopColor="#7a4424" />
              <stop offset="100%" stopColor="#2c160c" />
            </>
          )}
        </linearGradient>
        <linearGradient id={depthId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0" />
          <stop offset="45%" stopColor="#000000" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000000" stopOpacity={isChalk ? 0.22 : 0.38} />
        </linearGradient>
        <radialGradient id={sheenId} cx="30%" cy="26%" r="58%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={isChalk ? 0.65 : 0.5} />
          <stop offset="40%" stopColor="#ffffff" stopOpacity={isChalk ? 0.18 : 0.14} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={body} />
        </clipPath>
      </defs>
      {!isChalk ? (
        <ellipse cx="1.5" cy="8.4" rx="10.2" ry="2.4" fill="#000000" opacity="0.5" />
      ) : null}
      <g transform={`rotate(${rotate})`}>
        <path
          d={body}
          fill={`url(#${leatherId})`}
          stroke={isChalk ? '#18181b' : '#1a0e08'}
          strokeWidth="0.6"
        />
        <path d={body} fill={`url(#${depthId})`} />
        <path d={body} fill={`url(#${sheenId})`} />
        {/* Seam / equator stitch */}
        <path
          d="M-10.2 0 C-6.5 0.55 0 0.7 10.2 0"
          fill="none"
          stroke={isChalk ? '#27272a' : '#1c1008'}
          strokeWidth="0.45"
          strokeOpacity="0.55"
          clipPath={`url(#${clipId})`}
        />
        {/* End stripes */}
        <path
          d="M-7.6 -5.15 C-6.7 -5.85 -4.05 -6.15 -4.05 -6.15 L-4.05 6.15 C-4.05 6.15 -6.7 5.85 -7.6 5.15 C-8.45 3.95 -8.75 2.05 -8.75 0 C-8.75 -2.05 -8.45 -3.95 -7.6 -5.15 Z"
          fill={isChalk ? '#18181b' : '#fafafa'}
          opacity={isChalk ? 0.88 : 0.96}
          clipPath={`url(#${clipId})`}
        />
        <path
          d="M7.6 -5.15 C6.7 -5.85 4.05 -6.15 4.05 -6.15 L4.05 6.15 C4.05 6.15 6.7 5.85 7.6 5.15 C8.45 3.95 8.75 2.05 8.75 0 C8.75 -2.05 8.45 -3.95 7.6 -5.15 Z"
          fill={isChalk ? '#18181b' : '#fafafa'}
          opacity={isChalk ? 0.88 : 0.96}
          clipPath={`url(#${clipId})`}
        />
        {/* Laces panel */}
        <ellipse
          cx="0"
          cy="0"
          rx="3.1"
          ry="2.35"
          fill={isChalk ? '#e4e4e7' : '#5c3318'}
          opacity={isChalk ? 0.35 : 0.35}
        />
        <line
          x1="-2.55"
          y1="0"
          x2="2.55"
          y2="0"
          stroke={isChalk ? '#18181b' : '#0c0704'}
          strokeWidth="0.95"
          strokeLinecap="round"
        />
        {[-1.55, -0.55, 0.55, 1.55].map((x) => (
          <line
            key={x}
            x1={x}
            y1="-1.65"
            x2={x}
            y2="1.65"
            stroke={isChalk ? '#18181b' : '#0c0704'}
            strokeWidth="0.75"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  )
}

function PossessionFootball({ side }) {
  return (
    <img
      src="/sports/nfl/icons/football-possession.png?v=722"
      alt=""
      aria-hidden="true"
      title={`${side} possession`}
      className="h-[14px] w-[14px] shrink-0 object-contain brightness-0 invert drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
    />
  )
}

/** National TV / stream chip under the kickoff clock … opens the watch site. */
function WatchBroadcastPill({ label, url }) {
  const text = String(label || '').trim()
  const href = String(url || '').trim()
  if (!text) return null
  return (
    <button
      type="button"
      data-lounge-game-watch-pill
      onClick={() => {
        if (href) void openExternalUrl(href)
      }}
      disabled={!href}
      className="mt-1 inline-flex max-w-full items-center justify-center rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-sm backdrop-blur-sm touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/25 disabled:opacity-60"
      aria-label={href ? `Watch on ${text}` : text}
    >
      <span className="truncate">{text}</span>
    </button>
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

function FieldViz({
  game,
  live,
  awayColor,
  homeColor,
  lastPlay = '',
  players = [],
  playReplayNonce = 0,
  replayTeam = null,
}) {
  const sportKey = String(game?.sport_key || '').toLowerCase()
  const isFootball = sportKey.includes('football') || (!sportKey && Boolean(game?.away && game?.home))

  const isUserReplay = Number(playReplayNonce) > 0
  const fieldFlipped = isFieldOrientationFlipped(game, live)
  const posRaw = fieldPercent(live, { flipped: fieldFlipped })
  // Midfield fallback so tap-to-replay still animates on final / missing LOS.
  const pos = posRaw != null ? posRaw : isUserReplay ? 50 : null
  const hasLine = pos != null
  const centerBanner = fieldCenterBanner(game, live)
  const hideLiveLines = Boolean(centerBanner)
  const lastPlayText = String(lastPlay || '').trim()
  const animKey = `${lastPlayText}::${Number(playReplayNonce) || 0}`
  const possessionSide =
    replayTeam === 'home' || replayTeam === 'away'
      ? replayTeam
      : live?.possession === 'home' || live?.possession === 'away'
        ? live.possession
        : null

  const [rushAnim, setRushAnim] = useState(null)
  const [catchAnim, setCatchAnim] = useState(null)
  const [fgAnim, setFgAnim] = useState(null)
  const rushKeyRef = useRef('')
  const catchKeyRef = useRef('')
  const fgKeyRef = useRef('')
  const rushRafRef = useRef(0)
  const catchRafRef = useRef(0)
  const fgRafRef = useRef(0)
  /** Last settled LOS / 1st-down percents … held during rush until lines phase. */
  const settledLinesRef = useRef({ scrimPct: null, firstDownPct: null })

  useEffect(() => {
    if (!isFootball || !lastPlayText) return undefined
    if (!isUserReplay && (hideLiveLines || !hasLine || pos == null)) return undefined
    if (pos == null && !isUserReplay) return undefined
    if (parseFieldGoalPlay(lastPlayText)) return undefined
    const parsed = parseRushPlay(lastPlayText)
    if (!parsed) {
      if (rushKeyRef.current && animKey !== rushKeyRef.current) {
        setRushAnim(null)
        rushKeyRef.current = ''
      }
      return undefined
    }
    if (animKey === rushKeyRef.current) return undefined
    rushKeyRef.current = animKey
    catchKeyRef.current = ''
    fgKeyRef.current = ''
    setCatchAnim(null)
    setFgAnim(null)
    if (catchRafRef.current) cancelAnimationFrame(catchRafRef.current)
    if (fgRafRef.current) cancelAnimationFrame(fgRafRef.current)

    const attackDir = attackDirection(possessionSide, fieldFlipped)
    const isTouchdown =
      Boolean(parsed.isTouchdown) || playTextIsTouchdown(lastPlayText)
    const spots = resolvePlayAnimationPercents({
      text: lastPlayText,
      yards: parsed.yards,
      game,
      possessionSide,
      livePos: pos,
      preferTextSpots: isUserReplay,
      isTouchdown,
      flipped: fieldFlipped,
    })
    const endPct = spots.endPct
    const startPct = spots.startPct
    const startX = fieldMidXFromPercent(startPct)
    const endX = fieldMidXFromPercent(endPct)
    const travel = endX - startX
    // Prefer attack direction when travel is tiny (spot clamp / 0-yd edge).
    const facing = Math.abs(travel) < 0.5 ? attackDir : travel < 0 ? -1 : 1
    const kit = possessionKit(
      possessionSide ? { ...live, possession: possessionSide } : live,
      game,
      awayColor,
      homeColor,
    )
    const matched = matchRushPlayer(parsed.playerHint, players, kit.sideAbbrev)
    const headshotUrl = matched?.headshot_url ? String(matched.headshot_url) : ''
    const jerseyNumber = resolveFigureJersey(parsed, matched)

    const toFirstDownPct = firstDownPercentFromLive(live, endPct, fieldFlipped)
    const settled = settledLinesRef.current
    // Old LOS is always prior yardline from the play text (live pos is already post-play).
    const fromScrimPct = startPct
    const settledStillPrePlay =
      settled.scrimPct != null &&
      Math.abs(settled.scrimPct - startPct) <= Math.abs(settled.scrimPct - endPct) + 0.01
    let fromFirstDownPct =
      settledStillPrePlay &&
      settled.firstDownPct != null &&
      Number.isFinite(settled.firstDownPct)
        ? settled.firstDownPct
        : null
    if (fromFirstDownPct == null) {
      const priorDist = Number(live?.distance)
      fromFirstDownPct = Number.isFinite(priorDist)
        ? firstDownPercentFromLive(
            { ...live, distance: priorDist + parsed.yards },
            startPct,
            fieldFlipped,
          )
        : toFirstDownPct
    }

    const base = {
      playKey: animKey,
      startX,
      endX,
      y: RUSH_Y,
      primary: kit.primary,
      secondary: kit.secondary,
      helmetColor: kit.helmetColor,
      pantsColor: kit.pantsColor,
      tightsColor: kit.tightsColor,
      headshotUrl,
      jerseyNumber,
      facing,
      isTouchdown,
      fromScrimPct,
      toScrimPct: endPct,
      fromFirstDownPct,
      toFirstDownPct,
    }

    if (prefersReducedMotion()) {
      settledLinesRef.current = {
        scrimPct: endPct,
        firstDownPct: toFirstDownPct,
      }
      setRushAnim(null)
      return undefined
    }

    const totalMs = isTouchdown ? RUSH_TD_TOTAL_MS : RUSH_TOTAL_MS
    setRushAnim({
      ...base,
      progress: 0,
      linesProgress: 0,
      linesOpacity: 1,
      showFigure: true,
      showTrail: true,
      showTdLabel: false,
      playing: true,
    })
    const t0 = performance.now()
    const tick = (now) => {
      const elapsed = now - t0
      if (elapsed >= totalMs) {
        if (!isTouchdown) {
          settledLinesRef.current = {
            scrimPct: endPct,
            firstDownPct: toFirstDownPct,
          }
        }
        setRushAnim(null)
        return
      }

      let progress = 1
      let linesProgress = 0
      let linesOpacity = 1
      let showFigure = false
      let showTrail = false
      let showTdLabel = false
      let playing = true

      if (isTouchdown) {
        if (elapsed < RUSH_RUN_MS) {
          progress = easeOutCubic(elapsed / RUSH_RUN_MS)
          showFigure = true
          showTrail = true
        } else if (elapsed < RUSH_RUN_MS + CATCH_TD_PRE_LABEL_MS) {
          progress = 1
          showFigure = true
          showTrail = true
        } else if (
          elapsed <
          RUSH_RUN_MS + CATCH_TD_PRE_LABEL_MS + CATCH_TD_CELEBRATE_MS
        ) {
          progress = 1
          showFigure = true
          showTrail = true
          showTdLabel = true
          const fadeElapsed = elapsed - RUSH_RUN_MS - CATCH_TD_PRE_LABEL_MS
          linesOpacity = Math.max(
            0,
            1 - Math.min(1, fadeElapsed / CATCH_TD_LINES_FADE_MS),
          )
        } else {
          // Label-only tail … figure already gone.
          progress = 1
          showTdLabel = true
          linesOpacity = 0
        }
      } else if (elapsed < RUSH_RUN_MS) {
        progress = easeOutCubic(elapsed / RUSH_RUN_MS)
        showFigure = true
        showTrail = true
      } else if (elapsed < RUSH_RUN_MS + RUSH_HOLD_MS) {
        progress = 1
        showFigure = true
        showTrail = true
      } else if (elapsed < RUSH_RUN_MS + RUSH_HOLD_MS + RUSH_LINES_MS) {
        // RB gone; lines slide to post-play marks immediately.
        progress = 1
        const lineT =
          (elapsed - RUSH_RUN_MS - RUSH_HOLD_MS) / RUSH_LINES_MS
        linesProgress = easeOutCubic(Math.min(1, lineT))
      } else {
        // Lines settled; ball still withheld until RUSH_BALL_DELAY_MS.
        progress = 1
        linesProgress = 1
      }

      setRushAnim((prev) =>
        prev && prev.playKey === animKey
          ? {
              ...prev,
              progress,
              linesProgress,
              linesOpacity,
              showFigure,
              showTrail,
              showTdLabel,
              playing,
            }
          : prev
      )
      rushRafRef.current = requestAnimationFrame(tick)
    }
    rushRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rushRafRef.current) cancelAnimationFrame(rushRafRef.current)
    }
  }, [
    isFootball,
    hideLiveLines,
    hasLine,
    pos,
    lastPlayText,
    animKey,
    isUserReplay,
    possessionSide,
    fieldFlipped,
    live,
    awayColor,
    homeColor,
    game,
    players,
  ])

  useEffect(() => {
    if (!isFootball || !lastPlayText) return undefined
    if (!isUserReplay && (hideLiveLines || !hasLine || pos == null)) return undefined
    if (pos == null && !isUserReplay) return undefined
    // Rush / FG win if both somehow match.
    if (parseRushPlay(lastPlayText) || parseFieldGoalPlay(lastPlayText)) return undefined
    const parsed = parsePassPlay(lastPlayText)
    if (!parsed) {
      if (catchKeyRef.current && animKey !== catchKeyRef.current) {
        setCatchAnim(null)
        catchKeyRef.current = ''
      }
      return undefined
    }
    if (animKey === catchKeyRef.current) return undefined
    catchKeyRef.current = animKey
    rushKeyRef.current = ''
    fgKeyRef.current = ''
    setRushAnim(null)
    setFgAnim(null)
    if (rushRafRef.current) cancelAnimationFrame(rushRafRef.current)
    if (fgRafRef.current) cancelAnimationFrame(fgRafRef.current)

    const isTouchdown =
      Boolean(parsed.isTouchdown) || playTextIsTouchdown(lastPlayText)
    const attackDir = attackDirection(possessionSide, fieldFlipped)
    const spots = resolvePlayAnimationPercents({
      text: lastPlayText,
      yards: parsed.yards,
      game,
      possessionSide,
      livePos: pos,
      preferTextSpots: isUserReplay,
      isTouchdown,
      flipped: fieldFlipped,
    })
    const gainPct = spots.endPct
    const startPct = spots.startPct
    const startX = fieldMidXFromPercent(startPct)
    // TD: slide halfway into the scored (opponent) endzone along attackDir.
    const endX = isTouchdown
      ? attackDir < 0
        ? ENDZONE_COORDS.left.centerX
        : ENDZONE_COORDS.right.centerX
      : fieldMidXFromPercent(gainPct)
    const travel = endX - startX
    const facing = Math.abs(travel) < 0.5 ? attackDir : travel < 0 ? -1 : 1
    const kit = possessionKit(
      possessionSide ? { ...live, possession: possessionSide } : live,
      game,
      awayColor,
      homeColor,
    )
    const matched = matchRushPlayer(parsed.playerHint, players, kit.sideAbbrev)
    const headshotUrl = matched?.headshot_url ? String(matched.headshot_url) : ''
    const jerseyNumber = resolveFigureJersey(parsed, matched)

    const figTopAtEnd = RUSH_Y - RUSH_FIG_H + 8
    const figLeftAtEnd = endX - RUSH_FIG_W / 2
    const handsEnd = catchHandsWorld(figLeftAtEnd, figTopAtEnd, facing, RUSH_FIG_W, RUSH_FIG_H)
    const ballStart = { x: startX, y: RUSH_Y - 6 }
    const ballEnd = { x: handsEnd.x, y: handsEnd.y }
    const arcLift = catchArcLiftFromYards(parsed.yards)
    const ballCtrl = {
      x: (ballStart.x + ballEnd.x) / 2,
      y: Math.min(ballStart.y, ballEnd.y) - arcLift,
    }

    const toFirstDownPct = firstDownPercentFromLive(live, gainPct, fieldFlipped)
    const settled = settledLinesRef.current
    const fromScrimPct = startPct
    const settledStillPrePlay =
      settled.scrimPct != null &&
      Math.abs(settled.scrimPct - startPct) <= Math.abs(settled.scrimPct - gainPct) + 0.01
    let fromFirstDownPct =
      settledStillPrePlay &&
      settled.firstDownPct != null &&
      Number.isFinite(settled.firstDownPct)
        ? settled.firstDownPct
        : null
    if (fromFirstDownPct == null) {
      const priorDist = Number(live?.distance)
      fromFirstDownPct = Number.isFinite(priorDist)
        ? firstDownPercentFromLive(
            { ...live, distance: priorDist + parsed.yards },
            startPct,
            fieldFlipped,
          )
        : toFirstDownPct
    }

    const base = {
      playKey: animKey,
      startX,
      endX,
      y: RUSH_Y,
      primary: kit.primary,
      secondary: kit.secondary,
      helmetColor: kit.helmetColor,
      pantsColor: kit.pantsColor,
      tightsColor: kit.tightsColor,
      headshotUrl,
      jerseyNumber,
      facing,
      yards: parsed.yards,
      isTouchdown,
      ballStart,
      ballCtrl,
      ballEnd,
      fromScrimPct,
      toScrimPct: gainPct,
      fromFirstDownPct,
      toFirstDownPct,
    }

    if (prefersReducedMotion()) {
      settledLinesRef.current = {
        scrimPct: gainPct,
        firstDownPct: toFirstDownPct,
      }
      setCatchAnim(null)
      return undefined
    }

    const totalMs = isTouchdown ? CATCH_TD_TOTAL_MS : CATCH_TOTAL_MS
    setCatchAnim({
      ...base,
      progress: 0,
      linesProgress: 0,
      linesOpacity: 1,
      showFigure: true,
      showTrail: true,
      showBall: true,
      showTdLabel: false,
      playing: true,
    })
    const t0 = performance.now()
    const tick = (now) => {
      const elapsed = now - t0
      if (elapsed >= totalMs) {
        if (!isTouchdown) {
          settledLinesRef.current = {
            scrimPct: gainPct,
            firstDownPct: toFirstDownPct,
          }
        }
        setCatchAnim(null)
        return
      }

      let progress = 1
      let linesProgress = 0
      let linesOpacity = 1
      let showFigure = false
      let showTrail = false
      let showBall = false
      let showTdLabel = false

      if (isTouchdown) {
        if (elapsed < CATCH_RUN_MS) {
          progress = easeOutCubic(elapsed / CATCH_RUN_MS)
          showFigure = true
          showTrail = true
          showBall = true
        } else if (elapsed < CATCH_RUN_MS + CATCH_TD_PRE_LABEL_MS) {
          progress = 1
          showFigure = true
          showTrail = true
          showBall = true
        } else if (
          elapsed <
          CATCH_RUN_MS + CATCH_TD_PRE_LABEL_MS + CATCH_TD_CELEBRATE_MS
        ) {
          progress = 1
          showFigure = true
          showTrail = true
          showBall = true
          showTdLabel = true
          const fadeElapsed =
            elapsed - CATCH_RUN_MS - CATCH_TD_PRE_LABEL_MS
          linesOpacity = Math.max(
            0,
            1 - Math.min(1, fadeElapsed / CATCH_TD_LINES_FADE_MS),
          )
        } else {
          // Label-only tail … figure and catch ball already gone.
          progress = 1
          showTdLabel = true
          linesOpacity = 0
        }
      } else if (elapsed < CATCH_RUN_MS) {
        progress = easeOutCubic(elapsed / CATCH_RUN_MS)
        showFigure = true
        showTrail = true
        showBall = true
      } else if (elapsed < CATCH_RUN_MS + CATCH_HOLD_MS) {
        progress = 1
        showFigure = true
        showTrail = true
        showBall = true
      } else if (elapsed < CATCH_RUN_MS + CATCH_HOLD_MS + CATCH_LINES_MS) {
        progress = 1
        const lineT =
          (elapsed - CATCH_RUN_MS - CATCH_HOLD_MS) / CATCH_LINES_MS
        linesProgress = easeOutCubic(Math.min(1, lineT))
      } else {
        progress = 1
        linesProgress = 1
      }

      setCatchAnim((prev) =>
        prev && prev.playKey === animKey
          ? {
              ...prev,
              progress,
              linesProgress,
              linesOpacity,
              showFigure,
              showTrail,
              showBall,
              showTdLabel,
              playing: true,
            }
          : prev,
      )
      catchRafRef.current = requestAnimationFrame(tick)
    }
    catchRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (catchRafRef.current) cancelAnimationFrame(catchRafRef.current)
    }
  }, [
    isFootball,
    hideLiveLines,
    hasLine,
    pos,
    lastPlayText,
    animKey,
    isUserReplay,
    possessionSide,
    fieldFlipped,
    live,
    awayColor,
    homeColor,
    game,
    players,
  ])

  useEffect(() => {
    if (!isFootball || !lastPlayText) return undefined
    if (!isUserReplay && (hideLiveLines || !hasLine || pos == null)) return undefined
    if (pos == null && !isUserReplay) return undefined
    if (parseRushPlay(lastPlayText) || parsePassPlay(lastPlayText)) return undefined
    const parsed = parseFieldGoalPlay(lastPlayText)
    if (!parsed) {
      if (fgKeyRef.current && animKey !== fgKeyRef.current) {
        setFgAnim(null)
        fgKeyRef.current = ''
      }
      return undefined
    }
    if (animKey === fgKeyRef.current) return undefined
    fgKeyRef.current = animKey
    rushKeyRef.current = ''
    catchKeyRef.current = ''
    setRushAnim(null)
    setCatchAnim(null)
    if (rushRafRef.current) cancelAnimationFrame(rushRafRef.current)
    if (catchRafRef.current) cancelAnimationFrame(catchRafRef.current)

    const attackDir = attackDirection(possessionSide, fieldFlipped)
    const posts = attackDir > 0 ? FG_POSTS.right : FG_POSTS.left
    const kickPct = resolveFgKickPercent({
      fgYards: parsed.yards,
      possessionSide,
      livePos: pos,
      flipped: fieldFlipped,
    })
    const start = {
      x: fieldMidXFromPercent(kickPct),
      // Slight tee lean … held near upright before the plant.
      y: RUSH_Y - 8,
    }
    const yards = Number.isFinite(Number(parsed.yards)) ? Number(parsed.yards) : 40
    const made = Boolean(parsed.made)
    const facing = attackDir
    // Made: same continuous parabola through the uprights and land past them
    // (Science of NFL Football … horizontal speed holds, gravity turns the apex).
    // Miss: aim an upright, then bounce.
    const land = made
      ? {
          x: posts.centerX + attackDir * 118,
          y: RUSH_Y + 6,
        }
      : {
          x:
            (parsed.missSide === 'left'
              ? Math.min(posts.uLo, posts.uHi)
              : Math.max(posts.uLo, posts.uHi)),
          y: posts.crossbarY - 28,
        }
    const clearY = posts.crossbarY - 52
    const minLift = fgLiftToClearPosts(start, land, posts.centerX, clearY)
    const styleLift = fgStyleLiftFromYards(yards)
    // Long kicks flatten (styleLift drops) but never skim the crossbar.
    const lift = Math.max(minLift, styleLift)
    const hit = { x: land.x, y: land.y }
    const bounce = {
      x: hit.x - attackDir * 58,
      y: RUSH_Y - 22,
    }
    // Longer attempts hang a bit more in the air.
    const flightMs = FG_FLIGHT_BASE_MS + Math.min(900, Math.max(0, yards - 25) * 22)

    if (prefersReducedMotion()) {
      setFgAnim(null)
      return undefined
    }

    setFgAnim({
      playKey: animKey,
      made,
      facing,
      yards,
      start,
      land,
      hit,
      bounce,
      lift,
      flightMs,
      phase: 'hold',
      t: 0,
      showBall: true,
      playing: true,
    })

    const totalMs = FG_HOLD_MS + flightMs + (made ? 0 : FG_BOUNCE_MS)
    const t0 = performance.now()
    const tick = (now) => {
      const elapsed = now - t0
      if (elapsed >= totalMs) {
        setFgAnim(null)
        return
      }

      let phase = 'hold'
      let t = 0
      const showBall = true

      if (elapsed < FG_HOLD_MS) {
        phase = 'hold'
        t = 0
      } else if (elapsed < FG_HOLD_MS + flightMs) {
        phase = 'flight'
        // Snappy plant → C1 through apex → steady cruise on the way down.
        t = fgFlightPathT((elapsed - FG_HOLD_MS) / flightMs)
      } else {
        phase = 'bounce'
        t = easeOutCubic((elapsed - FG_HOLD_MS - flightMs) / FG_BOUNCE_MS)
      }

      setFgAnim((prev) =>
        prev && prev.playKey === animKey
          ? { ...prev, phase, t, showBall, playing: true }
          : prev,
      )
      fgRafRef.current = requestAnimationFrame(tick)
    }
    fgRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (fgRafRef.current) cancelAnimationFrame(fgRafRef.current)
    }
  }, [
    isFootball,
    hideLiveLines,
    hasLine,
    pos,
    lastPlayText,
    animKey,
    isUserReplay,
    possessionSide,
    fieldFlipped,
    live,
    game,
  ])

  useEffect(() => {
    if (rushAnim || catchAnim || fgAnim || !hasLine || pos == null || hideLiveLines) return
    settledLinesRef.current = {
      scrimPct: pos,
      firstDownPct: firstDownPercentFromLive(live, pos, fieldFlipped),
    }
  }, [
    rushAnim,
    catchAnim,
    fgAnim,
    hasLine,
    pos,
    hideLiveLines,
    fieldFlipped,
    live?.possession,
    live?.down,
    live?.distance,
  ])

  if (!isFootball) return null

  // Calibrated 3D field coordinates (viewBox="0 0 1266 533")
  // Left Goal Line: top=(239.0, 191), bot=(161.0, 478)
  // Right Goal Line: top=(1023.0, 191), bot=(1098.0, 478)
  const lineDriver =
    rushAnim != null && !rushAnim.isTouchdown
      ? rushAnim
      : catchAnim != null && !catchAnim.isTouchdown
        ? catchAnim
        : null
  const linesT = lineDriver != null ? Number(lineDriver.linesProgress) || 0 : 1
  const tdAnim =
    rushAnim?.isTouchdown
      ? rushAnim
      : catchAnim?.isTouchdown
        ? catchAnim
        : null
  const displayScrimPct =
    lineDriver != null
      ? lerp(lineDriver.fromScrimPct, lineDriver.toScrimPct, linesT)
      : tdAnim
        ? tdAnim.fromScrimPct
        : pos
  const liveFirstDownPct = firstDownPercentFromLive(live, pos, fieldFlipped)
  const displayFirstDownPct =
    lineDriver != null &&
    lineDriver.fromFirstDownPct != null &&
    lineDriver.toFirstDownPct != null
      ? lerp(lineDriver.fromFirstDownPct, lineDriver.toFirstDownPct, linesT)
      : tdAnim
        ? tdAnim.fromFirstDownPct
        : liveFirstDownPct
  const linesFadeOpacity =
    tdAnim?.linesOpacity != null
      ? Math.max(0, Math.min(1, Number(tdAnim.linesOpacity)))
      : 1

  const scrimTop =
    hasLine && displayScrimPct != null
      ? fieldTopXFromPercent(displayScrimPct)
      : null
  const scrimBot =
    hasLine && displayScrimPct != null
      ? fieldBotXFromPercent(displayScrimPct)
      : null
  const scrimMidX =
    hasLine && displayScrimPct != null
      ? fieldMidXFromPercent(displayScrimPct)
      : null

  // First down line
  let firstDownTop = null
  let firstDownBot = null
  if (hasLine && displayFirstDownPct != null) {
    firstDownTop = fieldTopXFromPercent(displayFirstDownPct)
    firstDownBot = fieldBotXFromPercent(displayFirstDownPct)
  }

  // Prefer local logo files inside SVG <image> … ESPN CDN hrefs often paint as broken
  // images in WebKit (cross-origin). Enrich maps abbrevs onto /sports/{nfl|cfb}/logos.
  const logoBase = isCfbSport(sportKey) ? '/sports/cfb/logos' : '/sports/nfl/logos'
  const homeLogoLocal = String(game?.home?.logo || '')
  const homeAbbrev = String(game?.home?.abbrev || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
  const homeLogoSrc = homeLogoLocal.startsWith('/sports/')
    ? homeLogoLocal
    : homeAbbrev
      ? `${logoBase}/${homeAbbrev}.png`
      : ''
  const college = isCfbSport(sportKey)
  const endzoneFont = college ? ENDZONE_FONT_CFB : ENDZONE_FONT_NFL
  // First half: away left / home right. After flip: home left / away right.
  const leftSide = fieldFlipped ? game?.home : game?.away
  const rightSide = fieldFlipped ? game?.away : game?.home
  const leftColor = fieldFlipped ? homeColor : awayColor
  const rightColor = fieldFlipped ? awayColor : homeColor
  const leftEndzone = resolveEndzoneDesign(leftSide, leftColor, 'left', { college })
  const rightEndzone = resolveEndzoneDesign(rightSide, rightColor, 'right', { college })

  const catchPlaying = Boolean(
    catchAnim != null &&
      (catchAnim.showFigure || catchAnim.showTdLabel || catchAnim.playing),
  )
  const rushPlaying = Boolean(
    rushAnim != null &&
      (rushAnim.showFigure || rushAnim.showTdLabel || rushAnim.playing),
  )
  const fgPlaying = Boolean(fgAnim?.playing || (fgAnim != null && fgAnim.showBall))
  // Hide LOS ball for the full rush/catch/FG sequence.
  const playAnimActive = rushAnim != null || catchAnim != null || fgAnim != null
  const suppressBanner = isUserReplay && (rushPlaying || catchPlaying || fgPlaying)
  const rushX =
    rushAnim != null && rushAnim.showFigure
      ? rushAnim.startX + (rushAnim.endX - rushAnim.startX) * rushAnim.progress
      : null
  const rushTrailVisible =
    Boolean(rushAnim?.showTrail && rushAnim.showFigure && rushAnim.progress > 0.02)
  const catchX =
    catchAnim != null && catchAnim.showFigure
      ? catchAnim.startX + (catchAnim.endX - catchAnim.startX) * catchAnim.progress
      : null
  const catchTrailVisible =
    Boolean(catchAnim?.showTrail && catchAnim.showFigure && catchAnim.progress > 0.02)
  const catchBallT =
    catchAnim != null ? catchBallFlightProgress(catchAnim.progress) : 0
  const catchBallVisible =
    Boolean(catchAnim?.showBall) &&
    (catchBallT > 0 || (catchAnim != null && catchAnim.progress >= 1))
  const catchHandsLive =
    catchX != null && catchAnim != null
      ? catchHandsWorld(
          catchX - RUSH_FIG_W / 2,
          catchAnim.y - RUSH_FIG_H + 8,
          catchAnim.facing,
          RUSH_FIG_W,
          RUSH_FIG_H,
        )
      : null
  // Clamp flight t to 1 for the hold … same bezier end as live hands (no position snap).
  const catchBallFlightT =
    catchAnim != null && catchAnim.progress >= 1 ? 1 : catchBallT
  const catchBallCtrl =
    catchAnim != null && catchHandsLive
      ? {
          x: (catchAnim.ballStart.x + catchHandsLive.x) / 2,
          y:
            Math.min(catchAnim.ballStart.y, catchHandsLive.y) -
            catchArcLiftFromYards(catchAnim.yards),
        }
      : null
  const catchBall =
    catchBallVisible && catchHandsLive && catchBallCtrl
      ? quadBezier(
          catchAnim.ballStart,
          catchBallCtrl,
          catchHandsLive,
          catchBallFlightT,
        )
      : null
  // Gentle spiral into the held angle … old path jumped ~180° → -18° on catch.
  const catchBallFacingSign = catchAnim && catchAnim.facing < 0 ? -1 : 1
  const catchBallRotate =
    catchAnim != null
      ? (-36 + catchBallFlightT * 18) * catchBallFacingSign
      : 0
  const showTdBanner = Boolean(catchAnim?.showTdLabel || rushAnim?.showTdLabel)

  // Field-goal ball: upright plant → true parabola (rise/fall) → land past posts / bounce.
  // End-over-end topple like a placekick (Science of NFL Football / toppling-flight papers).
  let fgBall = null
  let fgBallRotate = -82
  if (fgAnim?.showBall) {
    const { phase, t, start, land, hit, bounce, lift, facing } = fgAnim
    // SVG +rotate = clockwise. Leftward kick = CW (backwards); rightward = CCW.
    const tumble = facing < 0 ? 1 : -1
    if (phase === 'hold') {
      fgBall = { x: start.x, y: start.y }
      // Slight tee lean before the plant (not a perfect -90 statue).
      fgBallRotate = -82
    } else if (phase === 'flight') {
      fgBall = fgParabolaPoint(start, land, lift, t)
      // ~20 full end-over-end revolutions over the flight.
      fgBallRotate = -82 + tumble * t * (FG_TUMBLE_REVS * 360)
    } else {
      // Miss: carom off the upright and drop back toward the field.
      const ctrl = {
        x: (hit.x + bounce.x) / 2 + tumble * 16,
        y: Math.min(hit.y, bounce.y) - 40,
      }
      fgBall = quadBezier(hit, ctrl, bounce, t)
      fgBallRotate = -82 + tumble * (FG_TUMBLE_REVS * 360 + t * 720)
    }
  }
  return (
    <div data-lounge-game-field className="relative w-full px-1 pb-0 pt-5 sm:px-1.5">
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
            <filter id="glow-rush" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="text-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.8" />
            </filter>
            <filter id="text-shadow-sm" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.85" />
            </filter>
            {/* Endzone lighting gradients */}
            <linearGradient id="ez-left-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={leftEndzone.gradSheen} stopOpacity="0.84" />
              <stop offset="45%" stopColor={leftEndzone.gradMid} stopOpacity="0.78" />
              <stop offset="100%" stopColor={leftEndzone.gradDeep} stopOpacity="0.86" />
            </linearGradient>
            <linearGradient id="ez-right-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={rightEndzone.gradSheen} stopOpacity="0.84" />
              <stop offset="45%" stopColor={rightEndzone.gradMid} stopOpacity="0.78" />
              <stop offset="100%" stopColor={rightEndzone.gradDeep} stopOpacity="0.86" />
            </linearGradient>
          </defs>

          {/* Endzone Turf Washes */}
          <path d={ENDZONE_COORDS.left.paintPath} fill="url(#ez-left-grad)" />
          <path d={ENDZONE_COORDS.right.paintPath} fill="url(#ez-right-grad)" />

          {/* Left Endzone Mascot Wordmark (away 1H / home 2H) */}
          {leftEndzone.glyphs?.map((g, idx) => (
            <g key={`left-glyph-${idx}`} transform={g.transform}>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="none"
                stroke="#000000"
                strokeWidth="8"
                strokeLinejoin="round"
                fontFamily={endzoneFont}
                fontSize={leftEndzone.fontSize}
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
                stroke={leftEndzone.textStroke}
                strokeWidth="4.5"
                strokeLinejoin="round"
                fontFamily={endzoneFont}
                fontSize={leftEndzone.fontSize}
                fontWeight="900"
              >
                {g.char}
              </text>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill={leftEndzone.textFill}
                stroke={leftEndzone.isGoldText ? '#ffffff' : 'none'}
                strokeWidth={leftEndzone.isGoldText ? '1' : '0'}
                fontFamily={endzoneFont}
                fontSize={leftEndzone.fontSize}
                fontWeight="900"
              >
                {g.char}
              </text>
            </g>
          ))}

          {/* Right Endzone Mascot Wordmark (home 1H / away 2H) */}
          {rightEndzone.glyphs?.map((g, idx) => (
            <g key={`right-glyph-${idx}`} transform={g.transform}>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="none"
                stroke="#000000"
                strokeWidth="8"
                strokeLinejoin="round"
                fontFamily={endzoneFont}
                fontSize={rightEndzone.fontSize}
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
                stroke={rightEndzone.textStroke}
                strokeWidth="4.5"
                strokeLinejoin="round"
                fontFamily={endzoneFont}
                fontSize={rightEndzone.fontSize}
                fontWeight="900"
              >
                {g.char}
              </text>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill={rightEndzone.textFill}
                stroke={rightEndzone.isGoldText ? '#ffffff' : 'none'}
                strokeWidth={rightEndzone.isGoldText ? '1' : '0'}
                fontFamily={endzoneFont}
                fontSize={rightEndzone.fontSize}
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
                xlinkHref={homeLogoSrc}
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
          {!hideLiveLines &&
          firstDownTop != null &&
          firstDownBot != null &&
          linesFadeOpacity > 0.02 ? (
            <line
              x1={firstDownTop}
              y1={191}
              x2={firstDownBot}
              y2={478}
              stroke="#fde047"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeOpacity={linesFadeOpacity}
              filter="url(#glow-1st)"
            />
          ) : null}

          {/* Line of scrimmage (light blue) */}
          {!hideLiveLines &&
          scrimTop != null &&
          scrimBot != null &&
          linesFadeOpacity > 0.02 ? (
            <g opacity={linesFadeOpacity}>
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
              {/* Ball on LOS … hidden for full rush/catch sequence. */}
              {!playAnimActive ? (
                <g transform={`translate(${scrimMidX - 18} ${334.5 - 12})`}>
                  <AmericanFootballMark tone="field" size={36} rotate={-26} />
                </g>
              ) : null}
            </g>
          ) : null}

          {/* Rush trail + RB figure (once per distinct last-play text) */}
          {rushAnim && rushX != null ? (
            <g data-lounge-rush-anim>
              {rushTrailVisible ? (
                <line
                  x1={rushAnim.startX}
                  y1={rushAnim.y}
                  x2={rushX}
                  y2={rushAnim.y}
                  stroke={rushAnim.primary}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeOpacity="0.88"
                  filter="url(#glow-rush)"
                />
              ) : null}
              <g
                transform={`translate(${rushX - RUSH_FIG_W / 2} ${rushAnim.y - RUSH_FIG_H + 8})`}
              >
                <GameHubRushFigure
                  primary={rushAnim.primary}
                  secondary={rushAnim.secondary}
                  helmetColor={rushAnim.helmetColor}
                  pantsColor={rushAnim.pantsColor}
                  tightsColor={rushAnim.tightsColor}
                  headshotUrl={rushAnim.headshotUrl}
                  jerseyNumber={rushAnim.jerseyNumber}
                  facing={rushAnim.facing}
                  width={RUSH_FIG_W}
                  height={RUSH_FIG_H}
                />
              </g>
            </g>
          ) : null}

          {/* Pass catch … WR slide + football arc into raised hands */}
          {catchAnim && catchX != null ? (
            <g data-lounge-catch-anim>
              {catchTrailVisible ? (
                <line
                  x1={catchAnim.startX}
                  y1={catchAnim.y}
                  x2={catchX}
                  y2={catchAnim.y}
                  stroke={catchAnim.primary}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeOpacity="0.88"
                  filter="url(#glow-rush)"
                />
              ) : null}
              <g
                transform={`translate(${catchX - RUSH_FIG_W / 2} ${catchAnim.y - RUSH_FIG_H + 8})`}
              >
                <GameHubCatchFigure
                  primary={catchAnim.primary}
                  secondary={catchAnim.secondary}
                  helmetColor={catchAnim.helmetColor}
                  pantsColor={catchAnim.pantsColor}
                  tightsColor={catchAnim.tightsColor}
                  headshotUrl={catchAnim.headshotUrl}
                  jerseyNumber={catchAnim.jerseyNumber}
                  facing={catchAnim.facing}
                  width={RUSH_FIG_W}
                  height={RUSH_FIG_H}
                />
              </g>
              {/* One continuous ball mark … no remount / size / rotate snap on catch. */}
              {catchBall ? (
                <g
                  transform={`translate(${catchBall.x - 12} ${catchBall.y - 9})`}
                >
                  <AmericanFootballMark
                    tone="field"
                    size={24}
                    rotate={catchBallRotate}
                  />
                </g>
              ) : null}
            </g>
          ) : null}

          {fgBall ? (
            <g transform={`translate(${fgBall.x - FG_BALL_SIZE / 2} ${fgBall.y - FG_BALL_SIZE * 0.38})`}>
              <AmericanFootballMark tone="field" size={FG_BALL_SIZE} rotate={fgBallRotate} />
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

        {/* Stoppage / break banner … TIMEOUT, End of 1st, HALFTIME, End of 3rd, GAME OVER */}
        {centerBanner && !suppressBanner && !showTdBanner ? (
          <div
            data-lounge-game-field-banner
            className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center px-4 pb-[18%]"
            aria-live="polite"
          >
            <span
              className="max-w-full -translate-y-2 text-center text-[28px] font-black uppercase leading-none tracking-[0.08em] text-white sm:text-[36px] sm:-translate-y-3"
              style={{
                fontFamily: "Oswald, Graduate, Impact, 'Arial Black', sans-serif",
                textShadow:
                  '0 1px 0 #000, 0 2px 0 #000, 0 3px 0 rgba(0,0,0,0.85), 0 8px 24px rgba(0,0,0,0.65)',
                WebkitTextStroke: '1px rgba(0,0,0,0.35)',
              }}
            >
              {centerBanner}
            </span>
          </div>
        ) : null}

        {/* Rush / pass TD celebration */}
        {showTdBanner ? (
          <div
            data-lounge-td-banner
            className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center px-4 pb-[18%]"
            aria-live="polite"
          >
            <span
              className="lounge-td-banner-text max-w-full text-center text-[34px] font-black uppercase leading-none tracking-[0.14em] text-amber-300 sm:text-[44px]"
              style={{
                fontFamily: "Oswald, Graduate, Impact, 'Arial Black', sans-serif",
                textShadow:
                  '0 0 18px rgba(251,191,36,0.55), 0 1px 0 #000, 0 3px 0 #000, 0 10px 28px rgba(0,0,0,0.7)',
                WebkitTextStroke: '1px rgba(0,0,0,0.4)',
              }}
            >
              Touchdown
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * One bets bar (away left / home right). Money lives in the side pair `bets·$`
 * under each abbrev … no second rail, no seam tick.
 */
/** Public bets/$ bar … pre-game only (live/post stay scoreboard + field chrome). */
function HeroPublicBetting({ game, splits, awayColor, homeColor }) {
  if (!splits || game?.status !== 'pre') return null
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
            <span className="mx-0.5 font-semibold text-white/55">·</span>
            <span className={moneySkew ? 'text-amber-200' : 'text-white/75'}>
              {Math.round(awayMoney)}
            </span>
          </div>
        </div>
        <div className="pt-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-white/70">
          <div>{moneySkew ? 'Public · $ split' : 'Public'}</div>
          <div className="mt-0.5 font-medium normal-case tracking-normal text-white/55">bets · $</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 drop-shadow">
            {game.home?.abbrev}
          </div>
          <div className="mt-0.5 text-[12px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
            {Math.round(homeBets)}
            <span className="mx-0.5 font-semibold text-white/55">·</span>
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
  playReplayNonce = 0,
  replayTeam = null,
  topBar = null,
  splits = null,
  players = [],
}) {
  const { awayColor, homeColor, awayTreatment, homeTreatment } = useLoungeSportsPillWashAndLogos(game)
  const clock = liveClockLabel(game, live)
  const isFinal = game.status === 'post'
  // Final: clock still says Final … drop stale down/distance + yard line.
  const down = isFinal ? null : downDistanceLabel(live)
  const yard = isFinal ? null : yardLineLabel(game, live)
  const isFootball = String(game.sport_key || '').includes('football')
  const showLiveChrome = isFootball && game.status === 'in'
  const awayHasBall = showLiveChrome && live?.possession === 'away'
  const homeHasBall = showLiveChrome && live?.possession === 'home'
  const awayTimeouts = showLiveChrome ? (live?.away_timeouts ?? TIMEOUT_SLOTS) : null
  const homeTimeouts = showLiveChrome ? (live?.home_timeouts ?? TIMEOUT_SLOTS) : null

  const awayScoreN = Number(game.away?.score)
  const homeScoreN = Number(game.home?.score)
  const scoresComparable =
    isFinal && Number.isFinite(awayScoreN) && Number.isFinite(homeScoreN)
  const awayScoreDim = scoresComparable && awayScoreN < homeScoreN
  const homeScoreDim = scoresComparable && homeScoreN < awayScoreN
  const lastPlayText = String(lastPlay || '').trim()
  const showField = isFootball && (game.status === 'in' || game.status === 'post')
  const awayMl = formatLoungeSportsMoneyline(game.away?.ml)
  const homeMl = formatLoungeSportsMoneyline(game.home?.ml)
  const awayLabel = hubTeamLabel(game.away, game.status, game.sport_key)
  const homeLabel = hubTeamLabel(game.home, game.status, game.sport_key)
  const preLabels = game.status === 'pre'

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
      <div
        data-lounge-game-hero-veil
        className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-b from-black/15 via-black/28 to-[#09090b]"
      />

      {topBar ? <div className="relative z-[4]">{topBar}</div> : null}

      {showField ? (
        /* Condensed scoreboard only while the 3D field is up: logo | score mid-gap | status | … */
        <div data-lounge-game-scoreboard className="relative z-[4] px-3 pb-3 pt-1">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex w-[52px] shrink-0 flex-col items-center">
                <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={52} />
                <div className="mt-0.5 w-full text-center text-[13px] font-semibold uppercase tracking-wide text-white/85">
                  {awayLabel}
                </div>
                {game.away?.record ? (
                  <div className="mt-0.5 w-full text-center text-[10px] font-medium tabular-nums leading-none text-white/55">
                    {game.away.record}
                  </div>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                      awayScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.away, game.status)}
                  </div>
                  {awayMl ? (
                    <div className="mt-0.5 text-[11px] font-semibold leading-none tabular-nums text-white/70 drop-shadow">
                      {awayMl}
                    </div>
                  ) : null}
                  {awayTimeouts != null ? <TimeoutDots remaining={awayTimeouts} align="center" /> : null}
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
              <WatchBroadcastPill label={game.broadcast} url={game.broadcast_url} />
            </div>

            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                {homeHasBall ? <PossessionFootball side="home" /> : null}
                <div className="flex flex-col items-center">
                  <div
                    className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                      homeScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.home, game.status)}
                  </div>
                  {homeMl ? (
                    <div className="mt-0.5 text-[11px] font-semibold leading-none tabular-nums text-white/70 drop-shadow">
                      {homeMl}
                    </div>
                  ) : null}
                  {homeTimeouts != null ? <TimeoutDots remaining={homeTimeouts} align="center" /> : null}
                </div>
              </div>
              <div className="flex w-[52px] shrink-0 flex-col items-center">
                <LoungeSportsTeamLogo side={game.home} treatment={homeTreatment} size={52} />
                <div className="mt-0.5 w-full text-center text-[13px] font-semibold uppercase tracking-wide text-white/85">
                  {homeLabel}
                </div>
                {game.home?.record ? (
                  <div className="mt-0.5 w-full text-center text-[10px] font-medium tabular-nums leading-none text-white/55">
                    {game.home.record}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Pre/post without field: same logo | odds | center | odds | logo rhythm; bigger logos. */
        <div data-lounge-game-scoreboard className="relative z-[4] px-3 pb-3 pt-2">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex w-[68px] shrink-0 flex-col items-center">
                <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={68} />
                <div
                  className={`mt-0.5 w-full text-center font-semibold leading-snug text-white/85 ${
                    preLabels
                      ? 'text-[12px] tracking-tight'
                      : 'text-[13px] uppercase tracking-wide'
                  }`}
                >
                  {awayLabel}
                </div>
                {game.away?.record ? (
                  <div className="mt-0.5 w-full text-center text-[10px] font-medium tabular-nums leading-none text-white/55">
                    {game.away.record}
                  </div>
                ) : null}
                {awayTimeouts != null ? <TimeoutDots remaining={awayTimeouts} align="center" /> : null}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                      awayScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.away, game.status)}
                  </div>
                  {awayMl ? (
                    <div className="mt-0.5 text-[11px] font-semibold leading-none tabular-nums text-white/70 drop-shadow">
                      {awayMl}
                    </div>
                  ) : null}
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
              <WatchBroadcastPill label={game.broadcast} url={game.broadcast_url} />
            </div>

            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                {homeHasBall ? <PossessionFootball side="home" /> : null}
                <div className="flex flex-col items-center">
                  <div
                    className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                      homeScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.home, game.status)}
                  </div>
                  {homeMl ? (
                    <div className="mt-0.5 text-[11px] font-semibold leading-none tabular-nums text-white/70 drop-shadow">
                      {homeMl}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex w-[68px] shrink-0 flex-col items-center">
                <LoungeSportsTeamLogo side={game.home} treatment={homeTreatment} size={68} />
                <div
                  className={`mt-0.5 w-full text-center font-semibold leading-snug text-white/85 ${
                    preLabels
                      ? 'text-[12px] tracking-tight'
                      : 'text-[13px] uppercase tracking-wide'
                  }`}
                >
                  {homeLabel}
                </div>
                {game.home?.record ? (
                  <div className="mt-0.5 w-full text-center text-[10px] font-medium tabular-nums leading-none text-white/55">
                    {game.home.record}
                  </div>
                ) : null}
                {homeTimeouts != null ? <TimeoutDots remaining={homeTimeouts} align="center" /> : null}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-[4]">
        <HeroPublicBetting
          game={game}
          splits={splits}
          awayColor={awayColor}
          homeColor={homeColor}
        />
        {showField ? (
          <FieldViz
            game={game}
            live={live}
            awayColor={awayColor}
            homeColor={homeColor}
            lastPlay={lastPlayText}
            playReplayNonce={playReplayNonce}
            replayTeam={replayTeam}
            players={players}
          />
        ) : (
          <div className="h-2" aria-hidden="true" />
        )}
      </div>

      {showField && lastPlayText ? (
        <div
          data-lounge-game-last-play
          className="relative z-[4] truncate px-3 pb-2.5 pt-0.5 text-[12px] text-white/75"
        >
          <span className="font-semibold uppercase tracking-wide text-white/55">Last play </span>
          {lastPlayText}
        </div>
      ) : null}
    </div>
  )
}
