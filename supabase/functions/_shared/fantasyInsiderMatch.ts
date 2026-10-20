/**
 * Match an insider post to NFL players by full name (punctuation / suffix agnostic: "D.K. Metcalf" = "DK Metcalf",
 * "Kenneth Walker III" = "Kenneth Walker"). Two players with the same name are told apart by a team nickname in the
 * post or the beat writer's team; still ambiguous → dropped.
 */

export type InsiderPlayer = { sleeper_id: string; full_name: string; position: string; team: string | null }
export type PlayerIndex = { byName: Map<string, InsiderPlayer[]>; names: string[] }

const TEAM_NICKNAMES: Record<string, string[]> = {
  ARI: ['cardinals'], ATL: ['falcons'], BAL: ['ravens'], BUF: ['bills'], CAR: ['panthers'], CHI: ['bears'],
  CIN: ['bengals'], CLE: ['browns'], DAL: ['cowboys'], DEN: ['broncos'], DET: ['lions'], GB: ['packers'],
  HOU: ['texans'], IND: ['colts'], JAX: ['jaguars', 'jags'], KC: ['chiefs'], LV: ['raiders'], LAC: ['chargers'],
  LAR: ['rams'], MIA: ['dolphins'], MIN: ['vikings'], NE: ['patriots', 'pats'], NO: ['saints'], NYG: ['giants'],
  NYJ: ['jets'], PHI: ['eagles'], PIT: ['steelers'], SF: ['49ers', 'niners'], SEA: ['seahawks'], TB: ['buccaneers', 'bucs'],
  TEN: ['titans'], WAS: ['commanders'],
}

export function normName(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildPlayerIndex(players: InsiderPlayer[]): PlayerIndex {
  const byName = new Map<string, InsiderPlayer[]>()
  for (const p of players) {
    const key = normName(p.full_name)
    if (!key || !key.includes(' ')) continue
    const list = byName.get(key) || []
    list.push(p)
    byName.set(key, list)
  }
  // Longest first so "amon ra st brown" claims its span before a shorter overlapping name could.
  const names = [...byName.keys()].sort((a, b) => b.length - a.length)
  return { byName, names }
}

function teamsMentioned(text: string): Set<string> {
  const out = new Set<string>()
  for (const [abbrev, words] of Object.entries(TEAM_NICKNAMES)) {
    if (words.some((w) => text.includes(` ${w} `))) out.add(abbrev)
  }
  return out
}

/** Sleeper ids of the players this post is about, in the order they appear. */
export function matchPlayers(rawText: string, index: PlayerIndex, beatTeam: string | null = null): string[] {
  let text = ` ${normName(rawText)} `
  const teams = teamsMentioned(text)
  const hits: Array<{ at: number; id: string }> = []
  for (const name of index.names) {
    const at = text.indexOf(` ${name} `)
    if (at < 0) continue
    const list = index.byName.get(name) || []
    let pick: InsiderPlayer | null = null
    if (list.length === 1) pick = list[0]
    else {
      const byTeam = list.filter((p) => p.team && (teams.has(p.team) || p.team === beatTeam))
      if (byTeam.length === 1) pick = byTeam[0]
    }
    // Blank the span so a shorter name inside it ("ra st brown") cannot match again.
    text = text.slice(0, at + 1) + ' '.repeat(name.length) + text.slice(at + 1 + name.length)
    if (pick) hits.push({ at, id: pick.sleeper_id })
  }
  hits.sort((a, b) => a.at - b.at)
  return [...new Set(hits.map((h) => h.id))]
}
