/** NFL aliases + notable names so captions like "Jayden Daniels" still hit today's game. */

export const NFL_TEAM_CATALOG = [
  { abbrev: 'ARI', espn: 'ari', names: ['Arizona Cardinals', 'Cardinals'], players: ['Kyler Murray', 'Marvin Harrison'] },
  { abbrev: 'ATL', espn: 'atl', names: ['Atlanta Falcons', 'Falcons'], players: ['Michael Penix', 'Bijan Robinson', 'Drake London'] },
  { abbrev: 'BAL', espn: 'bal', names: ['Baltimore Ravens', 'Ravens'], players: ['Lamar Jackson', 'Derrick Henry', 'Zay Flowers'] },
  { abbrev: 'BUF', espn: 'buf', names: ['Buffalo Bills', 'Bills'], players: ['Josh Allen', 'Khalil Shakir', 'James Cook'] },
  { abbrev: 'CAR', espn: 'car', names: ['Carolina Panthers', 'Panthers'], players: ['Bryce Young', 'Tetairoa McMillan'] },
  { abbrev: 'CHI', espn: 'chi', names: ['Chicago Bears', 'Bears'], players: ['Caleb Williams', 'Rome Odunze', 'DJ Moore'] },
  { abbrev: 'CIN', espn: 'cin', names: ['Cincinnati Bengals', 'Bengals'], players: ['Joe Burrow', 'Ja\'Marr Chase', 'Jamarr Chase', 'Tee Higgins'] },
  { abbrev: 'CLE', espn: 'cle', names: ['Cleveland Browns', 'Browns'], players: ['Dillon Gabriel', 'Shedeur Sanders', 'Myles Garrett'] },
  { abbrev: 'DAL', espn: 'dal', names: ['Dallas Cowboys', 'Cowboys'], players: ['Dak Prescott', 'CeeDee Lamb', 'CeDee Lamb', 'George Pickens', 'Micah Parsons'] },
  { abbrev: 'DEN', espn: 'den', names: ['Denver Broncos', 'Broncos'], players: ['Bo Nix', 'Courtland Sutton'] },
  { abbrev: 'DET', espn: 'det', names: ['Detroit Lions', 'Lions'], players: ['Jared Goff', 'Amon-Ra St. Brown', 'Jahmyr Gibbs', 'Sam LaPorta'] },
  { abbrev: 'GB', espn: 'gb', names: ['Green Bay Packers', 'Packers'], players: ['Jordan Love', 'Jayden Reed', 'Josh Jacobs'] },
  { abbrev: 'HOU', espn: 'hou', names: ['Houston Texans', 'Texans'], players: ['C.J. Stroud', 'CJ Stroud', 'Nico Collins', 'Joe Mixon'] },
  { abbrev: 'IND', espn: 'ind', names: ['Indianapolis Colts', 'Colts'], players: ['Anthony Richardson', 'Daniel Jones', 'Jonathan Taylor'] },
  { abbrev: 'JAX', espn: 'jax', names: ['Jacksonville Jaguars', 'Jaguars', 'Jags'], players: ['Trevor Lawrence', 'Brian Thomas'] },
  { abbrev: 'KC', espn: 'kc', names: ['Kansas City Chiefs', 'Chiefs'], players: ['Patrick Mahomes', 'Travis Kelce', 'Xavier Worthy'] },
  { abbrev: 'LAC', espn: 'lac', names: ['Los Angeles Chargers', 'LA Chargers', 'Chargers'], players: ['Justin Herbert', 'Ladd McConkey'] },
  { abbrev: 'LAR', espn: 'lar', names: ['Los Angeles Rams', 'LA Rams', 'Rams'], players: ['Matthew Stafford', 'Puka Nacua', 'Davante Adams'] },
  { abbrev: 'LV', espn: 'lv', names: ['Las Vegas Raiders', 'Raiders'], players: ['Geno Smith', 'Brock Bowers', 'Ashton Jeanty'] },
  { abbrev: 'MIA', espn: 'mia', names: ['Miami Dolphins', 'Dolphins'], players: ['Tua Tagovailoa', 'Tyreek Hill', 'Jaylen Waddle'] },
  { abbrev: 'MIN', espn: 'min', names: ['Minnesota Vikings', 'Vikings'], players: ['J.J. McCarthy', 'JJ McCarthy', 'Justin Jefferson', 'Jordan Addison'] },
  { abbrev: 'NE', espn: 'ne', names: ['New England Patriots', 'Patriots', 'Pats'], players: ['Drake Maye'] },
  { abbrev: 'NO', espn: 'no', names: ['New Orleans Saints', 'Saints'], players: ['Tyler Shough', 'Alvin Kamara', 'Chris Olave'] },
  { abbrev: 'NYG', espn: 'nyg', names: ['New York Giants', 'NY Giants', 'Giants'], players: ['Russell Wilson', 'Jaxson Dart', 'Malik Nabers'] },
  { abbrev: 'NYJ', espn: 'nyj', names: ['New York Jets', 'NY Jets', 'Jets'], players: ['Justin Fields', 'Garrett Wilson', 'Sauce Gardner'] },
  { abbrev: 'PHI', espn: 'phi', names: ['Philadelphia Eagles', 'Eagles'], players: ['Jalen Hurts', 'A.J. Brown', 'AJ Brown', 'DeVonta Smith', 'Saquon Barkley'] },
  { abbrev: 'PIT', espn: 'pit', names: ['Pittsburgh Steelers', 'Steelers'], players: ['Aaron Rodgers', 'DK Metcalf', 'T.J. Watt', 'TJ Watt'] },
  { abbrev: 'SF', espn: 'sf', names: ['San Francisco 49ers', '49ers', 'Niners'], players: ['Brock Purdy', 'Christian McCaffrey', 'George Kittle'] },
  { abbrev: 'SEA', espn: 'sea', names: ['Seattle Seahawks', 'Seahawks'], players: ['Sam Darnold', 'Jaxon Smith-Njigba', 'Kenneth Walker'] },
  { abbrev: 'TB', espn: 'tb', names: ['Tampa Bay Buccaneers', 'Buccaneers', 'Bucs'], players: ['Baker Mayfield', 'Mike Evans', 'Bucky Irving'] },
  { abbrev: 'TEN', espn: 'ten', names: ['Tennessee Titans', 'Titans'], players: ['Cam Ward', 'Calvin Ridley'] },
  { abbrev: 'WAS', espn: 'wsh', names: ['Washington Commanders', 'Commanders', 'Washington'], players: ['Jayden Daniels', 'Terry McLaurin', 'Brian Robinson', 'Deebo Samuel'] },
]

const CATALOG_BY_ABBREV = new Map(NFL_TEAM_CATALOG.map((row) => [row.abbrev, row]))

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
  const abbrev = String(side?.abbrev || '').trim().toUpperCase()
  if (CATALOG_BY_ABBREV.has(abbrev)) return CATALOG_BY_ABBREV.get(abbrev)
  const hay = norm(`${side?.name || ''} ${side?.mascot || ''}`)
  return NFL_TEAM_CATALOG.find((row) => row.names.some((n) => hay.includes(norm(n)))) || null
}

export function enrichLoungeSportsGame(game) {
  if (!game) return game
  const sportKey = String(game.sport_key || '')
  const patchSide = (side) => {
    const row = catalogRowForSide(side, sportKey)
    if (!row) return side
    const logo = side?.logo && !/\/ncaa\/500\/[a-z]{2,4}\.png/i.test(side.logo)
      ? side.logo
      : `https://a.espncdn.com/i/teamlogos/nfl/500/${row.espn}.png`
    return {
      ...side,
      abbrev: row.abbrev,
      logo,
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
  return haystack.includes(p)
}

function hasAbbrev(original, abbrev) {
  const a = String(abbrev || '').trim()
  if (a.length < 2 || a.length > 4) return false
  const re = new RegExp(`(?:^|[^A-Za-z])${escapeRe(a)}(?:[^A-Za-z]|$)`)
  return re.test(original)
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
  if (hasAbbrev(original, side?.abbrev) || (row && hasAbbrev(original, row.abbrev))) score += 3
  return score
}

/**
 * Pick the live/recent game a Lounge caption is talking about.
 * Prefers both teams, then a unique player/mascot hit.
 */
export function matchLoungePostToSportsGame(caption, games) {
  const original = String(caption || '')
  const haystack = norm(original)
  if (haystack.length < 3 || !Array.isArray(games) || !games.length) return null

  const ranked = []
  for (const game of games) {
    const home = sideHits(original, haystack, game.home, game.sport_key)
    const away = sideHits(original, haystack, game.away, game.sport_key)
    let score = home + away
    if (home && away) score += 8
    if (score < 4) continue
    ranked.push({ game, score, both: home > 0 && away > 0 })
  }
  if (!ranked.length) return null
  ranked.sort((a, b) => {
    if (a.both !== b.both) return a.both ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    const rank = { in: 0, post: 1, pre: 2 }
    return (rank[a.game.status] ?? 3) - (rank[b.game.status] ?? 3)
  })
  const top = ranked[0]
  const twin = ranked[1]
  if (twin && !top.both && twin.score === top.score) return null
  return top.game
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
