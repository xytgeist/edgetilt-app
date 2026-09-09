/**
 * Ops desk composer: sport first, then drop types that exist for that sport.
 */

export const OPS_SPORT_NFL = 'americanfootball_nfl'
export const OPS_SPORT_CFB = 'americanfootball_ncaaf'
export const OPS_SPORT_UFC = 'mma_mixed_martial_arts'

export const OPS_SPORTS = [
  { id: OPS_SPORT_NFL, label: 'NFL' },
  { id: OPS_SPORT_CFB, label: 'CFB' },
  { id: OPS_SPORT_UFC, label: 'UFC' },
]

/** @type {{ id: string, label: string, sports: string[], destKind: string | null, hint: string }[]} */
export const OPS_DROPS = [
  {
    id: 'today',
    label: 'Picks for today',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB, OPS_SPORT_UFC],
    destKind: 'today',
    hint: 'Full syndicate card for every game kicking today (PT). Gap-fill … not a replay of Thu tease / Fri lock crons.',
  },
  {
    id: 'slate',
    label: 'Slate card',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB],
    destKind: 'slate',
    hint: 'Scheduled / full-board slate card. Use Picks for today when you only want kickoffs on this PT day.',
  },
  {
    id: 'ufc_slate',
    label: 'UFC slate',
    sports: [OPS_SPORT_UFC],
    destKind: 'ufc',
    hint: 'Active UFC board / main card. Picks for today limits to fights kicking today (PT).',
  },
  {
    id: 'solo',
    label: 'Solo / spot',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB],
    destKind: 'solo',
    hint: 'One lean or multi-picker syndicate card from the live board.',
  },
  {
    id: 'primetime',
    label: 'Primetime',
    sports: [OPS_SPORT_NFL],
    destKind: 'primetime',
    hint: 'TNF / SNF / MNF spotlight (auto-picks the next eligible primetime game).',
  },
  {
    id: 'wong',
    label: 'Wong teaser',
    sports: [OPS_SPORT_NFL],
    destKind: 'wong',
    hint: '2-leg Wong teaser of the week from current NFL lines.',
  },
  {
    id: 'weekly',
    label: 'Weekly recap',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB],
    destKind: 'weekly',
    hint: 'Tuesday syndicate ledger / post-mortem from graded picks.',
  },
  {
    id: 'anytime',
    label: 'Anytime TD',
    sports: [OPS_SPORT_NFL],
    destKind: 'anytime',
    hint: "Chedda's plus-money TD of the week plus VIP 3-player slate.",
  },
  {
    id: 'halftime',
    label: 'Halftime pivot',
    sports: [OPS_SPORT_NFL],
    destKind: 'halftime',
    hint: 'Live NFL game at halftime. VIP-only unless you check Public Lounge or X.',
  },
  {
    id: 'middle',
    label: 'Middle & arb',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB],
    destKind: 'middle',
    hint: 'Live middle / arb alert. VIP-only unless you check Public Lounge or X.',
  },
  {
    id: 'monthly',
    label: 'Monthly board',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB, OPS_SPORT_UFC],
    destKind: null,
    hint: 'Ops-only ATS + CLV scoreboard. Does not publish. Send to is ignored.',
  },
]

export function sportLabel(sportKey) {
  return OPS_SPORTS.find((s) => s.id === sportKey)?.label || sportKey
}

export function dropsForSport(sportKey) {
  return OPS_DROPS.filter((d) => d.sports.includes(sportKey))
}

export function dropById(dropId) {
  return OPS_DROPS.find((d) => d.id === dropId) || null
}

/**
 * Dest defaults for the Send to bar. Picks for today uses slate dest on football
 * (public + fan-only + VIP) and UFC dest on MMA (VIP-only).
 */
export function destKindForDrop(dropId, sportKey) {
  if (dropId === 'today') {
    return sportKey === OPS_SPORT_UFC ? 'ufc' : 'slate'
  }
  return dropById(dropId)?.destKind || null
}

export function firstDropIdForSport(sportKey) {
  return dropsForSport(sportKey)[0]?.id || 'today'
}
