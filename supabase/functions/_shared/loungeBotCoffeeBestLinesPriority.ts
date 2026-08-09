/**
 * Coffee & Covers — Best Lines thread priority (Ryan spec, Jul 2026).
 *
 * Tier 1 — Always show when games: NFL, NBA, MLB, NHL, CFB, CBB, top soccer.
 * Tier 2 — Show when relevant: boxing/MMA, tennis, secondary soccer, golf.
 * Tier 3 — Only when the board is strong: WNBA, spring football, lower soccer, niche.
 *
 * Thread order: NFL/CFB → NBA/CBB → MLB → NHL → top soccer lump → boxing/UFC →
 * tennis → secondary soccer lump → golf → tier 3 (when strong).
 */

export type CoffeeBestLinesTier = 1 | 2 | 3

function normalizeSportKey(sportKey: string): string {
  return String(sportKey || '').trim().toLowerCase()
}

/** Tier 1 top soccer — one combined thread part. */
export const COFFEE_TOP_TIER_SOCCER_KEY_ORDER = [
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_italy_serie_a',
  'soccer_germany_bundesliga',
  'soccer_france_ligue_one',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_fifa_world_cup',
] as const

export const COFFEE_TOP_TIER_SOCCER_KEYS = new Set<string>(COFFEE_TOP_TIER_SOCCER_KEY_ORDER)

/** Tier 2 core — More Soccer Today (Liga MX, MLS, Brasileirão). */
export const COFFEE_CORE_SECONDARY_SOCCER_KEY_ORDER = [
  'soccer_mexico_ligamx',
  'soccer_usa_mls',
  'soccer_brazil_campeonato',
] as const

/** Tier 2 overflow — separate thread part; dropped on light days unless board is strong. */
export const COFFEE_OTHER_SOCCER_KEY_ORDER = [
  'soccer_argentina_primera_division',
  'soccer_chile_campeonato',
  'soccer_netherlands_eredivisie',
  'soccer_portugal_primeira_liga',
  'soccer_uefa_europa_conference_league',
] as const

export const COFFEE_SECONDARY_SOCCER_KEY_ORDER = [
  ...COFFEE_CORE_SECONDARY_SOCCER_KEY_ORDER,
  ...COFFEE_OTHER_SOCCER_KEY_ORDER,
] as const

export const COFFEE_CORE_SECONDARY_SOCCER_KEYS = new Set<string>(COFFEE_CORE_SECONDARY_SOCCER_KEY_ORDER)
export const COFFEE_OTHER_SOCCER_KEYS = new Set<string>(COFFEE_OTHER_SOCCER_KEY_ORDER)
export const COFFEE_SECONDARY_SOCCER_KEYS = new Set<string>(COFFEE_SECONDARY_SOCCER_KEY_ORDER)

export const COFFEE_TOP_SOCCER_THREAD_HEADER = '⚽ Top Soccer Leagues'
/** When top European games are sparse, this block carries Brasileirão / MLS / etc. */
export const COFFEE_SOCCER_THREAD_HEADER = '⚽ Soccer'
/** Fan-facing label for the tier-2 soccer lump (not "secondary"). */
export const COFFEE_MORE_SOCCER_THREAD_LABEL = 'More Soccer Today'
export const COFFEE_SECONDARY_SOCCER_THREAD_HEADER = `⚽ ${COFFEE_MORE_SOCCER_THREAD_LABEL}`
/** Use only when a prior soccer Best Lines thread part already exists; otherwise label the block "Soccer". */
export const COFFEE_OTHER_SOCCER_THREAD_LABEL = 'Other Soccer'
export const COFFEE_OTHER_SOCCER_THREAD_HEADER = `⚽ ${COFFEE_OTHER_SOCCER_THREAD_LABEL}`

/** All Odds API `tennis_*` keys (except table tennis) → one Best Lines thread part. */
export const COFFEE_TENNIS_COMBINED_SORT_KEY = 'tennis_combined'

const COFFEE_SOCCER_LUMP_SORT_KEYS = new Set([
  'soccer_top_leagues',
  'soccer_core_secondary_leagues',
  'soccer_other_leagues',
])

export function isCoffeeTennisKey(sportKey: string): boolean {
  const sk = normalizeSportKey(sportKey)
  if (!sk.startsWith('tennis_')) return false
  if (sk.includes('table_tennis') || sk.includes('ping_pong')) return false
  return true
}

/** ATP before WTA before other tour keys when merging tennis slices. */
export function coffeeTennisSliceSortOrder(sportKey: string): number {
  const sk = normalizeSportKey(sportKey)
  if (sk === 'tennis_atp' || sk.startsWith('tennis_atp_')) return 0
  if (sk === 'tennis_wta' || sk.startsWith('tennis_wta_')) return 1
  return 2
}

/** Daily Best Lines thread sort — higher rank = earlier in thread. */
const COFFEE_BEST_LINES_SPORT_RANK: Record<string, number> = {
  americanfootball_nfl: 1000,
  americanfootball_ncaaf: 990,
  basketball_nba: 980,
  basketball_ncaab: 970,
  baseball_mlb: 960,
  icehockey_nhl: 950,
  soccer_top_leagues: 940,
  boxing_boxing: 930,
  mma_mixed_martial_arts: 925,
  tennis_combined: 920,
  tennis_atp: 920,
  tennis_wta: 919,
  soccer_core_secondary_leagues: 910,
  soccer_other_leagues: 905,
  golf_pga: 900,
  golf_masters_tournament_winner: 899,
  basketball_wnba: 890,
  americanfootball_usfl: 880,
  americanfootball_xfl: 879,
  americanfootball_ufl: 878,
  baseball_milb: 520,
  baseball_npb: 520,
  baseball_kbo: 520,
  baseball_ncaa: 520,
}

const COFFEE_BEST_LINES_FAMILY_RANK: Array<{ test: (sk: string) => boolean; rank: number }> = [
  { test: (sk) => sk.startsWith('americanfootball_nfl') && sk !== 'americanfootball_nfl_preseason', rank: 1000 },
  { test: (sk) => sk.startsWith('americanfootball_ncaaf') || sk.includes('ncaaf'), rank: 990 },
  { test: (sk) => sk === 'basketball_nba', rank: 980 },
  { test: (sk) => sk === 'basketball_ncaab', rank: 970 },
  { test: (sk) => sk.startsWith('baseball_mlb'), rank: 960 },
  { test: (sk) => sk === 'baseball_milb' || sk === 'baseball_npb' || sk === 'baseball_kbo' || sk === 'baseball_ncaa', rank: 520 },
  { test: (sk) => sk.startsWith('icehockey_nhl'), rank: 950 },
  { test: (sk) => COFFEE_TOP_TIER_SOCCER_KEYS.has(sk), rank: 940 },
  { test: (sk) => sk.startsWith('boxing_'), rank: 930 },
  { test: (sk) => sk.startsWith('mma_'), rank: 925 },
  { test: (sk) => sk.startsWith('tennis_'), rank: 920 },
  { test: (sk) => COFFEE_SECONDARY_SOCCER_KEYS.has(sk), rank: 910 },
  { test: (sk) => sk.startsWith('golf_'), rank: 900 },
  { test: (sk) => sk === 'basketball_wnba', rank: 890 },
  {
    test: (sk) => sk.includes('usfl') || sk.includes('xfl') || sk.includes('ufl'),
    rank: 880,
  },
  { test: (sk) => sk.startsWith('cricket_'), rank: 860 },
  { test: (sk) => sk.startsWith('rugby_'), rank: 859 },
  { test: (sk) => sk.includes('table_tennis') || sk.includes('ping_pong'), rank: 858 },
  { test: (sk) => sk.startsWith('volleyball_'), rank: 857 },
  { test: (sk) => sk.startsWith('aussierules_') || sk.includes('_afl') || sk.startsWith('afl_'), rank: 856 },
  { test: (sk) => sk.startsWith('esports_'), rank: 855 },
  { test: (sk) => sk.startsWith('horse') || sk.includes('horse_racing'), rank: 854 },
  {
    test: (sk) => sk.startsWith('motorsport_') || sk.startsWith('formula') || sk.includes('nascar') || sk.includes('indy'),
    rank: 853,
  },
  { test: (sk) => sk.startsWith('americanfootball_'), rank: 880 },
  { test: (sk) => sk.startsWith('basketball_'), rank: 890 },
  { test: (sk) => sk.startsWith('baseball_'), rank: 520 },
  { test: (sk) => sk.startsWith('icehockey_'), rank: 950 },
  { test: (sk) => sk.startsWith('soccer_'), rank: 850 },
]

export function isCoffeeTopTierSoccerKey(sportKey: string): boolean {
  return COFFEE_TOP_TIER_SOCCER_KEYS.has(normalizeSportKey(sportKey))
}

export function isCoffeeSecondarySoccerKey(sportKey: string): boolean {
  return COFFEE_SECONDARY_SOCCER_KEYS.has(normalizeSportKey(sportKey))
}

export function isCoffeeCoreSecondarySoccerKey(sportKey: string): boolean {
  return COFFEE_CORE_SECONDARY_SOCCER_KEYS.has(normalizeSportKey(sportKey))
}

export function isCoffeeOtherSoccerKey(sportKey: string): boolean {
  return COFFEE_OTHER_SOCCER_KEYS.has(normalizeSportKey(sportKey))
}

export function isCoffeeLowerSoccerKey(sportKey: string): boolean {
  const sk = normalizeSportKey(sportKey)
  return sk.startsWith('soccer_')
    && !COFFEE_TOP_TIER_SOCCER_KEYS.has(sk)
    && !COFFEE_SECONDARY_SOCCER_KEYS.has(sk)
}

export function coffeeTopTierSoccerSortOrder(sportKey: string): number {
  const sk = normalizeSportKey(sportKey)
  const idx = COFFEE_TOP_TIER_SOCCER_KEY_ORDER.indexOf(sk as (typeof COFFEE_TOP_TIER_SOCCER_KEY_ORDER)[number])
  return idx >= 0 ? idx : COFFEE_TOP_TIER_SOCCER_KEY_ORDER.length
}

export function coffeeSecondarySoccerSortOrder(sportKey: string): number {
  const sk = normalizeSportKey(sportKey)
  const idx = COFFEE_SECONDARY_SOCCER_KEY_ORDER.indexOf(
    sk as (typeof COFFEE_SECONDARY_SOCCER_KEY_ORDER)[number],
  )
  return idx >= 0 ? idx : COFFEE_SECONDARY_SOCCER_KEY_ORDER.length
}

export function coffeeCoreSecondarySoccerSortOrder(sportKey: string): number {
  const sk = normalizeSportKey(sportKey)
  const idx = COFFEE_CORE_SECONDARY_SOCCER_KEY_ORDER.indexOf(
    sk as (typeof COFFEE_CORE_SECONDARY_SOCCER_KEY_ORDER)[number],
  )
  return idx >= 0 ? idx : COFFEE_CORE_SECONDARY_SOCCER_KEY_ORDER.length
}

export function coffeeOtherSoccerSortOrder(sportKey: string): number {
  const sk = normalizeSportKey(sportKey)
  const idx = COFFEE_OTHER_SOCCER_KEY_ORDER.indexOf(
    sk as (typeof COFFEE_OTHER_SOCCER_KEY_ORDER)[number],
  )
  return idx >= 0 ? idx : COFFEE_OTHER_SOCCER_KEY_ORDER.length
}

export function resolveCoffeeBestLinesTier(sportKey: string): CoffeeBestLinesTier | null {
  const sk = normalizeSportKey(sportKey)
  if (!sk) return null

  if (
    sk === 'americanfootball_nfl'
    || sk.startsWith('americanfootball_ncaaf')
    || sk.includes('ncaaf')
    || sk === 'basketball_nba'
    || sk === 'basketball_ncaab'
    || sk.startsWith('baseball_mlb')
    || sk.startsWith('icehockey_nhl')
    || COFFEE_TOP_TIER_SOCCER_KEYS.has(sk)
  ) {
    return 1
  }

  if (
    sk.startsWith('boxing_')
    || sk.startsWith('mma_')
    || sk.startsWith('tennis_')
    || COFFEE_SECONDARY_SOCCER_KEYS.has(sk)
    || sk.startsWith('golf_')
  ) {
    return 2
  }

  if (
    sk === 'basketball_wnba'
    || sk === 'baseball_milb'
    || sk.includes('usfl')
    || sk.includes('xfl')
    || sk.includes('ufl')
    || isCoffeeLowerSoccerKey(sk)
    || sk.startsWith('cricket_')
    || sk.startsWith('rugby_')
    || sk.includes('table_tennis')
    || sk.includes('ping_pong')
    || sk.startsWith('volleyball_')
    || sk.startsWith('aussierules_')
    || sk.includes('_afl')
    || sk.startsWith('afl_')
    || sk.startsWith('esports_')
    || sk.startsWith('horse')
    || sk.includes('horse_racing')
    || sk.startsWith('motorsport_')
    || sk.startsWith('formula')
    || sk.includes('nascar')
    || sk.includes('indy')
    || sk === 'americanfootball_nfl_preseason'
  ) {
    return 3
  }

  if (sk.startsWith('americanfootball_')) return 3
  if (sk.startsWith('basketball_')) return 3
  if (sk.startsWith('baseball_')) return 3
  if (sk.startsWith('icehockey_')) return 2

  return null
}

/** Higher = earlier in Coffee Best Lines thread + preferred for featured lean. */
export function coffeeBestLinesRankForSport(sportKey: string): number {
  const sk = normalizeSportKey(sportKey)
  if (!sk) return 0

  const exact = COFFEE_BEST_LINES_SPORT_RANK[sk]
  if (exact != null) return exact

  for (const row of COFFEE_BEST_LINES_FAMILY_RANK) {
    if (row.test(sk)) return row.rank
  }

  const tier = resolveCoffeeBestLinesTier(sk)
  if (tier === 1) return 940
  if (tier === 2) return 900
  if (tier === 3) return 850
  return 0
}

export function coffeeBestLinesThreadSortRank(sportKey: string): number {
  return coffeeBestLinesRankForSport(sportKey)
}

/** Hard cap on Best Lines sport line reply parts (each lump = one sport). Root Coffee post is separate — does not consume a slot. */
export const COFFEE_BEST_LINES_MAX_SPORTS = 7
/** Heavy slate (e.g. NFL Sunday): Tier 1 + boxing/UFC only. Sport line parts only. */
export const COFFEE_BEST_LINES_HEAVY_SLATE_MAX = 6
/** Light day: only sports with a decent board. Sport line parts only. */
export const COFFEE_BEST_LINES_LIGHT_SLATE_MAX = 5

export function resolveCoffeeBestLinesThreadTier(sortKey: string): CoffeeBestLinesTier | null {
  const sk = normalizeSportKey(sortKey)
  if (sk === 'soccer_top_leagues') return 1
  if (sk === 'soccer_core_secondary_leagues') return 2
  if (sk === 'soccer_other_leagues') return 2
  if (sk === COFFEE_TENNIS_COMBINED_SORT_KEY) return 2
  return resolveCoffeeBestLinesTier(sk)
}

export function isCoffeeHeavyBestLinesTier2Key(sortKey: string): boolean {
  const sk = normalizeSportKey(sortKey)
  if (COFFEE_SOCCER_LUMP_SORT_KEYS.has(sk)) return true
  return sk.startsWith('boxing_') || sk.startsWith('mma_')
}

/** Soccer lumps + boxing stay in the thread on busy days (MLB → Boxing → Soccer). */
export function isCoffeePinnedBestLinesThreadKey(sortKey: string): boolean {
  const sk = normalizeSportKey(sortKey)
  if (COFFEE_SOCCER_LUMP_SORT_KEYS.has(sk)) return true
  return sk.startsWith('boxing_') || sk.startsWith('mma_')
}

export type CoffeeBestLinesThreadCandidateMeta = CoffeeBestLinesSliceStrength & {
  sortKey: string
  sortRank: number
  tier: CoffeeBestLinesTier
  bestEvPct: number
  strengthScore: number
}

function bestEvPctFromSlice(slice: CoffeeBestLinesSliceStrength): number {
  const picks = [...slice.coverPicks, ...slice.mlPicks]
  if (!picks.length) return 0
  return Math.max(...picks.map((p) => p.edgePct))
}

/** Volume + edge + priority — used to fill Tier 2 slots after Tier 1. */
export function coffeeBestLinesStrengthScore(
  sortKey: string,
  slice: CoffeeBestLinesSliceStrength,
): number {
  const bestEv = bestEvPctFromSlice(slice)
  const metBarBonus = (slice.coversMetBar || slice.mlMetBar) ? 25 : 0
  return slice.gameCount * 10 + bestEv * 8 + metBarBonus + coffeeBestLinesThreadSortRank(sortKey) / 100
}

export function buildCoffeeBestLinesThreadCandidateMeta(
  sortKey: string,
  slice: CoffeeBestLinesSliceStrength,
): CoffeeBestLinesThreadCandidateMeta {
  const tier = resolveCoffeeBestLinesThreadTier(sortKey)
  const sortRank = coffeeBestLinesThreadSortRank(sortKey)
  const bestEvPct = bestEvPctFromSlice(slice)
  return {
    sortKey,
    sortRank,
    tier: tier ?? 3,
    bestEvPct,
    strengthScore: coffeeBestLinesStrengthScore(sortKey, slice),
    ...slice,
  }
}

export function aggregateCoffeeBestLinesSliceStats(
  slices: CoffeeBestLinesSliceStrength[],
): CoffeeBestLinesSliceStrength {
  const coverPicks = slices.flatMap((s) => s.coverPicks)
  const mlPicks = slices.flatMap((s) => s.mlPicks)
  return {
    coverPicks,
    mlPicks,
    gameCount: slices.reduce((sum, s) => sum + s.gameCount, 0),
    coversMetBar: slices.some((s) => s.coversMetBar),
    mlMetBar: slices.some((s) => s.mlMetBar),
  }
}

/** NFL Sunday-style overload — not generic high game volume (MLB Saturdays hit 40+ easily). */
export function isCoffeeHeavyBestLinesSlate(candidates: CoffeeBestLinesThreadCandidateMeta[]): boolean {
  const hasNfl = candidates.some((c) => {
    const sk = normalizeSportKey(c.sortKey)
    return sk === 'americanfootball_nfl'
  })
  const tier1Count = candidates.filter((c) => c.tier === 1).length
  return (hasNfl && tier1Count >= 4) || tier1Count >= 6
}

export function isCoffeeLightBestLinesSlate(candidates: CoffeeBestLinesThreadCandidateMeta[]): boolean {
  const tier1Count = candidates.filter((c) => c.tier === 1).length
  return candidates.length <= 5 && tier1Count <= 2
}

export function resolveCoffeeBestLinesMaxSports(
  candidates: CoffeeBestLinesThreadCandidateMeta[],
): number {
  if (isCoffeeHeavyBestLinesSlate(candidates)) return COFFEE_BEST_LINES_HEAVY_SLATE_MAX
  if (isCoffeeLightBestLinesSlate(candidates)) return COFFEE_BEST_LINES_LIGHT_SLATE_MAX
  return COFFEE_BEST_LINES_MAX_SPORTS
}

function hasDecentCoffeeBestLinesBoard(candidate: CoffeeBestLinesThreadCandidateMeta): boolean {
  if (candidate.tier === 1) return candidate.gameCount > 0
  if (candidate.bestEvPct >= 3) return true
  if (candidate.gameCount >= 3) return true
  return Boolean(candidate.coversMetBar || candidate.mlMetBar)
}

/** Pinned thread parts (soccer lumps, boxing/UFC) stay on light days when they have lines. */
function passesCoffeeLightSlateBoardFilter(candidate: CoffeeBestLinesThreadCandidateMeta): boolean {
  if (isCoffeePinnedBestLinesThreadKey(candidate.sortKey) && candidate.gameCount > 0) {
    return true
  }
  return hasDecentCoffeeBestLinesBoard(candidate)
}

function compareCoffeeBestLinesThreadCandidates(
  a: CoffeeBestLinesThreadCandidateMeta,
  b: CoffeeBestLinesThreadCandidateMeta,
): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  if (b.sortRank !== a.sortRank) return b.sortRank - a.sortRank
  if (b.strengthScore !== a.strengthScore) return b.strengthScore - a.strengthScore
  return a.sortKey.localeCompare(b.sortKey)
}

/** Cap Best Lines sport line reply parts: always Tier 1, then best Tier 2, drop lowest when over cap. Root post is extra. */
export function selectCoffeeBestLinesThreadCandidates<T extends CoffeeBestLinesThreadCandidateMeta>(
  candidates: T[],
): T[] {
  if (!candidates.length) return []

  const sorted = [...candidates].sort(compareCoffeeBestLinesThreadCandidates)
  const maxSportLineParts = resolveCoffeeBestLinesMaxSports(sorted)
  const heavy = isCoffeeHeavyBestLinesSlate(sorted)
  const light = isCoffeeLightBestLinesSlate(sorted)

  let tier1 = sorted.filter((c) => c.tier === 1)
  let tier2 = sorted.filter((c) => c.tier === 2)
  let tier3 = sorted.filter((c) => c.tier === 3)

  if (heavy) {
    tier2 = tier2.filter((c) => isCoffeeHeavyBestLinesTier2Key(c.sortKey))
    tier3 = []
  }

  if (light) {
    tier1 = tier1.filter(passesCoffeeLightSlateBoardFilter)
    tier2 = tier2.filter(passesCoffeeLightSlateBoardFilter)
    tier3 = tier3.filter((c) => c.bestEvPct >= 4 || c.coversMetBar || c.mlMetBar)
  }

  const selected: T[] = [...tier1]

  const pinnedTier2 = tier2.filter((c) => isCoffeePinnedBestLinesThreadKey(c.sortKey))
  const otherTier2 = tier2.filter((c) => !isCoffeePinnedBestLinesThreadKey(c.sortKey))

  for (const candidate of [...pinnedTier2].sort((a, b) => b.strengthScore - a.strengthScore)) {
    if (selected.length >= maxSportLineParts) break
    selected.push(candidate)
  }

  for (const candidate of [...otherTier2].sort((a, b) => b.strengthScore - a.strengthScore)) {
    if (selected.length >= maxSportLineParts) break
    selected.push(candidate)
  }

  for (const candidate of [...tier3].sort((a, b) => b.strengthScore - a.strengthScore)) {
    if (selected.length >= maxSportLineParts) break
    selected.push(candidate)
  }

  if (selected.length > maxSportLineParts) {
    return [...selected]
      .sort(compareCoffeeBestLinesThreadCandidates)
      .slice(0, maxSportLineParts)
  }

  return selected.sort(compareCoffeeBestLinesThreadCandidates)
}

export type CoffeeBestLinesSliceStrength = {
  coverPicks: Array<{ edgePct: number }>
  mlPicks: Array<{ edgePct: number }>
  gameCount: number
  coversMetBar?: boolean
  mlMetBar?: boolean
}

/** Tier 3 + lower soccer only appear when there is real value on the board. */
export function shouldIncludeCoffeeBestLinesThreadPart(
  sportKey: string,
  slice: CoffeeBestLinesSliceStrength,
): boolean {
  const sk = normalizeSportKey(sportKey)
  if (sk === 'baseball_milb') return false

  if (slice.gameCount <= 0) return false

  const tier = resolveCoffeeBestLinesTier(sportKey)
  if (!tier) return false
  if (tier <= 2) return true

  const picks = [...slice.coverPicks, ...slice.mlPicks]
  if (!picks.length) return false

  const bestEv = Math.max(...picks.map((p) => p.edgePct))
  if (bestEv >= 3) return true
  if (slice.coversMetBar || slice.mlMetBar) return true
  return false
}
