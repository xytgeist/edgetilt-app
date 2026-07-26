/**
 * Scott sport display labels from Odds API sport_key (+ optional API title).
 * Keeps primary US leagues distinct from international / minor league keys.
 */

function normalizeSportKey(sportKey: string): string {
  return String(sportKey || '').trim().toLowerCase()
}

const BASEBALL_SPORT_LABELS: Record<string, string> = {
  baseball_mlb: 'MLB',
  baseball_mlb_preseason: 'MLB Preseason',
  baseball_mlb_world_series_winner: 'MLB',
  baseball_milb: 'MiLB',
  baseball_npb: 'NPB',
  baseball_kbo: 'KBO',
  baseball_ncaa: 'NCAA Baseball',
}

const ICE_HOCKEY_SPORT_LABELS: Record<string, string> = {
  icehockey_nhl: 'NHL',
  icehockey_nhl_preseason: 'NHL Preseason',
  icehockey_nhl_championship_winner: 'NHL',
}

/** Editorial overrides where Odds API title is abbreviated (EPL) or grouped. */
const SOCCER_LABEL_OVERRIDES: Record<string, string> = {
  soccer_epl: 'Premier League',
  soccer_spain_la_liga: 'La Liga',
  soccer_germany_bundesliga: 'Bundesliga',
  soccer_italy_serie_a: 'Serie A',
  soccer_france_ligue_one: 'Ligue 1',
  soccer_usa_mls: 'MLS',
  soccer_uefa_champs_league: 'Champions League',
  soccer_uefa_europa_league: 'Europa League',
  soccer_uefa_europa_conference_league: 'Conference League',
  soccer_fifa_world_cup: 'World Cup',
  soccer_brazil_campeonato: 'Brasileirão',
  soccer_mexico_ligamx: 'Liga MX',
}

const MMA_PROMOTION_FROM_HEADLINE: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bufc\s*\d+/i, label: 'UFC' },
  { pattern: /\bufc\b/i, label: 'UFC' },
  { pattern: /\bbellator\b/i, label: 'Bellator' },
  { pattern: /\bpfl\b/i, label: 'PFL' },
  { pattern: /\bone championship\b/i, label: 'ONE Championship' },
  { pattern: /\bone fc\b/i, label: 'ONE' },
  { pattern: /\bcage warriors\b/i, label: 'Cage Warriors' },
  { pattern: /\binvicta\b/i, label: 'Invicta' },
  { pattern: /\blfa\b/i, label: 'LFA' },
  { pattern: /\brizin\b/i, label: 'Rizin' },
]

function titleCaseKeyTail(sportKey: string): string {
  const sk = normalizeSportKey(sportKey)
  if (!sk) return 'Sport'
  const tail = sk.includes('_') ? sk.split('_').slice(1).join(' ') : sk
  return tail
    .split(' ')
    .map((word) => {
      const w = word.trim()
      if (!w) return ''
      if (/^[a-z]{2,4}$/.test(w)) return w.toUpperCase()
      return w.replace(/\b\w/g, (c) => c.toUpperCase())
    })
    .filter(Boolean)
    .join(' ')
}

function soccerLabelFromKey(sportKey: string, apiTitle?: string): string {
  const sk = normalizeSportKey(sportKey)
  if (SOCCER_LABEL_OVERRIDES[sk]) return SOCCER_LABEL_OVERRIDES[sk]!
  const title = String(apiTitle || '').trim()
  if (title) return title
  return titleCaseKeyTail(sk)
}

export function isMmaSportKey(sportKey: string): boolean {
  return normalizeSportKey(sportKey).startsWith('mma_')
}

/** Promotion brand from Rundown event headline, when present. */
export function mmaPromotionLabelFromHeadline(headline: string): string | null {
  const h = String(headline || '').trim()
  if (!h) return null
  for (const { pattern, label } of MMA_PROMOTION_FROM_HEADLINE) {
    if (pattern.test(h)) return label
  }
  return null
}

/** Per-event MMA label when Odds API uses one key for all promotions. */
export function mmaEventCategoryLabel(sportKey: string, eventHeadline?: string | null): string {
  if (!isMmaSportKey(sportKey)) return ''
  const promotion = mmaPromotionLabelFromHeadline(String(eventHeadline || ''))
  if (promotion) return promotion
  return 'MMA'
}

/** Short sport label for Scott alert headers and scan targets. */
export function sportDisplayLabel(sportKey: string, apiTitle?: string): string {
  const sk = normalizeSportKey(sportKey)
  if (!sk) return ''
  if (sk === 'americanfootball_nfl') return 'NFL'
  if (sk === 'americanfootball_nfl_preseason') return 'NFL Preseason'
  if (sk === 'americanfootball_ncaaf') return 'NCAAF'
  if (sk.startsWith('baseball_')) return BASEBALL_SPORT_LABELS[sk] ?? ''
  if (sk === 'basketball_nba') return 'NBA'
  if (sk === 'basketball_ncaab') return 'NCAAB'
  if (sk === 'basketball_wnba') return 'WNBA'
  if (sk.startsWith('icehockey_')) return ICE_HOCKEY_SPORT_LABELS[sk] ?? ''
  if (sk.startsWith('mma_')) return 'MMA'
  if (sk.startsWith('soccer_')) return soccerLabelFromKey(sk, apiTitle)
  if (sk.startsWith('tennis')) return 'Tennis'
  if (sk.startsWith('golf')) return 'Golf'
  if (sk.startsWith('boxing')) return 'Boxing'
  if (sk === 'aussierules_afl') return 'AFL'
  if (sk === 'rugbyleague_nrl') return 'NRL'
  return ''
}

/** @deprecated alias — use sportDisplayLabel */
export function sportContextLabelFromKey(sportKey: string, apiTitle?: string): string {
  return sportDisplayLabel(sportKey, apiTitle)
}
