/**
 * Scott scan targets — tier-based sport coverage (primary) + calendar boost (secondary).
 *
 * Poll loops scan active Odds API sports in Ryan's tier 1–4 scope that are also on `SCAN_SPORT_ALLOWLIST`.
 * Calendar rows on today's PT date merge in higher priority, captions, and slugs.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  coverageRankForSport,
  resolveSportKeyTier,
  sortCalendarRowsByCoverage,
  type CalendarRowForCoverage,
} from './loungeBotCoverageScope.ts'
import { ptTodayDate, sportHasEventsInWindow } from './loungeBotOddsRun.ts'
import { sportDisplayLabel } from './loungeBotSportLabels.ts'

export type CalendarRow = {
  slug: string
  label_short: string
  caption_prefix: string | null
  odds_sport_keys: string[]
  priority?: number
  coverage_tier?: number | null
  kind?: string | null
}

export type ScottScanTarget = CalendarRow & { sportKey: string }

/** Today's enabled calendar rows (PT) — priority boost + captions, not the scan allowlist. */
export async function loadTodayCalendarRows(admin: SupabaseClient): Promise<CalendarRow[]> {
  const today = ptTodayDate()
  const { data, error } = await admin
    .from('lounge_sports_betting_calendar')
    .select('slug, label_short, caption_prefix, odds_sport_keys, priority, coverage_tier, kind')
    .eq('enabled', true)
    .lte('start_date', today)
    .gte('end_date', today)

  if (error) throw new Error(error.message)
  return sortCalendarRowsByCoverage((data || []) as CalendarRow[])
}

const DEFAULT_PRIORITY_BY_TIER: Record<number, number> = {
  1: 85,
  2: 70,
  3: 55,
  4: 42,
}

function slugFromSportKey(sportKey: string): string {
  return String(sportKey || '').trim().toLowerCase().replace(/_/g, '-')
}

function defaultLabelForSportKey(sportKey: string, sportTitles?: Map<string, string>): string {
  const sk = String(sportKey || '').trim().toLowerCase()
  const apiTitle = sportTitles?.get(sk)
  const fromLabels = sportDisplayLabel(sportKey, apiTitle)
  if (fromLabels) return fromLabels
  if (apiTitle) return apiTitle
  if (!sk) return 'Sport'
  const tail = sk.includes('_') ? sk.split('_').slice(1).join(' ') : sk
  return tail.replace(/\b\w/g, (c) => c.toUpperCase())
}

function synthesizeTarget(
  sportKey: string,
  tier: number,
  calendarRow?: CalendarRow | null,
  sportTitles?: Map<string, string>,
): ScottScanTarget {
  if (calendarRow) {
    return {
      ...calendarRow,
      sportKey,
      odds_sport_keys: calendarRow.odds_sport_keys?.length
        ? calendarRow.odds_sport_keys
        : [sportKey],
    }
  }
  const label = defaultLabelForSportKey(sportKey, sportTitles)
  return {
    slug: slugFromSportKey(sportKey),
    label_short: label,
    caption_prefix: label,
    odds_sport_keys: [sportKey],
    priority: DEFAULT_PRIORITY_BY_TIER[tier] ?? 50,
    coverage_tier: tier,
    kind: 'season',
    sportKey,
  }
}

function pickBestCalendarRowForKey(
  calendarByKey: Map<string, CalendarRow>,
  sportKey: string,
): CalendarRow | null {
  const direct = calendarByKey.get(sportKey)
  if (direct) return direct

  let best: CalendarRow | null = null
  let bestRank = -1
  for (const row of calendarByKey.values()) {
    const keys = row.odds_sport_keys || []
    if (!keys.includes(sportKey)) continue
    const rank = coverageRankForSport(sportKey, row)
    if (rank > bestRank) {
      bestRank = rank
      best = row
    }
  }
  return best
}

/**
 * Sports the scanners pay Odds API credits for (Ryan, Sep 2026: drop the niche long tail … it was ~75% of bot fetches).
 * An enabled calendar row for today still pulls any other sport in, so special events stay one DB row away.
 */
const SCAN_SPORT_ALLOWLIST = new Set([
  'americanfootball_nfl',
  'americanfootball_nfl_preseason',
  'americanfootball_ncaaf',
  'basketball_nba',
  'basketball_ncaab',
  'basketball_wnba',
  'baseball_mlb',
  'icehockey_nhl',
  'mma_mixed_martial_arts',
  'boxing_boxing',
  'soccer_epl',
  'soccer_uefa_champs_league',
  'soccer_usa_mls',
  'soccer_spain_la_liga',
  'soccer_italy_serie_a',
  'soccer_germany_bundesliga',
  'soccer_france_ligue_one',
  'soccer_fifa_world_cup',
])
const SCAN_SPORT_PATTERNS = [/^tennis_(atp|wta)_(aus_open|french_open|wimbledon|us_open)/]

export function isScanAllowlistedSport(sportKey: string): boolean {
  const sk = String(sportKey || '').trim().toLowerCase()
  return SCAN_SPORT_ALLOWLIST.has(sk) || SCAN_SPORT_PATTERNS.some((re) => re.test(sk))
}

/** Active Odds API sports in Scott tier scope + scan allowlist, merged with today's calendar boosts. */
export async function resolveScottScanTargets(
  admin: SupabaseClient,
  activeSports: Set<string>,
  sportTitles?: Map<string, string>,
): Promise<ScottScanTarget[]> {
  const calendarRows = await loadTodayCalendarRows(admin)
  const calendarByKey = new Map<string, CalendarRow>()

  for (const row of calendarRows) {
    for (const key of row.odds_sport_keys || []) {
      const sk = String(key || '').trim().toLowerCase()
      if (!sk) continue
      const existing = calendarByKey.get(sk)
      if (!existing || coverageRankForSport(sk, row) > coverageRankForSport(sk, existing)) {
        calendarByKey.set(sk, row)
      }
    }
  }

  const targets = new Map<string, ScottScanTarget>()

  for (const sportKey of activeSports) {
    const sk = String(sportKey || '').trim().toLowerCase()
    if (!sk) continue
    const tier = resolveSportKeyTier(sk)
    const calendarRow = pickBestCalendarRowForKey(calendarByKey, sk)
    const inTierScope = tier != null
    const calendarBoost = Boolean(calendarRow)
    if (!inTierScope && !calendarBoost) continue
    if (!calendarBoost && !isScanAllowlistedSport(sk)) continue

    const effectiveTier = tier ?? Number(calendarRow?.coverage_tier) ?? 3
    targets.set(sk, synthesizeTarget(sk, effectiveTier, calendarRow, sportTitles))
  }

  return sortCalendarRowsByCoverage([...targets.values()]) as ScottScanTarget[]
}

/** Pregame scans: anything live (6h lookback) or inside the 48h odds window. */
export const PREGAME_SCAN_WINDOW = { lookbackHours: 6, aheadHours: 48 }
/** In-game scans: only games that kicked off in the last 6h. */
export const LIVE_SCAN_WINDOW = { lookbackHours: 6, aheadHours: 0 }

/** Drop sports with no games in the window (free `/events` check) before paying for `/odds`. */
export async function filterTargetsWithEvents<T extends { sportKey: string }>(
  targets: T[],
  window: { lookbackHours: number; aheadHours: number },
): Promise<T[]> {
  const keep = await Promise.all(targets.map((t) => sportHasEventsInWindow(t.sportKey, window)))
  return targets.filter((_, i) => keep[i])
}

export function calendarPickFromTarget(target: ScottScanTarget) {
  return {
    calendarSlug: target.slug,
    categoryLabel: String(target.caption_prefix || target.label_short || target.sportKey).trim(),
  }
}

/** Manual fetch: calendar row today, or any tier-scoped sport key. */
export function resolveCalendarSelection(
  calendarRows: CalendarRow[],
  sportKey: string,
  calendarSlug: string,
): { ok: true; categoryLabel: string; calendarSlug: string } | { ok: false; error: string } {
  const sk = String(sportKey || '').trim().toLowerCase()
  if (!sk) {
    return { ok: false, error: 'sportKey required.' }
  }

  const matches = calendarRows.filter((row) => (row.odds_sport_keys || []).includes(sk))
  if (matches.length) {
    let row = matches[0]
    if (calendarSlug) {
      const picked = matches.find((r) => r.slug === calendarSlug)
      if (!picked) {
        return { ok: false, error: 'Calendar selection does not match the sport key.' }
      }
      row = picked
    }
    return {
      ok: true,
      calendarSlug: row.slug,
      categoryLabel: String(row.caption_prefix || row.label_short || '').trim(),
    }
  }

  const tier = resolveSportKeyTier(sk)
  if (tier != null) {
    const label = defaultLabelForSportKey(sk)
    return {
      ok: true,
      calendarSlug: calendarSlug || slugFromSportKey(sk),
      categoryLabel: label,
    }
  }

  return {
    ok: false,
    error: 'Sport is outside Scott coverage scope. Add a calendar row for today or use a supported Odds API key.',
  }
}

export type { CalendarRowForCoverage }
