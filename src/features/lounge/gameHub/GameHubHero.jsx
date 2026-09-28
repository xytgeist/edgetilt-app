import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  LoungeSportsTeamLogo,
  useLoungeSportsPillWashAndLogos,
} from '../loungeSportsPillPaint.jsx'
import { formatLoungeSportsMoneyline } from '../LoungeGameScorePill.jsx'
import { cfbTeamSchoolName, hubTeamLabel } from '../loungeSportsMatch.js'
import { openExternalUrl } from '../../../utils/edgeNative.js'
import {
  CORNER_PYLONS,
  ENDZONE_COORDS,
  resolveEndzoneDesign,
} from './gameHubEndzone.js'
import GameHubRushFigure from './GameHubRushFigure.jsx'
import GameHubCatchFigure from './GameHubCatchFigure.jsx'
import { getLuminance, hexToHsl, hexToRgb, resolveTeamKit } from './gameHubFigureColors.js'
import { pregameGameMarketPicks, pregamePlayerPropRails } from './gameHubPregameProps.js'
import { liveFantasyRails, livePropRails } from './gameHubLiveRails.js'
import { liveBestLines, pregameBestLines } from './gameHubBestLines.js'
import { useNevadaBooks } from './gameHubNevadaBooks.js'
import { formatFantasyPoints, playFantasyPoints } from './gameHubPlayFantasy.js'
import {
  fantasyScoringLabel,
  getFantasyScoring,
  nextFantasyScoring,
  receptionPoints,
  setFantasyScoring,
  useFantasyScoring,
} from './gameHubFantasyScoring.js'
import {
  CATCH_HANDS_LOCAL,
  CATCH_VIEWBOX_H,
  CATCH_VIEWBOX_W,
} from './gameHubCatchPieces.js'
import {
  american,
  attackDirection,
  downDistanceLabel,
  fieldCenterBanner,
  kalshiCents,
  fieldPercent,
  isFieldOrientationFlipped,
  isFieldReplayablePlay,
  liveClockLabel,
  matchRushPlayer,
  parseFieldGoalPlay,
  parseInterceptionPlay,
  parseInterceptionReturn,
  parseKickoffReturn,
  parseKickoffTouchback,
  parsePuntTouchback,
  parsePassPlay,
  parsePuntReturn,
  parseRushPlay,
  playTextIsScoreTry,
  playTextAwaitsKickoff,
  buildPossessionDriveMarks,
  drivePlayShortLabel,
  isOpeningKickoffRow,
  playsFromEarlierHalf,
  lastBallPlayText,
  latestPlayScore,
  playTextIsTouchdown,
  resolveFigureJersey,
  resolvePlayAnimationPercents,
  playSpotFieldPercent,
  scoreText,
  signedPoint,
  yardLineLabel,
} from './gameHubFormatters.js'
import { armGameHubWhistle, playGameHubWhistle } from './gameHubWhistle.js'

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
/** Pick-six: QB throw flight (LOS → defender's hands). */
const PICK_THROW_MS = 1300
/** Defender starts drifting onto the ball's down arc at this fraction of the throw. */
const PICK_BREAK_AT = 0.3
/** Defender starts this many yards deeper (offense direction) than the pick spot. */
const PICK_DEFENDER_DEPTH_YDS = 7
/** Return run: base + per-yard, capped so a 99-yarder still reads. */
const PICK_RETURN_BASE_MS = 900
const PICK_RETURN_MS_PER_YD = 20
const PICK_RETURN_MAX_MS = 2600
/** Non-scoring pick with no return: defender goes down with it. */
const PICK_DOWN_SETTLE_MS = 350
/** Non-scoring pick: pause at the return spot before the TURNOVER banner. */
const PICK_DOWN_HOLD_MS = 900
/** Interception touchback: caught this deep in the end zone (end line is 10 yd deep). */
const PICK_TOUCHBACK_DEPTH_YDS = 6
/** Kickoff hang time (tee → returner's tuck). */
const KICK_FLIGHT_MS = 2100
/** Punt hang time (punter → returner's tuck) … a punt hangs longer than a kickoff over a shorter chord. */
const PUNT_FLIGHT_MS = 2400
/** Punter stands this many yards behind the LOS. */
const PUNT_DEPTH_YDS = 15
/** Typical gross punt when the feed omits the distance. */
const PUNT_DEFAULT_YDS = 55
/** Returners don't field punts inside their own 5. */
const PUNT_MIN_CATCH_YD = 5
/** Returner starts creeping up onto the down arc at this fraction of the flight. */
const KICK_CREEP_AT = 0.45
/** Returner lines up this many yards deeper than where he fields it. */
const KICK_RETURNER_DEPTH_YDS = 5
const KICK_RETURN_BASE_MS = 800
const KICK_RETURN_MS_PER_YD = 20
const KICK_RETURN_MAX_MS = 2800
/** Hold the returner where he's tackled before the next drive's lines settle in. */
const KICK_HOLD_MS = 1600
/** Kick apex lift (px above the chord) … a kickoff hangs well above a pass. */
const KICK_ARC_LIFT = 250
/** Punts go up much higher than kickoffs. */
const PUNT_ARC_LIFT = 400
/** Touchback: lands this deep in the end zone, then hops out the back (end line is 10 yd deep). */
const TOUCHBACK_LAND_DEPTH_YDS = 4
const TOUCHBACK_BOUNCES = [
  { toYds: 8, lift: 34, ms: 420 },
  { toYds: 9.5, lift: 15, ms: 320 },
]
const TOUCHBACK_HOLD_MS = 500
/** Max wait for the live last play's feed row before auto-playing without it. */
const PLAY_ROW_WAIT_MS = 6000
/** Ball piece center in the RB sculpt viewBox (left-facing art, 728×1382). */
const RUSH_TUCK_LOCAL = { x: 140, y: 380 }
const RUSH_VIEWBOX_W = 728
const RUSH_VIEWBOX_H = 1382
/** Rush TD celebrate timeline (same phases as pass TD, keyed off RUSH_RUN_MS). */
/** TD: the figure finishes this deep in the end zone (half its 10 yd depth); drive lines still stop at the goal line. */
const TD_FIGURE_END_ZONE_YDS = 5
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
 * Thrown spiral: whole long-axis turns per flight (laces land back on top, no snap at the catch), scaled by
 * distance … ~3 turns at 5 yds, ~15 at 30 yds.
 */
/** Past ~16 turns/s a 60fps frame steps ~100°+ and the laces strobe / wagon-wheel backwards. */
const PASS_SPIRAL_MAX_REVS_PER_S = 16
function passSpiralRevs(yards, flightMs) {
  const y = Math.abs(Number(yards))
  const want = Number.isFinite(y) ? Math.round(Math.max(2, Math.min(20, 3 + (y - 5) * 0.48))) : 5
  const cap = Math.max(2, Math.floor((PASS_SPIRAL_MAX_REVS_PER_S * flightMs) / 1000))
  return Math.min(want, cap)
}
function passSpiral(flightT, yards, flightMs) {
  const t = Number(flightT)
  return Number.isFinite(t) && t > 0 && t < 1 ? t * passSpiralRevs(yards, flightMs) * 360 : null
}
/** Kickoffs / punts tumble end-over-end at the field goal's rate (revs per ms of flight). */
const KICK_TUMBLE_DEG_PER_MS = (FG_TUMBLE_REVS * 360) / FG_FLIGHT_BASE_MS
/** Backwards end-over-end from the tee lean … SVG +rotate is clockwise, so a leftward kick spins CW. */
/** Punts turn over lazily (~1.5 revs/s) vs a kickoff's hard tumble. */
const PUNT_TUMBLE_DEG_PER_MS = (1.5 * 360) / 1000
function kickTumbleRotate(elapsedMs, kickDir, degPerMs = KICK_TUMBLE_DEG_PER_MS) {
  return -82 + (kickDir < 0 ? 1 : -1) * elapsedMs * degPerMs
}
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
 * Perspective-near (front) uprights are the *shorter* stems in the art
 * (left `uLo`, right `uHi`) … cut into gamecast-goalposts-front-poles.png
 * and drawn above the FG ball. Taller stems stay in the back overlay.
 */
const FG_POSTS = {
  left: { uLo: 96, uHi: 136, centerX: 116, crossbarY: 208, frontX: 96 },
  right: { uLo: 1128, uHi: 1164, centerX: 1146, crossbarY: 208, frontX: 1168 },
}

const RUSH_Y = 334.5
const RUSH_FIG_W = 124
const RUSH_FIG_H = 144
/** Holder / tee sit this many yards behind the LOS on a placekick. */
const FG_HOLDER_BEHIND_LOS = 7

/**
 * FG LOS + kick spot (field %).
 * Official FG yards ≈ kick-to-posts (posts 10 yd past the goal line); kick sits
 * ~7 yd behind the LOS. Prefer settled / live LOS when it still matches that
 * geometry … live pos is often already the *next* play after a made FG.
 */
function resolveFgLosAndKick({
  fgYards,
  possessionSide,
  livePos,
  settledScrimPct,
  flipped,
  knownLosPct = null,
}) {
  const attackDir = attackDirection(possessionSide, flipped)
  const goalPct = attackDir > 0 ? 100 : 0
  const y = Number(fgYards)

  if (knownLosPct != null && Number.isFinite(Number(knownLosPct))) {
    const losPct = Math.max(2, Math.min(98, Number(knownLosPct)))
    const kickPct = Math.max(2, Math.min(98, losPct - attackDir * FG_HOLDER_BEHIND_LOS))
    return { losPct, kickPct, attackDir }
  }

  let impliedKick = null
  let impliedLos = null
  if (Number.isFinite(y) && y >= 18 && y <= 75) {
    impliedKick = goalPct - attackDir * (y - 10)
    impliedLos = impliedKick + attackDir * FG_HOLDER_BEHIND_LOS
  }

  const nearImplied = (pct) =>
    impliedLos == null || Math.abs(Number(pct) - impliedLos) <= 12

  let losPct = null
  if (settledScrimPct != null && Number.isFinite(Number(settledScrimPct)) && nearImplied(settledScrimPct)) {
    losPct = Number(settledScrimPct)
  }
  if (losPct == null && impliedLos != null) {
    losPct = impliedLos
  }
  if (
    losPct == null &&
    livePos != null &&
    Number.isFinite(Number(livePos)) &&
    nearImplied(livePos)
  ) {
    losPct = Number(livePos)
  }
  if (losPct == null && impliedLos != null) {
    losPct = impliedLos
  }
  if (losPct == null) {
    // Midfield-ish fallback for tap-to-replay with no LOS / yards.
    losPct = goalPct - attackDir * 35
  }

  losPct = Math.max(2, Math.min(98, losPct))
  const kickPct = Math.max(
    2,
    Math.min(98, losPct - attackDir * FG_HOLDER_BEHIND_LOS),
  )
  return { losPct, kickPct, attackDir }
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

const FIELD_FAR_Y = 191
const FIELD_NEAR_Y = 478
/** Perspective x for a field percent at any depth between the far and near sidelines. */
function fieldXAtY(p, y) {
  const t = (y - FIELD_FAR_Y) / (FIELD_NEAR_Y - FIELD_FAR_Y)
  return fieldTopXFromPercent(p) + (fieldBotXFromPercent(p) - fieldTopXFromPercent(p)) * t
}

/** Wait this long after a new scoring PBP row before its score may tick (lets the field anim start first). */
const PLAY_SCORE_GRACE_MS = 900

/** Full "left end" / "deep right" drift off the ball line for the rush / catch figure. */
const RUN_LATERAL_PX = 50

/** Most of the drift lands in the first half of the run, then the figure heads straight upfield. */
function runLateralAt(lateralPx, progress) {
  if (!lateralPx) return 0
  return lateralPx * easeOutCubic(Math.min(1, Math.max(0, progress) / 0.55))
}

/** Rush / catch figure spot at `progress`, perspective-correct once it drifts off the ball line. */
function runPoint(anim, progress, baseY = anim.y) {
  const y = baseY + runLateralAt(anim.lateralPx, progress)
  return { x: fieldXAtY(lerp(anim.fromScrimPct, anim.toScrimPct, progress), y), y }
}

function runTrailPoints(anim, progress) {
  const n = Math.max(2, Math.ceil(progress * 16))
  const pts = []
  for (let i = 0; i <= n; i += 1) {
    const p = runPoint(anim, (progress * i) / n, anim.trailY)
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  }
  return pts.join(' ')
}

/** Drive chart lane spacing … losses / flags on the offense drop one lane toward the near sideline. */
const DRIVE_LANE_PX = 13
const DRIVE_INCOMPLETE_LATERAL_PX = 58
const DRIVE_INCOMPLETE_LIFT_PX = 42

function driveArrow(x, y, dir) {
  return `${x + dir * 6},${y} ${x - dir * 4},${y - 5} ${x - dir * 4},${y + 5}`
}

/** Maroon / navy on turf reads black behind a dark halo … light halo for dark team colors.
 * No blur filter on these: a horizontal line has a zero-height bbox, so a filtered stroke never paints. */
function playLineHalo(primary) {
  const light = getLuminance(hexToRgb(primary)) < 0.35
  return { halo: light ? '#ffffff' : '#000000', haloOpacity: light ? 0.35 : 0.35 }
}

/** How long the per-play fantasy points chips stay up after the play anim ends. */
const FANTASY_TOAST_MS = 3400

const THROW_FLIGHT_MS = 720
const THROW_BOUNCES = [
  { dist: 22, lift: 15, ms: 360 },
  { dist: 12, lift: 6, ms: 230 },
  { dist: 6, lift: 2.5, ms: 150 },
]
const THROW_REST_MS = 260
const THROW_FADE_MS = 240
const THROW_TOTAL_MS =
  THROW_FLIGHT_MS + THROW_BOUNCES.reduce((s, b) => s + b.ms, 0) + THROW_REST_MS + THROW_FADE_MS

/** Quadratic sub-curve [0, t] as a path … lets the dashed arc trail the ball. */
function quadPathTo(p0, c, p1, t) {
  const q = { x: p0.x + (c.x - p0.x) * t, y: p0.y + (c.y - p0.y) * t }
  const b = quadBezier(p0, c, p1, t)
  return `M ${p0.x} ${p0.y} Q ${q.x} ${q.y} ${b.x} ${b.y}`
}

/** Ball + X at `elapsed` ms into the throw: arc flight, ground bounces, rest, fade. */
function incompleteThrowFrame(p0, c, p1, elapsed) {
  if (elapsed < THROW_FLIGHT_MS) {
    const t = elapsed / THROW_FLIGHT_MS
    const b = quadBezier(p0, c, p1, t)
    const tx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x)
    const ty = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y)
    return { t, ball: b, rotate: (Math.atan2(ty, tx) * 180) / Math.PI, ballOpacity: 1, xScale: 0 }
  }
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1
  const ux = (p1.x - p0.x) / len
  const uy = (p1.y - p0.y) / len
  const spin = ux < 0 ? -1 : 1
  const xScale = Math.min(1, (elapsed - THROW_FLIGHT_MS) / 140)
  let at = elapsed - THROW_FLIGHT_MS
  let sx = p1.x
  let sy = p1.y
  let rot = 0
  for (const bounce of THROW_BOUNCES) {
    if (at < bounce.ms) {
      const s = at / bounce.ms
      return {
        t: 1,
        ball: { x: sx + ux * bounce.dist * s, y: sy + uy * bounce.dist * s - 4 * bounce.lift * s * (1 - s) },
        rotate: rot + spin * 200 * s,
        ballOpacity: 1,
        xScale,
      }
    }
    at -= bounce.ms
    sx += ux * bounce.dist
    sy += uy * bounce.dist
    rot += spin * 200
  }
  const fade = Math.max(0, at - THROW_REST_MS) / THROW_FADE_MS
  return { t: 1, ball: { x: sx, y: sy }, rotate: rot, ballOpacity: Math.max(0, 1 - fade), xScale: 1 }
}

/**
 * Incompletion on the drive chart … static dashed arc to a red X, or (newest play, once per `throwKey`)
 * the ball leading the arc, bouncing off the turf, and the X popping in on the first hit.
 */
/**
 * Field banner text that stays on one line … shrinks the font to the banner's inner width instead of wrapping.
 * Measures an unanimated twin so the pop-in's wide letter-spacing doesn't under-size it.
 */
/** Space kept between the scoreboard's center stack and a field banner (covers the text's own -translate-y). */
const BANNER_FLOOR_GAP_PX = 12

/**
 * Field banner layer that slides down just enough to clear `floorRef` (the scoreboard's center stack … clock,
 * down, channel pill). Landscape lets the field run up under the board, so tall phones would otherwise center
 * the banner on the pill. Measures offsets, not rects, since the banner text animates its transform.
 */
function FloorClearBanner({ floorRef = null, measureKey = '', className, children, ...attrs }) {
  const wrapRef = useRef(null)
  const shiftRef = useRef(0)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const floor = floorRef?.current
    if (!wrap || !floor) return undefined
    // Block line spans inside the (inline, transformed) visible text: real boxes for ResizeObserver; their
    // offsetParent is that text span, which sits at `vis.offsetTop` inside `wrap`.
    const lineEls = () => [...(wrap.lastElementChild?.children || [])]
    const measure = () => {
      const vis = wrap.lastElementChild
      const lines = lineEls()
      if (!vis || !lines.length) return
      const last = lines[lines.length - 1]
      const top = vis.offsetTop + lines[0].offsetTop
      const bottom = vis.offsetTop + last.offsetTop + last.offsetHeight
      const textTop = wrap.getBoundingClientRect().top - shiftRef.current + top
      const room = Math.max(0, wrap.clientHeight - bottom)
      const need = floor.getBoundingClientRect().bottom + BANNER_FLOOR_GAP_PX - textTop
      const next = Math.max(0, Math.min(Math.ceil(need), room))
      if (next === shiftRef.current) return
      shiftRef.current = next
      setShift(next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    ro.observe(floor)
    for (const el of lineEls()) ro.observe(el)
    return () => ro.disconnect()
  }, [floorRef, measureKey])

  return (
    <div
      ref={wrapRef}
      className={className}
      style={shift ? { transform: `translateY(${shift}px)` } : undefined}
      {...attrs}
    >
      {children}
    </div>
  )
}

function FieldBannerFitText({ text, className, style }) {
  const measureRef = useRef(null)
  const [fontPx, setFontPx] = useState(null)

  useLayoutEffect(() => {
    const twin = measureRef.current
    const box = twin?.parentElement
    if (!twin || !box) return undefined
    const fit = () => {
      const cs = getComputedStyle(box)
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const natural = twin.getBoundingClientRect().width
      const base = parseFloat(getComputedStyle(twin).fontSize)
      setFontPx(avail > 0 && natural > avail ? Math.floor(base * (avail / natural) * 0.98 * 2) / 2 : null)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [text])

  // "\n" stacks lines … the widest line sets the shrink.
  const lines = String(text || '').split('\n')
  const body = lines.map((line, i) => (
    <span key={i} className="block">
      {line}
    </span>
  ))
  return (
    <>
      <span
        ref={measureRef}
        aria-hidden="true"
        className={`${className} invisible absolute left-0 top-0 inline-block whitespace-nowrap`}
        style={{ ...style, animation: 'none', transform: 'none' }}
      >
        {body}
      </span>
      <span className={`${className} whitespace-nowrap`} style={fontPx ? { ...style, fontSize: `${fontPx}px` } : style}>
        {body}
      </span>
    </>
  )
}

function DriveIncompleteMark({ p0, c, p1, attackDir, primary, halo, haloOpacity, throwKey, onThrowDone, college = false, yards = null }) {
  const [elapsed, setElapsed] = useState(null)
  const onDoneRef = useRef(onThrowDone)
  useEffect(() => {
    onDoneRef.current = onThrowDone
  }, [onThrowDone])
  useEffect(() => {
    if (!throwKey) return undefined
    if (prefersReducedMotion()) {
      onDoneRef.current?.(throwKey)
      return undefined
    }
    let raf = 0
    const start = performance.now()
    const tick = (now) => {
      const e = now - start
      if (e >= THROW_TOTAL_MS) {
        setElapsed(null)
        onDoneRef.current?.(throwKey)
        return
      }
      setElapsed(e)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [throwKey])

  const frame = throwKey ? incompleteThrowFrame(p0, c, p1, elapsed ?? 0) : null
  const d = frame ? quadPathTo(p0, c, p1, frame.t) : `M ${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p1.x} ${p1.y}`
  const xScale = frame ? frame.xScale : 1
  const { x: x1, y: y1 } = p1
  return (
    <g data-drive-play="incomplete" data-drive-throw={frame ? 'playing' : undefined}>
      <path d={d} fill="none" stroke={halo} strokeOpacity={haloOpacity} strokeWidth="6.5" strokeDasharray="7 6" strokeLinecap="round" />
      <path d={d} fill="none" stroke={primary} strokeWidth="4.2" strokeDasharray="7 6" strokeLinecap="round" />
      <polygon points={driveArrow(p0.x, p0.y, attackDir)} fill="#fff" stroke="#000" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" />
      {xScale > 0 ? (
        <g strokeLinecap="round" transform={`translate(${x1} ${y1}) scale(${xScale}) translate(${-x1} ${-y1})`}>
          <line x1={x1 - 6} y1={y1 - 6} x2={x1 + 6} y2={y1 + 6} stroke="#000" strokeOpacity="0.5" strokeWidth="6" />
          <line x1={x1 - 6} y1={y1 + 6} x2={x1 + 6} y2={y1 - 6} stroke="#000" strokeOpacity="0.5" strokeWidth="6" />
          <line x1={x1 - 6} y1={y1 - 6} x2={x1 + 6} y2={y1 + 6} stroke="#ef4444" strokeWidth="3.2" />
          <line x1={x1 - 6} y1={y1 + 6} x2={x1 + 6} y2={y1 - 6} stroke="#ef4444" strokeWidth="3.2" />
        </g>
      ) : null}
      {frame && frame.ballOpacity > 0 ? (
        <g opacity={frame.ballOpacity} transform={`translate(${frame.ball.x - 12} ${frame.ball.y - 9})`}>
          <AmericanFootballMark tone="field" size={24} rotate={frame.rotate} spiral={passSpiral(frame.t, yards, THROW_FLIGHT_MS)} college={college} />
        </g>
      ) : null}
    </g>
  )
}

const DRIVE_FLAG_DEFENSE = '#facc15'
/** Scoring play segment … metallic gold, warmer than the defensive-flag yellow. */
const DRIVE_TD_GOLD = '#d4a017'
const DRIVE_FLAG_OFFENSE = '#ef4444'
/** A flag on the defense always moves the ball forward for the offense; one on the offense moves it back. */
function drivePenaltyOnDefense(m, attackDir) {
  return (m.toPct - m.fromPct) * attackDir > 0
}

/** Tap a drive segment → short play label above it; fades out on its own (CSS), gone instantly on the next play. */
function DriveTapTag({ x, y, label, tone }) {
  const textRef = useRef(null)
  const rectRef = useRef(null)
  const placeX = (w) => Math.max(w / 2 + 8, Math.min(1266 - w / 2 - 8, x))
  // Fit the pill to the rendered text (Oswald width varies too much to estimate).
  useLayoutEffect(() => {
    const len = textRef.current?.getComputedTextLength?.()
    if (!(len > 0) || !rectRef.current) return
    const fitW = Math.min(1200, len + 24)
    const fitX = placeX(fitW)
    rectRef.current.setAttribute('x', String(fitX - fitW / 2))
    rectRef.current.setAttribute('width', String(fitW))
    textRef.current.setAttribute('x', String(fitX))
  })
  const w = Math.min(1200, label.length * 9 + 24)
  const h = 30
  const cx = placeX(w)
  const top = Math.max(4, y - h - 10)
  const fill = tone === 'flag-defense' ? DRIVE_FLAG_DEFENSE : tone === 'flag-offense' ? '#dc2626' : 'rgba(9,9,11,0.88)'
  const ink = tone === 'flag-defense' ? '#111' : '#fff'
  return (
    <g data-drive-tap-tag={tone}>
      <rect ref={rectRef} x={cx - w / 2} y={top} width={w} height={h} rx="6" fill={fill} stroke="#000" strokeOpacity="0.6" strokeWidth="1.5" />
      <text
        ref={textRef}
        x={cx}
        y={top + h / 2 + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fill={ink}
        fontSize="20"
        fontWeight="700"
        letterSpacing="0.03em"
        style={{ fontFamily: "Oswald, 'Arial Narrow', Impact, sans-serif" }}
      >
        {label}
      </text>
    </g>
  )
}

function DrivePlayMarks({ marks, attackDir, primary, hideKey, throwKey = '', onThrowDone, onMarkTap, college = false }) {
  const { halo, haloOpacity } = playLineHalo(primary)
  /** Fat invisible stroke over a segment … the only tappable thing on the field plane. Stacked lanes overlap,
   * so a tap picks whichever segment is nearest the touch point. */
  const hits = []
  const geoms = []
  const pickNearest = (e, fallback) => {
    const svg = e.currentTarget.ownerSVGElement
    const ctm = svg?.getScreenCTM?.()
    if (!ctm) return fallback
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    let best = fallback
    let bestD = Infinity
    for (const g of geoms) {
      for (const q of g.pts) {
        const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
        if (dd < bestD) {
          bestD = dd
          best = g
        }
      }
    }
    return best
  }
  const addHit = (m, d, at, pts) => {
    if (!onMarkTap) return
    const geom = { m, at, pts }
    geoms.push(geom)
    hits.push(
      <path
        key={`${m.key}:hit`}
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth="28"
        strokeLinecap="round"
        data-drive-play-hit={m.kind}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          const g = pickNearest(e, geom)
          onMarkTap(g.m, g.at)
        }}
      />,
    )
  }
  const linePts = (x1, x2, y) => Array.from({ length: 9 }, (_, i) => ({ x: x1 + ((x2 - x1) * i) / 8, y }))
  // Gains (and flags on the defense) chain on the main line; losses / flags on the offense sit a lane below,
  // stacking further only when they overlap each other.
  const backLanes = []
  const laneOf = new Map()
  for (const m of marks) {
    if (m.kind === 'incomplete') continue
    if ((m.toPct - m.fromPct) * attackDir >= 0) {
      laneOf.set(m.key, 0)
      continue
    }
    const lo = Math.min(m.fromPct, m.toPct)
    const hi = Math.max(m.fromPct, m.toPct)
    let lane = 0
    while ((backLanes[lane] || []).some(([a, b]) => lo < b - 0.3 && hi > a + 0.3)) lane += 1
    ;(backLanes[lane] ||= []).push([lo, hi])
    laneOf.set(m.key, lane + 1)
  }
  // Incomplete arcs + X paint last so later gain / penalty lines never cover them.
  const paintOrder = [...marks.filter((m) => m.kind !== 'incomplete'), ...marks.filter((m) => m.kind === 'incomplete')]
  return (
    <g data-lounge-drive-marks>
      {paintOrder.map((m) => {
        if (m.key === hideKey) return null
        if (m.kind === 'line') {
          const y = RUSH_Y + (laneOf.get(m.key) || 0) * DRIVE_LANE_PX
          // Arrow sits at the snap. Loss (sack, TFL) points back toward the offense's own goal.
          const lineDir = (m.toPct - m.fromPct) * attackDir < -0.2 ? -attackDir : attackDir
          let x1 = fieldXAtY(m.fromPct, y)
          let x2 = fieldXAtY(m.toPct, y)
          if (Math.abs(x2 - x1) < 6) {
            const c = (x1 + x2) / 2
            x1 = c - 3 * attackDir
            x2 = c + 3 * attackDir
          }
          addHit(m, `M ${x1} ${y} L ${x2} ${y}`, { x: (x1 + x2) / 2, y }, linePts(x1, x2, y))
          return (
            <g key={m.key} data-drive-play="line">
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={m.touchdown ? '#000' : halo}
                strokeOpacity={m.touchdown ? 0.5 : haloOpacity}
                strokeWidth="9.5"
                strokeLinecap="round"
              />
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={m.touchdown ? DRIVE_TD_GOLD : primary}
                strokeWidth="7"
                strokeLinecap="round"
                strokeOpacity="0.95"
              />
              <polygon points={driveArrow(fieldXAtY(m.fromPct, y), y, lineDir)} fill="#fff" stroke="#000" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" />
            </g>
          )
        }
        if (m.kind === 'penalty') {
          const y = RUSH_Y + (laneOf.get(m.key) || 0) * DRIVE_LANE_PX
          const x1 = fieldXAtY(m.fromPct, y)
          const x2 = fieldXAtY(m.toPct, y)
          const penaltyDir = m.toPct >= m.fromPct ? 1 : -1
          addHit(m, `M ${x1} ${y} L ${x2} ${y}`, { x: (x1 + x2) / 2, y }, linePts(x1, x2, y))
          return (
            <g key={m.key} data-drive-play="penalty" data-drive-flag-on={drivePenaltyOnDefense(m, attackDir) ? 'defense' : 'offense'}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="#000" strokeOpacity="0.45" strokeWidth="7.5" strokeLinecap="round" />
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={drivePenaltyOnDefense(m, attackDir) ? DRIVE_FLAG_DEFENSE : DRIVE_FLAG_OFFENSE}
                strokeWidth="4.5"
                strokeDasharray="8 6"
                strokeLinecap="round"
              />
              <polygon points={driveArrow(x1, y, penaltyDir)} fill="#fff" stroke="#000" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" />
            </g>
          )
        }
        const y0 = RUSH_Y
        const y1 = Math.max(
          FIELD_FAR_Y + 12,
          Math.min(FIELD_NEAR_Y - 12, y0 + m.lateral * attackDir * DRIVE_INCOMPLETE_LATERAL_PX),
        )
        const x0 = fieldXAtY(m.fromPct, y0)
        const x1 = fieldXAtY(m.toPct, y1)
        const c = { x: (x0 + x1) / 2, y: Math.min(y0, y1) - DRIVE_INCOMPLETE_LIFT_PX }
        addHit(
          m,
          `M ${x0} ${y0} Q ${c.x} ${c.y} ${x1} ${y1}`,
          { x: x1, y: Math.min(y0, y1) - DRIVE_INCOMPLETE_LIFT_PX / 2 },
          Array.from({ length: 11 }, (_, i) => quadBezier({ x: x0, y: y0 }, c, { x: x1, y: y1 }, i / 10)),
        )
        return (
          <DriveIncompleteMark
            key={m.key}
            p0={{ x: x0, y: y0 }}
            c={c}
            p1={{ x: x1, y: y1 }}
            attackDir={attackDir}
            primary={primary}
            halo={halo}
            haloOpacity={haloOpacity}
            throwKey={m.isNewest ? throwKey : ''}
            onThrowDone={onThrowDone}
            college={college}
            yards={Math.abs(m.toPct - m.fromPct)}
          />
        )
      })}
      {hits}
    </g>
  )
}

/**
 * Same play across feed text variants: live "(04:59) …" clock prefix vs PBP row, and ESPN
 * appending the PAT ("… 12 Yd Run (Nicholson Kick)" / "… TOUCHDOWN. Kick is good").
 */
function fieldPlayIdentity(text) {
  let s = String(text || '').toLowerCase()
  const td = s.search(/\btouchdown\b/)
  if (td >= 0) s = s.slice(0, td + 'touchdown'.length)
  const id = s.replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '')
  return id || String(text || '').trim()
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
  const target = scrimPct + dir * dist
  // "& Goal": the line to gain is the goal line itself … no yellow line, like the broadcast.
  if (target <= 0 || target >= 100) return null
  return target
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

/**
 * Ball arcs from `start` into the end zone at `goalPct` (traveling `dir`), lands TOUCHBACK_LAND_DEPTH_YDS
 * deep, then hops out the back and comes to rest. Shared by kickoff + punt touchbacks.
 * @returns {{ frameAt: (elapsed: number) => { ball: {x:number,y:number}, rotate: number, opacity: number }, totalMs: number }}
 */
function touchbackBallFrames({ start, goalPct, dir, flightMs, arcLift, tumbleDegPerMs = KICK_TUMBLE_DEG_PER_MS }) {
  const land = { x: fieldMidXFromPercent(goalPct + dir * TOUCHBACK_LAND_DEPTH_YDS), y: RUSH_Y }
  const ctrl = { x: (start.x + land.x) / 2, y: Math.min(start.y, land.y) - arcLift }
  const bounceSpots = TOUCHBACK_BOUNCES.map((b) => ({ ...b, x: fieldMidXFromPercent(goalPct + dir * b.toYds) }))
  const bouncesMs = TOUCHBACK_BOUNCES.reduce((sum, b) => sum + b.ms, 0)
  const spin = dir > 0 ? 1 : -1
  const frameAt = (elapsed) => {
    if (elapsed < flightMs) {
      const t = elapsed / flightMs
      return { ball: quadBezier(start, ctrl, land, t), rotate: kickTumbleRotate(elapsed, dir, tumbleDegPerMs), opacity: 1 }
    }
    let at = elapsed - flightMs
    let fromX = land.x
    let rot = kickTumbleRotate(flightMs, dir, tumbleDegPerMs)
    for (let i = 0; i < bounceSpots.length; i += 1) {
      const b = bounceSpots[i]
      if (at < b.ms) {
        const u = at / b.ms
        return {
          ball: { x: fromX + (b.x - fromX) * u, y: RUSH_Y - 4 * b.lift * u * (1 - u) },
          rotate: rot + spin * 260 * u,
          opacity: 1,
        }
      }
      at -= b.ms
      fromX = b.x
      rot += spin * 260
    }
    return { ball: { x: fromX, y: RUSH_Y }, rotate: rot, opacity: 1 }
  }
  return { frameAt, totalMs: flightMs + bouncesMs + TOUCHBACK_HOLD_MS }
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

/**
 * RB ball tuck sits ~25% in from the leading edge of the figure slot.
 * Place the figure so that point sits on `ballX` (LOS / gain mid-field X).
 */
const RUSH_BALL_FROM_FRONT = 0.25

function rushFigLeftForBallX(ballX, facing) {
  const fromLeft = facing >= 0 ? 1 - RUSH_BALL_FROM_FRONT : RUSH_BALL_FROM_FRONT
  return ballX - fromLeft * RUSH_FIG_W
}

/** World point of the RB's tucked football (meet-scaled sculpt, mirrored when facing right). */
function rushTuckWorld(figLeft, figTop, facing) {
  const scale = Math.min(RUSH_FIG_W / RUSH_VIEWBOX_W, RUSH_FIG_H / RUSH_VIEWBOX_H)
  const padX = (RUSH_FIG_W - RUSH_VIEWBOX_W * scale) / 2
  const padY = (RUSH_FIG_H - RUSH_VIEWBOX_H * scale) / 2
  const lx = facing >= 0 ? RUSH_VIEWBOX_W - RUSH_TUCK_LOCAL.x : RUSH_TUCK_LOCAL.x
  return { x: figLeft + padX + lx * scale, y: figTop + padY + RUSH_TUCK_LOCAL.y * scale }
}

/** "ATL" / "Alab" feed abbrev → hub side (exact, then prefix either way). */
function sideForFeedAbbrev(abbrev, game) {
  const a = String(abbrev || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (a.length < 2) return null
  const away = String(game?.away?.abbrev || '').toUpperCase().replace(/[^A-Z]/g, '')
  const home = String(game?.home?.abbrev || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (a === away) return 'away'
  if (a === home) return 'home'
  const pre = (x) => x.length >= 2 && (x.startsWith(a) || a.startsWith(x))
  const awayHit = pre(away)
  const homeHit = pre(home)
  if (awayHit && !homeHit) return 'away'
  if (homeHit && !awayHit) return 'home'
  return null
}

/** Place WR/TE so the front-of-hands pocket sits on `ballX`. */
function catchFigLeftForHandsX(ballX, facing, figW = RUSH_FIG_W, figH = RUSH_FIG_H) {
  const scale = Math.min(figW / CATCH_VIEWBOX_W, figH / CATCH_VIEWBOX_H)
  const padX = (figW - CATCH_VIEWBOX_W * scale) / 2
  const lx = facing < 0 ? CATCH_VIEWBOX_W - CATCH_HANDS_LOCAL.x : CATCH_HANDS_LOCAL.x
  return ballX - padX - lx * scale
}
function isRedHex(hex) {
  if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(hex || '').trim())) return false
  const { h, s, l } = hexToHsl(hex)
  return (h >= 340 || h <= 12) && s >= 0.45 && l >= 0.12 && l <= 0.75
}

function isGoldHex(hex) {
  if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(hex || '').trim())) return false
  const { h, s, l } = hexToHsl(hex)
  return h >= 38 && h <= 62 && s >= 0.5 && l >= 0.3
}

/**
 * Drive / play line color. Red primaries read as the offensive-flag red and the incomplete X, so they switch
 * to the team's secondary … unless that is also red, gold (TD segment / defensive flag), or too dark on turf,
 * in which case white.
 */
function playLineColor(primary, secondary) {
  if (!isRedHex(primary)) return primary
  const alt = String(secondary || '')
  if (!alt || isRedHex(alt) || isGoldHex(alt) || getLuminance(hexToRgb(alt)) < 0.25) return '#ffffff'
  return alt
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
  const inWhite = possHome === homeTeamWearsWhite(game)
  const whitePants = /^#?f{3}(f{3})?$/i.test(String(resolved.pantsColor || '')) || !resolved.pantsColor
  return {
    primary,
    secondary,
    /** Road whites (colored numbers); home wears the team color. */
    jerseyColor: inWhite ? '#FFFFFF' : '',
    line: playLineColor(primary, side?.color2),
    helmetColor: resolved.helmetColor,
    // White team pants under a white jersey reads all-white … road kit takes the team color instead.
    pantsColor: inWhite && whitePants ? primary : resolved.pantsColor,
    tightsColor: resolved.tightsColor,
    sideAbbrev,
  }
}

/** Dallas wears white at home (opponent in color); everyone else wears color at home. */
function homeTeamWearsWhite(game) {
  return String(game?.sport_key || '').includes('nfl') && String(game?.home?.abbrev || '').toUpperCase() === 'DAL'
}

const TIMEOUT_SLOTS = 3
/** NFL athletic block; CFB uses Graduate (college slab) loaded in index.html. */
const ENDZONE_FONT_NFL = "Impact, 'Arial Black', sans-serif"
const ENDZONE_FONT_CFB = "Graduate, Impact, 'Arial Black', serif"

function isCfbSport(sportKey) {
  return String(sportKey || '').includes('ncaaf')
}

/** Longer schools overflow the banner, so they fall back to the abbrev ("TOUCHDOWN MTSU"). */
const TD_BANNER_SCHOOL_MAX_CHARS = 7

/** Team word for "TOUCHDOWN X" / "TURNOVER X": CFB school ("USC", "OREGON") · NFL abbrev ("BUF", "LAC"). */
function fieldBannerTeamLabel(teamAbbrev, game, sportKey) {
  const abbrev = String(teamAbbrev || '').trim().toUpperCase()
  if (!abbrev || !isCfbSport(sportKey)) return abbrev
  const side = [game?.away, game?.home].find((s) => String(s?.abbrev || '').trim().toUpperCase() === abbrev)
  if (!side) return abbrev
  const name = String(side.name || '').trim()
  const mascot = String(side.mascot || '').trim()
  let school = cfbTeamSchoolName(side)
  // ESPN `mascot` is only the last word ("Tide"), so stripping it is a fallback for uncataloged schools.
  if (!school && name && mascot && name.toLowerCase().endsWith(mascot.toLowerCase()) && name.length > mascot.length) {
    school = name.slice(0, name.length - mascot.length).trim()
  }
  return school && school.length <= TD_BANNER_SCHOOL_MAX_CHARS ? school : abbrev
}

/** No TD animation seen (hub opened after the score) … feed row team, flipped for pick / kick / punt return TDs. */
function touchdownScorerAbbrevFromText(text, feedTeam, game) {
  if (feedTeam !== 'home' && feedTeam !== 'away') return ''
  if (!playTextIsTouchdown(text)) return ''
  const defenseScored = Boolean(
    parseInterceptionReturn(text) || parseKickoffReturn(text)?.isTouchdown || parsePuntReturn(text)?.isTouchdown,
  )
  const side = defenseScored ? (feedTeam === 'home' ? 'away' : 'home') : feedTeam
  return String(game?.[side]?.abbrev || '')
}

/** Top 25 rank (1-25) or null. */
function teamTop25Rank(side) {
  const n = Number(side?.rank)
  return Number.isInteger(n) && n >= 1 && n <= 25 ? n : null
}

/**
 * Team label with a small leading Top 25 rank (broadcast style "15 UTAH").
 * Short abbrev labels stay on one line and spill evenly past the logo column.
 */
function RankedTeamLabel({ side, label, className = '', wrap = false }) {
  const rank = teamTop25Rank(side)
  const layout = wrap
    ? 'w-full text-center'
    : 'flex w-full items-baseline justify-center whitespace-nowrap'
  return (
    <div className={`${layout} ${className}`.trim()}>
      {rank != null ? (
        <span data-lounge-team-rank className="mr-[3px] text-[0.72em] font-bold tabular-nums text-white/60">
          {rank}
        </span>
      ) : null}
      <span>{label}</span>
    </div>
  )
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
  /** Long-axis roll in degrees (thrown spiral) … laces + panel seams wrap around the body. */
  spiral = null,
  /** College ball: stripes are half-bands on the laces side only, so they roll with the laces. */
  college = false,
  className = '',
  title,
}) {
  const uid = useId().replace(/:/g, '')
  const spinning = spiral != null && Number.isFinite(Number(spiral))
  const rollRad = spinning ? (Number(spiral) * Math.PI) / 180 : 0
  const lacesFacing = Math.cos(rollRad)
  const bandClipId = `fb-band-${uid}`
  // Laces-side half (roll ± 90°) ∩ near side (± 90°), projected onto the body's height.
  let stripeBand = null
  if (spinning && college) {
    const roll = ((((Number(spiral) + 180) % 360) + 360) % 360) - 180
    const lo = Math.max(roll - 90, -90)
    const hi = Math.min(roll + 90, 90)
    const yAt = (deg) => (Math.abs(deg) >= 90 ? Math.sign(deg) * 7.5 : 6.5 * Math.sin((deg * Math.PI) / 180))
    stripeBand = hi > lo ? { y: yAt(lo), h: Math.max(0, yAt(hi) - yAt(lo)) } : { y: 0, h: 0 }
  }
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
        {stripeBand ? (
          <clipPath id={bandClipId}>
            <rect x="-13" y={stripeBand.y.toFixed(2)} width="26" height={stripeBand.h.toFixed(2)} />
          </clipPath>
        ) : null}
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
        {/* Seam / equator stitch … spiraling: four panel seams at 90° riding the body's curve (near side only). */}
        {spinning ? (
          <g clipPath={`url(#${clipId})`}>
            {[0, 90, 180, 270].map((deg) => {
              const a = rollRad + (deg * Math.PI) / 180
              if (Math.cos(a) <= 0.05) return null
              return (
                <path
                  key={deg}
                  d="M-12 0 C-11.2 -2.8 -8.6 -6.5 0 -6.5 C8.6 -6.5 11.2 -2.8 12 0"
                  transform={`scale(1 ${(-Math.sin(a) * 0.92).toFixed(3)})`}
                  fill="none"
                  stroke="#1c1008"
                  strokeWidth="0.4"
                  strokeOpacity={(0.55 * Math.min(1, Math.cos(a) * 1.5)).toFixed(2)}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </g>
        ) : (
          <path
            d="M-10.2 0 C-6.5 0.55 0 0.7 10.2 0"
            fill="none"
            stroke={isChalk ? '#27272a' : '#1c1008'}
            strokeWidth="0.45"
            strokeOpacity="0.55"
            clipPath={`url(#${clipId})`}
          />
        )}
        {/* End stripes … college balls only (NFL balls have none). */}
        {college || isChalk ? (
        <g clipPath={stripeBand ? `url(#${bandClipId})` : undefined}>
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
        </g>
        ) : null}
        {/* Laces panel … spiraling: slides over the top and squashes edge-on, hidden on the far side. */}
        {!spinning || lacesFacing > 0.05 ? (
        <g clipPath={spinning ? `url(#${clipId})` : undefined}>
        <g
          transform={
            spinning
              ? `translate(0 ${(Math.sin(rollRad) * 5.6).toFixed(2)}) scale(1 ${lacesFacing.toFixed(3)})`
              : undefined
          }
          opacity={spinning ? Math.min(1, lacesFacing * 1.6).toFixed(2) : undefined}
        >
        <ellipse
          cx="0"
          cy="0"
          rx="3.1"
          ry="2.35"
          fill={isChalk ? '#e4e4e7' : '#5c3318'}
          opacity={isChalk ? 0.35 : 0.35}
        />
        {/* Field laces are white on both NFL + college balls … a dark underlay keeps them crisp on the leather. */}
        {(isChalk ? [['#18181b', 0]] : [['#1a0e08', 0.5], ['#fafafa', 0]]).map(([stroke, pad]) => (
          <g key={stroke} stroke={stroke} strokeLinecap="round" strokeOpacity={pad ? 0.7 : 1}>
            <line x1="-2.55" y1="0" x2="2.55" y2="0" strokeWidth={0.95 + pad} />
            {[-1.55, -0.55, 0.55, 1.55].map((x) => (
              <line key={x} x1={x} y1="-1.65" x2={x} y2="1.65" strokeWidth={0.75 + pad} />
            ))}
          </g>
        ))}
        </g>
        </g>
        ) : null}
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
  playStartSpot = null,
  plays = null,
  onPlayAnimActiveChange = null,
  bannerFloorRef = null,
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
  // Timeouts keep LOS / 1st down / ball / red zone … the drive is still live.
  const hideLiveLines = Boolean(centerBanner) && centerBanner !== 'TIMEOUT'
  const feedLastPlayText = String(lastPlay || '').trim()
  // One-play queue: a play that lands mid-animation waits for it to finish (newest wins), so a PAT or
  // timeout row a poll after a TD no longer cuts the celebration off. Tap replays bypass the hold.
  const [heldPlayText, setHeldPlayText] = useState(feedLastPlayText)
  const lastPlayText = isUserReplay ? feedLastPlayText : heldPlayText
  const lastPlayRow = useMemo(() => {
    const id = fieldPlayIdentity(lastPlayText)
    if (!id || !Array.isArray(plays)) return null
    return plays.findLast((p) => fieldPlayIdentity(p?.description) === id) || null
  }, [plays, lastPlayText])
  // One key per play … ESPN rewrites a play's text after the fact ("1ST DOWN", corrected yards), and the
  // feed row can land a poll after the live text. Either would otherwise read as a new play and replay it.
  const playKeyAliasRef = useRef(new Map())
  const playKey = useMemo(() => {
    const aliases = playKeyAliasRef.current
    const rowKey = lastPlayRow?.id ? `row:${lastPlayRow.id}` : ''
    // Same snap merged from another feed (TheRundown → ESPN) keeps the key it had under the old id.
    const sourceKeys = Array.isArray(lastPlayRow?.source_ids) ? lastPlayRow.source_ids.map((id) => `row:${id}`) : []
    const textKey = fieldPlayIdentity(lastPlayText)
    const known = [rowKey, ...sourceKeys, textKey].find((k) => k && aliases.get(k))
    const key = (known && aliases.get(known)) || rowKey || textKey
    for (const k of [rowKey, ...sourceKeys, textKey]) if (k) aliases.set(k, key)
    return key
  }, [lastPlayRow, lastPlayText])
  const animKey = `${playKey}::${Number(playReplayNonce) || 0}`
  /** Last auto-play that finished … a TD's text returning after the PAT row must not replay. */
  const lastAutoPlayedKeyRef = useRef('')
  const possessionSide =
    replayTeam === 'home' || replayTeam === 'away'
      ? replayTeam
      : live?.possession === 'home' || live?.possession === 'away'
        ? live.possession
        : null
  const rowTeamSide = lastPlayRow?.team === 'home' || lastPlayRow?.team === 'away' ? lastPlayRow.team : null
  // Offense on the snap … live possession is already post-play, so a turnover on downs / lost fumble
  // would run the play in the other team's kit and direction.
  const snapOffenseSide =
    replayTeam === 'home' || replayTeam === 'away' ? replayTeam : rowTeamSide || possessionSide
  const knownStartPct = playSpotFieldPercent(playStartSpot, fieldFlipped)
  // 1st-down line at the snap … live down/distance is already post-play (and empty after a TD).
  const knownStartDistance = Number(playStartSpot?.distance)
  const knownFirstDownPct =
    knownStartPct != null && snapOffenseSide && Number.isFinite(knownStartDistance) && knownStartDistance > 0
      ? Math.max(
          0,
          Math.min(100, knownStartPct + attackDirection(snapOffenseSide, fieldFlipped) * knownStartDistance),
        )
      : null

  const feedFirstDownPct = isFootball ? firstDownPercentFromLive(live, pos, fieldFlipped) : null
  /** Last feed line to gain + its LOS … ESPN drops down/distance while a timeout is on. */
  const [heldFirstDown, setHeldFirstDown] = useState(null)
  if (
    feedFirstDownPct != null &&
    (heldFirstDown?.pos !== pos || heldFirstDown?.pct !== feedFirstDownPct)
  ) {
    setHeldFirstDown({ pos, pct: feedFirstDownPct })
  }
  /** Scoring team abbrev from the last TD animation … keeps "TOUCHDOWN X" up through the PAT row. */
  const [heldTdTeam, setHeldTdTeam] = useState('')
  // TD / PAT still the latest row and no stoppage banner = the TD label's lifetime … keep the scoring drive up with it.
  const tdDriveHold = Boolean(isFootball && lastPlayText && playTextIsScoreTry(lastPlayText) && !centerBanner)
  const livePeriod = live?.period
  const staleHalf = Boolean(isFootball && game?.status === 'in' && playsFromEarlierHalf(plays, livePeriod))
  // While a newer play is queued, the drive chart stops at the play on the field.
  const drivePlays = useMemo(() => {
    if (isUserReplay || !Array.isArray(plays) || lastPlayText === feedLastPlayText) return plays
    const id = fieldPlayIdentity(lastPlayText)
    const idx = id ? plays.findLastIndex((p) => fieldPlayIdentity(p?.description) === id) : -1
    return idx >= 0 ? plays.slice(0, idx + 1) : plays
  }, [isUserReplay, plays, lastPlayText, feedLastPlayText])
  const drive = useMemo(
    () => (isFootball ? buildPossessionDriveMarks(drivePlays, { keepScoringDrive: tdDriveHold, livePeriod }) : null),
    [isFootball, drivePlays, tdDriveHold, livePeriod],
  )
  const [throwDoneKey, setThrowDoneKey] = useState('')
  /** Incompletion throw that passed the start gate … see `throwKey`. */
  const [throwArmedKey, setThrowArmedKey] = useState('')
  const onThrowDone = useCallback(
    (key) => {
      setThrowDoneKey(key)
      if (!isUserReplay) lastAutoPlayedKeyRef.current = key
    },
    [isUserReplay],
  )
  const openingKickoff = isOpeningKickoffRow(lastPlayRow)
  const fieldRootRef = useRef(null)
  /** Game + quarter already whistled … a restarted kick effect or a re-kick after a flag must not blow it twice. */
  const whistledKickRef = useRef('')
  // Referee whistle as the opening kickoff of each half starts animating (live auto-play only).
  const whistleOpeningKick = useCallback(() => {
    const ctx = fieldAnimCtxRef.current
    if (isUserReplay || !ctx.openingKickoff) return
    const key = `${ctx.game?.id || ''}::${ctx.openingKickoff}`
    if (whistledKickRef.current === key) return
    whistledKickRef.current = key
    // Lounge can stay mounted but hidden while another app tab is up … only whistle when on screen.
    if (fieldRootRef.current?.getClientRects().length) playGameHubWhistle()
  }, [isUserReplay])

  const [rushAnim, setRushAnim] = useState(null)
  const [catchAnim, setCatchAnim] = useState(null)
  const [fgAnim, setFgAnim] = useState(null)
  const [pickAnim, setPickAnim] = useState(null)
  const pickKeyRef = useRef('')
  const pickRafRef = useRef(0)
  const [kickAnim, setKickAnim] = useState(null)
  /** Final touchback frame … the ball stays in the end zone until the next play replaces `animKey`. */
  const [tbRest, setTbRest] = useState(null)
  const kickKeyRef = useRef('')
  const kickRafRef = useRef(0)
  /** Field PNG must own layout height before absolute SVG overlays paint. */
  const [fieldArtReady, setFieldArtReady] = useState(false)
  const rushKeyRef = useRef('')
  const catchKeyRef = useRef('')
  const fgKeyRef = useRef('')
  const rushRafRef = useRef(0)
  const catchRafRef = useRef(0)
  const fgRafRef = useRef(0)
  /** Last settled LOS / 1st-down percents … held during rush until lines phase. */
  const settledLinesRef = useRef({ scrimPct: null, firstDownPct: null })
  /**
   * Snapshot for play anims … hub polls rebuild `live` / `pos` / `players` often.
   * Those must not be effect deps or cleanup cancels RAF before the TD label fires.
   */
  const fieldAnimCtxRef = useRef({
    pos: null,
    live: null,
    players: [],
    game: null,
    awayColor: '',
    homeColor: '',
    possessionSide: null,
    /** Offense on the snap (replay team → feed row team → live possession) … rush / catch / FG anims. */
    snapOffenseSide: null,
    /** Feed row team for the play (ESPN offense … the punting side on a punt). */
    feedTeam: null,
    fieldFlipped: false,
    knownStartPct: null,
    knownFirstDownPct: null,
    /** Feed row `end_spot` for the play … where an INT return ended (new LOS). */
    knownEndPct: null,
    /** Feed row team (offense on the snap). */
    rowTeam: null,
    /** Anim effects key on `animKey`; text edits of the same play must not re-run them. */
    lastPlayText: '',
  })
  fieldAnimCtxRef.current = {
    pos,
    live,
    players,
    game,
    awayColor,
    homeColor,
    possessionSide,
    snapOffenseSide,
    feedTeam: replayTeam === 'home' || replayTeam === 'away' ? replayTeam : null,
    fieldFlipped,
    knownStartPct,
    knownFirstDownPct,
    knownEndPct: playSpotFieldPercent(lastPlayRow?.end_spot, fieldFlipped),
    rowTeam: rowTeamSide,
    turnover: lastPlayRow?.turnover === true,
    /** Quarter (1 / 3) when this play is a half's opening kickoff, else 0. */
    openingKickoff: openingKickoff ? Number(lastPlayRow.period) : 0,
    lastPlayText,
  }
  // Live text can beat its feed row by a poll … the row carries the snap team and spot (a turnover on
  // downs would otherwise run in the new offense's kit). Wait briefly, then play without it.
  const awaitingPlayRow = Boolean(
    isFootball &&
      !isUserReplay &&
      lastPlayText &&
      !lastPlayRow &&
      Array.isArray(plays) &&
      plays.length > 0 &&
      isFieldReplayablePlay(lastPlayText),
  )
  const [playRowWaitDoneKey, setPlayRowWaitDoneKey] = useState('')
  useEffect(() => {
    if (!awaitingPlayRow) return undefined
    const t = setTimeout(() => setPlayRowWaitDoneKey(playKey), PLAY_ROW_WAIT_MS)
    return () => clearTimeout(t)
  }, [awaitingPlayRow, playKey])
  const holdForPlayRow = awaitingPlayRow && playRowWaitDoneKey !== playKey
  /** Gates auto-play start without thrashing on every yard-line tick. */
  const autoPlayReady = Boolean(
    isUserReplay || (!hideLiveLines && hasLine && pos != null && !holdForPlayRow),
  )
  // A running anim holds the gate open … a poll that drops the LOS or flashes a stoppage banner mid-play
  // would otherwise tear it down and restart it from the top (the play "animates twice").
  const anyPlayAnimRunning =
    rushAnim != null || catchAnim != null || fgAnim != null || pickAnim != null || kickAnim != null
  /** Don't run play chrome until the field plate has real pixel size. */
  const playAnimReady = Boolean(fieldArtReady && (isUserReplay || autoPlayReady || anyPlayAnimRunning))

  const markFieldArtReady = () => {
    setFieldArtReady(true)
  }
  const bindFieldArtImg = (el) => {
    if (!el) return
    if (el.complete && el.naturalWidth > 0) setFieldArtReady(true)
  }

  useEffect(() => {
    const lastPlayText = fieldAnimCtxRef.current.lastPlayText
    if (!isFootball || !lastPlayText) return undefined
    const ctx = fieldAnimCtxRef.current
    if (!playAnimReady) return undefined
    if (ctx.pos == null && !isUserReplay) return undefined
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
    if (!isUserReplay && animKey === lastAutoPlayedKeyRef.current) return undefined
    rushKeyRef.current = animKey
    catchKeyRef.current = ''
    fgKeyRef.current = ''
    setCatchAnim(null)
    setFgAnim(null)
    if (catchRafRef.current) cancelAnimationFrame(catchRafRef.current)
    if (fgRafRef.current) cancelAnimationFrame(fgRafRef.current)
    pickKeyRef.current = ''
    setPickAnim(null)
    if (pickRafRef.current) cancelAnimationFrame(pickRafRef.current)
    kickKeyRef.current = ''
    setKickAnim(null)
    if (kickRafRef.current) cancelAnimationFrame(kickRafRef.current)

    const attackDir = attackDirection(ctx.snapOffenseSide, ctx.fieldFlipped)
    const isTouchdown =
      Boolean(parsed.isTouchdown) || playTextIsTouchdown(lastPlayText)
    const spots = resolvePlayAnimationPercents({
      text: lastPlayText,
      yards: parsed.yards,
      game: ctx.game,
      possessionSide: ctx.snapOffenseSide,
      livePos: ctx.pos,
      preferTextSpots: isUserReplay,
      isTouchdown,
      flipped: ctx.fieldFlipped,
      knownStartPct: ctx.knownStartPct,
    })
    const endPct = spots.endPct
    let startPct = spots.startPct
    // Goal-line chips need a visible run-up or the TD celebrate never "reads".
    if (isTouchdown && ctx.knownStartPct == null) {
      const minRun = 18
      if (attackDir < 0) startPct = Math.max(startPct, endPct + minRun)
      else startPct = Math.min(startPct, endPct - minRun)
      startPct = Math.max(0, Math.min(100, startPct))
    }
    const startX = fieldMidXFromPercent(startPct)
    const endX = fieldMidXFromPercent(
      isTouchdown ? (attackDir > 0 ? 100 : 0) + attackDir * TD_FIGURE_END_ZONE_YDS : endPct,
    )
    const travel = endX - startX
    // Prefer attack direction when travel is tiny (spot clamp / 0-yd edge).
    const facing = Math.abs(travel) < 0.5 ? attackDir : travel < 0 ? -1 : 1
    const kit = possessionKit(
      ctx.snapOffenseSide ? { ...ctx.live, possession: ctx.snapOffenseSide } : ctx.live,
      ctx.game,
      ctx.awayColor,
      ctx.homeColor,
    )
    const matched = matchRushPlayer(parsed.playerHint, ctx.players, kit.sideAbbrev)
    const headshotUrl = matched?.headshot_url ? String(matched.headshot_url) : ''
    const jerseyNumber = resolveFigureJersey(parsed, matched)

    const toFirstDownPct = firstDownPercentFromLive(ctx.live, endPct, ctx.fieldFlipped)
    const settled = settledLinesRef.current
    // Old LOS is always prior yardline from the play text (live pos is already post-play).
    const fromScrimPct = startPct
    const settledStillPrePlay =
      settled.scrimPct != null &&
      Math.abs(settled.scrimPct - startPct) <= Math.abs(settled.scrimPct - endPct) + 0.01
    let fromFirstDownPct =
      ctx.knownFirstDownPct != null
        ? ctx.knownFirstDownPct
        : settledStillPrePlay &&
            settled.firstDownPct != null &&
            Number.isFinite(settled.firstDownPct)
          ? settled.firstDownPct
          : null
    if (fromFirstDownPct == null) {
      const priorDist = Number(ctx.live?.distance)
      fromFirstDownPct = Number.isFinite(priorDist)
        ? firstDownPercentFromLive(
            { ...ctx.live, distance: priorDist + parsed.yards },
            startPct,
            ctx.fieldFlipped,
          )
        : toFirstDownPct
    }

    const base = {
      playKey: animKey,
      startX,
      endX,
      y: RUSH_Y,
      primary: kit.primary,
      line: kit.line,
      jerseyColor: kit.jerseyColor,
      teamAbbrev: kit.sideAbbrev,
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
      /** Loss: the trail rides the drive chart's offset lane so the handoff doesn't jump. */
      trailY: RUSH_Y + ((endPct - startPct) * attackDir < 0 ? DRIVE_LANE_PX : 0),
      lateralPx: (parsed.lateral || 0) * attackDir * RUN_LATERAL_PX,
      fromFirstDownPct,
      toFirstDownPct,
    }

    if (prefersReducedMotion()) {
      // TD: never park LOS/ball on the goal line … wait for kickoff / next drive.
      if (!isTouchdown) {
        settledLinesRef.current = {
          scrimPct: endPct,
          firstDownPct: toFirstDownPct,
        }
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
        rushRafRef.current = 0
        if (!isUserReplay) lastAutoPlayedKeyRef.current = animKey
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
      if (!rushRafRef.current) return
      cancelAnimationFrame(rushRafRef.current)
      rushRafRef.current = 0
      // Mid-flight teardown only … finished ticks already zeroed the ref.
      if (rushKeyRef.current === animKey) rushKeyRef.current = ''
    }
  }, [isFootball, animKey, isUserReplay, playAnimReady])

  useEffect(() => {
    const lastPlayText = fieldAnimCtxRef.current.lastPlayText
    if (!isFootball || !lastPlayText) return undefined
    const ctx = fieldAnimCtxRef.current
    if (!playAnimReady) return undefined
    if (ctx.pos == null && !isUserReplay) return undefined
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
    if (!isUserReplay && animKey === lastAutoPlayedKeyRef.current) return undefined
    catchKeyRef.current = animKey
    rushKeyRef.current = ''
    fgKeyRef.current = ''
    setRushAnim(null)
    setFgAnim(null)
    if (rushRafRef.current) cancelAnimationFrame(rushRafRef.current)
    if (fgRafRef.current) cancelAnimationFrame(fgRafRef.current)
    pickKeyRef.current = ''
    setPickAnim(null)
    if (pickRafRef.current) cancelAnimationFrame(pickRafRef.current)
    kickKeyRef.current = ''
    setKickAnim(null)
    if (kickRafRef.current) cancelAnimationFrame(kickRafRef.current)

    const isTouchdown =
      Boolean(parsed.isTouchdown) || playTextIsTouchdown(lastPlayText)
    const attackDir = attackDirection(ctx.snapOffenseSide, ctx.fieldFlipped)
    const spots = resolvePlayAnimationPercents({
      text: lastPlayText,
      yards: parsed.yards,
      game: ctx.game,
      possessionSide: ctx.snapOffenseSide,
      livePos: ctx.pos,
      preferTextSpots: isUserReplay,
      isTouchdown,
      flipped: ctx.fieldFlipped,
      knownStartPct: ctx.knownStartPct,
    })
    const gainPct = spots.endPct
    let startPct = spots.startPct
    // Goal-line chips need a visible run-up or the TD celebrate never "reads".
    if (isTouchdown && ctx.knownStartPct == null) {
      const minRun = 18
      if (attackDir < 0) startPct = Math.max(startPct, gainPct + minRun)
      else startPct = Math.min(startPct, gainPct - minRun)
      startPct = Math.max(0, Math.min(100, startPct))
    }
    const startX = fieldMidXFromPercent(startPct)
    // Ball-on-figure track ends on the line of gain (TD: halfway into the end zone).
    const endX = fieldMidXFromPercent(
      isTouchdown ? (attackDir > 0 ? 100 : 0) + attackDir * TD_FIGURE_END_ZONE_YDS : gainPct,
    )
    const travel = endX - startX
    const facing = Math.abs(travel) < 0.5 ? attackDir : travel < 0 ? -1 : 1
    const kit = possessionKit(
      ctx.snapOffenseSide ? { ...ctx.live, possession: ctx.snapOffenseSide } : ctx.live,
      ctx.game,
      ctx.awayColor,
      ctx.homeColor,
    )
    const matched = matchRushPlayer(parsed.playerHint, ctx.players, kit.sideAbbrev)
    const headshotUrl = matched?.headshot_url ? String(matched.headshot_url) : ''
    const jerseyNumber = resolveFigureJersey(parsed, matched)

    const figTopAtEnd = RUSH_Y - RUSH_FIG_H + 8
    const figLeftAtEnd = catchFigLeftForHandsX(endX, facing, RUSH_FIG_W, RUSH_FIG_H)
    const handsEnd = catchHandsWorld(figLeftAtEnd, figTopAtEnd, facing, RUSH_FIG_W, RUSH_FIG_H)
    const ballStart = { x: startX, y: RUSH_Y - 6 }
    const ballEnd = { x: handsEnd.x, y: handsEnd.y }
    const arcLift = catchArcLiftFromYards(parsed.yards)
    const ballCtrl = {
      x: (ballStart.x + ballEnd.x) / 2,
      y: Math.min(ballStart.y, ballEnd.y) - arcLift,
    }

    const toFirstDownPct = firstDownPercentFromLive(ctx.live, gainPct, ctx.fieldFlipped)
    const settled = settledLinesRef.current
    const fromScrimPct = startPct
    const settledStillPrePlay =
      settled.scrimPct != null &&
      Math.abs(settled.scrimPct - startPct) <= Math.abs(settled.scrimPct - gainPct) + 0.01
    let fromFirstDownPct =
      ctx.knownFirstDownPct != null
        ? ctx.knownFirstDownPct
        : settledStillPrePlay &&
            settled.firstDownPct != null &&
            Number.isFinite(settled.firstDownPct)
          ? settled.firstDownPct
          : null
    if (fromFirstDownPct == null) {
      const priorDist = Number(ctx.live?.distance)
      fromFirstDownPct = Number.isFinite(priorDist)
        ? firstDownPercentFromLive(
            { ...ctx.live, distance: priorDist + parsed.yards },
            startPct,
            ctx.fieldFlipped,
          )
        : toFirstDownPct
    }

    const base = {
      playKey: animKey,
      startX,
      endX,
      y: RUSH_Y,
      primary: kit.primary,
      line: kit.line,
      jerseyColor: kit.jerseyColor,
      teamAbbrev: kit.sideAbbrev,
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
      /** Loss: the trail rides the drive chart's offset lane so the handoff doesn't jump. */
      trailY: RUSH_Y + ((gainPct - startPct) * attackDir < 0 ? DRIVE_LANE_PX : 0),
      lateralPx: (parsed.lateral || 0) * attackDir * RUN_LATERAL_PX,
      fromFirstDownPct,
      toFirstDownPct,
    }

    if (prefersReducedMotion()) {
      // TD: never park LOS/ball on the goal line … wait for kickoff / next drive.
      if (!isTouchdown) {
        settledLinesRef.current = {
          scrimPct: gainPct,
          firstDownPct: toFirstDownPct,
        }
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
        catchRafRef.current = 0
        if (!isUserReplay) lastAutoPlayedKeyRef.current = animKey
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
      if (!catchRafRef.current) return
      cancelAnimationFrame(catchRafRef.current)
      catchRafRef.current = 0
      // Mid-flight teardown only … finished ticks already zeroed the ref.
      if (catchKeyRef.current === animKey) catchKeyRef.current = ''
    }
  }, [isFootball, animKey, isUserReplay, playAnimReady])

  useEffect(() => {
    const lastPlayText = fieldAnimCtxRef.current.lastPlayText
    if (!isFootball || !lastPlayText) return undefined
    const ctx = fieldAnimCtxRef.current
    if (!playAnimReady) return undefined
    if (ctx.pos == null && !isUserReplay) return undefined
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
    if (!isUserReplay && animKey === lastAutoPlayedKeyRef.current) return undefined
    fgKeyRef.current = animKey
    rushKeyRef.current = ''
    catchKeyRef.current = ''
    setRushAnim(null)
    setCatchAnim(null)
    if (rushRafRef.current) cancelAnimationFrame(rushRafRef.current)
    if (catchRafRef.current) cancelAnimationFrame(catchRafRef.current)
    pickKeyRef.current = ''
    setPickAnim(null)
    if (pickRafRef.current) cancelAnimationFrame(pickRafRef.current)
    kickKeyRef.current = ''
    setKickAnim(null)
    if (kickRafRef.current) cancelAnimationFrame(kickRafRef.current)

    const attackDir = attackDirection(ctx.snapOffenseSide, ctx.fieldFlipped)
    const posts = attackDir > 0 ? FG_POSTS.right : FG_POSTS.left
    const settled = settledLinesRef.current
    const { losPct, kickPct } = resolveFgLosAndKick({
      fgYards: parsed.yards,
      possessionSide: ctx.snapOffenseSide,
      livePos: ctx.pos,
      settledScrimPct: settled?.scrimPct,
      flipped: ctx.fieldFlipped,
      knownLosPct: ctx.knownStartPct,
    })
    const start = {
      x: fieldMidXFromPercent(kickPct),
      // Slight tee lean … held near upright before the plant.
      y: RUSH_Y - 8,
    }
    const yards = Number.isFinite(Number(parsed.yards)) ? Number(parsed.yards) : 40
    const made = Boolean(parsed.made)
    const facing = attackDir
    // Hold the pre-kick LOS on the field for the whole flight (live pos often
    // already jumped to the kickoff spot after a make).
    const fromScrimPct = losPct
    const toScrimPct = losPct
    const settledStillPreKick =
      settled?.scrimPct != null &&
      Math.abs(settled.scrimPct - losPct) <= 12
    const fromFirstDownPct =
      ctx.knownFirstDownPct != null
        ? ctx.knownFirstDownPct
        : settledStillPreKick &&
            settled.firstDownPct != null &&
            Number.isFinite(settled.firstDownPct)
          ? settled.firstDownPct
          : firstDownPercentFromLive(ctx.live, losPct, ctx.fieldFlipped)
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

    settledLinesRef.current = {
      scrimPct: losPct,
      firstDownPct: fromFirstDownPct,
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
      fromScrimPct,
      toScrimPct,
      fromFirstDownPct,
      toFirstDownPct: fromFirstDownPct,
      linesProgress: 1,
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
        fgRafRef.current = 0
        if (!isUserReplay) lastAutoPlayedKeyRef.current = animKey
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
      if (!fgRafRef.current) return
      cancelAnimationFrame(fgRafRef.current)
      fgRafRef.current = 0
      // Mid-flight teardown only … finished ticks already zeroed the ref.
      if (fgKeyRef.current === animKey) fgKeyRef.current = ''
    }
  }, [isFootball, animKey, isUserReplay, playAnimReady])

  // Pick-six: QB throws downfield (offense direction), a defender drifts onto the ball's
  // down arc, catches it, and returns it the other way to the goal line.
  useEffect(() => {
    const lastPlayText = fieldAnimCtxRef.current.lastPlayText
    if (!isFootball || !lastPlayText) return undefined
    const ctx = fieldAnimCtxRef.current
    if (!playAnimReady) return undefined
    if (ctx.pos == null && !isUserReplay) return undefined
    const parsed = parseInterceptionReturn(lastPlayText) || parseInterceptionPlay(lastPlayText)
    if (!parsed) {
      if (pickKeyRef.current && animKey !== pickKeyRef.current) {
        setPickAnim(null)
        pickKeyRef.current = ''
      }
      return undefined
    }
    if (animKey === pickKeyRef.current) return undefined
    if (!isUserReplay && animKey === lastAutoPlayedKeyRef.current) return undefined
    pickKeyRef.current = animKey
    rushKeyRef.current = ''
    catchKeyRef.current = ''
    fgKeyRef.current = ''
    setRushAnim(null)
    setCatchAnim(null)
    setFgAnim(null)
    if (rushRafRef.current) cancelAnimationFrame(rushRafRef.current)
    if (catchRafRef.current) cancelAnimationFrame(catchRafRef.current)
    if (fgRafRef.current) cancelAnimationFrame(fgRafRef.current)
    kickKeyRef.current = ''
    setKickAnim(null)
    if (kickRafRef.current) cancelAnimationFrame(kickRafRef.current)

    const isTouchdown = parsed.isTouchdown === true
    const livePoss = ctx.live?.possession === 'home' || ctx.live?.possession === 'away' ? ctx.live.possession : null
    const otherSide = (s) => (s === 'home' ? 'away' : s === 'away' ? 'home' : null)
    // Feed row team on an INT is the throwing (offense) side. After a non-scoring pick the live
    // feed already hands possession to the defense.
    const offense = isTouchdown
      ? ctx.possessionSide || livePoss
      : ctx.rowTeam || ctx.feedTeam || otherSide(livePoss)
    const defense = otherSide(offense)
    if (!offense || !defense) {
      pickKeyRef.current = ''
      return undefined
    }
    const offDir = attackDirection(offense, ctx.fieldFlipped)
    const defDir = -offDir
    const clampPct = (v) => Math.max(0, Math.min(100, v))
    const settled = settledLinesRef.current
    const priorLosPct =
      ctx.knownStartPct != null
        ? ctx.knownStartPct
        : settled.scrimPct != null && Number.isFinite(settled.scrimPct)
          ? settled.scrimPct
          : null
    const returnYards = Number.isFinite(Number(parsed.returnYards))
      ? Number(parsed.returnYards)
      : isTouchdown ? 25 : 0
    let pickPct
    let goalPct
    if (isTouchdown) {
      // Defense scores at the offense's own goal line.
      goalPct = defDir > 0 ? 100 : 0
      pickPct = clampPct(goalPct - defDir * returnYards)
    } else if (parsed.touchback) {
      // Picked deep in the end zone the offense was attacking … downed there.
      pickPct = (offDir > 0 ? 100 : 0) + offDir * PICK_TOUCHBACK_DEPTH_YDS
      goalPct = pickPct
    } else {
      // Return ends at the new LOS: row end spot, else live spot once possession flipped.
      const endPct =
        ctx.knownEndPct != null
          ? ctx.knownEndPct
          : livePoss === defense && ctx.pos != null
            ? ctx.pos
            : null
      if (endPct != null) {
        pickPct = clampPct(endPct - defDir * returnYards)
        goalPct = endPct
      } else {
        pickPct = clampPct((priorLosPct ?? 50) + offDir * 15)
        goalPct = clampPct(pickPct + defDir * returnYards)
      }
    }
    let losPct = priorLosPct != null ? priorLosPct : clampPct(pickPct - offDir * 12)
    // Throw must travel downfield from the LOS to the pick spot. Non-scoring picks trust the feed's LOS.
    if ((isTouchdown || priorLosPct == null) && (pickPct - losPct) * offDir < 3) {
      losPct = clampPct(pickPct - offDir * 10)
    }
    const airYards = Math.abs(pickPct - losPct)
    const fromFirstDownPct =
      ctx.knownFirstDownPct != null
        ? ctx.knownFirstDownPct
        : settled.firstDownPct != null && Number.isFinite(settled.firstDownPct) &&
            settled.scrimPct != null && Math.abs(settled.scrimPct - losPct) <= 1
          ? settled.firstDownPct
          : null

    const kit = possessionKit({ ...ctx.live, possession: defense }, ctx.game, ctx.awayColor, ctx.homeColor)
    const matched = matchRushPlayer(parsed.playerHint, ctx.players, kit.sideAbbrev)
    const headshotUrl = matched?.headshot_url ? String(matched.headshot_url) : ''
    const jerseyNumber = resolveFigureJersey(parsed, matched)

    const losX = fieldMidXFromPercent(losPct)
    const pickX = fieldMidXFromPercent(pickPct)
    // End zone is 10 yd deep … a touchback defender starts near the end line, not past it.
    const startX = fieldMidXFromPercent(
      !isTouchdown && parsed.touchback
        ? (offDir > 0 ? 100 : 0) + offDir * 9
        : clampPct(pickPct + offDir * PICK_DEFENDER_DEPTH_YDS),
    )
    const goalX = fieldMidXFromPercent(goalPct)
    const returnDist = Math.abs(goalPct - pickPct)
    const returnMs = !isTouchdown && returnDist < 0.5
      ? PICK_DOWN_SETTLE_MS
      : Math.min(PICK_RETURN_MAX_MS, PICK_RETURN_BASE_MS + returnDist * PICK_RETURN_MS_PER_YD)
    const runEndMs = PICK_THROW_MS + returnMs

    const base = {
      playKey: animKey,
      isTouchdown,
      y: RUSH_Y,
      facing: defDir,
      primary: kit.primary,
      line: kit.line,
      jerseyColor: kit.jerseyColor,
      teamAbbrev: kit.sideAbbrev,
      secondary: kit.secondary,
      helmetColor: kit.helmetColor,
      pantsColor: kit.pantsColor,
      tightsColor: kit.tightsColor,
      headshotUrl,
      jerseyNumber,
      ballStart: { x: losX, y: RUSH_Y - 6 },
      airYards,
      pickX,
      fromScrimPct: losPct,
      toScrimPct: losPct,
      fromFirstDownPct,
      toFirstDownPct: fromFirstDownPct,
    }

    if (prefersReducedMotion()) {
      setPickAnim(null)
      return undefined
    }

    // Non-scoring pick: brief hold at the return spot, then the TURNOVER banner takes over.
    const totalMs = isTouchdown
      ? runEndMs + CATCH_TD_PRE_LABEL_MS + CATCH_TD_CELEBRATE_MS + CATCH_TD_LABEL_TAIL_MS
      : runEndMs + PICK_DOWN_HOLD_MS
    setPickAnim({
      ...base,
      figX: startX,
      ballT: 0,
      showFigure: true,
      showBall: true,
      showTrail: false,
      showTdLabel: false,
      linesOpacity: 1,
      playing: true,
    })
    const t0 = performance.now()
    const tick = (now) => {
      const elapsed = now - t0
      if (elapsed >= totalMs) {
        pickRafRef.current = 0
        if (!isUserReplay) lastAutoPlayedKeyRef.current = animKey
        setPickAnim(null)
        return
      }
      let figX = pickX
      let ballT = 1
      let showFigure = true
      let showBall = true
      let showTrail = false
      let showTdLabel = false
      let linesOpacity = 1
      if (elapsed < PICK_THROW_MS) {
        const t = elapsed / PICK_THROW_MS
        ballT = t
        const drift = t < PICK_BREAK_AT ? 0 : (t - PICK_BREAK_AT) / (1 - PICK_BREAK_AT)
        figX = startX + (pickX - startX) * easeOutCubic(drift)
      } else if (elapsed < runEndMs) {
        const t = easeOutCubic((elapsed - PICK_THROW_MS) / returnMs)
        figX = pickX + (goalX - pickX) * t
        showTrail = t > 0.02
      } else if (!isTouchdown) {
        figX = goalX
        showTrail = Math.abs(goalX - pickX) > 1
      } else if (elapsed < runEndMs + CATCH_TD_PRE_LABEL_MS) {
        figX = goalX
        showTrail = true
      } else if (elapsed < runEndMs + CATCH_TD_PRE_LABEL_MS + CATCH_TD_CELEBRATE_MS) {
        figX = goalX
        showTrail = true
        showTdLabel = true
        const fadeElapsed = elapsed - runEndMs - CATCH_TD_PRE_LABEL_MS
        linesOpacity = Math.max(0, 1 - Math.min(1, fadeElapsed / CATCH_TD_LINES_FADE_MS))
      } else {
        showFigure = false
        showBall = false
        showTdLabel = true
        linesOpacity = 0
      }
      setPickAnim((prev) =>
        prev && prev.playKey === animKey
          ? { ...prev, figX, ballT, showFigure, showBall, showTrail, showTdLabel, linesOpacity, playing: true }
          : prev,
      )
      pickRafRef.current = requestAnimationFrame(tick)
    }
    pickRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (!pickRafRef.current) return
      cancelAnimationFrame(pickRafRef.current)
      pickRafRef.current = 0
      if (pickKeyRef.current === animKey) pickKeyRef.current = ''
    }
  }, [isFootball, animKey, isUserReplay, playAnimReady])

  // Kickoff / punt return: ball hangs from the kicking team's 35 (kickoff) or 15 yd behind the
  // LOS (punt), the RB creeps onto its down arc, fields it, and slides the return (or scores).
  useEffect(() => {
    const lastPlayText = fieldAnimCtxRef.current.lastPlayText
    if (!isFootball || !lastPlayText) return undefined
    const ctx = fieldAnimCtxRef.current
    if (!playAnimReady) return undefined
    const kickoff = parseKickoffReturn(lastPlayText)
    const punt = kickoff ? null : parsePuntReturn(lastPlayText)
    const touchback = kickoff || punt ? null : parseKickoffTouchback(lastPlayText) || parsePuntTouchback(lastPlayText)
    const puntTouchback = touchback?.punt === true
    const parsed = kickoff || punt || touchback
    if (!parsed) {
      if (kickKeyRef.current && animKey !== kickKeyRef.current) {
        setKickAnim(null)
        kickKeyRef.current = ''
      }
      return undefined
    }
    if (animKey === kickKeyRef.current) return undefined
    if (!isUserReplay && animKey === lastAutoPlayedKeyRef.current) return undefined

    const other = (s) => (s === 'home' ? 'away' : s === 'away' ? 'home' : null)
    const livePoss = ctx.live?.possession === 'home' || ctx.live?.possession === 'away' ? ctx.live.possession : null
    // NFL kickoffs name the kicking spot; CFB only the return spot (usually the receiver's own
    // territory). Punts: the feed row team is the punter; after the play live possession flips.
    const receiving = punt || puntTouchback
      ? other(ctx.feedTeam) || sideForFeedAbbrev(parsed.landAbbrev, ctx.game) || livePoss
      : other(sideForFeedAbbrev(parsed.kickFromAbbrev, ctx.game)) ||
        sideForFeedAbbrev(parsed.landAbbrev, ctx.game) ||
        sideForFeedAbbrev(parsed.endAbbrev, ctx.game) ||
        livePoss
    const kicking = other(receiving)
    if (!receiving || !kicking) return undefined

    kickKeyRef.current = animKey
    rushKeyRef.current = ''
    catchKeyRef.current = ''
    fgKeyRef.current = ''
    pickKeyRef.current = ''
    setRushAnim(null)
    setCatchAnim(null)
    setFgAnim(null)
    setPickAnim(null)
    if (rushRafRef.current) cancelAnimationFrame(rushRafRef.current)
    if (catchRafRef.current) cancelAnimationFrame(catchRafRef.current)
    if (fgRafRef.current) cancelAnimationFrame(fgRafRef.current)
    if (pickRafRef.current) cancelAnimationFrame(pickRafRef.current)

    const recDir = attackDirection(receiving, ctx.fieldFlipped)
    const kickDir = -recDir
    const kickOwnGoal = kickDir > 0 ? 0 : 100
    const recOwnGoal = recDir > 0 ? 0 : 100

    // Touchback: no returner … the ball lands in the end zone and bounces out the back.
    if (touchback) {
      if (prefersReducedMotion()) {
        setKickAnim(null)
        return undefined
      }
      let kickFromPct
      if (puntTouchback) {
        // Punter stands PUNT_DEPTH_YDS behind the LOS; punt yards run LOS → receiving goal line.
        const settled = settledLinesRef.current
        const losPct =
          ctx.knownStartPct != null
            ? ctx.knownStartPct
            : settled.scrimPct != null && Number.isFinite(settled.scrimPct)
              ? settled.scrimPct
              : recOwnGoal - kickDir * (Number.isFinite(touchback.puntYards) ? touchback.puntYards : PUNT_DEFAULT_YDS)
        kickFromPct = losPct - kickDir * PUNT_DEPTH_YDS
      } else {
        const kickFromYard = Number.isFinite(touchback.kickFromYard) ? touchback.kickFromYard : 35
        kickFromPct = kickOwnGoal + kickDir * kickFromYard
      }
      const start = { x: fieldMidXFromPercent(kickFromPct), y: RUSH_Y - 6 }
      const { frameAt, totalMs } = touchbackBallFrames({
        start,
        goalPct: recOwnGoal,
        dir: kickDir,
        flightMs: puntTouchback ? PUNT_FLIGHT_MS : KICK_FLIGHT_MS,
        arcLift: puntTouchback ? PUNT_ARC_LIFT : KICK_ARC_LIFT,
        tumbleDegPerMs: puntTouchback ? PUNT_TUMBLE_DEG_PER_MS : KICK_TUMBLE_DEG_PER_MS,
      })
      setKickAnim({
        playKey: animKey,
        touchback: true,
        isTouchdown: false,
        y: RUSH_Y,
        facing: recDir,
        showFigure: false,
        showTrail: false,
        showTdLabel: false,
        linesOpacity: 1,
        fromScrimPct: null,
        fromFirstDownPct: null,
        showLines: false,
        tb: frameAt(0),
        playing: true,
      })
      whistleOpeningKick()
      const t0 = performance.now()
      const tick = (now) => {
        const elapsed = now - t0
        if (elapsed >= totalMs) {
          kickRafRef.current = 0
          if (!isUserReplay) lastAutoPlayedKeyRef.current = animKey
          setTbRest({ key: animKey, ...frameAt(totalMs) })
          setKickAnim(null)
          return
        }
        const tb = frameAt(elapsed)
        setKickAnim((prev) => (prev && prev.playKey === animKey ? { ...prev, tb } : prev))
        kickRafRef.current = requestAnimationFrame(tick)
      }
      kickRafRef.current = requestAnimationFrame(tick)
      return () => {
        if (!kickRafRef.current) return
        cancelAnimationFrame(kickRafRef.current)
        kickRafRef.current = 0
        if (kickKeyRef.current === animKey) kickKeyRef.current = ''
      }
    }
    const clampPct = (v) => Math.max(-8, Math.min(108, v))
    const landSide = sideForFeedAbbrev(parsed.landAbbrev, ctx.game)
    const landFromText =
      parsed.landYard != null && landSide
        ? landSide === receiving
          ? recOwnGoal + recDir * parsed.landYard
          : kickOwnGoal + kickDir * parsed.landYard
        : null

    let kickFromPct
    let landPct
    let fromScrimPct = null
    let fromFirstDownPct = null
    let puntEndPct = null
    if (punt) {
      const settled = settledLinesRef.current
      const losPct =
        ctx.knownStartPct != null
          ? ctx.knownStartPct
          : settled.scrimPct != null && Number.isFinite(settled.scrimPct)
            ? settled.scrimPct
            : landFromText != null
              ? landFromText - kickDir * (Number.isFinite(parsed.puntYards) ? parsed.puntYards : PUNT_DEFAULT_YDS)
              : null
      if (losPct == null) {
        kickKeyRef.current = ''
        return undefined
      }
      fromScrimPct = losPct
      fromFirstDownPct =
        ctx.knownFirstDownPct != null
          ? ctx.knownFirstDownPct
          : settled.firstDownPct != null && Number.isFinite(settled.firstDownPct) &&
              settled.scrimPct != null && Math.abs(settled.scrimPct - losPct) <= 1
            ? settled.firstDownPct
            : null
      kickFromPct = clampPct(losPct - kickDir * PUNT_DEPTH_YDS)
      // Stated punt yards run from the LOS but can be gross or net of the return depending on the
      // feed, and ESPN's landing abbrev is sometimes the wrong side … end spot minus return wins.
      landPct = clampPct(losPct + kickDir * (Number.isFinite(parsed.puntYards) ? parsed.puntYards : PUNT_DEFAULT_YDS))
      const endSide = sideForFeedAbbrev(parsed.endAbbrev, ctx.game)
      if (!parsed.isTouchdown && parsed.endYard != null && endSide && Number.isFinite(parsed.returnYards)) {
        const endFromText =
          endSide === kicking ? kickOwnGoal + kickDir * parsed.endYard : recOwnGoal + recDir * parsed.endYard
        const catchFromEnd = endFromText - recDir * parsed.returnYards
        if ((catchFromEnd - losPct) * kickDir > 0) {
          landPct = clampPct(catchFromEnd)
          puntEndPct = endFromText
        }
      }
    } else {
      const kickFromYard = Number.isFinite(parsed.kickFromYard) ? parsed.kickFromYard : 35
      kickFromPct = kickOwnGoal + kickDir * kickFromYard
      landPct = clampPct(
        (landSide === receiving ? landFromText : null) ??
          kickFromPct + kickDir * (Number.isFinite(parsed.kickYards) ? parsed.kickYards : 60),
      )
    }
    let endPct = puntEndPct
    if (endPct == null) {
      if (parsed.isTouchdown) endPct = kickOwnGoal
      else if (Number.isFinite(parsed.returnYards)) endPct = landPct + recDir * parsed.returnYards
      else if (parsed.endYard != null) {
        endPct =
          sideForFeedAbbrev(parsed.endAbbrev, ctx.game) === kicking
            ? kickOwnGoal + kickDir * parsed.endYard
            : recOwnGoal + recDir * parsed.endYard
      }
    }
    if (endPct == null) {
      kickKeyRef.current = ''
      return undefined
    }
    endPct = Math.max(0, Math.min(100, endPct))

    const kit = possessionKit({ ...ctx.live, possession: receiving }, ctx.game, ctx.awayColor, ctx.homeColor)
    const matched = matchRushPlayer(parsed.playerHint, ctx.players, kit.sideAbbrev)
    const headshotUrl = matched?.headshot_url ? String(matched.headshot_url) : ''
    const jerseyNumber = resolveFigureJersey(parsed, matched)

    // Punt returners never field it inside their own 5 … the return still ends on the feed spot.
    // A fair catch stays on its feed spot (that's the next LOS).
    const fairCatch = Boolean(punt?.fairCatch)
    const puntFloorPct = recOwnGoal + recDir * PUNT_MIN_CATCH_YD
    const insideFloor = (v) => Boolean(punt) && !fairCatch && (v - puntFloorPct) * recDir < 0
    const catchPct = insideFloor(landPct) ? puntFloorPct : landPct
    const startPct = catchPct - recDir * KICK_RETURNER_DEPTH_YDS
    const landX = fieldMidXFromPercent(catchPct)
    const startX = fieldMidXFromPercent(clampPct(insideFloor(startPct) ? puntFloorPct : startPct))
    const endX = fairCatch ? landX : fieldMidXFromPercent(endPct)
    const returnYards = fairCatch ? 0 : Math.abs(endPct - catchPct)
    const returnMs = fairCatch
      ? 0
      : Math.min(KICK_RETURN_MAX_MS, KICK_RETURN_BASE_MS + returnYards * KICK_RETURN_MS_PER_YD)
    const flightMs = punt ? PUNT_FLIGHT_MS : KICK_FLIGHT_MS
    const runEndMs = flightMs + returnMs
    const totalMs = parsed.isTouchdown
      ? runEndMs + CATCH_TD_PRE_LABEL_MS + CATCH_TD_CELEBRATE_MS + CATCH_TD_LABEL_TAIL_MS
      : runEndMs + KICK_HOLD_MS

    if (prefersReducedMotion()) {
      setKickAnim(null)
      return undefined
    }

    setKickAnim({
      playKey: animKey,
      isTouchdown: parsed.isTouchdown,
      y: RUSH_Y,
      facing: recDir,
      primary: kit.primary,
      line: kit.line,
      jerseyColor: kit.jerseyColor,
      teamAbbrev: kit.sideAbbrev,
      secondary: kit.secondary,
      helmetColor: kit.helmetColor,
      pantsColor: kit.pantsColor,
      tightsColor: kit.tightsColor,
      headshotUrl,
      jerseyNumber,
      ballStart: { x: fieldMidXFromPercent(kickFromPct), y: RUSH_Y - 6 },
      flightMs,
      punt: Boolean(punt),
      landX,
      figX: startX,
      ballT: 0,
      showFigure: true,
      showTrail: false,
      showTdLabel: false,
      linesOpacity: 1,
      fromScrimPct,
      fromFirstDownPct,
      /** Punt: snap LOS / line to gain stay up until the returner fields it. */
      showLines: fromScrimPct != null,
      playing: true,
    })
    if (!punt) whistleOpeningKick()
    const t0 = performance.now()
    const tick = (now) => {
      const elapsed = now - t0
      if (elapsed >= totalMs) {
        kickRafRef.current = 0
        if (!isUserReplay) lastAutoPlayedKeyRef.current = animKey
        setKickAnim(null)
        return
      }
      let figX = endX
      let ballT = 1
      let showFigure = true
      let showTrail = !fairCatch
      let showTdLabel = false
      if (elapsed < flightMs) {
        const t = elapsed / flightMs
        ballT = t
        const creep = t < KICK_CREEP_AT ? 0 : (t - KICK_CREEP_AT) / (1 - KICK_CREEP_AT)
        figX = startX + (landX - startX) * easeOutCubic(creep)
        showTrail = false
      } else if (elapsed < runEndMs) {
        const t = easeOutCubic((elapsed - flightMs) / returnMs)
        figX = landX + (endX - landX) * t
        showTrail = t > 0.02
      } else if (parsed.isTouchdown) {
        const tdElapsed = elapsed - runEndMs
        showTdLabel = tdElapsed >= CATCH_TD_PRE_LABEL_MS
        showFigure = tdElapsed < CATCH_TD_PRE_LABEL_MS + CATCH_TD_CELEBRATE_MS
      }
      setKickAnim((prev) =>
        prev && prev.playKey === animKey
          ? {
              ...prev,
              figX,
              ballT,
              showFigure,
              showTrail,
              showTdLabel,
              showLines: prev.fromScrimPct != null && elapsed < flightMs,
              playing: true,
            }
          : prev,
      )
      kickRafRef.current = requestAnimationFrame(tick)
    }
    kickRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (!kickRafRef.current) return
      cancelAnimationFrame(kickRafRef.current)
      kickRafRef.current = 0
      if (kickKeyRef.current === animKey) kickKeyRef.current = ''
    }
  }, [isFootball, animKey, isUserReplay, playAnimReady, whistleOpeningKick])

  useEffect(() => {
    if (rushAnim || catchAnim || fgAnim || pickAnim || kickAnim || !hasLine || pos == null || hideLiveLines) return
    // New replayable play: keep the pre-play LOS until rush/catch/FG claims this animKey.
    // Otherwise a made FG's kickoff spot (or post-rush LOS) can clobber settled before RAF starts.
    if (
      lastPlayText &&
      isFieldReplayablePlay(lastPlayText) &&
      animKey &&
      animKey !== rushKeyRef.current &&
      animKey !== catchKeyRef.current &&
      animKey !== fgKeyRef.current &&
      animKey !== pickKeyRef.current &&
      animKey !== kickKeyRef.current
    ) {
      return
    }
    // After a TD / try, ESPN reports the try spot … don't adopt that as LOS/ball.
    if (lastPlayText && playTextIsScoreTry(lastPlayText)) return
    const prior = settledLinesRef.current
    settledLinesRef.current = {
      scrimPct: pos,
      firstDownPct:
        firstDownPercentFromLive(live, pos, fieldFlipped) ??
        (centerBanner === 'TIMEOUT' && prior.scrimPct === pos ? prior.firstDownPct : null),
    }
  }, [
    rushAnim,
    catchAnim,
    fgAnim,
    pickAnim,
    kickAnim,
    hasLine,
    pos,
    hideLiveLines,
    centerBanner,
    fieldFlipped,
    live?.possession,
    live?.down,
    live?.distance,
    lastPlayText,
    animKey,
  ])

  const [driveTap, setDriveTap] = useState(null)
  const onDriveMarkTap = useCallback(
    (m, at) => {
      const tone = m.kind !== 'penalty' ? 'play' : drivePenaltyOnDefense(m, drive?.attackDir ?? 1) ? 'flag-defense' : 'flag-offense'
      setDriveTap((prev) => ({ n: (prev?.n || 0) + 1, animKey, label: drivePlayShortLabel(m), tone, x: at.x, y: at.y }))
    },
    [animKey, drive?.attackDir],
  )
  const anyPlayAnim =
    rushAnim != null || catchAnim != null || fgAnim != null || pickAnim != null || kickAnim != null
  useEffect(() => {
    onPlayAnimActiveChange?.(anyPlayAnim)
  }, [anyPlayAnim, onPlayAnimActiveChange])

  // Play anim just finished → pop each involved player's fantasy points for that play.
  const [fantasyToast, setFantasyToast] = useState(null)
  const prevAnyPlayAnimRef = useRef(false)
  useEffect(() => {
    const was = prevAnyPlayAnimRef.current
    prevAnyPlayAnimRef.current = anyPlayAnim
    if (anyPlayAnim) {
      setFantasyToast(null)
      return undefined
    }
    if (!was) return undefined
    const ctx = fieldAnimCtxRef.current
    const offense = ctx.rowTeam || ctx.snapOffenseSide
    const hasSide = offense === 'home' || offense === 'away'
    const defense = offense === 'home' ? 'away' : 'home'
    const defenseAbbrev = hasSide ? String(ctx.game?.[defense]?.abbrev || '') : ''
    const defenseLogoRaw = hasSide ? String(ctx.game?.[defense]?.logo || '') : ''
    const logoKey = defenseAbbrev.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
    const rows = playFantasyPoints(ctx.lastPlayText, {
      players: ctx.players,
      offenseAbbrev: hasSide ? String(ctx.game?.[offense]?.abbrev || '') : '',
      defenseAbbrev,
      defenseLogo: defenseLogoRaw.startsWith('/sports/')
        ? defenseLogoRaw
        : logoKey
          ? `${isCfbSport(ctx.game?.sport_key) ? '/sports/cfb/logos' : '/sports/nfl/logos'}/${logoKey}.png`
          : '',
      turnover: ctx.turnover === true,
      recPoints: receptionPoints(getFantasyScoring()),
    })
    if (!rows.length) return undefined
    setFantasyToast({ key: `${animKey}:${Date.now()}`, rows })
    const t = window.setTimeout(() => setFantasyToast(null), FANTASY_TOAST_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on the anim active → idle edge only
  }, [anyPlayAnim])

  const throwRunning = Boolean(throwArmedKey) && throwArmedKey === animKey && throwDoneKey !== animKey
  const fieldAnimBusy = anyPlayAnimRunning || throwRunning
  useEffect(() => {
    if (isUserReplay || fieldAnimBusy || heldPlayText === feedLastPlayText) return
    setHeldPlayText(feedLastPlayText)
  }, [isUserReplay, fieldAnimBusy, heldPlayText, feedLastPlayText])

  if (!isFootball) return null

  // Calibrated 3D field coordinates (viewBox="0 0 1266 533")
  // Left Goal Line: top=(239.0, 191), bot=(161.0, 478)
  // Right Goal Line: top=(1023.0, 191), bot=(1098.0, 478)
  const lineDriver =
    rushAnim != null && !rushAnim.isTouchdown
      ? rushAnim
      : catchAnim != null && !catchAnim.isTouchdown
        ? catchAnim
        : fgAnim != null
          ? fgAnim
          : null
  const linesT = lineDriver != null ? Number(lineDriver.linesProgress) || 0 : 1
  const tdAnim =
    rushAnim?.isTouchdown
      ? rushAnim
      : catchAnim?.isTouchdown
        ? catchAnim
        : pickAnim ?? (kickAnim?.isTouchdown ? kickAnim : null)
  const kickLinesUp = Boolean(kickAnim?.showLines && kickAnim.fromScrimPct != null)
  let displayScrimPct = pos
  if (kickAnim != null) displayScrimPct = kickLinesUp ? kickAnim.fromScrimPct : null
  else if (lineDriver != null) displayScrimPct = lerp(lineDriver.fromScrimPct, lineDriver.toScrimPct, linesT)
  else if (tdAnim) displayScrimPct = tdAnim.fromScrimPct
  const liveFirstDownPct =
    feedFirstDownPct ??
    (centerBanner === 'TIMEOUT' && pos != null && heldFirstDown?.pos === pos ? heldFirstDown.pct : null)
  let displayFirstDownPct = liveFirstDownPct
  if (kickAnim != null) displayFirstDownPct = kickLinesUp ? kickAnim.fromFirstDownPct : null
  else if (lineDriver != null && lineDriver.fromFirstDownPct != null && lineDriver.toFirstDownPct != null) {
    displayFirstDownPct = lerp(lineDriver.fromFirstDownPct, lineDriver.toFirstDownPct, linesT)
  } else if (tdAnim) displayFirstDownPct = tdAnim.fromFirstDownPct
  const linesFadeOpacity =
    tdAnim?.linesOpacity != null
      ? Math.max(0, Math.min(1, Number(tdAnim.linesOpacity)))
      : 1
  // After a TD / PAT / 2-pt, made FG or safety, no LOS or field ball until the kickoff play lands.
  const suppressPostTdMarkers = Boolean(
    !rushAnim &&
      !catchAnim &&
      !fgAnim &&
      !pickAnim &&
      !kickAnim &&
      lastPlayText &&
      playTextAwaitsKickoff(lastBallPlayText(plays, lastPlayText)),
  )
  const showLiveScrimMarkers =
    hasLine &&
    !hideLiveLines &&
    !suppressPostTdMarkers &&
    (!staleHalf || kickAnim != null) &&
    (!kickAnim || kickLinesUp) &&
    displayScrimPct != null &&
    linesFadeOpacity > 0.02

  const scrimTop =
    showLiveScrimMarkers && displayScrimPct != null
      ? fieldTopXFromPercent(displayScrimPct)
      : null
  const scrimBot =
    showLiveScrimMarkers && displayScrimPct != null
      ? fieldBotXFromPercent(displayScrimPct)
      : null
  const scrimMidX =
    showLiveScrimMarkers && displayScrimPct != null
      ? fieldMidXFromPercent(displayScrimPct)
      : null

  // First down line
  let firstDownTop = null
  let firstDownBot = null
  if (
    showLiveScrimMarkers &&
    displayFirstDownPct != null &&
    !suppressPostTdMarkers
  ) {
    firstDownTop = fieldTopXFromPercent(displayFirstDownPct)
    firstDownBot = fieldBotXFromPercent(displayFirstDownPct)
  }

  // Red zone: LOS inside the opponent's 20 → tint that 20-to-goal band.
  // Mid-anim the offense is the snap team (a turnover flips live possession) … otherwise trust the live feed.
  const livePossession = live?.possession === 'home' || live?.possession === 'away' ? live.possession : null
  const redZoneTeam =
    lineDriver != null || tdAnim != null
      ? snapOffenseSide
      : kickAnim != null
        ? possessionSide
        : livePossession
  const redZoneAttackDir = redZoneTeam ? attackDirection(redZoneTeam, fieldFlipped) : 0
  const redZoneSide =
    showLiveScrimMarkers && redZoneAttackDir !== 0
      ? redZoneAttackDir > 0 && displayScrimPct >= 80
        ? 'right'
        : redZoneAttackDir < 0 && displayScrimPct <= 20
          ? 'left'
          : null
      : null
  const redZonePoints = (fromPct, toPct) =>
    [
      `${fieldTopXFromPercent(fromPct)},191`,
      `${fieldTopXFromPercent(toPct)},191`,
      `${fieldBotXFromPercent(toPct)},478`,
      `${fieldBotXFromPercent(fromPct)},478`,
    ].join(' ')

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
  // End zone art is fixed (away left / home right); only the direction of play flips by quarter.
  const leftEndzone = resolveEndzoneDesign(game?.away, awayColor, 'left', { college })
  const rightEndzone = resolveEndzoneDesign(game?.home, homeColor, 'right', { college })

  const catchPlaying = Boolean(
    catchAnim != null &&
      (catchAnim.showFigure || catchAnim.showTdLabel || catchAnim.playing),
  )
  const rushPlaying = Boolean(
    rushAnim != null &&
      (rushAnim.showFigure || rushAnim.showTdLabel || rushAnim.playing),
  )
  const fgPlaying = Boolean(fgAnim?.playing || (fgAnim != null && fgAnim.showBall))
  const pickPlaying = Boolean(pickAnim != null && (pickAnim.showFigure || pickAnim.showTdLabel || pickAnim.playing))
  const kickPlaying = Boolean(kickAnim?.playing)
  // Hide LOS ball for the full rush/catch/FG sequence.
  const playAnimActive =
    rushAnim != null || catchAnim != null || fgAnim != null || pickAnim != null || kickAnim != null
  const suppressBanner = isUserReplay && (rushPlaying || catchPlaying || fgPlaying || pickPlaying || kickPlaying)
  const rushPt = rushAnim != null && rushAnim.showFigure ? runPoint(rushAnim, rushAnim.progress) : null
  const rushX = rushPt?.x ?? null
  const rushTrailVisible =
    Boolean(rushAnim?.showTrail && rushAnim.showFigure && rushAnim.progress > 0.02)
  const catchPt = catchAnim != null && catchAnim.showFigure ? runPoint(catchAnim, catchAnim.progress) : null
  const catchX = catchPt?.x ?? null
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
          catchFigLeftForHandsX(catchX, catchAnim.facing, RUSH_FIG_W, RUSH_FIG_H),
          catchPt.y - RUSH_FIG_H + 8,
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
  const showDriveMarks = Boolean(
    drive?.marks.length && game?.status === 'in' && !hideLiveLines && !kickAnim && !pickAnim,
  )
  /** Newest incompletion animates its throw once per play (or replay tap); the LOS ball hides meanwhile. */
  const newestIncomplete = drive?.marks.find((m) => m.isNewest && m.kind === 'incomplete')
  const throwEligible = Boolean(
    showDriveMarks &&
      newestIncomplete &&
      fieldPlayIdentity(newestIncomplete.text) === fieldPlayIdentity(lastPlayText) &&
      animKey !== throwDoneKey,
  )
  // Same start gate as the other play anims (field art painted, LOS known, no banner) … a throw fired
  // into a zero-height field burns its one run unseen. Once armed it finishes even if the gate blips.
  if (throwEligible && playAnimReady && throwArmedKey !== animKey) setThrowArmedKey(animKey)
  const throwKey = throwEligible && throwArmedKey === animKey ? animKey : ''
  const drivePrimary = drive?.team
    ? possessionKit({ possession: drive.team }, game, awayColor, homeColor).line
    : '#ffffff'
  // The live rush / catch trail paints this play while its figure runs … the persistent line takes over after.
  const newestDriveMark = drive?.marks.findLast((m) => m.kind === 'line')
  const driveHideKey =
    newestDriveMark?.isNewest &&
    (rushAnim?.showFigure || catchAnim?.showFigure) &&
    fieldPlayIdentity(newestDriveMark.text) === fieldPlayIdentity(lastPlayText)
      ? newestDriveMark.key
      : null
  const animTdTeam =
    [catchAnim, rushAnim, pickAnim, kickAnim].find((a) => a?.showTdLabel)?.teamAbbrev || ''
  const animTdLabel = Boolean(
    catchAnim?.showTdLabel || rushAnim?.showTdLabel || pickAnim?.showTdLabel || kickAnim?.showTdLabel,
  )
  // TD / PAT / 2-pt is still the latest row … hold the label until the kickoff or a stoppage banner.
  const scoreTryWindow = Boolean(isFootball && lastPlayText && playTextIsScoreTry(lastPlayText))
  if (animTdTeam && heldTdTeam !== animTdTeam) setHeldTdTeam(animTdTeam)
  else if (!animTdLabel && heldTdTeam && !scoreTryWindow) setHeldTdTeam('')
  const holdTdBanner = !animTdLabel && scoreTryWindow && !centerBanner && !playAnimActive
  const showTdBanner = animTdLabel || holdTdBanner
  // Interception / opponent fumble recovery / turnover on downs is still the latest row … name the team that took the ball.
  const turnoverOffense =
    lastPlayRow?.team === 'home' || lastPlayRow?.team === 'away' ? lastPlayRow.team : replayTeam
  const isTurnoverPlay = Boolean(
    isFootball &&
      lastPlayText &&
      (lastPlayRow?.turnover === true || /\bintercept(?:ed|ion)\b|\bturnover\s+on\s+downs\b/i.test(lastPlayText)) &&
      (turnoverOffense === 'home' || turnoverOffense === 'away'),
  )
  const showTurnoverBanner = isTurnoverPlay && !showTdBanner && !centerBanner && !playAnimActive
  const turnoverTeamLabel = showTurnoverBanner
    ? fieldBannerTeamLabel(game?.[turnoverOffense === 'home' ? 'away' : 'home']?.abbrev, game, sportKey)
    : ''
  const tdTeamLabel = showTdBanner
    ? fieldBannerTeamLabel(
      animTdTeam || heldTdTeam || touchdownScorerAbbrevFromText(lastPlayText, replayTeam, game),
      game,
      sportKey,
    )
    : ''
  const playBannerText = showTdBanner
    ? tdTeamLabel ? `Touchdown\n${tdTeamLabel}` : 'Touchdown'
    : turnoverTeamLabel ? `Turnover\n${turnoverTeamLabel} Ball` : 'Turnover'

  // Pick-six: ball rides a QB arc into the defender's hands, then stays tucked on the return.
  const pickHands =
    pickAnim?.showFigure
      ? catchHandsWorld(
          catchFigLeftForHandsX(pickAnim.figX, pickAnim.facing, RUSH_FIG_W, RUSH_FIG_H),
          pickAnim.y - RUSH_FIG_H + 8,
          pickAnim.facing,
          RUSH_FIG_W,
          RUSH_FIG_H,
        )
      : null
  let pickBall = null
  let pickBallRotate = 0
  if (pickAnim?.showBall && pickHands) {
    if (pickAnim.ballT < 1) {
      const ctrl = {
        x: (pickAnim.ballStart.x + pickHands.x) / 2,
        y: Math.min(pickAnim.ballStart.y, pickHands.y) - catchArcLiftFromYards(pickAnim.airYards),
      }
      pickBall = quadBezier(pickAnim.ballStart, ctrl, pickHands, pickAnim.ballT)
      // Spiral points the throw direction (opposite the returner's facing).
      pickBallRotate = (-36 + pickAnim.ballT * 18) * (pickAnim.facing < 0 ? 1 : -1)
    } else {
      pickBall = pickHands
      pickBallRotate = -18 * (pickAnim.facing < 0 ? -1 : 1)
    }
  }

  // Kickoff: loose ball hangs tee → returner's tuck; after the catch the sculpt's own ball shows.
  const kickFigLeft =
    kickAnim?.showFigure ? rushFigLeftForBallX(kickAnim.figX, kickAnim.facing) : null
  const kickFigTop = kickAnim ? kickAnim.y - RUSH_FIG_H + 8 : null
  let kickBall = null
  let kickBallRotate = 0
  if (kickAnim?.showFigure && kickAnim.ballT < 1 && kickFigLeft != null) {
    const tuck = rushTuckWorld(kickFigLeft, kickFigTop, kickAnim.facing)
    const ctrl = {
      x: (kickAnim.ballStart.x + tuck.x) / 2,
      y: Math.min(kickAnim.ballStart.y, tuck.y) - (kickAnim.punt ? PUNT_ARC_LIFT : KICK_ARC_LIFT),
    }
    kickBall = quadBezier(kickAnim.ballStart, ctrl, tuck, kickAnim.ballT)
    // Returner faces back up the field, so the kick travels the other way.
    kickBallRotate = kickTumbleRotate(
      kickAnim.ballT * (kickAnim.flightMs || KICK_FLIGHT_MS),
      -kickAnim.facing,
      kickAnim.punt ? PUNT_TUMBLE_DEG_PER_MS : KICK_TUMBLE_DEG_PER_MS,
    )
  }

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
    <div ref={fieldRootRef} data-lounge-game-field className="relative z-[5] w-full px-1 pb-0 pt-5 sm:px-1.5">
      <div className="relative w-full overflow-visible" style={{ aspectRatio: '1266 / 533' }}>
        {/* Layer 1: Floating field base graphic */}
        <img
          ref={bindFieldArtImg}
          src="/sports/nfl/gamecast-field-floating.png?v=629"
          alt="Gamecast Field"
          width={1266}
          height={533}
          decoding="async"
          onLoad={markFieldArtReady}
          onError={markFieldArtReady}
          className="pointer-events-none absolute inset-0 block h-full w-full select-none"
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
              <stop offset="0%" stopColor={leftEndzone.gradSheen} stopOpacity={0.84 + leftEndzone.washOpacityBoost} />
              <stop offset="45%" stopColor={leftEndzone.gradMid} stopOpacity={0.78 + leftEndzone.washOpacityBoost} />
              <stop offset="100%" stopColor={leftEndzone.gradDeep} stopOpacity={0.86 + leftEndzone.washOpacityBoost} />
            </linearGradient>
            <linearGradient id="ez-right-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={rightEndzone.gradSheen} stopOpacity={0.84 + rightEndzone.washOpacityBoost} />
              <stop offset="45%" stopColor={rightEndzone.gradMid} stopOpacity={0.78 + rightEndzone.washOpacityBoost} />
              <stop offset="100%" stopColor={rightEndzone.gradDeep} stopOpacity={0.86 + rightEndzone.washOpacityBoost} />
            </linearGradient>
          </defs>

          {/* Endzone Turf Washes */}
          <path d={ENDZONE_COORDS.left.paintPath} fill="url(#ez-left-grad)" />
          <path d={ENDZONE_COORDS.right.paintPath} fill="url(#ez-right-grad)" />

          {/* Left Endzone Mascot Wordmark (away, fixed) */}
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

          {/* Right Endzone Mascot Wordmark (home, fixed) */}
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

          {/* Red zone tint (opponent 20 → goal line) */}
          <g data-lounge-red-zone={redZoneSide || undefined}>
            <polygon
              points={redZonePoints(0, 20)}
              fill="#ef4444"
              opacity={redZoneSide === 'left' ? 0.4 * linesFadeOpacity : 0}
              style={{ transition: 'opacity 450ms ease' }}
            />
            <polygon
              points={redZonePoints(80, 100)}
              fill="#ef4444"
              opacity={redZoneSide === 'right' ? 0.4 * linesFadeOpacity : 0}
              style={{ transition: 'opacity 450ms ease' }}
            />
          </g>

          {showDriveMarks ? (
            <DrivePlayMarks
              marks={drive.marks}
              attackDir={drive.attackDir}
              primary={drivePrimary}
              hideKey={driveHideKey}
              throwKey={throwKey}
              onThrowDone={onThrowDone}
              onMarkTap={onDriveMarkTap}
              college={college}
            />
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
          {/* Ball on LOS … hidden for full rush/catch/FG sequence.
              Rush/catch figures render above the posts overlay (z-8) so
              red-zone plays are not buried under the uprights plate. */}
              {!playAnimActive && !throwKey && tbRest?.key !== animKey ? (
                <g transform={`translate(${scrimMidX - 18} ${334.5 - 12})`}>
                  <AmericanFootballMark tone="field" size={36} rotate={-26} college={college} />
                </g>
              ) : null}
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

        {/* Layer 3: Goalposts back plate (front/near uprights punched out). */}
        <img
          src="/sports/nfl/gamecast-goalposts-overlay.png?v=728"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 block h-full w-full select-none"
        />

        {/* Play chrome above posts … rush/catch were buried under uprights in the red zone. */}
        <svg
          viewBox="0 0 1266 533"
          className="pointer-events-none absolute inset-0 z-[8] h-full w-full select-none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <filter id="glow-play-chrome" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {rushAnim && rushX != null ? (
            <g data-lounge-rush-anim>
              {rushTrailVisible ? (
                <polyline
                  points={runTrailPoints(rushAnim, rushAnim.progress)}
                  fill="none"
                  stroke={rushAnim.isTouchdown ? '#000' : playLineHalo(rushAnim.line).halo}
                  strokeOpacity={rushAnim.isTouchdown ? 0.5 : playLineHalo(rushAnim.line).haloOpacity}
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {rushTrailVisible ? (
                <polyline
                  points={runTrailPoints(rushAnim, rushAnim.progress)}
                  fill="none"
                  stroke={rushAnim.isTouchdown ? DRIVE_TD_GOLD : rushAnim.line}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity="0.95"
                />
              ) : null}
              <g
                transform={`translate(${rushFigLeftForBallX(rushX, rushAnim.facing)} ${rushPt.y - RUSH_FIG_H + 8})`}
              >
                <GameHubRushFigure
                  primary={rushAnim.primary}
                  secondary={rushAnim.secondary}
                  jerseyColor={rushAnim.jerseyColor}
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
          {catchAnim && catchX != null ? (
            <g data-lounge-catch-anim>
              {catchTrailVisible ? (
                <polyline
                  points={runTrailPoints(catchAnim, catchAnim.progress)}
                  fill="none"
                  stroke={catchAnim.isTouchdown ? '#000' : playLineHalo(catchAnim.line).halo}
                  strokeOpacity={catchAnim.isTouchdown ? 0.5 : playLineHalo(catchAnim.line).haloOpacity}
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {catchTrailVisible ? (
                <polyline
                  points={runTrailPoints(catchAnim, catchAnim.progress)}
                  fill="none"
                  stroke={catchAnim.isTouchdown ? DRIVE_TD_GOLD : catchAnim.line}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity="0.95"
                />
              ) : null}
              <g
                transform={`translate(${catchFigLeftForHandsX(catchX, catchAnim.facing)} ${catchPt.y - RUSH_FIG_H + 8})`}
              >
                <GameHubCatchFigure
                  primary={catchAnim.primary}
                  secondary={catchAnim.secondary}
                  jerseyColor={catchAnim.jerseyColor}
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
              {catchBall ? (
                <g transform={`translate(${catchBall.x - 12} ${catchBall.y - 9})`}>
                  <AmericanFootballMark
                    tone="field"
                    size={24}
                    rotate={catchBallRotate}
                    spiral={passSpiral(catchBallFlightT, catchAnim.yards, CATCH_RUN_MS * (1 - CATCH_BALL_LAUNCH_AT))}
                    college={college}
                  />
                </g>
              ) : null}
            </g>
          ) : null}
          {pickAnim?.showFigure ? (
            <g data-lounge-pick-anim>
              {pickAnim.showTrail ? (
                <line
                  x1={pickAnim.pickX}
                  y1={pickAnim.y}
                  x2={pickAnim.figX}
                  y2={pickAnim.y}
                  stroke={pickAnim.line}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeOpacity="0.88"
                />
              ) : null}
              <g
                transform={`translate(${catchFigLeftForHandsX(pickAnim.figX, pickAnim.facing)} ${pickAnim.y - RUSH_FIG_H + 8})`}
              >
                <GameHubCatchFigure
                  primary={pickAnim.primary}
                  secondary={pickAnim.secondary}
                  jerseyColor={pickAnim.jerseyColor}
                  helmetColor={pickAnim.helmetColor}
                  pantsColor={pickAnim.pantsColor}
                  tightsColor={pickAnim.tightsColor}
                  headshotUrl={pickAnim.headshotUrl}
                  jerseyNumber={pickAnim.jerseyNumber}
                  facing={pickAnim.facing}
                  width={RUSH_FIG_W}
                  height={RUSH_FIG_H}
                />
              </g>
            </g>
          ) : null}
          {kickAnim?.showFigure && kickFigLeft != null ? (
            <g data-lounge-kick-anim>
              {kickAnim.showTrail ? (
                <line
                  x1={kickAnim.landX}
                  y1={kickAnim.y}
                  x2={kickAnim.figX}
                  y2={kickAnim.y}
                  stroke={kickAnim.line}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeOpacity="0.88"
                />
              ) : null}
              <g transform={`translate(${kickFigLeft} ${kickFigTop})`}>
                <GameHubRushFigure
                  primary={kickAnim.primary}
                  secondary={kickAnim.secondary}
                  jerseyColor={kickAnim.jerseyColor}
                  helmetColor={kickAnim.helmetColor}
                  pantsColor={kickAnim.pantsColor}
                  tightsColor={kickAnim.tightsColor}
                  headshotUrl={kickAnim.headshotUrl}
                  jerseyNumber={kickAnim.jerseyNumber}
                  facing={kickAnim.facing}
                  width={RUSH_FIG_W}
                  height={RUSH_FIG_H}
                  hideBall={kickAnim.ballT < 1}
                />
              </g>
            </g>
          ) : null}
          {kickAnim?.touchback && kickAnim.tb?.opacity > 0 ? (
            <g
              data-lounge-kick-anim="touchback"
              opacity={kickAnim.tb.opacity}
              transform={`translate(${kickAnim.tb.ball.x - 12} ${kickAnim.tb.ball.y - 9})`}
            >
              <AmericanFootballMark tone="field" size={24} rotate={kickAnim.tb.rotate} college={college} />
            </g>
          ) : null}
          {!kickAnim && tbRest?.key === animKey ? (
            <g
              data-lounge-kick-rest="touchback"
              transform={`translate(${tbRest.ball.x - 12} ${tbRest.ball.y - 9})`}
            >
              <AmericanFootballMark tone="field" size={24} rotate={tbRest.rotate} college={college} />
            </g>
          ) : null}
          {kickBall ? (
            <g transform={`translate(${kickBall.x - 12} ${kickBall.y - 9})`}>
              <AmericanFootballMark tone="field" size={24} rotate={kickBallRotate} college={college} />
            </g>
          ) : null}
          {pickBall ? (
            <g transform={`translate(${pickBall.x - 12} ${pickBall.y - 9})`}>
              <AmericanFootballMark tone="field" size={24} rotate={pickBallRotate} spiral={passSpiral(pickAnim.ballT, pickAnim.airYards, PICK_THROW_MS)} college={college} />
            </g>
          ) : null}
          {fgBall ? (
            <g
              data-lounge-fg-anim
              transform={`translate(${fgBall.x - FG_BALL_SIZE / 2} ${fgBall.y - FG_BALL_SIZE * 0.38})`}
            >
              <AmericanFootballMark tone="field" size={FG_BALL_SIZE} rotate={fgBallRotate} college={college} />
            </g>
          ) : null}
        </svg>
        {/* Near (shorter) uprights above the ball … pixel-cut from the posts art. */}
        <img
          src="/sports/nfl/gamecast-goalposts-front-poles.png?v=728"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[9] block h-full w-full select-none"
        />
        {/* Tapped play label … top of the field stack so goalpost pads near the goal line can't cover it. */}
        {driveTap && driveTap.animKey === animKey && showDriveMarks && !playAnimActive ? (
          <svg
            viewBox="0 0 1266 533"
            className="pointer-events-none absolute inset-0 z-[10] h-full w-full select-none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <g key={driveTap.n} className="lounge-drive-tap-tag" onAnimationEnd={() => setDriveTap(null)}>
              <DriveTapTag x={driveTap.x} y={driveTap.y} label={driveTap.label} tone={driveTap.tone} />
            </g>
          </svg>
        ) : null}
        {/* Stoppage / break banner … TIMEOUT, End of 1st, HALFTIME, End of 3rd, GAME OVER */}
        {centerBanner && !suppressBanner && !showTdBanner ? (
          <FloorClearBanner
            floorRef={bannerFloorRef}
            measureKey={centerBanner}
            data-lounge-game-field-banner
            className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center px-4 pb-[18%]"
            aria-live="polite"
          >
            <FieldBannerFitText
              text={centerBanner}
              className="-translate-y-2 text-center text-[28px] font-black uppercase leading-none tracking-[0.08em] text-white sm:text-[36px] sm:-translate-y-3"
              style={{
                fontFamily: "Oswald, Graduate, Impact, 'Arial Black', sans-serif",
                textShadow:
                  '0 1px 0 #000, 0 2px 0 #000, 0 3px 0 rgba(0,0,0,0.85), 0 8px 24px rgba(0,0,0,0.65)',
                WebkitTextStroke: '1px rgba(0,0,0,0.35)',
              }}
            />
          </FloorClearBanner>
        ) : null}

        {/* Rush / pass TD celebration */}
        {showTdBanner || showTurnoverBanner ? (
          <FloorClearBanner
            floorRef={bannerFloorRef}
            measureKey={playBannerText}
            data-lounge-td-banner
            data-lounge-field-play-banner={showTdBanner ? 'touchdown' : 'turnover'}
            className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center px-4 pb-[18%]"
            aria-live="polite"
          >
            <FieldBannerFitText
              text={playBannerText}
              className="lounge-td-banner-text text-center text-[34px] font-black uppercase leading-[1.05] tracking-[0.14em] text-amber-300 sm:text-[44px]"
              style={{
                fontFamily: "Oswald, Graduate, Impact, 'Arial Black', sans-serif",
                textShadow:
                  '0 0 18px rgba(251,191,36,0.55), 0 1px 0 #000, 0 3px 0 #000, 0 10px 28px rgba(0,0,0,0.7)',
                WebkitTextStroke: '1px rgba(0,0,0,0.4)',
              }}
            />
          </FloorClearBanner>
        ) : null}

        {fantasyToast ? (
          <div
            key={fantasyToast.key}
            data-lounge-play-fantasy-points
            // Between the hash rows … `bottom`, since the keyframes own `transform`.
            className="lounge-play-fantasy-toast pointer-events-none absolute inset-x-0 bottom-[43%] z-[8] flex flex-wrap items-center justify-center gap-1.5 px-3"
            aria-live="polite"
          >
            {fantasyToast.rows.map((r) => (
              <div
                key={r.key}
                className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 shadow-lg"
                style={{ background: 'rgba(9,9,11,0.82)', border: '1px solid rgba(255,255,255,0.18)' }}
              >
                {r.headshotUrl ? (
                  <img
                    src={r.headshotUrl}
                    alt=""
                    className={`h-6 w-6 rounded-full ${r.position === 'DEF' ? 'object-contain p-0.5' : 'object-cover'}`}
                    style={{ background: 'rgba(255,255,255,0.12)' }}
                  />
                ) : (
                  <span className="h-6 w-1" aria-hidden="true" />
                )}
                <span className="text-[12px] font-semibold leading-none" style={{ color: '#fff' }}>
                  {r.name}
                  {r.position ? (
                    <span className="ml-1 text-[9px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {r.position}
                    </span>
                  ) : null}
                </span>
                <span
                  className="text-[13px] font-bold leading-none tabular-nums"
                  style={{ color: r.points < 0 ? '#fda4af' : '#6ee7b7' }}
                >
                  {formatFantasyPoints(r.points)}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  pts
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Landscape gamecast rail rows: ESPN box score key → short label. */
const TEAM_STAT_RAIL_ROWS = [
  ['totalYards', 'Total yds'],
  ['netPassingYards', 'Pass yds'],
  ['rushingYards', 'Rush yds'],
  ['firstDowns', '1st downs'],
  ['thirdDownEff', '3rd down'],
  ['turnovers', 'Turnovers'],
  ['possessionTime', 'Possession'],
  ['totalPenaltiesYards', 'Penalties'],
]

/** Stat rail floor beside the landscape field (rem) … the field's width cap leaves this much per side. */
const STAT_RAIL_MIN_REM = 5.5

/**
 * One team's box score column beside the landscape field (away left / home right). Empty until stats land.
 * `topInset`: the field row runs up under the scoreboard … rails start below it.
 */
function TeamStatRail({ stats, align }) {
  const byName = new Map((Array.isArray(stats) ? stats : []).map((s) => [s.name, s.value]))
  const rows = TEAM_STAT_RAIL_ROWS.filter(([key]) => byName.has(key))
  return (
    <div className={`flex h-full min-w-0 flex-col justify-evenly ${align === 'left' ? 'items-start' : 'items-end'}`}>
      {rows.map(([key, label]) => (
        <div key={key} className={`min-w-0 max-w-full ${align === 'left' ? 'text-left' : 'text-right'}`}>
          <div className="truncate text-[15px] font-bold leading-none tabular-nums text-white drop-shadow">
            {byName.get(key)}
          </div>
          <div className="mt-0.5 truncate text-[9px] font-semibold uppercase leading-none tracking-wide text-white/55">
            {label}
          </div>
        </div>
      ))}
    </div>
  )
}

const RAIL_PAGE_LABEL = { stats: 'Team', fantasy: 'Fantasy', props: 'Props' }
const RAIL_SWIPE_PX = 28
const RAIL_WHEEL_COOLDOWN_MS = 450

function railNumber(n) {
  const v = Math.round(Number(n) * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

function RailPlayerName({ name, position, left }) {
  return (
    <div className="truncate text-[10px] font-semibold uppercase leading-none tracking-wide text-white/60">
      {left ? (
        <>
          {name} <span className="text-white/35">{position}</span>
        </>
      ) : (
        <>
          <span className="text-white/35">{position}</span> {name}
        </>
      )}
    </div>
  )
}

/** Live fantasy page: points so far, projection beside it (hub scoring format). */
function FantasyRailRows({ rows, align }) {
  const left = align === 'left'
  return (
    <div className={`flex h-full min-w-0 flex-col justify-evenly ${left ? 'items-start text-left' : 'items-end text-right'}`}>
      {rows.map((r) => (
        <div key={r.key} className="min-w-0 max-w-full">
          <RailPlayerName name={r.name} position={r.position} left={left} />
          <div className="mt-0.5 truncate leading-none tabular-nums">
            <span className="text-[15px] font-bold text-white drop-shadow">{railNumber(r.points)}</span>
            {r.proj != null ? <span className="ml-1 text-[10px] font-semibold text-white/45">/ {railNumber(r.proj)}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Live props page: box score progress toward every bettable line; scrolls when the list outgrows the rail
 * (`SwipeRail` only pages once the scroll hits an end). Taps open the market.
 */
function PropRailRows({ rows, align }) {
  const left = align === 'left'
  return (
    <div
      data-lounge-gamecast-rail-scroll
      className={`flex h-full min-w-0 flex-col gap-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        left ? 'items-start text-left' : 'items-end text-right'
      }`}
      style={{ touchAction: 'pan-y' }}
    >
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          data-lounge-gamecast-market-link
          disabled={!r.url}
          onClick={() => void openExternalUrl(r.url)}
          aria-label={`${r.name} ${r.current ?? 'no stats yet'} of ${r.line} ${r.stat}, open on ${MARKET_SOURCE_LABEL[r.source] || 'market'}`}
          className={`w-full min-w-0 shrink-0 rounded-lg py-0.5 touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/15 ${
            left ? 'text-left' : 'text-right'
          }`}
        >
          <RailPlayerName name={r.name} position={r.position} left={left} />
          <div className="mt-0.5 truncate leading-none tabular-nums">
            <span className={`text-[15px] font-bold drop-shadow ${r.hit ? 'text-emerald-300' : 'text-white'}`}>
              {r.current != null ? railNumber(r.current) : '–'}
            </span>
            <span className="ml-0.5 text-[10px] font-semibold text-white/45">/ {r.target != null ? railNumber(r.target) : r.line}</span>
          </div>
          <div className="mt-0.5 truncate text-[9px] font-semibold uppercase leading-none tracking-wide text-white/40">
            {r.stat} <span className="text-emerald-300/80">{kalshiCents(r.price)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

/**
 * One side rail beside the landscape field: team stats / fantasy / props pages, swiped up / down (both rails
 * share `page`, so either side flips both). Pages without data are left out of `pages` by the parent.
 */
/** Room left to scroll inside a rail page's own scroller (if the gesture started in one). */
function railScrollRoom(target) {
  const el = target instanceof Element ? target.closest('[data-lounge-gamecast-rail-scroll]') : null
  if (!el || el.scrollHeight <= el.clientHeight + 1) return { up: false, down: false }
  return { up: el.scrollTop > 1, down: el.scrollTop + el.clientHeight < el.scrollHeight - 1 }
}

function SwipeRail({ align, topInset = 0, pages, page, onStep, stats, fantasy, props }) {
  const left = align === 'left'
  const scoring = useFantasyScoring()
  const touchRef = useRef(null)
  const wheelAtRef = useRef(0)
  const idx = Math.max(0, pages.indexOf(page))
  const multi = pages.length > 1
  return (
    <div
      data-lounge-gamecast-stat-rail={align}
      data-lounge-gamecast-rail-page={page}
      className={`relative flex min-w-0 flex-1 flex-col overflow-hidden ${multi ? 'pb-1 pt-1' : 'py-2'} ${
        left ? 'items-start pl-3' : 'items-end pr-3'
      }`}
      style={{
        minWidth: `${STAT_RAIL_MIN_REM}rem`,
        paddingTop: topInset ? topInset + (multi ? 0 : 4) : undefined,
        touchAction: multi ? 'none' : undefined,
      }}
      onTouchStart={
        multi
          ? (e) => {
              const t = e.touches[0]
              touchRef.current = t ? { x: t.clientX, y: t.clientY, room: railScrollRoom(e.target) } : null
            }
          : undefined
      }
      onTouchEnd={
        multi
          ? (e) => {
              const start = touchRef.current
              touchRef.current = null
              const t = e.changedTouches[0]
              if (!start || !t) return
              const dy = t.clientY - start.y
              if (Math.abs(dy) < RAIL_SWIPE_PX || Math.abs(dy) < Math.abs(t.clientX - start.x)) return
              if (dy < 0 ? start.room.down : start.room.up) return
              onStep(dy < 0 ? 1 : -1)
            }
          : undefined
      }
      onWheel={
        multi
          ? (e) => {
              if (Math.abs(e.deltaY) < 12) return
              const room = railScrollRoom(e.target)
              const now = Date.now()
              if (e.deltaY > 0 ? room.down : room.up) {
                wheelAtRef.current = now
                return
              }
              if (now - wheelAtRef.current < RAIL_WHEEL_COOLDOWN_MS) return
              wheelAtRef.current = now
              onStep(e.deltaY > 0 ? 1 : -1)
            }
          : undefined
      }
    >
      {multi ? (
        <div className={`flex w-full shrink-0 items-center gap-1.5 pb-0.5 ${left ? 'justify-start' : 'flex-row-reverse justify-start'}`}>
          {page === 'fantasy' ? (
            <button
              type="button"
              onClick={() => setFantasyScoring(nextFantasyScoring(scoring))}
              aria-label={`Fantasy scoring ${fantasyScoringLabel(scoring)}, tap to change`}
              className="-mx-1 -my-1.5 truncate px-1 py-1.5 text-[8px] font-semibold uppercase leading-none tracking-[0.14em] text-white/45 touch-manipulation [-webkit-tap-highlight-color:transparent] active:text-white/80"
            >
              {RAIL_PAGE_LABEL[page]} · <span className="text-white/75">{fantasyScoringLabel(scoring)}</span>
            </button>
          ) : (
            <span className="truncate text-[8px] font-semibold uppercase leading-none tracking-[0.14em] text-white/45">
              {RAIL_PAGE_LABEL[page]}
            </span>
          )}
          <span className="flex shrink-0 gap-0.5" aria-hidden="true">
            {pages.map((p) => (
              <span key={p} className={`h-1 w-1 rounded-full ${p === page ? 'bg-white/80' : 'bg-white/25'}`} />
            ))}
          </span>
        </div>
      ) : null}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        {pages.map((p, i) => (
          <div
            key={p}
            aria-hidden={p !== page}
            className="absolute inset-0 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none"
            style={{
              transform: `translateY(${(i - idx) * 100}%)`,
              opacity: p === page ? 1 : 0,
              pointerEvents: p === page ? undefined : 'none',
            }}
          >
            {p === 'stats' ? <TeamStatRail stats={stats} align={align} /> : null}
            {p === 'fantasy' ? <FantasyRailRows rows={fantasy} align={align} /> : null}
            {p === 'props' ? <PropRailRows rows={props} align={align} /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

const MARKET_SOURCE_LABEL = { kalshi: 'Kalshi', polymarket: 'Polymarket' }

function evTag(ev) {
  return ev != null && ev > 0 ? `+${(ev * 100).toFixed(1)}% EV` : ''
}

/**
 * Board stat; with `href` it becomes a tap-through to the market / book (price reads as the Yes price for
 * prediction markets). `book` labels which sportsbook has the best line; `tag` is an optional EV badge.
 */
function MatchupLine({ title, value, sub, href = '', source = '', book = '', tag = '' }) {
  const body = (
    <>
      <div className="text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-white/55">{title}</div>
      <div className="mt-1 text-[18px] font-bold leading-none tabular-nums text-white drop-shadow">{value}</div>
      {sub ? (
        <div
          className={`mt-0.5 text-[10px] font-semibold leading-none tabular-nums ${href ? 'text-emerald-300' : 'text-white/55'}`}
        >
          {sub}
        </div>
      ) : null}
      {book ? (
        <div className="mt-0.5 max-w-[5.5rem] truncate text-[8px] font-semibold uppercase leading-none tracking-wide text-white/45">
          {book}
        </div>
      ) : null}
      {tag ? (
        <div className="mt-0.5 rounded-full bg-emerald-400/20 px-1 text-[8px] font-bold leading-[1.4] tabular-nums text-emerald-200">
          {tag}
        </div>
      ) : null}
    </>
  )
  if (!href) return <div className="flex min-w-[3.5rem] flex-col items-center">{body}</div>
  return (
    <button
      type="button"
      data-lounge-gamecast-market-link
      onClick={() => void openExternalUrl(href)}
      aria-label={`${title} ${value}, open on ${MARKET_SOURCE_LABEL[source] || source || 'market'}`}
      className="-mx-1.5 -my-1 flex min-w-[3.5rem] flex-col items-center rounded-lg px-1.5 py-1 touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/15"
    >
      {body}
    </button>
  )
}

/** Scoreboard spread / ML under-over the score: taps open the best book's betslip (or book home) when shopped. */
function ScoreboardLine({ pick, text, label, className = '' }) {
  const base = `leading-none tabular-nums drop-shadow ${className}`
  if (!pick?.url) return <div className={base}>{text}</div>
  const price = american(pick.price)
  return (
    <button
      type="button"
      data-lounge-gamecast-market-link
      onClick={(e) => {
        e.stopPropagation()
        void openExternalUrl(pick.url)
      }}
      aria-label={`${label} ${text}${label === 'Spread' && price ? ` ${price}` : ''}, open on ${pick.book || 'sportsbook'}`}
      title={`${pick.book || 'Sportsbook'} ${text}${label === 'Spread' && price ? ` (${price})` : ''}`}
      className={`${base} -mx-1 rounded px-1 underline decoration-white/25 underline-offset-2 touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/15`}
    >
      {text}
    </button>
  )
}

/** Best-line pick (`pregameBestLines`) as a MatchupLine; falls back to the scoreboard number without a book. */
function BestLine({ title, pick, value, fallback }) {
  if (!pick) return fallback != null ? <MatchupLine title={title} value={fallback} /> : null
  return (
    <MatchupLine
      title={title}
      value={value}
      sub={value === american(pick.price) ? null : american(pick.price)}
      href={pick.url || ''}
      source={pick.book}
      book={pick.book}
      tag={evTag(pick.ev)}
    />
  )
}

/** One team's column on the landscape pregame board: logo, name, record, best spread + ML, then team total. */
function MatchupTeamColumn({ side, label, treatment, best, teamTotal }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <LoungeSportsTeamLogo side={side} treatment={treatment} size={64} />
      <RankedTeamLabel
        side={side}
        label={label}
        className="mt-1 max-w-full truncate text-[14px] font-semibold tracking-tight text-white/90"
      />
      {side?.record ? (
        <div className="mt-0.5 text-[11px] font-medium tabular-nums leading-none text-white/55">{side.record}</div>
      ) : null}
      <div className="mt-2.5 flex items-start gap-3">
        <BestLine
          title="Spread"
          pick={best?.spread}
          value={best?.spread ? signedPoint(best.spread.point) : null}
          fallback={side?.spread != null ? signedPoint(side.spread) : null}
        />
        <BestLine
          title="ML"
          pick={best?.ml}
          value={best?.ml ? american(best.ml.price) : null}
          fallback={side?.ml != null ? american(side.ml) : null}
        />
      </div>
      {teamTotal ? (
        <div className="mt-2">
          <MatchupLine
            title="Team total"
            value={`o${teamTotal.line}`}
            sub={kalshiCents(teamTotal.price)}
            href={teamTotal.url}
            source={teamTotal.source}
          />
        </div>
      ) : null}
    </div>
  )
}

/** Outer edge of the pregame board: each team's headline player prop (rung nearest 50¢) per player. */
function PregamePropRail({ rows, align }) {
  const left = align === 'left'
  return (
    <div
      data-lounge-gamecast-prop-rail={align}
      className={`flex min-w-0 flex-col justify-center gap-2 ${left ? 'items-start text-left' : 'items-end text-right'}`}
    >
      {rows.length ? (
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">Player props</div>
      ) : null}
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          data-lounge-gamecast-market-link
          disabled={!r.url}
          onClick={() => void openExternalUrl(r.url)}
          aria-label={`${r.name} ${r.line} ${r.stat}, open on ${MARKET_SOURCE_LABEL[r.source] || 'market'}`}
          className={`-mx-1.5 -my-0.5 min-w-0 max-w-full rounded-lg px-1.5 py-0.5 touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-white/15 ${
            left ? 'text-left' : 'text-right'
          }`}
        >
          <div className="truncate text-[10px] font-semibold uppercase leading-none tracking-wide text-white/60">
            {left ? (
              <>
                {r.name} <span className="text-white/35">{r.position}</span>
              </>
            ) : (
              <>
                <span className="text-white/35">{r.position}</span> {r.name}
              </>
            )}
          </div>
          <div className="mt-0.5 truncate text-[13px] font-bold leading-none tabular-nums text-white drop-shadow">
            {r.line} {r.stat} <span className="font-semibold text-emerald-300">{kalshiCents(r.price)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

/**
 * Landscape phone pregame: matchup board instead of the (empty) field … player props on the outer edges,
 * teams + lines next to them, kickoff / channel / total / 1H in the middle, public betting along the bottom.
 */
function LandscapeMatchupBoard({
  game,
  clock,
  awayLabel,
  homeLabel,
  awayColor,
  homeColor,
  awayTreatment,
  homeTreatment,
  splits,
  odds,
  sideSlots,
  bottomBar,
  players,
  marketProps,
}) {
  const { nevada } = useNevadaBooks()
  const best = useMemo(() => pregameBestLines(odds, { nevada }), [odds, nevada])
  const rails = useMemo(() => pregamePlayerPropRails(marketProps, players), [marketProps, players])
  const picks = useMemo(() => pregameGameMarketPicks(marketProps, game), [marketProps, game])
  const h1Spread = picks.firstHalf.spread
  const h1Total = picks.firstHalf.total
  const h1SpreadTeam = h1Spread?.side ? game[h1Spread.side]?.abbrev : null
  return (
    <div
      data-lounge-game-hero
      data-lounge-gamecast-matchup
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{
        '--hero-away': awayColor,
        '--hero-home': homeColor,
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
      <div className="relative z-[4] flex min-h-0 flex-1 flex-col px-3 pt-[max(0.375rem,env(safe-area-inset-top,0px))]">
        <div className="flex items-start justify-between gap-2">
          <div className="shrink-0">{sideSlots?.left}</div>
          <div className="flex min-w-0 flex-col items-center pt-1 text-center">
            <span className="text-[15px] font-bold tracking-wide text-white/90">{clock}</span>
            <WatchBroadcastPill label={game.broadcast} url={game.broadcast_url} />
          </div>
          <div className="shrink-0">{sideSlots?.right}</div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,0.9fr)] items-center gap-2">
          <PregamePropRail rows={rails.away} align="left" />
          <MatchupTeamColumn
            side={game.away}
            label={awayLabel}
            treatment={awayTreatment}
            best={best?.away}
            teamTotal={picks.teamTotal.away}
          />
          <div className="flex flex-col items-center gap-2.5 px-1 text-center">
            <div className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/45">at</div>
            {best?.books > 1 ? (
              <div
                data-lounge-gamecast-best-price
                className="-mt-1 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2 py-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.12em] text-emerald-200"
              >
                Best price · {best.books} books
              </div>
            ) : null}
            {best?.over || best?.under ? (
              <div className="flex items-start gap-3">
                <BestLine title="Over" pick={best.over} value={best.over ? `o${best.over.point}` : null} />
                <BestLine title="Under" pick={best.under} value={best.under ? `u${best.under.point}` : null} />
              </div>
            ) : null}
            {h1Spread && h1SpreadTeam ? (
              <MatchupLine
                title="1H spread"
                value={`${h1SpreadTeam} -${h1Spread.line}`}
                sub={kalshiCents(h1Spread.price)}
                href={h1Spread.url}
                source={h1Spread.source}
              />
            ) : null}
            {h1Total ? (
              <MatchupLine
                title="1H total"
                value={`o${h1Total.line}`}
                sub={kalshiCents(h1Total.price)}
                href={h1Total.url}
                source={h1Total.source}
              />
            ) : null}
          </div>
          <MatchupTeamColumn
            side={game.home}
            label={homeLabel}
            treatment={homeTreatment}
            best={best?.home}
            teamTotal={picks.teamTotal.home}
          />
          <PregamePropRail rows={rails.home} align="right" />
        </div>
        <HeroPublicBetting game={game} splits={splits} awayColor={awayColor} homeColor={homeColor} />
      </div>
      {bottomBar ? <div className="relative z-[4] shrink-0 pb-1">{bottomBar}</div> : null}
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
  game: feedGame,
  live,
  lastPlay,
  playReplayNonce = 0,
  replayTeam = null,
  playStartSpot = null,
  topBar = null,
  splits = null,
  players = [],
  plays = null,
  /** Landscape phone gamecast: fills its parent, field sized to the height left under the scoreboard. */
  fullscreen = false,
  /** Fullscreen only: chips flanking the scoreboard (back / mute) … there's no top bar row to spare. */
  sideSlots = null,
  /** Fullscreen only: strip pinned under the board (hub game pills ticker). */
  bottomBar = null,
  /** Fullscreen only: ESPN box score totals `{ home, away }` for the rails beside the field. */
  teamStats = null,
  /** Per-book lines: scoreboard best spread / ML (live + pregame) and the fullscreen pregame matchup board. */
  odds = null,
  /** Fullscreen: Kalshi / Polymarket game + player markets (pregame board rails, live props rail page). */
  marketProps = null,
  /** Fullscreen only: ESPN per-player box lines `{ home, away }` for the fantasy + props rail pages. */
  playerBox = null,
}) {
  const { awayColor, homeColor, awayTreatment, homeTreatment } = useLoungeSportsPillWashAndLogos(feedGame)
  const isNflGame = String(feedGame?.sport_key || '').includes('nfl')
  const fantasyScoring = useFantasyScoring()
  const { nevada: nevadaBooks } = useNevadaBooks()
  const fantasyRails = useMemo(
    () => (fullscreen ? liveFantasyRails(playerBox, players, 5, fantasyScoring) : { away: [], home: [] }),
    [fullscreen, playerBox, players, fantasyScoring],
  )
  const propRails = useMemo(
    () => (fullscreen && isNflGame ? livePropRails(marketProps, players, playerBox) : { away: [], home: [] }),
    [fullscreen, isNflGame, marketProps, players, playerBox],
  )
  const railPages = useMemo(() => {
    const pages = ['stats']
    if (fantasyRails.away.length || fantasyRails.home.length) pages.push('fantasy')
    if (propRails.away.length || propRails.home.length) pages.push('props')
    return pages
  }, [fantasyRails, propRails])
  const [railPageId, setRailPageId] = useState('stats')
  const railPage = railPages.includes(railPageId) ? railPageId : 'stats'
  const stepRailPage = useCallback(
    (dir) => {
      const i = railPages.indexOf(railPage)
      setRailPageId(railPages[(i + dir + railPages.length) % railPages.length])
    },
    [railPages, railPage],
  )
  const playScore = useMemo(() => latestPlayScore(plays), [plays])
  const playScoreId = playScore?.id || ''
  const [playScoreShownId, setPlayScoreShownId] = useState('')
  const fieldAnimActiveRef = useRef(false)
  const playScoreReadyRef = useRef('')
  // Grace so a fresh scoring row's field anim can start first; then tick now, or when that anim ends.
  useEffect(() => {
    if (!playScoreId) return undefined
    const t = setTimeout(() => {
      playScoreReadyRef.current = playScoreId
      if (!fieldAnimActiveRef.current) setPlayScoreShownId(playScoreId)
    }, PLAY_SCORE_GRACE_MS)
    return () => clearTimeout(t)
  }, [playScoreId])
  const onFieldAnimActiveChange = useCallback((active) => {
    fieldAnimActiveRef.current = active
    if (!active && playScoreReadyRef.current) setPlayScoreShownId(playScoreReadyRef.current)
  }, [])
  // ESPN's board total can lag the PBP row … once the scoring play has animated, show the higher of the two.
  const game = useMemo(() => {
    if (!playScore || playScoreShownId !== playScore.id || feedGame?.status !== 'in') return feedGame
    const lift = (side, n) => {
      const cur = Number(side?.score)
      return side && (!Number.isFinite(cur) || n > cur) ? { ...side, score: n } : side
    }
    const away = lift(feedGame.away, playScore.away)
    const home = lift(feedGame.home, playScore.home)
    return away === feedGame.away && home === feedGame.home ? feedGame : { ...feedGame, away, home }
  }, [feedGame, playScore, playScoreShownId])
  // Feed can sit on status 'in' at 4th 0:00 for minutes after the whistle … read it as final like the field banner.
  const clockExpiredFinal = game.status === 'in' && fieldCenterBanner(game, live) === 'GAME OVER'
  const isFinal = game.status === 'post' || clockExpiredFinal
  const clock = clockExpiredFinal
    ? (Number(live?.period) > 4 ? 'Final/OT' : 'Final')
    : liveClockLabel(game, live)
  // Final: clock still says Final … drop stale down/distance + yard line.
  // New half before its kickoff row … ESPN still carries the last snap's down / spot.
  const staleHalf = game.status === 'in' && playsFromEarlierHalf(plays, live?.period)
  const down = isFinal || staleHalf ? null : downDistanceLabel(live)
  const yard = isFinal || staleHalf ? null : yardLineLabel(game, live)
  const isFootball = String(game.sport_key || '').includes('football')
  const showLiveChrome = isFootball && game.status === 'in' && !clockExpiredFinal
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
  // Best line per side, each a book deep link: pregame ranks by EV vs Pinnacle no-vig; live shops only fresh
  // books at the consensus number (`liveBestLines`) so a suspended book's stale price can't win.
  const shopLines = !clockExpiredFinal && (game.status === 'in' || game.status === 'pre')
  const scoreBest = useMemo(
    () =>
      !shopLines
        ? null
        : game.status === 'in'
          ? liveBestLines(odds, { nevada: nevadaBooks })
          : pregameBestLines(odds, { nevada: nevadaBooks }),
    [shopLines, odds, game.status, nevadaBooks],
  )
  const awayMl = clockExpiredFinal
    ? ''
    : scoreBest?.away?.ml
      ? american(scoreBest.away.ml.price)
      : formatLoungeSportsMoneyline(game.away?.ml)
  const homeMl = clockExpiredFinal
    ? ''
    : scoreBest?.home?.ml
      ? american(scoreBest.home.ml.price)
      : formatLoungeSportsMoneyline(game.home?.ml)
  const spreadText = (side, pick) =>
    !shopLines ? '' : pick ? signedPoint(pick.point) : side?.spread != null ? signedPoint(side.spread) : ''
  const awaySpreadText = spreadText(game.away, scoreBest?.away?.spread)
  const homeSpreadText = spreadText(game.home, scoreBest?.home?.spread)
  const awayLabel = hubTeamLabel(game.away, game.status, game.sport_key)
  const homeLabel = hubTeamLabel(game.home, game.status, game.sport_key)
  const preLabels = game.status === 'pre'

  // Opening-kickoff whistle fires from the field's kick animation … arm audio unlock while the hub is up.
  useEffect(() => {
    armGameHubWhistle()
  }, [])

  // Landscape gamecast: the field row slides up under the scoreboard (scoreboard paints on top); only the
  // goalpost tops reach that high. Track the board's height so the overlap follows it.
  const scoreboardRef = useRef(null)
  // Center stack (clock / down / channel pill) … field banners slide below it when the field overlaps the board.
  const scoreboardCenterRef = useRef(null)
  const [measuredScoreboardH, setScoreboardH] = useState(0)
  const overlapBoard = fullscreen && showField
  const scoreboardH = overlapBoard ? measuredScoreboardH : 0
  useLayoutEffect(() => {
    const el = scoreboardRef.current
    if (!overlapBoard || !el) return undefined
    const measure = () => setScoreboardH(el.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [overlapBoard])

  if (fullscreen && game.status === 'pre') {
    return (
      <LandscapeMatchupBoard
        game={game}
        clock={clock}
        awayLabel={awayLabel}
        homeLabel={homeLabel}
        awayColor={awayColor}
        homeColor={homeColor}
        awayTreatment={awayTreatment}
        homeTreatment={homeTreatment}
        splits={splits}
        odds={odds}
        sideSlots={sideSlots}
        bottomBar={bottomBar}
        players={players}
        marketProps={marketProps}
      />
    )
  }

  return (
    <div
      data-lounge-game-hero
      className={fullscreen ? 'relative flex min-h-0 flex-1 flex-col overflow-hidden' : 'relative overflow-hidden'}
      style={{
        '--hero-away': awayColor,
        '--hero-home': homeColor,
        // Wash runs under the notch / home indicator; content stays inside the safe area.
        ...(fullscreen
          ? {
              paddingLeft: 'env(safe-area-inset-left, 0px)',
              paddingRight: 'env(safe-area-inset-right, 0px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }
          : null),
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
        <div
          ref={scoreboardRef}
          data-lounge-game-scoreboard
          className={
            fullscreen
              ? 'relative z-[6] shrink-0 px-3 pb-0.5 pt-[max(0.375rem,env(safe-area-inset-top,0px))]'
              : 'relative z-[4] px-3 pb-3 pt-1'
          }
        >
          <div className="flex items-center justify-between gap-1.5">
            {fullscreen && sideSlots?.left ? <div className="shrink-0 self-start">{sideSlots.left}</div> : null}
            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex w-[52px] shrink-0 flex-col items-center">
                <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={52} />
                <RankedTeamLabel
                  side={game.away}
                  label={awayLabel}
                  className="mt-0.5 text-[13px] font-semibold uppercase tracking-wide text-white/85"
                />
                {game.away?.record ? (
                  <div className="mt-0.5 w-full text-center text-[10px] font-medium tabular-nums leading-none text-white/55">
                    {game.away.record}
                  </div>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                <div className="flex flex-col items-center">
                  {awaySpreadText ? (
                    <ScoreboardLine
                      pick={scoreBest?.away?.spread}
                      text={awaySpreadText}
                      label="Spread"
                      className="mb-0.5 text-[11px] font-semibold text-white/70"
                    />
                  ) : null}
                  <div
                    className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                      awayScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.away, game.status)}
                  </div>
                  {awayMl ? (
                    <ScoreboardLine
                      pick={scoreBest?.away?.ml}
                      text={awayMl}
                      label="Moneyline"
                      className="mt-0.5 text-[11px] font-semibold text-white/70"
                    />
                  ) : null}
                  {awayTimeouts != null ? <TimeoutDots remaining={awayTimeouts} align="center" /> : null}
                </div>
                {awayHasBall ? <PossessionFootball side="away" /> : null}
              </div>
            </div>

            <div
              ref={scoreboardCenterRef}
              className="flex max-w-[36%] shrink-0 flex-col items-center gap-0 px-1 text-center"
            >
              <span
                className={`text-[12px] font-bold tracking-wide ${
                  game.status === 'in' && !isFinal ? 'text-rose-300' : 'text-white/85'
                }`}
              >
                {clock}
              </span>
              {down ? <span className="text-[11px] font-semibold leading-tight text-white/90">{down}</span> : null}
              {yard ? <span className="text-[11px] font-semibold leading-tight text-white/70">{yard}</span> : null}
              {isFinal ? null : <WatchBroadcastPill label={game.broadcast} url={game.broadcast_url} />}
            </div>

            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                {homeHasBall ? <PossessionFootball side="home" /> : null}
                <div className="flex flex-col items-center">
                  {homeSpreadText ? (
                    <ScoreboardLine
                      pick={scoreBest?.home?.spread}
                      text={homeSpreadText}
                      label="Spread"
                      className="mb-0.5 text-[11px] font-semibold text-white/70"
                    />
                  ) : null}
                  <div
                    className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                      homeScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.home, game.status)}
                  </div>
                  {homeMl ? (
                    <ScoreboardLine
                      pick={scoreBest?.home?.ml}
                      text={homeMl}
                      label="Moneyline"
                      className="mt-0.5 text-[11px] font-semibold text-white/70"
                    />
                  ) : null}
                  {homeTimeouts != null ? <TimeoutDots remaining={homeTimeouts} align="center" /> : null}
                </div>
              </div>
              <div className="flex w-[52px] shrink-0 flex-col items-center">
                <LoungeSportsTeamLogo side={game.home} treatment={homeTreatment} size={52} />
                <RankedTeamLabel
                  side={game.home}
                  label={homeLabel}
                  className="mt-0.5 text-[13px] font-semibold uppercase tracking-wide text-white/85"
                />
                {game.home?.record ? (
                  <div className="mt-0.5 w-full text-center text-[10px] font-medium tabular-nums leading-none text-white/55">
                    {game.home.record}
                  </div>
                ) : null}
              </div>
            </div>
            {fullscreen && sideSlots?.right ? <div className="shrink-0 self-start">{sideSlots.right}</div> : null}
          </div>
        </div>
      ) : (
        /* Pre/post without field: same logo | odds | center | odds | logo rhythm; bigger logos. */
        <div data-lounge-game-scoreboard className="relative z-[4] px-3 pb-3 pt-2">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex w-[68px] shrink-0 flex-col items-center">
                <LoungeSportsTeamLogo side={game.away} treatment={awayTreatment} size={68} />
                <RankedTeamLabel
                  side={game.away}
                  label={awayLabel}
                  className={`mt-0.5 font-semibold leading-snug text-white/85 ${
                    preLabels
                      ? 'text-[12px] tracking-tight'
                      : 'text-[13px] uppercase tracking-wide'
                  }`}
                />
                {game.away?.record ? (
                  <div className="mt-0.5 w-full text-center text-[10px] font-medium tabular-nums leading-none text-white/55">
                    {game.away.record}
                  </div>
                ) : null}
                {awayTimeouts != null ? <TimeoutDots remaining={awayTimeouts} align="center" /> : null}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                <div className="flex flex-col items-center">
                  {awaySpreadText ? (
                    <ScoreboardLine
                      pick={scoreBest?.away?.spread}
                      text={awaySpreadText}
                      label="Spread"
                      className="mb-0.5 text-[11px] font-semibold text-white/70"
                    />
                  ) : null}
                  <div
                    className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                      awayScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.away, game.status)}
                  </div>
                  {awayMl ? (
                    <ScoreboardLine
                      pick={scoreBest?.away?.ml}
                      text={awayMl}
                      label="Moneyline"
                      className="mt-0.5 text-[11px] font-semibold text-white/70"
                    />
                  ) : null}
                </div>
                {awayHasBall ? <PossessionFootball side="away" /> : null}
              </div>
            </div>

            <div className="flex max-w-[36%] shrink-0 flex-col items-center gap-0 px-1 text-center">
              <span
                className={`text-[12px] font-bold tracking-wide ${
                  game.status === 'in' && !isFinal ? 'text-rose-300' : 'text-white/85'
                }`}
              >
                {clock}
              </span>
              {down ? <span className="text-[11px] font-semibold leading-tight text-white/90">{down}</span> : null}
              {yard ? <span className="text-[11px] font-semibold leading-tight text-white/70">{yard}</span> : null}
              {isFinal ? null : <WatchBroadcastPill label={game.broadcast} url={game.broadcast_url} />}
            </div>

            <div className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
                {homeHasBall ? <PossessionFootball side="home" /> : null}
                <div className="flex flex-col items-center">
                  {homeSpreadText ? (
                    <ScoreboardLine
                      pick={scoreBest?.home?.spread}
                      text={homeSpreadText}
                      label="Spread"
                      className="mb-0.5 text-[11px] font-semibold text-white/70"
                    />
                  ) : null}
                  <div
                    className={`text-[34px] font-bold leading-none tabular-nums drop-shadow ${
                      homeScoreDim ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {scoreText(game.home, game.status)}
                  </div>
                  {homeMl ? (
                    <ScoreboardLine
                      pick={scoreBest?.home?.ml}
                      text={homeMl}
                      label="Moneyline"
                      className="mt-0.5 text-[11px] font-semibold text-white/70"
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex w-[68px] shrink-0 flex-col items-center">
                <LoungeSportsTeamLogo side={game.home} treatment={homeTreatment} size={68} />
                <RankedTeamLabel
                  side={game.home}
                  label={homeLabel}
                  className={`mt-0.5 font-semibold leading-snug text-white/85 ${
                    preLabels
                      ? 'text-[12px] tracking-tight'
                      : 'text-[13px] uppercase tracking-wide'
                  }`}
                />
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

      {/* z above scoreboard so FG apex / high arcs paint over the board chrome */}
      <div
        className={fullscreen ? 'relative z-[5] flex min-h-0 flex-1 items-stretch justify-center' : 'relative z-[5]'}
        style={fullscreen ? { containerType: 'size', marginTop: overlapBoard ? -scoreboardH : undefined } : undefined}
      >
        {showField && fullscreen ? (
          <SwipeRail
            align="left"
            topInset={scoreboardH}
            pages={railPages}
            page={railPage}
            onStep={stepRailPage}
            stats={teamStats?.away}
            fantasy={fantasyRails.away}
            props={propRails.away}
          />
        ) : null}
        <HeroPublicBetting
          game={game}
          splits={splits}
          awayColor={awayColor}
          homeColor={homeColor}
        />
        {showField && fullscreen ? (
          // FieldViz = 20px top pad + 4px side pads around a 1266:533 plane … widest that fits this box while
          // leaving each stat rail its min width. Bottom-anchored: spare height goes up under the scoreboard.
          <div
            className={`shrink-0 ${overlapBoard ? 'self-end' : 'self-center'}`}
            style={{ width: `min(calc(100cqw - ${2 * STAT_RAIL_MIN_REM}rem), calc((100cqh - 20px) * 1266 / 533 + 8px))` }}
          >
            <FieldViz
              game={game}
              live={live}
              awayColor={awayColor}
              homeColor={homeColor}
              lastPlay={lastPlayText}
              playReplayNonce={playReplayNonce}
              replayTeam={replayTeam}
              playStartSpot={playStartSpot}
              players={players}
              plays={plays}
              onPlayAnimActiveChange={onFieldAnimActiveChange}
              bannerFloorRef={overlapBoard ? scoreboardCenterRef : null}
            />
          </div>
        ) : showField ? (
          <FieldViz
            game={game}
            live={live}
            awayColor={awayColor}
            homeColor={homeColor}
            lastPlay={lastPlayText}
            playReplayNonce={playReplayNonce}
            replayTeam={replayTeam}
            playStartSpot={playStartSpot}
            players={players}
            plays={plays}
            onPlayAnimActiveChange={onFieldAnimActiveChange}
          />
        ) : (
          <div className="h-2" aria-hidden="true" />
        )}
        {showField && fullscreen ? (
          <SwipeRail
            align="right"
            topInset={scoreboardH}
            pages={railPages}
            page={railPage}
            onStep={stepRailPage}
            stats={teamStats?.home}
            fantasy={fantasyRails.home}
            props={propRails.home}
          />
        ) : null}
      </div>

      {showField && lastPlayText ? (
        <div
          data-lounge-game-last-play
          className={`relative z-[4] truncate px-3 pt-0.5 text-[12px] text-white/75 ${fullscreen ? 'shrink-0 pb-2' : 'pb-2.5'}`}
        >
          <span className="font-semibold uppercase tracking-wide text-white/55">Last play </span>
          {lastPlayText}
        </div>
      ) : null}
      {fullscreen && bottomBar ? <div className="relative z-[4] shrink-0 pb-1">{bottomBar}</div> : null}
    </div>
  )
}
