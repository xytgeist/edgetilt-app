/**
 * Scott Sharpe coverage scope — Ryan's tier 1–4 sport priority (Jul 2026).
 *
 * Tier 1 — Must cover: NFL, NBA, NCAAF, MLB, NCAAB
 * Tier 2 — High priority: UFC/MMA, NHL, soccer, tennis, golf
 * Tier 3 — Strong secondary: boxing, horse racing, motorsport, WNBA, esports
 * Tier 4 — Completeness / arb: cricket, table tennis, rugby, AFL, volleyball
 *
 * Poll loops scan every active Odds API sport in tiers 1–4.
 * Calendar rows boost priority + captions for special events (not the allowlist).
 */

export type CoverageTier = 1 | 2 | 3 | 4

export const EXCEPTIONAL_EV_GAP_PCT = 2
export const EXCEPTIONAL_MOVEMENT_GAP = 15

/** Minimum rank delta before tier beats movement score without exceptional gap. */
const MOVEMENT_TIER_WEIGHT = 8

export type CalendarCoverageInput = {
  coverage_tier?: number | null
  priority?: number | null
  kind?: string | null
  odds_sport_keys?: string[] | null
}

const TIER1_EXACT = new Set([
  'americanfootball_nfl',
  'basketball_nba',
  'americanfootball_ncaaf',
  'baseball_mlb',
  'basketball_ncaab',
  'soccer_fifa_world_cup',
])

function normalizeSportKey(sportKey: string): string {
  return String(sportKey || '').trim().toLowerCase()
}

/**
 * Ryan's coverage tier for an Odds API sport key.
 * Returns null when the sport is outside Scott's scope (unless boosted by calendar today).
 */
export function resolveSportKeyTier(sportKey: string): CoverageTier | null {
  const sk = normalizeSportKey(sportKey)
  if (!sk) return null

  if (TIER1_EXACT.has(sk)) return 1
  if (sk.includes('world_cup') || sk.includes('fifa_world_cup')) return 1

  // Tier 2 — high priority
  if (sk.startsWith('mma_')) return 2
  if (sk === 'icehockey_nhl') return 2
  if (sk.startsWith('soccer_')) return 2
  if (sk.startsWith('tennis_')) return 2
  if (sk.startsWith('golf_')) return 2

  // Tier 3 — strong secondary
  if (sk.startsWith('boxing_')) return 3
  if (sk.startsWith('horse') || sk.includes('horse_racing')) return 3
  if (sk.startsWith('motorsport_') || sk.startsWith('formula') || sk.includes('nascar') || sk.includes('indy')) {
    return 3
  }
  if (sk === 'basketball_wnba') return 3
  if (sk.startsWith('esports_')) return 3
  if (sk === 'americanfootball_nfl_preseason') return 3

  // Tier 4 — completeness / arb
  if (sk.startsWith('cricket_')) return 4
  if (sk.includes('table_tennis') || sk.includes('ping_pong')) return 4
  if (sk.startsWith('rugby_')) return 4
  if (sk.startsWith('aussierules_') || sk.includes('_afl') || sk.startsWith('afl_')) return 4
  if (sk.startsWith('volleyball_')) return 4

  // Residual league keys in major families
  if (sk.startsWith('americanfootball_')) return 3
  if (sk.startsWith('basketball_')) return 3
  if (sk.startsWith('baseball_')) return 3
  if (sk.startsWith('icehockey_')) return 3

  return null
}

export function isScottCoverageSportKey(sportKey: string): boolean {
  return resolveSportKeyTier(sportKey) != null
}

export function resolveCalendarCoverageTier(input?: CalendarCoverageInput | null): CoverageTier {
  const explicit = Number(input?.coverage_tier)
  if (explicit === 1 || explicit === 2 || explicit === 3 || explicit === 4) return explicit

  const keys = Array.isArray(input?.odds_sport_keys) ? input.odds_sport_keys : []
  if (keys.length) {
    const tiers = keys
      .map((k) => resolveSportKeyTier(k))
      .filter((t): t is CoverageTier => t != null)
    if (tiers.length) return Math.min(...tiers) as CoverageTier
  }

  return 2
}

/** Higher = more important for Scott (tier dominates, then calendar priority / event boost). */
export function coverageRankForSport(
  sportKey: string,
  calendarRow?: CalendarCoverageInput | null,
): number {
  const tier = resolveCalendarCoverageTier({
    coverage_tier: calendarRow?.coverage_tier ?? resolveSportKeyTier(sportKey),
    odds_sport_keys: calendarRow?.odds_sport_keys ?? [sportKey],
    kind: calendarRow?.kind,
    priority: calendarRow?.priority,
  })
  const tierBase = (5 - tier) * 100
  const priority = Math.max(0, Math.min(100, Number(calendarRow?.priority) || 0))
  const kind = String(calendarRow?.kind || '').toLowerCase()
  const eventBoost = kind === 'tournament' || kind === 'marquee' ? 25 : 0
  return tierBase + priority + eventBoost
}

export function compareByCoverageThenEv(
  a: { edgePct: number; coverageRank: number; calendarPriority?: number; bookCount?: number },
  b: { edgePct: number; coverageRank: number; calendarPriority?: number; bookCount?: number },
): number {
  const edgeGap = b.edgePct - a.edgePct
  if (Math.abs(edgeGap) >= EXCEPTIONAL_EV_GAP_PCT) return edgeGap

  if (b.coverageRank !== a.coverageRank) return b.coverageRank - a.coverageRank
  if (b.edgePct !== a.edgePct) return b.edgePct - a.edgePct
  const aPri = a.calendarPriority ?? 0
  const bPri = b.calendarPriority ?? 0
  if (bPri !== aPri) return bPri - aPri
  return (b.bookCount ?? 0) - (a.bookCount ?? 0)
}

export function compareMovementWithCoverage(
  a: { movementScore: number; coverageRank: number },
  b: { movementScore: number; coverageRank: number },
): number {
  const moveGap = b.movementScore - a.movementScore
  if (Math.abs(moveGap) >= EXCEPTIONAL_MOVEMENT_GAP) return moveGap

  const tierGap = b.coverageRank - a.coverageRank
  if (Math.abs(tierGap) >= MOVEMENT_TIER_WEIGHT && tierGap !== 0) return tierGap
  if (moveGap !== 0) return moveGap
  return tierGap
}

export type CalendarRowForCoverage = CalendarCoverageInput & {
  slug?: string
  label_short?: string
  caption_prefix?: string | null
  odds_sport_keys?: string[]
  start_date?: string
  end_date?: string
}

export function sortCalendarRowsByCoverage<T extends CalendarRowForCoverage>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aKey = a.odds_sport_keys?.[0] || ''
    const bKey = b.odds_sport_keys?.[0] || ''
    const aRank = coverageRankForSport(aKey, a)
    const bRank = coverageRankForSport(bKey, b)
    if (bRank !== aRank) return bRank - aRank
    const aLabel = String(a.label_short || a.slug || '')
    const bLabel = String(b.label_short || b.slug || '')
    return aLabel.localeCompare(bLabel)
  })
}

/** @deprecated Use coverageRankForSport — kept for imports that expect a 0–100 popularity scale. */
export function sportPopularityRank(sportKey: string, calendarRow?: CalendarCoverageInput | null): number {
  return coverageRankForSport(sportKey, calendarRow)
}
