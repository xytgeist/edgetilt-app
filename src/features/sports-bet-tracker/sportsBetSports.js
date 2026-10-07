import {
  LOUNGE_SPORTS_HUB_FILTER_CFB,
  LOUNGE_SPORTS_HUB_FILTER_MLB,
  LOUNGE_SPORTS_HUB_FILTER_MLS,
  LOUNGE_SPORTS_HUB_FILTER_NBA,
  LOUNGE_SPORTS_HUB_FILTER_NFL,
  LOUNGE_SPORTS_HUB_FILTER_NHL,
  LOUNGE_SPORTS_HUB_FILTER_PGA,
} from '../lounge/loungeSportsHubNav.js'

/** Hub leagues plus Other. Values are Odds API sport_key. */
export const SPORTS_BET_SPORTS = [
  { key: LOUNGE_SPORTS_HUB_FILTER_NFL, label: 'NFL' },
  { key: LOUNGE_SPORTS_HUB_FILTER_CFB, label: 'CFB' },
  { key: LOUNGE_SPORTS_HUB_FILTER_NBA, label: 'NBA' },
  { key: LOUNGE_SPORTS_HUB_FILTER_MLB, label: 'MLB' },
  { key: LOUNGE_SPORTS_HUB_FILTER_NHL, label: 'NHL' },
  { key: LOUNGE_SPORTS_HUB_FILTER_PGA, label: 'Golf' },
  { key: LOUNGE_SPORTS_HUB_FILTER_MLS, label: 'MLS' },
  { key: 'other', label: 'Other' },
]

export function sportByKey(key) {
  const raw = String(key || '').trim()
  return SPORTS_BET_SPORTS.find((s) => s.key === raw) || null
}

export function resolveSportsBetSport(sportKey, sportLabel) {
  const keyRaw = String(sportKey || '').trim()
  const labelRaw = String(sportLabel || '').trim()
  const byKey = sportByKey(keyRaw)
  if (byKey) return byKey
  const lower = `${keyRaw} ${labelRaw}`.toLowerCase()
  if (lower.includes('ncaaf') || lower === 'cfb' || /\bcfb\b/.test(lower)) {
    return sportByKey(LOUNGE_SPORTS_HUB_FILTER_CFB)
  }
  if (lower.includes('nfl')) return sportByKey(LOUNGE_SPORTS_HUB_FILTER_NFL)
  if (lower.includes('nba')) return sportByKey(LOUNGE_SPORTS_HUB_FILTER_NBA)
  if (lower.includes('mlb')) return sportByKey(LOUNGE_SPORTS_HUB_FILTER_MLB)
  if (lower.includes('nhl') || lower.includes('icehockey')) return sportByKey(LOUNGE_SPORTS_HUB_FILTER_NHL)
  if (lower.includes('pga') || lower.includes('golf')) return sportByKey(LOUNGE_SPORTS_HUB_FILTER_PGA)
  if (lower.includes('mls') || lower.includes('soccer_usa')) return sportByKey(LOUNGE_SPORTS_HUB_FILTER_MLS)
  const byLabel = SPORTS_BET_SPORTS.find((s) => s.label.toLowerCase() === labelRaw.toLowerCase())
  if (byLabel) return byLabel
  if (keyRaw) return { key: keyRaw, label: labelRaw || keyRaw.replace(/_/g, ' ') }
  if (labelRaw) return { key: 'other', label: labelRaw }
  return { key: '', label: '' }
}
