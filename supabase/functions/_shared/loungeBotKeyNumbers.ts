/**
 * NFL & Football Key Number Hook Intelligence Engine.
 *
 * In NFL betting, margin distribution is heavily clustered around key scoring numbers:
 * - 3 (Field Goal): ~14.8% of games
 * - 7 (Touchdown + XP): ~9.3% of games
 * - 6 (Unconverted TD / 2 FGs): ~5.9% of games
 * - 10 (TD + FG): ~5.6% of games
 * - 4 (TD vs FG): ~5.1% of games
 *
 * This module evaluates:
 * 1. "Hook Tax" / Half-Point Trap Detection: e.g. laying -3.5 or taking +2.5 / +6.5.
 * 2. Key Crossing Value: e.g. buying or finding an underdog at +3.5 or +7.5.
 * 3. Line shopping advice when a book offers key number protection.
 */

export type KeyNumberAnalysis = {
  spreadPoint: number // e.g. -3.5, +3.5, -2.5, +7.5, -7.0
  isKeyNumber: boolean // exact match on 3, 7, 6, 10, 4
  nearestKeyNumber: number | null // 3, 7, 6, 10, 4
  isHookTax: boolean // e.g. -3.5 (laying hook on 3) or -7.5 (laying hook on 7) or +2.5 (missing hook on 3)
  isHookGolden: boolean // e.g. +3.5 (dog gets hook over 3) or +7.5 (dog gets hook over 7)
  hookWarning?: string
  sharpRecommendation?: string
}

export const NFL_KEY_NUMBER_FREQUENCIES: Record<number, number> = {
  3: 14.8,
  7: 9.3,
  6: 5.9,
  10: 5.6,
  4: 5.1,
}

/**
 * Analyze a football spread line for key number hooks and valuation.
 */
export function analyzeFootballKeyNumbers(spreadPoint: number | null): KeyNumberAnalysis {
  if (spreadPoint == null || !Number.isFinite(spreadPoint)) {
    return {
      spreadPoint: 0,
      isKeyNumber: false,
      nearestKeyNumber: null,
      isHookTax: false,
      isHookGolden: false,
    }
  }

  const absPoint = Math.abs(spreadPoint)
  const isFav = spreadPoint < 0
  const isDog = spreadPoint > 0

  const exactKey = [3, 7, 6, 10, 4].find((k) => Math.abs(absPoint - k) < 0.05) != null
  let nearestKey: number | null = null
  if (Math.abs(absPoint - 3) <= 0.6) nearestKey = 3
  else if (Math.abs(absPoint - 7) <= 0.6) nearestKey = 7
  else if (Math.abs(absPoint - 6) <= 0.6) nearestKey = 6
  else if (Math.abs(absPoint - 10) <= 0.6) nearestKey = 10
  else if (Math.abs(absPoint - 4) <= 0.6) nearestKey = 4

  // Hook Tax:
  // 1. Favorite laying -3.5 (needs 4+ pt win; 3 pt win loses)
  // 2. Favorite laying -7.5 (needs 8+ pt win; 7 pt win loses)
  // 3. Underdog taking +2.5 (3 pt loss loses; missed the key 3)
  // 4. Underdog taking +6.5 (7 pt loss loses; missed the key 7)
  const isHookTax = (isFav && (absPoint === 3.5 || absPoint === 7.5)) || (isDog && (absPoint === 2.5 || absPoint === 6.5))

  // Golden Hook:
  // 1. Underdog taking +3.5 (3 pt loss covers)
  // 2. Underdog taking +7.5 (7 pt loss covers)
  // 3. Favorite laying -2.5 (3 pt win covers)
  // 4. Favorite laying -6.5 (7 pt win covers)
  const isHookGolden = (isDog && (absPoint === 3.5 || absPoint === 7.5)) || (isFav && (absPoint === 2.5 || absPoint === 6.5))

  let hookWarning: string | undefined
  let sharpRecommendation: string | undefined

  if (isFav && absPoint === 3.5) {
    hookWarning = 'Hook Tax Warning · Laying -3.5 is a historical trap (~15% of NFL games land on 3). A 3-point victory results in a loss.'
    sharpRecommendation = 'Shop for -2.5 or -3 (-120), or look for alternate ML pricing.'
  } else if (isDog && absPoint === 2.5) {
    hookWarning = 'Dead Number Warning · Catching +2.5 misses the critical 3-point field goal push/win buffer.'
    sharpRecommendation = 'Seek +3 (-120) or +3.5 to capture the key field goal cluster.'
  } else if (isFav && absPoint === 7.5) {
    hookWarning = 'Hook Tax Warning · Laying -7.5 requires winning by more than a full touchdown + extra point.'
    sharpRecommendation = 'Target -6.5 or -7 flat to protect against a standard 7-point margin.'
  } else if (isDog && absPoint === 3.5) {
    sharpRecommendation = 'Golden Key Number · Catching +3.5 captures the ~15% field goal margin cluster for the cover.'
  } else if (isDog && absPoint === 7.5) {
    sharpRecommendation = 'Golden Key Number · Catching +7.5 protects against a standard 7-point touchdown defeat.'
  }

  return {
    spreadPoint,
    isKeyNumber: exactKey,
    nearestKeyNumber: nearestKey,
    isHookTax,
    isHookGolden,
    hookWarning,
    sharpRecommendation,
  }
}
