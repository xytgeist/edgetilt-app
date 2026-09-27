/**
 * Match a venue's team (code + display name) to one side of our game. Used for CFB markets where
 * Kalshi / Polymarket codes don't line up with ESPN abbrevs (SCAR vs SC, PSU vs PSU is luck).
 */

export type MarketSideHint = { abbrev: string; names: string[] }

export function foldTeamName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bst\b/g, 'state')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 3 = same code, 2 = same full name, 1 = venue name is a word-prefix of ours ("Penn State" of
 * "Penn State Nittany Lions"). 0 = no match. Callers require both sides > 0 and take the best total.
 */
export function scoreMarketSide(code: string, name: string, side: MarketSideHint): number {
  const c = String(code || '').trim().toUpperCase()
  if (c && side.abbrev && c === side.abbrev.toUpperCase()) return 3
  const n = foldTeamName(name)
  if (!n) return 0
  let best = 0
  for (const raw of side.names) {
    const ours = foldTeamName(raw)
    if (!ours) continue
    if (ours === n) return 2
    if (ours.startsWith(`${n} `)) best = 1
  }
  return best
}

/**
 * Best orientation for a two-team venue event. `score` is 0 when either side fails to match;
 * `codeToAbbrev` maps the venue's team codes to our ESPN abbrevs for stamping `team_hint`.
 */
export function matchMarketPair(
  venue: Array<{ code: string; name: string }>,
  away: MarketSideHint,
  home: MarketSideHint,
): { score: number; codeToAbbrev: Record<string, string> } {
  if (venue.length !== 2) return { score: 0, codeToAbbrev: {} }
  const [a, b] = venue
  const straight = [scoreMarketSide(a.code, a.name, away), scoreMarketSide(b.code, b.name, home)]
  const swapped = [scoreMarketSide(a.code, a.name, home), scoreMarketSide(b.code, b.name, away)]
  const s = Math.min(...straight) > 0 ? straight[0] + straight[1] : 0
  const w = Math.min(...swapped) > 0 ? swapped[0] + swapped[1] : 0
  if (!s && !w) return { score: 0, codeToAbbrev: {} }
  const [forA, forB] = s >= w ? [away, home] : [home, away]
  const codeToAbbrev: Record<string, string> = {}
  if (a.code) codeToAbbrev[a.code.toUpperCase()] = forA.abbrev
  if (b.code) codeToAbbrev[b.code.toUpperCase()] = forB.abbrev
  return { score: Math.max(s, w), codeToAbbrev }
}

/** Kickoff calendar date in US Eastern as { y, m (1-12), d }, which both venues stamp on events. */
export function easternDateParts(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(t))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || NaN)
  const y = get('year')
  const m = get('month')
  const d = get('day')
  return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? { y, m, d } : null
}
