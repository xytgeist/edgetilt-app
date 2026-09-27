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
import { getLuminance, hexToRgb, resolveTeamKit } from './gameHubFigureColors.js'
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
/** Punt hang time (punter → returner's tuck). */
const PUNT_FLIGHT_MS = 1900
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
/** Touchback: lands this deep in the end zone, then hops out the back (end line is 10 yd deep). */
const TOUCHBACK_LAND_DEPTH_YDS = 4
const TOUCHBACK_BOUNCES = [
  { toYds: 8, lift: 34, ms: 420 },
  { toYds: 12.5, lift: 15, ms: 320 },
]
const TOUCHBACK_HOLD_MS = 500
/** Ball piece center in the RB sculpt viewBox (left-facing art, 728×1382). */
const RUSH_TUCK_LOCAL = { x: 140, y: 380 }
const RUSH_VIEWBOX_W = 728
const RUSH_VIEWBOX_H = 1382
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
/** Thrown spiral: whole long-axis turns per flight, so the laces land back on top (no snap at the catch). */
const PASS_SPIRAL_REVS = 5
function passSpiral(flightT) {
  const t = Number(flightT)
  return Number.isFinite(t) && t > 0 && t < 1 ? t * PASS_SPIRAL_REVS * 360 : null
}
/** Kickoffs / punts tumble end-over-end at the field goal's rate (revs per ms of flight). */
const KICK_TUMBLE_DEG_PER_MS = (FG_TUMBLE_REVS * 360) / FG_FLIGHT_BASE_MS
/** Backwards end-over-end from the tee lean … SVG +rotate is clockwise, so a leftward kick spins CW. */
function kickTumbleRotate(elapsedMs, kickDir) {
  return -82 + (kickDir < 0 ? 1 : -1) * elapsedMs * KICK_TUMBLE_DEG_PER_MS
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

  return (
    <>
      <span
        ref={measureRef}
        aria-hidden="true"
        className={`${className} invisible absolute left-0 top-0 whitespace-nowrap`}
        style={{ ...style, animation: 'none', transform: 'none' }}
      >
        {text}
      </span>
      <span className={`${className} whitespace-nowrap`} style={fontPx ? { ...style, fontSize: `${fontPx}px` } : style}>
        {text}
      </span>
    </>
  )
}

function DriveIncompleteMark({ p0, c, p1, attackDir, primary, halo, haloOpacity, throwKey, onThrowDone }) {
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
      <path d={d} fill="none" stroke={halo} strokeOpacity={haloOpacity} strokeWidth="5" strokeDasharray="7 6" strokeLinecap="round" />
      <path d={d} fill="none" stroke={primary} strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
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
          <AmericanFootballMark tone="field" size={24} rotate={frame.rotate} spiral={passSpiral(frame.t)} />
        </g>
      ) : null}
    </g>
  )
}

const DRIVE_FLAG_DEFENSE = '#facc15'
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

function DrivePlayMarks({ marks, attackDir, primary, hideKey, throwKey = '', onThrowDone, onMarkTap }) {
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
  return (
    <g data-lounge-drive-marks>
      {marks.map((m) => {
        if (m.key === hideKey) return null
        if (m.kind === 'line') {
          const y = RUSH_Y + (laneOf.get(m.key) || 0) * DRIVE_LANE_PX
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
              <line x1={x1} y1={y} x2={x2} y2={y} stroke={halo} strokeOpacity={haloOpacity} strokeWidth="7.5" strokeLinecap="round" />
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={primary}
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeOpacity="0.95"
              />
              <polygon points={driveArrow(fieldXAtY(m.fromPct, y), y, attackDir)} fill="#fff" stroke="#000" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" />
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
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="#000" strokeOpacity="0.45" strokeWidth="6" strokeLinecap="round" />
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={drivePenaltyOnDefense(m, attackDir) ? DRIVE_FLAG_DEFENSE : DRIVE_FLAG_OFFENSE}
                strokeWidth="3.5"
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

/**
 * Ball arcs from `start` into the end zone at `goalPct` (traveling `dir`), lands TOUCHBACK_LAND_DEPTH_YDS
 * deep, then hops out the back and fades. Shared by kickoff + punt touchbacks.
 * @returns {{ frameAt: (elapsed: number) => { ball: {x:number,y:number}, rotate: number, opacity: number }, totalMs: number }}
 */
function touchbackBallFrames({ start, goalPct, dir, flightMs, arcLift }) {
  const land = { x: fieldMidXFromPercent(goalPct + dir * TOUCHBACK_LAND_DEPTH_YDS), y: RUSH_Y }
  const ctrl = { x: (start.x + land.x) / 2, y: Math.min(start.y, land.y) - arcLift }
  const bounceSpots = TOUCHBACK_BOUNCES.map((b) => ({ ...b, x: fieldMidXFromPercent(goalPct + dir * b.toYds) }))
  const bouncesMs = TOUCHBACK_BOUNCES.reduce((sum, b) => sum + b.ms, 0)
  const spin = dir > 0 ? 1 : -1
  const frameAt = (elapsed) => {
    if (elapsed < flightMs) {
      const t = elapsed / flightMs
      return { ball: quadBezier(start, ctrl, land, t), rotate: kickTumbleRotate(elapsed, dir), opacity: 1 }
    }
    let at = elapsed - flightMs
    let fromX = land.x
    let rot = kickTumbleRotate(flightMs, dir)
    for (let i = 0; i < bounceSpots.length; i += 1) {
      const b = bounceSpots[i]
      if (at < b.ms) {
        const u = at / b.ms
        const last = i === bounceSpots.length - 1
        return {
          ball: { x: fromX + (b.x - fromX) * u, y: RUSH_Y - 4 * b.lift * u * (1 - u) },
          rotate: rot + spin * 260 * u,
          opacity: last ? Math.max(0, 1 - Math.max(0, u - 0.35) / 0.65) : 1,
        }
      }
      at -= b.ms
      fromX = b.x
      rot += spin * 260
    }
    return { ball: { x: fromX, y: RUSH_Y }, rotate: rot, opacity: 0 }
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

/** Longer schools / NFL mascots overflow the banner, so they fall back to the abbrev ("TOUCHDOWN MTSU", "TOUCHDOWN TB"). */
const TD_BANNER_SCHOOL_MAX_CHARS = 7

/** Team word for "TOUCHDOWN X" / "TURNOVER X": CFB school ("USC", "OREGON") · NFL mascot ("CHIEFS"). */
function fieldBannerTeamLabel(teamAbbrev, game, sportKey) {
  const abbrev = String(teamAbbrev || '').trim().toUpperCase()
  if (!abbrev) return ''
  const side = [game?.away, game?.home].find((s) => String(s?.abbrev || '').trim().toUpperCase() === abbrev)
  if (!side) return abbrev
  const name = String(side.name || '').trim()
  const mascot = String(side.mascot || '').trim()
  if (!isCfbSport(sportKey)) {
    return mascot && mascot.length <= TD_BANNER_SCHOOL_MAX_CHARS ? mascot : abbrev
  }
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
  className = '',
  title,
}) {
  const uid = useId().replace(/:/g, '')
  const spinning = spiral != null && Number.isFinite(Number(spiral))
  const rollRad = spinning ? (Number(spiral) * Math.PI) / 180 : 0
  const lacesFacing = Math.cos(rollRad)
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
  const lastPlayText = String(lastPlay || '').trim()
  const animKey = `${fieldPlayIdentity(lastPlayText)}::${Number(playReplayNonce) || 0}`
  /** Last auto-play that finished … a TD's text returning after the PAT row must not replay. */
  const lastAutoPlayedKeyRef = useRef('')
  const possessionSide =
    replayTeam === 'home' || replayTeam === 'away'
      ? replayTeam
      : live?.possession === 'home' || live?.possession === 'away'
        ? live.possession
        : null
  const knownStartPct = playSpotFieldPercent(playStartSpot, fieldFlipped)
  // 1st-down line at the snap … live down/distance is already post-play (and empty after a TD).
  const knownStartDistance = Number(playStartSpot?.distance)
  const knownFirstDownPct =
    knownStartPct != null && possessionSide && Number.isFinite(knownStartDistance) && knownStartDistance > 0
      ? Math.max(
          0,
          Math.min(100, knownStartPct + attackDirection(possessionSide, fieldFlipped) * knownStartDistance),
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
  const drive = useMemo(
    () => (isFootball ? buildPossessionDriveMarks(plays, { keepScoringDrive: tdDriveHold, livePeriod }) : null),
    [isFootball, plays, tdDriveHold, livePeriod],
  )
  const [throwDoneKey, setThrowDoneKey] = useState('')
  const onThrowDone = useCallback(
    (key) => {
      setThrowDoneKey(key)
      if (!isUserReplay) lastAutoPlayedKeyRef.current = key
    },
    [isUserReplay],
  )
  const lastPlayRow = useMemo(() => {
    const id = fieldPlayIdentity(lastPlayText)
    if (!id || !Array.isArray(plays)) return null
    return plays.findLast((p) => fieldPlayIdentity(p?.description) === id) || null
  }, [plays, lastPlayText])
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
    feedTeam: replayTeam === 'home' || replayTeam === 'away' ? replayTeam : null,
    fieldFlipped,
    knownStartPct,
    knownFirstDownPct,
    knownEndPct: playSpotFieldPercent(lastPlayRow?.end_spot, fieldFlipped),
    rowTeam: lastPlayRow?.team === 'home' || lastPlayRow?.team === 'away' ? lastPlayRow.team : null,
    /** Quarter (1 / 3) when this play is a half's opening kickoff, else 0. */
    openingKickoff: openingKickoff ? Number(lastPlayRow.period) : 0,
    lastPlayText,
  }
  /** Gates auto-play start without thrashing on every yard-line tick. */
  const autoPlayReady = Boolean(
    isUserReplay || (!hideLiveLines && hasLine && pos != null),
  )
  /** Don't run play chrome until the field plate has real pixel size. */
  const playAnimReady = Boolean(fieldArtReady && (isUserReplay || autoPlayReady))

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

    const attackDir = attackDirection(ctx.possessionSide, ctx.fieldFlipped)
    const isTouchdown =
      Boolean(parsed.isTouchdown) || playTextIsTouchdown(lastPlayText)
    const spots = resolvePlayAnimationPercents({
      text: lastPlayText,
      yards: parsed.yards,
      game: ctx.game,
      possessionSide: ctx.possessionSide,
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
    const endX = fieldMidXFromPercent(endPct)
    const travel = endX - startX
    // Prefer attack direction when travel is tiny (spot clamp / 0-yd edge).
    const facing = Math.abs(travel) < 0.5 ? attackDir : travel < 0 ? -1 : 1
    const kit = possessionKit(
      ctx.possessionSide ? { ...ctx.live, possession: ctx.possessionSide } : ctx.live,
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
    const attackDir = attackDirection(ctx.possessionSide, ctx.fieldFlipped)
    const spots = resolvePlayAnimationPercents({
      text: lastPlayText,
      yards: parsed.yards,
      game: ctx.game,
      possessionSide: ctx.possessionSide,
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
    // Ball-on-figure track ends on the line of gain (goal line for TD … not endzone center).
    const endX = fieldMidXFromPercent(gainPct)
    const travel = endX - startX
    const facing = Math.abs(travel) < 0.5 ? attackDir : travel < 0 ? -1 : 1
    const kit = possessionKit(
      ctx.possessionSide ? { ...ctx.live, possession: ctx.possessionSide } : ctx.live,
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

    const attackDir = attackDirection(ctx.possessionSide, ctx.fieldFlipped)
    const posts = attackDir > 0 ? FG_POSTS.right : FG_POSTS.left
    const settled = settledLinesRef.current
    const { losPct, kickPct } = resolveFgLosAndKick({
      fgYards: parsed.yards,
      possessionSide: ctx.possessionSide,
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
        flightMs: KICK_FLIGHT_MS,
        arcLift: KICK_ARC_LIFT,
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
      teamAbbrev: kit.sideAbbrev,
      secondary: kit.secondary,
      helmetColor: kit.helmetColor,
      pantsColor: kit.pantsColor,
      tightsColor: kit.tightsColor,
      headshotUrl,
      jerseyNumber,
      ballStart: { x: fieldMidXFromPercent(kickFromPct), y: RUSH_Y - 6 },
      flightMs,
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
  // After a TD / PAT / 2-pt, no LOS or field ball until the kickoff play lands.
  const suppressPostTdMarkers = Boolean(
    !rushAnim &&
      !catchAnim &&
      !fgAnim &&
      !pickAnim &&
      !kickAnim &&
      lastPlayText &&
      playTextIsScoreTry(lastBallPlayText(plays, lastPlayText)),
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
  // `possessionSide` is the last play's team (a punt/turnover flips it) … only trust it mid-anim.
  const livePossession = live?.possession === 'home' || live?.possession === 'away' ? live.possession : null
  const redZoneTeam =
    lineDriver != null || tdAnim != null || kickAnim != null ? possessionSide : livePossession
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
  const throwKey =
    showDriveMarks &&
    newestIncomplete &&
    fieldPlayIdentity(newestIncomplete.text) === fieldPlayIdentity(lastPlayText) &&
    animKey !== throwDoneKey
      ? animKey
      : ''
  const drivePrimary = drive?.team
    ? possessionKit({ possession: drive.team }, game, awayColor, homeColor).primary
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
      y: Math.min(kickAnim.ballStart.y, tuck.y) - KICK_ARC_LIFT,
    }
    kickBall = quadBezier(kickAnim.ballStart, ctrl, tuck, kickAnim.ballT)
    // Returner faces back up the field, so the kick travels the other way.
    kickBallRotate = kickTumbleRotate(kickAnim.ballT * (kickAnim.flightMs || KICK_FLIGHT_MS), -kickAnim.facing)
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
              {!playAnimActive && !throwKey ? (
                <g transform={`translate(${scrimMidX - 18} ${334.5 - 12})`}>
                  <AmericanFootballMark tone="field" size={36} rotate={-26} />
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
          {driveTap && driveTap.animKey === animKey && showDriveMarks && !playAnimActive ? (
            <g key={driveTap.n} className="lounge-drive-tap-tag" onAnimationEnd={() => setDriveTap(null)}>
              <DriveTapTag x={driveTap.x} y={driveTap.y} label={driveTap.label} tone={driveTap.tone} />
            </g>
          ) : null}
          {rushAnim && rushX != null ? (
            <g data-lounge-rush-anim>
              {rushTrailVisible ? (
                <polyline
                  points={runTrailPoints(rushAnim, rushAnim.progress)}
                  fill="none"
                  stroke={playLineHalo(rushAnim.primary).halo}
                  strokeOpacity={playLineHalo(rushAnim.primary).haloOpacity}
                  strokeWidth="7.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {rushTrailVisible ? (
                <polyline
                  points={runTrailPoints(rushAnim, rushAnim.progress)}
                  fill="none"
                  stroke={rushAnim.primary}
                  strokeWidth="5.5"
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
                  stroke={playLineHalo(catchAnim.primary).halo}
                  strokeOpacity={playLineHalo(catchAnim.primary).haloOpacity}
                  strokeWidth="7.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {catchTrailVisible ? (
                <polyline
                  points={runTrailPoints(catchAnim, catchAnim.progress)}
                  fill="none"
                  stroke={catchAnim.primary}
                  strokeWidth="5.5"
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
                    spiral={passSpiral(catchBallFlightT)}
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
                  stroke={pickAnim.primary}
                  strokeWidth="4"
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
                  stroke={kickAnim.primary}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeOpacity="0.88"
                />
              ) : null}
              <g transform={`translate(${kickFigLeft} ${kickFigTop})`}>
                <GameHubRushFigure
                  primary={kickAnim.primary}
                  secondary={kickAnim.secondary}
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
              <AmericanFootballMark tone="field" size={24} rotate={kickAnim.tb.rotate} />
            </g>
          ) : null}
          {kickBall ? (
            <g transform={`translate(${kickBall.x - 12} ${kickBall.y - 9})`}>
              <AmericanFootballMark tone="field" size={24} rotate={kickBallRotate} />
            </g>
          ) : null}
          {pickBall ? (
            <g transform={`translate(${pickBall.x - 12} ${pickBall.y - 9})`}>
              <AmericanFootballMark tone="field" size={24} rotate={pickBallRotate} spiral={passSpiral(pickAnim.ballT)} />
            </g>
          ) : null}
          {fgBall ? (
            <g
              data-lounge-fg-anim
              transform={`translate(${fgBall.x - FG_BALL_SIZE / 2} ${fgBall.y - FG_BALL_SIZE * 0.38})`}
            >
              <AmericanFootballMark tone="field" size={FG_BALL_SIZE} rotate={fgBallRotate} />
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
        {/* Stoppage / break banner … TIMEOUT, End of 1st, HALFTIME, End of 3rd, GAME OVER */}
        {centerBanner && !suppressBanner && !showTdBanner ? (
          <div
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
          </div>
        ) : null}

        {/* Rush / pass TD celebration */}
        {showTdBanner || showTurnoverBanner ? (
          <div
            data-lounge-td-banner
            data-lounge-field-play-banner={showTdBanner ? 'touchdown' : 'turnover'}
            className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center px-4 pb-[18%]"
            aria-live="polite"
          >
            <FieldBannerFitText
              text={
                showTdBanner
                  ? tdTeamLabel ? `Touchdown ${tdTeamLabel}` : 'Touchdown'
                  : turnoverTeamLabel ? `Turnover · ${turnoverTeamLabel} Ball` : 'Turnover'
              }
              className="lounge-td-banner-text text-center text-[34px] font-black uppercase leading-none tracking-[0.14em] text-amber-300 sm:text-[44px]"
              style={{
                fontFamily: "Oswald, Graduate, Impact, 'Arial Black', sans-serif",
                textShadow:
                  '0 0 18px rgba(251,191,36,0.55), 0 1px 0 #000, 0 3px 0 #000, 0 10px 28px rgba(0,0,0,0.7)',
                WebkitTextStroke: '1px rgba(0,0,0,0.4)',
              }}
            />
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
}) {
  const { awayColor, homeColor, awayTreatment, homeTreatment } = useLoungeSportsPillWashAndLogos(feedGame)
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
  const clock = liveClockLabel(game, live)
  const isFinal = game.status === 'post'
  // Final: clock still says Final … drop stale down/distance + yard line.
  // New half before its kickoff row … ESPN still carries the last snap's down / spot.
  const staleHalf = game.status === 'in' && playsFromEarlierHalf(plays, live?.period)
  const down = isFinal || staleHalf ? null : downDistanceLabel(live)
  const yard = isFinal || staleHalf ? null : yardLineLabel(game, live)
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

  // Opening-kickoff whistle fires from the field's kick animation … arm audio unlock while the hub is up.
  useEffect(() => {
    armGameHubWhistle()
  }, [])

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
      <div className="relative z-[5]">
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
            playStartSpot={playStartSpot}
            players={players}
            plays={plays}
            onPlayAnimActiveChange={onFieldAnimActiveChange}
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
