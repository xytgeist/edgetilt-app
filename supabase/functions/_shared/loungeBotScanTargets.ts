/**
 * Scott scan targets — tier-based sport coverage (primary) + calendar boost (secondary).
 *
 * Poll loops scan every active Odds API sport in Ryan's tier 1–4 scope.
 * Calendar rows on today's PT date merge in higher priority, captions, and slugs.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  coverageRankForSport,
  resolveSportKeyTier,
  sortCalendarRowsByCoverage,
  type CalendarRowForCoverage,
} from './loungeBotCoverageScope.ts'
import { ptTodayDate } from './loungeBotOddsCaption.ts'
import { sportContextLabelFromKey } from './loungeBotRundownContext.ts'

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

function defaultLabelForSportKey(sportKey: string): string {
  const fromRundown = sportContextLabelFromKey(sportKey)
  if (fromRundown) return fromRundown
  const sk = String(sportKey || '').trim().toLowerCase()
  if (!sk) return 'Sport'
  const tail = sk.includes('_') ? sk.split('_').slice(1).join(' ') : sk
  return tail.replace(/\b\w/g, (c) => c.toUpperCase())
}

function synthesizeTarget(sportKey: string, tier: number, calendarRow?: CalendarRow | null): ScottScanTarget {
  if (calendarRow) {
    return {
      ...calendarRow,
      sportKey,
      odds_sport_keys: calendarRow.odds_sport_keys?.length
        ? calendarRow.odds_sport_keys
        : [sportKey],
    }
  }
  const label = defaultLabelForSportKey(sportKey)
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

/** Active Odds API sports in Scott tier scope, merged with today's calendar boosts. */
export async function resolveScottScanTargets(
  admin: SupabaseClient,
  activeSports: Set<string>,
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

    const effectiveTier = tier ?? Number(calendarRow?.coverage_tier) ?? 3
    targets.set(sk, synthesizeTarget(sk, effectiveTier, calendarRow))
  }

  return sortCalendarRowsByCoverage([...targets.values()]) as ScottScanTarget[]
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
