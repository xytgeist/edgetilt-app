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

/** @type {{ id: string, label: string, sports: string[], destKind: string | null, hint: string, info: string }[]} */
export const OPS_DROPS = [
  {
    id: 'today',
    label: 'Picks for today',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB, OPS_SPORT_UFC],
    destKind: 'today',
    hint: 'Full syndicate card for every game kicking today (PT). Gap-fill … not a replay of Thu tease / Fri lock crons.',
    info: 'Full 4-desk vote on every game kicking today (Pacific time). Hammers, consensus, house divided, Tank totals. Use this to fill gaps after cron already posted the Thu tease or Fri lock. It is not a replay of those scheduled packages. Football also writes the fan-only Lounge card + VIP chat unless you change Send to.',
  },
  {
    id: 'slate',
    label: 'Slate card',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB],
    destKind: 'slate',
    hint: 'Scheduled / full-board slate card. Use Picks for today when you only want kickoffs on this PT day.',
    info: 'The scheduled / full-board shop card for the sport (week or lock window), not limited to games kicking today. Same 4-desk layout as Picks for today. Pick today when you only want this PT calendar day.',
  },
  {
    id: 'ufc_slate',
    label: 'UFC slate',
    sports: [OPS_SPORT_UFC],
    destKind: 'ufc',
    hint: 'Active UFC board / main card. Picks for today limits to fights kicking today (PT).',
    info: 'Active UFC board / main card, not limited to fights kicking today. Defaults to VIP chat. Check Public Lounge or X if you want the tease out too. Use Picks for today when you only want tonight\'s card.',
  },
  {
    id: 'solo',
    label: 'Solo / spot',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB],
    destKind: 'solo',
    hint: 'One lean or a short multi-desk snack from leftover +EV. Not the full today/slate card.',
    info: 'Opportunistic +EV hunter, not a full slate. Scans the live board and posts either one desk lean or a short 2-4 pick snack (Chedda dog, Tank total, Rocco spread, Scott leftover). Auto builds the snack when the board is thick, otherwise one pick. Solo lock forces one desk. Syndicate card forces the snack. Public Lounge only unless you change Send to. Use Picks for today or Slate when you want every game voted.',
  },
  {
    id: 'primetime',
    label: 'Primetime',
    sports: [OPS_SPORT_NFL],
    destKind: 'primetime',
    hint: 'TNF / SNF / MNF 4-desk spotlight on public Lounge, VIP chat, and X.',
    info: 'One-game TNF / SNF / MNF spotlight. Auto-picks the next eligible primetime matchup. Public Lounge, VIP chat, and X get the same 4-desk card. No fan-only Lounge post. Wednesday TNF VIP is a separate early room drop. Inactives lock is the Primetime lock drop.',
  },
  {
    id: 'primetime_lock',
    label: 'Primetime lock',
    sports: [OPS_SPORT_NFL],
    destKind: 'primetime',
    hint: '90-min inactives lock. Confirm the lean or kill (pass) if a listed starter is out or the number walked.',
    info: 'Second primetime drop, ~90 minutes before kick. Reads the lean already on the ledger. Locks the same side if inactives and the number are clean. Kills (pass, not a new pick) if a listed starter (QB / LT / edge / featured RB) is out on our side, or the number walked 1.5+ pts off the edge. Same public Lounge + VIP chat + X destinations as Primetime. Cron waits for the 70-110 min window; Preview / Publish can run anytime.',
  },
  {
    id: 'wong',
    label: 'Wong teaser',
    sports: [OPS_SPORT_NFL],
    destKind: 'wong',
    hint: '2-leg Wong teaser of the week from current NFL lines.',
    info: 'Builds a 2-leg Wong teaser from current NFL lines (key-number buys). One teaser card, not a full slate.',
  },
  {
    id: 'weekly',
    label: 'Weekly recap',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB],
    destKind: 'weekly',
    hint: 'Tuesday syndicate ledger / post-mortem from graded picks.',
    info: 'Tuesday ledger / post-mortem from graded picks over the last week. Record, CLV, what hit and what missed. Not a new card of upcoming games.',
  },
  {
    id: 'anytime',
    label: 'Anytime TD',
    sports: [OPS_SPORT_NFL],
    destKind: 'anytime',
    hint: "Chedda's plus-money TD of the week plus VIP 3-player slate.",
    info: "Chedda's plus-money anytime TD of the week on the public feed, plus an uncut 3-player TD slate in VIP. NFL player-prop board only.",
  },
  {
    id: 'halftime',
    label: 'Halftime pivot',
    sports: [OPS_SPORT_NFL],
    destKind: 'halftime',
    hint: 'Live NFL game at halftime. VIP-only unless you check Public Lounge or X.',
    info: 'Looks at a live NFL game sitting at halftime and posts a 2nd-half pivot when yardage / scoreboard / pace say so. VIP-only unless you check Public Lounge or X.',
  },
  {
    id: 'middle',
    label: 'Middle & arb',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB],
    destKind: 'middle',
    hint: 'Live middle / arb alert. VIP-only unless you check Public Lounge or X.',
    info: 'Scans live books against pending syndicate positions for a middle window or a cross-book arb. Alert only … not a new full card. VIP-only unless you check Public Lounge or X.',
  },
  {
    id: 'monthly',
    label: 'Monthly board',
    sports: [OPS_SPORT_NFL, OPS_SPORT_CFB, OPS_SPORT_UFC],
    destKind: null,
    hint: 'Ops-only ATS + CLV scoreboard. Does not publish. Send to is ignored.',
    info: 'Ops-only ATS + CLV scoreboard by bucket × desk. Does not publish anywhere. Send to is ignored. This month or last 3 months.',
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
