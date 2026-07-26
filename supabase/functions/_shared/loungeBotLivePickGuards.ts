/**
 * Live in-game pick quality gates (pre-match uses DEFAULT_MIN_BOOKS = 3).
 */
import type { OddsPick } from './loungeBotOddsCaption.ts'

export const LIVE_MIN_BOOKS = 6
export const LIVE_DEFAULT_MIN_EV_PCT = 6
export const LIVE_ML_LONGSHOT_WARN_PRICE = 700
export const LIVE_ML_LONGSHOT_BLOCK_PRICE = 800
export const LIVE_ML_LONGSHOT_ESCAPE_BOOKS = 8

export function isDrawOrTiePick(pick: OddsPick): boolean {
  return /^draw$|^tie$/i.test(String(pick.pickName || '').trim())
}

export function isSoccerSportKey(sportKey: string): boolean {
  return String(sportKey || '').trim().toLowerCase().startsWith('soccer_')
}

export type LivePickRejectReason =
  | 'live_soccer_draw'
  | 'live_ml_longshot'
  | 'live_min_books'
  | 'live_min_ev'

/** Returns a reject reason when a live pick should not be posted. */
export function rejectLivePick(pick: OddsPick, minEvPct: number): LivePickRejectReason | null {
  if (pick.bookCount < LIVE_MIN_BOOKS) return 'live_min_books'
  if (pick.edgePct < minEvPct) return 'live_min_ev'

  if (pick.marketKey === 'h2h' && isDrawOrTiePick(pick) && isSoccerSportKey(pick.sportKey)) {
    return 'live_soccer_draw'
  }

  if (pick.marketKey === 'h2h' && pick.pickPrice > LIVE_ML_LONGSHOT_BLOCK_PRICE) {
    if (pick.bookCount < LIVE_ML_LONGSHOT_ESCAPE_BOOKS) {
      return 'live_ml_longshot'
    }
  }

  return null
}

/** Footer for live picks that pass gates but need a speed warning. */
export function liveVerifyFooterLine(pick: OddsPick): string | null {
  if (pick.marketKey === 'h2h' && pick.pickPrice > LIVE_ML_LONGSHOT_WARN_PRICE) {
    if (pick.pickPrice > LIVE_ML_LONGSHOT_BLOCK_PRICE) {
      return 'Live · extreme number, confirm still available'
    }
    return 'Live · verify quickly'
  }
  if (pick.edgePct >= 10 && pick.bookCount < LIVE_ML_LONGSHOT_ESCAPE_BOOKS) {
    return 'Live · verify quickly'
  }
  return null
}

export function filterLiveEligiblePicks(picks: OddsPick[], minEvPct: number): OddsPick[] {
  return picks.filter((pick) => rejectLivePick(pick, minEvPct) == null)
}
