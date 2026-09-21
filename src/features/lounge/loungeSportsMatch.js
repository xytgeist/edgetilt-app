import { pickAmbiguousTeamGame, pickSpecificMatchupGame, sideAbbrev, gameHasTeam } from './loungeSportsSlateWindow.js'

/** NFL aliases + notable names so captions like "Jayden Daniels" still hit today's game. */
export const NFL_TEAM_CATALOG = [
  { abbrev: 'ARI', espn: 'ari', color: '#97233F', color2: '#000000', names: ['Arizona Cardinals', 'Cardinals'], players: ['Kyler Murray', 'Marvin Harrison'] },
  { abbrev: 'ATL', espn: 'atl', color: '#A71930', color2: '#000000', names: ['Atlanta Falcons', 'Falcons'], players: ['Michael Penix', 'Bijan Robinson', 'Drake London'] },
  { abbrev: 'BAL', espn: 'bal', color: '#241773', color2: '#9E7C0C', names: ['Baltimore Ravens', 'Ravens'], players: ['Lamar Jackson', 'Derrick Henry', 'Zay Flowers'] },
  { abbrev: 'BUF', espn: 'buf', color: '#00338D', color2: '#C60C30', names: ['Buffalo Bills', 'Bills'], players: ['Josh Allen', 'Khalil Shakir', 'James Cook'] },
  { abbrev: 'CAR', espn: 'car', color: '#0085CA', color2: '#000000', names: ['Carolina Panthers', 'Panthers'], players: ['Bryce Young', 'Tetairoa McMillan'] },
  { abbrev: 'CHI', espn: 'chi', color: '#0B162A', color2: '#E64100', names: ['Chicago Bears', 'Bears'], players: ['Caleb Williams', 'Rome Odunze', 'DJ Moore'] },
  { abbrev: 'CIN', espn: 'cin', color: '#FB4F14', color2: '#000000', names: ['Cincinnati Bengals', 'Bengals'], players: ['Joe Burrow', 'Ja\'Marr Chase', 'Jamarr Chase', 'Tee Higgins'] },
  { abbrev: 'CLE', espn: 'cle', color: '#FF3C00', color2: '#311D00', names: ['Cleveland Browns', 'Browns'], players: ['Dillon Gabriel', 'Shedeur Sanders', 'Myles Garrett'] },
  { abbrev: 'DAL', espn: 'dal', color: '#002244', color2: '#B0B7BC', names: ['Dallas Cowboys', 'Cowboys'], players: ['Dak Prescott', 'CeeDee Lamb', 'CeDee Lamb', 'George Pickens', 'Micah Parsons'] },
  { abbrev: 'DEN', espn: 'den', color: '#002244', color2: '#FB4F14', names: ['Denver Broncos', 'Broncos'], players: ['Bo Nix', 'Courtland Sutton'] },
  { abbrev: 'DET', espn: 'det', color: '#0076B6', color2: '#B0B7BC', names: ['Detroit Lions', 'Lions'], players: ['Jared Goff', 'Amon-Ra St. Brown', 'Jahmyr Gibbs', 'Sam LaPorta'] },
  { abbrev: 'GB', espn: 'gb', color: '#203731', color2: '#FFB612', names: ['Green Bay Packers', 'Packers'], players: ['Jordan Love', 'Jayden Reed', 'Josh Jacobs'] },
  { abbrev: 'HOU', espn: 'hou', color: '#03202F', color2: '#A71930', names: ['Houston Texans', 'Texans'], players: ['C.J. Stroud', 'CJ Stroud', 'Nico Collins', 'Joe Mixon'] },
  { abbrev: 'IND', espn: 'ind', color: '#002C5F', color2: '#A5ACAF', names: ['Indianapolis Colts', 'Colts', 'Indy'], players: ['Anthony Richardson', 'Daniel Jones', 'Jonathan Taylor'] },
  { abbrev: 'JAX', espn: 'jax', color: '#006778', color2: '#000000', names: ['Jacksonville Jaguars', 'Jaguars', 'Jags'], players: ['Trevor Lawrence', 'Brian Thomas'] },
  { abbrev: 'KC', espn: 'kc', color: '#E31837', color2: '#FFB612', names: ['Kansas City Chiefs', 'Chiefs'], players: ['Patrick Mahomes', 'Travis Kelce', 'Xavier Worthy'] },
  { abbrev: 'LAC', espn: 'lac', color: '#007BC7', color2: '#FFC20E', names: ['Los Angeles Chargers', 'LA Chargers', 'Chargers'], players: ['Justin Herbert', 'Ladd McConkey'] },
  { abbrev: 'LAR', espn: 'lar', color: '#003594', color2: '#FFD100', names: ['Los Angeles Rams', 'LA Rams', 'Rams'], players: ['Matthew Stafford', 'Puka Nacua', 'Davante Adams'] },
  { abbrev: 'LV', espn: 'lv', color: '#000000', color2: '#A5ACAF', names: ['Las Vegas Raiders', 'Raiders'], players: ['Geno Smith', 'Brock Bowers', 'Ashton Jeanty'] },
  { abbrev: 'MIA', espn: 'mia', color: '#008E97', color2: '#F58220', names: ['Miami Dolphins', 'Dolphins'], players: ['Tua Tagovailoa', 'Tyreek Hill', 'Jaylen Waddle'] },
  { abbrev: 'MIN', espn: 'min', color: '#4F2683', color2: '#FFC62F', names: ['Minnesota Vikings', 'Vikings'], players: ['J.J. McCarthy', 'JJ McCarthy', 'Justin Jefferson', 'Jordan Addison'] },
  { abbrev: 'NE', espn: 'ne', color: '#002244', color2: '#C60C30', names: ['New England Patriots', 'Patriots', 'Pats'], players: ['Drake Maye'] },
  { abbrev: 'NO', espn: 'no', color: '#D3BC8D', color2: '#000000', names: ['New Orleans Saints', 'Saints'], players: ['Tyler Shough', 'Alvin Kamara', 'Chris Olave'] },
  { abbrev: 'NYG', espn: 'nyg', color: '#0B2265', color2: '#A71930', names: ['New York Giants', 'NY Giants', 'Giants'], players: ['Russell Wilson', 'Jaxson Dart', 'Malik Nabers'] },
  { abbrev: 'NYJ', espn: 'nyj', color: '#003F2D', color2: '#000000', names: ['New York Jets', 'NY Jets', 'Jets'], players: ['Justin Fields', 'Garrett Wilson', 'Sauce Gardner'] },
  { abbrev: 'PHI', espn: 'phi', color: '#004C54', color2: '#A5ACAF', names: ['Philadelphia Eagles', 'Eagles'], players: ['Jalen Hurts', 'A.J. Brown', 'AJ Brown', 'DeVonta Smith', 'Saquon Barkley'] },
  { abbrev: 'PIT', espn: 'pit', color: '#000000', color2: '#FFB612', names: ['Pittsburgh Steelers', 'Steelers'], players: ['Aaron Rodgers', 'DK Metcalf', 'T.J. Watt', 'TJ Watt'] },
  { abbrev: 'SF', espn: 'sf', color: '#AA0000', color2: '#B3995D', names: ['San Francisco 49ers', '49ers', 'Niners'], players: ['Brock Purdy', 'Christian McCaffrey', 'George Kittle'] },
  { abbrev: 'SEA', espn: 'sea', color: '#002244', color2: '#69BE28', names: ['Seattle Seahawks', 'Seahawks'], players: ['Sam Darnold', 'Jaxon Smith-Njigba', 'Kenneth Walker'] },
  { abbrev: 'TB', espn: 'tb', color: '#A71930', color2: '#322F2B', names: ['Tampa Bay Buccaneers', 'Buccaneers', 'Bucs'], players: ['Baker Mayfield', 'Mike Evans', 'Bucky Irving'] },
  { abbrev: 'TEN', espn: 'ten', color: '#4495D1', color2: '#0C2340', names: ['Tennessee Titans', 'Titans'], players: ['Cam Ward', 'Calvin Ridley'] },
  { abbrev: 'WAS', espn: 'wsh', color: '#5A1414', color2: '#FFB612', names: ['Washington Commanders', 'Commanders', 'Washington', 'Washington Football Team', 'Redskins'], players: ['Jayden Daniels', 'Jayden Daniel', 'Terry McLaurin', 'Brian Robinson', 'Deebo Samuel'] },
]

const CATALOG_BY_ABBREV = new Map()
for (const row of NFL_TEAM_CATALOG) {
  CATALOG_BY_ABBREV.set(row.abbrev, row)
  const espn = String(row.espn || '').trim().toUpperCase()
  if (espn) CATALOG_BY_ABBREV.set(espn, row)
}
CATALOG_BY_ABBREV.set('JAC', CATALOG_BY_ABBREV.get('JAX'))
CATALOG_BY_ABBREV.set('WSH', CATALOG_BY_ABBREV.get('WAS'))

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function catalogRowForSide(side, sportKey) {
  if (!String(sportKey || '').includes('nfl')) return null
  const hay = ` ${norm(`${side?.name || ''} ${side?.mascot || ''}`)} `
  const byName = NFL_TEAM_CATALOG.find((row) =>
    row.names.some((n) => {
      const p = norm(n)
      return p.length >= 4 && hay.includes(` ${p} `)
    }),
  )
  if (byName) return byName
  const abbrev = String(side?.abbrev || '').trim().toUpperCase()
  if (abbrev.length >= 2 && CATALOG_BY_ABBREV.has(abbrev)) return CATALOG_BY_ABBREV.get(abbrev)
  return null
}

function hexToRgb(hex) {
  const n = String(hex || '').replace('#', '')
  if (n.length !== 6) return null
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  return { r, g, b }
}

function hexLuminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const lin = (c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

function mixHex(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  if (!A || !B) return a
  const m = (x, y) => Math.round(x + (y - x) * t)
  return `#${[m(A.r, B.r), m(A.g, B.g), m(A.b, B.b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Team primary for the pill fade. Near-black only (Raiders / Steelers) gets a slight lift so multiply-blend still stains. Mixing in color2 turned Giants navy purple and Rams blue muddy gold. */
export function nflPillWash(primary, _secondary) {
  const p = String(primary || '#3f3f46')
  if (hexLuminance(p) < 0.01) return mixHex(p, '#ffffff', 0.22)
  return p
}

export function enrichLoungeSportsGame(game) {
  if (!game) return game
  const sportKey = String(game.sport_key || '')
  const patchSide = (side) => {
    const row = catalogRowForSide(side, sportKey)
    if (!row) return side
    return {
      ...side,
      abbrev: row.abbrev,
      logo: `/sports/nfl/logos/${row.abbrev}.png`,
      color: row.color,
      color2: row.color2,
    }
  }
  const home = patchSide(game.home)
  const away = patchSide(game.away)
  const extra = []
  for (const side of [home, away]) {
    const row = catalogRowForSide(side, sportKey)
    if (!row) continue
    extra.push(...row.names, ...row.players, row.abbrev)
  }
  return {
    ...game,
    home,
    away,
    aliases: [...new Set([...(game.aliases || []), ...extra])],
  }
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasPhrase(haystack, phrase) {
  const p = norm(phrase)
  if (p.length < 3) return false
  return new RegExp(`(?:^| )${escapeRe(p)}(?: |$)`).test(haystack)
}

function hasAbbrev(original, abbrev) {
  const a = String(abbrev || '').trim().toUpperCase()
  if (a.length < 2 || a.length > 4) return false
  const re = new RegExp(`(?:^|[^A-Za-z])${escapeRe(a)}(?:[^A-Za-z]|$)`)
  return re.test(original)
}

function canonicalAbbrev(token) {
  const t = String(token || '').trim().toUpperCase()
  return CATALOG_BY_ABBREV.get(t)?.abbrev || t
}

function versusAbbrevs(original) {
  const m = String(original || '').match(/\b([A-Z]{2,4})\s+(?:vs\.?|@|v)\s+([A-Z]{2,4})\b/)
  if (!m) return null
  const a = canonicalAbbrev(m[1])
  const b = canonicalAbbrev(m[2])
  if (!CATALOG_BY_ABBREV.has(a) || !CATALOG_BY_ABBREV.has(b) || a === b) return null
  return [a, b]
}

function sideHits(original, haystack, side, sportKey) {
  let score = 0
  const row = catalogRowForSide(side, sportKey)
  const phrases = [
    side?.name,
    side?.mascot,
    ...(row?.names || []),
    ...(row?.players || []),
  ]
  for (const phrase of phrases) {
    if (!hasPhrase(haystack, phrase)) continue
    const words = norm(phrase).split(' ').filter(Boolean)
    score += words.length >= 2 ? 6 : norm(phrase).length >= 5 ? 4 : 2
  }
  const codes = [side?.abbrev, row?.abbrev, row?.espn]
  if (codes.some((c) => hasAbbrev(original, c))) score += 3
  return score
}

function mentionedNflAbbrevs(original, haystack) {
  const out = []
  for (const row of NFL_TEAM_CATALOG) {
    const nameHit = row.names.some((n) => hasPhrase(haystack, n))
    const playerHit = row.players.some((n) => hasPhrase(haystack, n))
    const codeHit = hasAbbrev(original, row.abbrev) || hasAbbrev(original, row.espn)
    if (nameHit || playerHit || codeHit) out.push(row.abbrev)
  }
  return [...new Set(out)]
}

/**
 * Caption → game. Named matchups pin that game (recent or upcoming).
 * Vague one-team lines use live / most recent until MNF is final, then the next game.
 */
export function matchLoungePostToSportsGame(caption, games) {
  const original = String(caption || '')
  const haystack = norm(original)
  if (haystack.length < 3 || !Array.isArray(games) || !games.length) return null

  const pair = versusAbbrevs(original)
  const mentioned = mentionedNflAbbrevs(original, haystack)
  const teams = pair || mentioned

  if (teams.length >= 2) {
    const [a, b] = pair || mentioned
    const candidates = games.filter((game) => gameHasTeam(game, a) && gameHasTeam(game, b))
    const hit = pickSpecificMatchupGame(candidates, games)
    if (hit) return hit
    const live = teams.map((abbrev) => pickAmbiguousTeamGame(abbrev, games)).find((g) => g?.status === 'in')
    if (live) return live
    const recent = teams.map((abbrev) => pickAmbiguousTeamGame(abbrev, games)).find(Boolean)
    if (recent) return recent
  }

  if (teams.length === 1) {
    return pickAmbiguousTeamGame(teams[0], games)
  }

  const ranked = []
  for (const game of games) {
    const home = sideHits(original, haystack, game.home, game.sport_key)
    const away = sideHits(original, haystack, game.away, game.sport_key)
    let score = home + away
    const both = home > 0 && away > 0
    if (both) score += 8
    if (score < 4) continue
    ranked.push({ game, score, both, home, away })
  }
  if (!ranked.length) return null
  const specific = ranked.filter((r) => r.both).map((r) => r.game)
  if (specific.length) return pickSpecificMatchupGame(specific, games)
  const teamHits = new Set()
  for (const row of ranked) {
    if (row.home) teamHits.add(sideAbbrev(row.game.home))
    if (row.away) teamHits.add(sideAbbrev(row.game.away))
  }
  if (teamHits.size === 1) return pickAmbiguousTeamGame([...teamHits][0], games)
  ranked.sort((a, b) => b.score - a.score)
  return ranked[0]?.game || null
}

export function loungeSportsMatchTextFromPost(post) {
  const parts = [
    post?.caption,
    post?.game_title,
    post?.reposted_post?.caption,
    post?.reposted_comment?.body,
  ]
  return parts.filter(Boolean).join('\n')
}
