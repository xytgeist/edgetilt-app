/**
 * Sport-aware gates for pre-match ⚡ +EV Edge alerts (poll_edges / manual fetch).
 * Situational Lean, live in-game edge, and Best Bet of the Hour use separate floors.
 */
import type { OddsPick } from './loungeBotOddsCaption.ts'
import { DEFAULT_MAX_EV_PCT } from './loungeBotOddsCaption.ts'
import type { PlusEvPickOptions } from './loungeBotOddsCaption.ts'

/** Max ⚡ Edge posts per poll_edges cron tick (best EV across all sports). */
export const MAX_EDGE_ALERTS_PER_POLL_TICK = 2

export const EDGE_ALERT_SOCCER_MIN_EV_PCT = 7
export const EDGE_ALERT_SOCCER_MIN_BOOKS = 6
/** Lower-tier soccer with ≤5 books must clear this EV bar. */
export const EDGE_ALERT_SOCCER_LOWER_TIER_THIN_MIN_EV_PCT = 8

export const EDGE_ALERT_MAJOR_US_MIN_EV_PCT = 5
export const EDGE_ALERT_MAJOR_US_MIN_BOOKS = 5

export const EDGE_ALERT_DEFAULT_MIN_EV_PCT = 5.5
export const EDGE_ALERT_DEFAULT_MIN_BOOKS = 5

/** Top 5 European leagues + MLS + Liga MX (Ryan spec). */
const TOP_TIER_SOCCER_KEYS = new Set([
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'soccer_usa_mls',
  'soccer_mexico_ligamx',
])

function normalizeSportKey(sportKey: string): string {
  return String(sportKey || '').trim().toLowerCase()
}

export function isSoccerSportKey(sportKey: string): boolean {
  return normalizeSportKey(sportKey).startsWith('soccer_')
}

export function isTopTierSoccerLeague(sportKey: string): boolean {
  return TOP_TIER_SOCCER_KEYS.has(normalizeSportKey(sportKey))
}

/** NFL, NBA, MLB, NHL, CFB, CBB (+ same-league preseason keys). */
export function isMajorUsSportKey(sportKey: string): boolean {
  const sk = normalizeSportKey(sportKey)
  return sk === 'americanfootball_nfl'
    || sk === 'americanfootball_nfl_preseason'
    || sk === 'americanfootball_ncaaf'
    || sk === 'basketball_nba'
    || sk === 'basketball_ncaab'
    || sk === 'baseball_mlb'
    || sk === 'baseball_mlb_preseason'
    || sk === 'icehockey_nhl'
    || sk === 'icehockey_nhl_preseason'
}

export type EdgeAlertBaseThresholds = {
  minEvPct: number
  minBooks: number
}

/** Base min EV / books before pick-specific soccer thin-book guard. */
export function edgeAlertBaseThresholds(sportKey: string): EdgeAlertBaseThresholds {
  if (isSoccerSportKey(sportKey)) {
    return { minEvPct: EDGE_ALERT_SOCCER_MIN_EV_PCT, minBooks: EDGE_ALERT_SOCCER_MIN_BOOKS }
  }
  if (isMajorUsSportKey(sportKey)) {
    return { minEvPct: EDGE_ALERT_MAJOR_US_MIN_EV_PCT, minBooks: EDGE_ALERT_MAJOR_US_MIN_BOOKS }
  }
  return { minEvPct: EDGE_ALERT_DEFAULT_MIN_EV_PCT, minBooks: EDGE_ALERT_DEFAULT_MIN_BOOKS }
}

export function edgeAlertRequiredMinBooks(sportKey: string, pick: Pick<OddsPick, 'bookCount'>): number {
  if (isSoccerSportKey(sportKey) && !isTopTierSoccerLeague(sportKey) && pick.bookCount <= 5) {
    return 5
  }
  return edgeAlertBaseThresholds(sportKey).minBooks
}

export function edgeAlertRequiredMinEvPct(sportKey: string, pick: Pick<OddsPick, 'bookCount'>): number {
  const base = edgeAlertBaseThresholds(sportKey).minEvPct
  if (
    isSoccerSportKey(sportKey)
    && !isTopTierSoccerLeague(sportKey)
    && pick.bookCount <= 5
  ) {
    return Math.max(base, EDGE_ALERT_SOCCER_LOWER_TIER_THIN_MIN_EV_PCT)
  }
  return base
}

export function edgeAlertPickQualifies(sportKey: string, pick: OddsPick): boolean {
  return pick.bookCount >= edgeAlertRequiredMinBooks(sportKey, pick)
    && pick.edgePct >= edgeAlertRequiredMinEvPct(sportKey, pick)
}

/** Scan options for findPlusEvOpportunities (may be looser than final qualify for soccer thin books). */
export function edgeAlertScanOptions(sportKey: string): PlusEvPickOptions {
  const base = edgeAlertBaseThresholds(sportKey)
  if (isSoccerSportKey(sportKey)) {
    return {
      minBooks: 5,
      minEvPct: EDGE_ALERT_SOCCER_MIN_EV_PCT,
      maxEvPct: DEFAULT_MAX_EV_PCT,
    }
  }
  return {
    minBooks: base.minBooks,
    minEvPct: base.minEvPct,
    maxEvPct: DEFAULT_MAX_EV_PCT,
  }
}
