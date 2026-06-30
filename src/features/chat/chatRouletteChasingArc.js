import { useEffect } from 'react'

/** Ring circumference for RING_R = 36 */
export const CHAT_ROULETTE_RING_C = 2 * Math.PI * 36

/** Full cycle = two ring laps, then loops. */
export const CHAT_ROULETTE_CHASE_LAP_MS = 1400

/** Tail + head each complete this many laps per cycle. */
const LAPS_PER_CYCLE = 2

/** Arc length bounds; max breathes slowly via {@link chatRouletteChaseAt}. */
const L_MIN_FRAC = 12 / 360
const L_MAX_FRAC = 132 / 360

/** Spread reaches max by this fraction of the cycle (during lap 1). */
const GROW_END = 0.2

/** Hold long arc until here; tail catch-up only in the last ~32% (lap 2). */
const CATCHUP_START = 0.68

function smoothstep01(u) {
  const x = Math.max(0, Math.min(1, u))
  return x * x * (3 - 2 * x)
}

/**
 * Two-lap spread: stretch early, stay long through lap 1 (no collapse at 12 o'clock),
 * fast tail catch-up only before the loop seam.
 * @param {number} t01
 */
function arcSpreadAt(t01) {
  const t = ((t01 % 1) + 1) % 1
  if (t <= GROW_END) return smoothstep01(t / GROW_END)
  if (t < CATCHUP_START) return 1
  const u = (t - CATCHUP_START) / (1 - CATCHUP_START)
  // smoothstep shrink: zero slope at start + end → head slows, never retreats
  return 1 - smoothstep01(u)
}

/**
 * Chasing-arc kinematics over two laps: tail T and head H always advance clockwise.
 * Head may slow during catch-up but never moves backward (dH/dt > 0).
 *
 * @param {number} t01 Normalized time in [0, 1) for one full cycle.
 * @param {number} C Ring circumference.
 * @param {number} [nowMs] Wall clock for slow Lmax variation.
 */
export function chatRouletteChaseAt(t01, C = CHAT_ROULETTE_RING_C, nowMs = 0) {
  const t = ((t01 % 1) + 1) % 1
  const lMin = L_MIN_FRAC * C
  const lMaxVar = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(nowMs * 0.00075))
  const lMax = L_MAX_FRAC * C * lMaxVar
  const spread = arcSpreadAt(t)
  const L = lMin + (lMax - lMin) * spread
  const T = t * LAPS_PER_CYCLE * C
  const H = T + L
  return { T, L, H, ballRotateDeg: (H / C) * 360 }
}

/**
 * Drives arc + ball on each rAF frame (no React state - avoids jitter).
 *
 * @param {React.RefObject<SVGCircleElement | null>} arcRef
 * @param {React.RefObject<SVGGElement | null>} ballArmRef
 * @param {number} [lapMs]
 */
export function useChatRouletteChaseAnimation(arcRef, ballArmRef, lapMs = CHAT_ROULETTE_CHASE_LAP_MS) {
  useEffect(() => {
    const arc = arcRef.current
    const ballArm = ballArmRef.current
    if (!arc || !ballArm) return undefined

    const C = CHAT_ROULETTE_RING_C
    let raf = 0
    let start = null

    const frame = (now) => {
      if (start == null) start = now
      const t01 = ((now - start) % lapMs) / lapMs
      const { T, L, ballRotateDeg } = chatRouletteChaseAt(t01, C, now)

      arc.setAttribute('stroke-dasharray', `${L} ${C - L}`)
      arc.setAttribute('stroke-dashoffset', String(-T))
      ballArm.setAttribute('transform', `rotate(${ballRotateDeg} 50 50)`)

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [arcRef, ballArmRef, lapMs])
}
