import { pickAmbiguousTeamGame, pickSpecificMatchupGame, gameHasTeam, sideAbbrev } from './loungeSportsSlateWindow.js'
import { LOUNGE_SPORTS_GAME_PIN_MAX } from './loungeSportsGameField.js'
import { CFB_TEAM_CATALOG } from './cfbTeamCatalog.generated.js'

export { CFB_TEAM_CATALOG }

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
  { abbrev: 'DEN', espn: 'den', color: '#FB4F14', color2: '#002244', names: ['Denver Broncos', 'Broncos'], players: ['Bo Nix', 'Courtland Sutton'] },
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

const CFB_BY_ABBREV = new Map()
const CFB_BY_ESPN_ID = new Map()
for (const row of CFB_TEAM_CATALOG) {
  CFB_BY_ABBREV.set(String(row.abbrev || '').toUpperCase(), row)
  const espnId = String(row.espn || '').trim()
  if (espnId) CFB_BY_ESPN_ID.set(espnId, row)
}

/** Rundown / Odds / ESPN letter-codes that are not catalog keys. */
const CFB_ABBREV_ALIASES = {
  WSH: 'WASH',
  WAS: 'WASH',
  TAMU: 'TAM',
  'TA&M': 'TAM',
  TEXAM: 'TAM',
  SMISS: 'USM',
  SOMISS: 'USM',
  SOUMISS: 'USM',
  MIOH: 'M-OH',
  MIAOH: 'M-OH',
  'MIAMI-OH': 'M-OH',
  MIAOHIO: 'M-OH',
  GA: 'UGA',
  UGA: 'UGA',
  MISSST: 'MSST',
  MISSSTATE: 'MSST',
  OKLA: 'OU',
  OKL: 'OU',
  PITT: 'PITT',
  PIT: 'PITT',
  NCSU: 'NCSU',
  NCST: 'NCSU',
  FSU: 'FSU',
  FLAST: 'FSU',
  MIAFL: 'MIA',
  HAWAII: 'HAW',
  HAW: 'HAW',
  SDSU: 'SDSU',
  SJSU: 'SJSU',
  WSU: 'WSU',
  WASHST: 'WSU',
  MSU: 'MSU',
  MICHST: 'MSU',
}

function resolveCfbCatalogAbbrev(raw) {
  const a = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9&-]/g, '')
  if (!a) return ''
  if (CFB_BY_ABBREV.has(a)) return a
  const aliased = CFB_ABBREV_ALIASES[a]
  if (aliased && CFB_BY_ABBREV.has(aliased)) return aliased
  return a
}

function cfbRowByLongestName(hay) {
  let best = null
  let bestLen = 0
  for (const row of CFB_TEAM_CATALOG) {
    const mascotN = norm(row.mascot)
    const schoolN = norm(row.school)
    for (const n of row.names || []) {
      const p = norm(n)
      if (p.length < 4) continue
      const isBareMascot = Boolean(mascotN) && p === mascotN && p !== schoolN
      if (isBareMascot) continue
      if (!hay.includes(` ${p} `)) continue
      if (p.length > bestLen) {
        best = row
        bestLen = p.length
      }
    }
  }
  return best
}

function isCfbSportKey(sportKey) {
  return String(sportKey || '').includes('ncaaf')
}

function isNflSportKey(sportKey) {
  const sk = String(sportKey || '')
  return sk.includes('nfl') && !sk.includes('ncaaf')
}

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Soft-norm for composer commits: punctuation becomes a space, trailing spaces are kept.
 * “Rams” → no commit. “Rams ” / “DAL,” / “Chiefs!” → committed.
 */
function softNormForCommit(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^\s+/, '')
}

function catalogRowForSide(side, sportKey) {
  const hay = ` ${norm(`${side?.name || ''} ${side?.mascot || ''}`)} `
  if (isCfbSportKey(sportKey)) {
    const espnId = String(side?.team_id ?? side?.espn_id ?? '').trim()
    if (espnId && CFB_BY_ESPN_ID.has(espnId)) return CFB_BY_ESPN_ID.get(espnId)
    const abbrev = resolveCfbCatalogAbbrev(side?.abbrev)
    if (abbrev.length >= 2 && CFB_BY_ABBREV.has(abbrev)) return CFB_BY_ABBREV.get(abbrev)
    return cfbRowByLongestName(hay)
  }
  if (!isNflSportKey(sportKey)) return null
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

/**
 * Short market full name for hub chrome … "LA Rams" / "Denver Broncos"
 * (prefers LA/NY short forms when catalog has them).
 */
export function nflTeamShortName(side) {
  const row = catalogRowForSide(side, 'americanfootball_nfl')
  if (row?.names?.length) {
    const short = row.names.find((n) => /^(LA|NY)\s/i.test(String(n)))
    if (short) return short
    return row.names[0]
  }
  const name = String(side?.name || '').trim()
  if (name) return name
  const mascot = String(side?.mascot || '').trim()
  if (mascot) return mascot
  return String(side?.abbrev || '').trim()
}

/** Pre-game: full short name. Live/final: abbrev. */
export function hubTeamLabel(side, status) {
  if (status === 'pre') return nflTeamShortName(side)
  return String(side?.abbrev || '').trim()
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

function rgbLuminance(rgb) {
  if (!rgb) return 0
  const lin = (c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

function hexLuminance(hex) {
  return rgbLuminance(hexToRgb(hex))
}

function contrastRatio(a, b) {
  const hi = Math.max(rgbLuminance(a), rgbLuminance(b))
  const lo = Math.min(rgbLuminance(a), rgbLuminance(b))
  return (hi + 0.05) / (lo + 0.05)
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

function colorDist(aHex, bHex) {
  const A = hexToRgb(aHex)
  const B = hexToRgb(bHex)
  if (!A || !B) return 999
  const dr = A.r - B.r
  const dg = A.g - B.g
  const db = A.b - B.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Two jersey primaries read as the same stain (NYG navy vs LAR blue, DAL/NE/SEA #002244).
 * Hue-blind luminance contrast is wrong here (KC red vs MIA teal both mid-dark) ... use RGB distance.
 */
export function nflPrimariesTooSimilar(aHex, bHex) {
  const A = hexToRgb(aHex)
  const B = hexToRgb(bHex)
  if (!A || !B) return false
  return colorDist(aHex, bHex) < 60
}

/**
 * Home keeps primary. Away keeps primary unless both primaries clash ... then away uses
 * secondary when that secondary actually separates from the home wash (skip muddy blacks).
 */
export function resolveNflPillWashes(home, away) {
  const homeWash = nflPillWash(home?.color, home?.color2)
  const awayPrimary = nflPillWash(away?.color, away?.color2)
  if (!nflPrimariesTooSimilar(home?.color, away?.color)) {
    return { homeWash, awayWash: awayPrimary }
  }
  const sec = String(away?.color2 || '').trim()
  if (!sec || !hexToRgb(sec)) return { homeWash, awayWash: awayPrimary }
  const awaySecondary = nflPillWash(sec)
  // Secondary must beat the same-color mud (and not collapse into home).
  if (colorDist(homeWash, awaySecondary) < 40) return { homeWash, awayWash: awayPrimary }
  if (colorDist(homeWash, awaySecondary) < 60 && colorDist(awayPrimary, homeWash) <= colorDist(awaySecondary, homeWash)) {
    return { homeWash, awayWash: awayPrimary }
  }
  return { homeWash, awayWash: awaySecondary }
}

/** Dark navy/black washes camouflage the default mark. Prefer the light logo asset instead. */
export function nflPillWashLikelyNeedsLightLogo(washHex) {
  return nflPillWashLikelyTreatment(washHex) === 'light'
}

/**
 * Optimistic treatment before the PNG probe lands.
 * - light: near-black / deep navy wash (NYG/LAR primary)
 * - halo: everything else … better a thin white edge than a camouflaged mark
 */
export function nflPillWashLikelyTreatment(washHex) {
  const L = hexLuminance(washHex)
  if (L < 0.08) return 'light'
  return 'halo'
}

/** @deprecated Use nflPillWashLikelyNeedsLightLogo */
export function nflPillWashLikelyAir(washHex) {
  return nflPillWashLikelyNeedsLightLogo(washHex)
}

const logoWashTreatmentCache = new Map()

/**
 * Sample the default PNG against the wash.
 * - light: heavy camouflage on a dark wash → `*-light.png`
 * - halo: anything short of that … keep full-color mark + thin white edge
 *   (NYG blue on red looks “fine” to WCAG contrast but still needs the edge)
 */
export function probeLogoWashTreatment(src, washHex) {
  const key = `${String(src || '')}|${String(washHex || '').toLowerCase()}`
  const hit = logoWashTreatmentCache.get(key)
  if (hit) return hit
  const job = (async () => {
    const wash = hexToRgb(washHex)
    if (!src || !wash || typeof document === 'undefined') return nflPillWashLikelyTreatment(washHex)
    try {
      const img = new Image()
      img.decoding = 'async'
      img.src = src
      await img.decode()
      const size = 48
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return nflPillWashLikelyTreatment(washHex)
      ctx.drawImage(img, 0, 0, size, size)
      const { data } = ctx.getImageData(0, 0, size, size)
      let opaque = 0
      let camouflaged = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 48) continue
        opaque += 1
        // Slightly looser than WCAG-ish 1.55 so “close” navy-on-red still counts.
        if (contrastRatio({ r: data[i], g: data[i + 1], b: data[i + 2] }, wash) < 2.05) camouflaged += 1
      }
      if (opaque <= 8) return nflPillWashLikelyTreatment(washHex)
      const frac = camouflaged / opaque
      const washLum = rgbLuminance(wash)
      // Only deep navy-on-navy (etc.) upgrades to the light asset. Everything else gets halo.
      if (frac >= 0.42 && washLum < 0.12) return 'light'
      return 'halo'
    } catch {
      return nflPillWashLikelyTreatment(washHex)
    }
  })()
  logoWashTreatmentCache.set(key, job)
  return job
}

/** @deprecated Use probeLogoWashTreatment … returns true when treatment is `light`. */
export function probeLogoWashConflict(src, washHex) {
  const job = probeLogoWashTreatment(src, washHex)
  return Promise.resolve(job).then((t) => t === 'light')
}

export function enrichLoungeSportsGame(game) {
  if (!game) return game
  const sportKey = String(game.sport_key || '')
  const logoBase = isCfbSportKey(sportKey) ? '/sports/cfb/logos' : '/sports/nfl/logos'
  const patchSide = (side) => {
    const row = catalogRowForSide(side, sportKey)
    if (!row) return side
    return {
      ...side,
      abbrev: row.abbrev,
      mascot: side?.mascot || row.mascot || side?.mascot,
      logo: `${logoBase}/${row.abbrev}.png`,
      logoLight: `${logoBase}/${row.abbrev}-light.png`,
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
    extra.push(...(row.names || []), ...(row.players || []), row.abbrev)
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

/** Composer: phrase only counts after whitespace or punctuation (“Rams ” / “Rams,”). */
function hasCommittedPhrase(haystackKeepTrail, phrase) {
  const p = norm(phrase)
  if (p.length < 3) return false
  return new RegExp(`(?:^| )${escapeRe(p)} `).test(haystackKeepTrail)
}

function hasAbbrev(original, abbrev) {
  const a = String(abbrev || '').trim().toUpperCase()
  if (a.length < 2 || a.length > 4) return false
  const re = new RegExp(`(?:^|[^A-Za-z])${escapeRe(a)}(?:[^A-Za-z]|$)`, 'i')
  return re.test(original)
}

/**
 * Composer: abbrev counts after whitespace or punctuation (“DAL ” / “DAL,”), not bare “DAL”.
 * Token must be uppercase so English “Was ” / “No ” / “Sea ” do not fire team codes.
 */
function hasCommittedAbbrev(original, abbrev) {
  const a = String(abbrev || '').trim().toUpperCase()
  if (a.length < 2 || a.length > 4) return false
  const re = new RegExp(`(?:^|[^A-Za-z])${escapeRe(a)}(?=[^A-Za-z0-9])`)
  return re.test(original)
}

function canonicalAbbrev(token) {
  const t = String(token || '').trim().toUpperCase()
  return CATALOG_BY_ABBREV.get(t)?.abbrev || t
}

function versusAbbrevs(original) {
  const m = String(original || '').match(/\b([A-Za-z]{2,4})\s+(?:vs\.?|@|v)\s+([A-Za-z]{2,4})\b/i)
  if (!m) return null
  const a = canonicalAbbrev(m[1])
  const b = canonicalAbbrev(m[2])
  if (!CATALOG_BY_ABBREV.has(a) || !CATALOG_BY_ABBREV.has(b) || a === b) return null
  return [a, b]
}

/**
 * Versus only after both sides are committed (space/punct after each side).
 * “KC vs” does not count; “KC vs MIA ” / “Rams vs Broncos,” does.
 * Abbrev sides must be typed uppercase (same rule as lone codes).
 */
function versusAbbrevsCommitted(original) {
  const m = String(original || '').match(/\b([A-Za-z]{2,4})\s+(?:vs\.?|@|v)\s+([A-Za-z]{2,4})(?=[^A-Za-z0-9]|$)/i)
  if (!m) return null
  if (m[1] !== m[1].toUpperCase() || m[2] !== m[2].toUpperCase()) return null
  const a = canonicalAbbrev(m[1])
  const b = canonicalAbbrev(m[2])
  if (!CATALOG_BY_ABBREV.has(a) || !CATALOG_BY_ABBREV.has(b) || a === b) return null
  // Bare EOF after the second token does not commit (same as “DAL” alone).
  const after = String(original || '').slice(m.index + m[0].length)
  if (!after.length || !/^[^A-Za-z0-9]/.test(after)) return null
  return [a, b]
}

/** Soft-norm path: full names / mascots only (never lowercased abbrevs like “was”). */
function resolveCommittedTeamName(phrase) {
  const p = norm(phrase)
  if (!p) return null
  for (const row of NFL_TEAM_CATALOG) {
    if (row.names.some((n) => norm(n) === p)) return row.abbrev
  }
  return null
}

/** “Rams vs DAL ” / “DAL vs Rams,” … one side uppercase abbrev, other a committed name. */
function versusNameAbbrevCommitted(original) {
  const text = String(original || '')
  const rightAbbrev = text.match(/(.+?)\s+(?:vs\.?|@|v)\s+([A-Z]{2,4})(?=[^A-Za-z0-9])/i)
  if (rightAbbrev) {
    const a = resolveCommittedTeamName(softNormForCommit(rightAbbrev[1]).trim())
    const b = canonicalAbbrev(rightAbbrev[2])
    if (a && CATALOG_BY_ABBREV.has(b) && a !== b) return [a, b]
  }
  const leftAbbrev = text.match(/\b([A-Z]{2,4})\s+(?:vs\.?|@|v)\s+(.+?)(?=[^A-Za-z0-9])/i)
  if (leftAbbrev) {
    const a = canonicalAbbrev(leftAbbrev[1])
    const b = resolveCommittedTeamName(softNormForCommit(leftAbbrev[2]).trim())
    if (b && CATALOG_BY_ABBREV.has(a) && a !== b) return [a, b]
  }
  return null
}

/** Name or abbrev matchup with space/punct after the second side (“Rams vs Broncos ” / “Rams vs Broncos,”). */
function versusTeamsCommitted(original) {
  const fromAbbrev = versusAbbrevsCommitted(original)
  if (fromAbbrev) return fromAbbrev
  const fromMix = versusNameAbbrevCommitted(original)
  if (fromMix) return fromMix
  const soft = softNormForCommit(original)
  const m = soft.match(/(.+?)\s+(?:vs\.?|@|v)\s+(.+?)\s/)
  if (!m) return null
  const a = resolveCommittedTeamName(m[1])
  const b = resolveCommittedTeamName(m[2])
  if (!a || !b || a === b) return null
  return [a, b]
}

function sideHits(original, haystack, side, sportKey, { committed = false } = {}) {
  let score = 0
  const row = catalogRowForSide(side, sportKey)
  const phrases = [
    side?.name,
    side?.mascot,
    ...(row?.names || []),
    ...(row?.players || []),
  ]
  const phraseHit = committed ? hasCommittedPhrase : hasPhrase
  const abbrevHit = committed ? hasCommittedAbbrev : hasAbbrev
  const hay = committed ? softNormForCommit(original) : haystack
  for (const phrase of phrases) {
    if (!phraseHit(hay, phrase)) continue
    const words = norm(phrase).split(' ').filter(Boolean)
    score += words.length >= 2 ? 6 : norm(phrase).length >= 5 ? 4 : 2
  }
  const codes = [side?.abbrev, row?.abbrev, row?.espn]
  if (codes.some((c) => abbrevHit(original, c))) score += 3
  return score
}

/**
 * Betting / game-talk cues so a lone uppercase abbrev is not enough to suggest a card.
 * Matchups and full team names bypass this gate.
 */
const SPORTS_CONTEXT_RE =
  /\b(?:vs\.?|v\.?|@|spread|spreads|odds|lines?|ats|ml|moneyline|money\s*line|cover(?:s|ed)?|beat(?:s|en)?|won|wins|winning|losing|lost|lose|score(?:d|s)?|points?|week\s*\d+|snf|mnf|tnf|nfl|football|kickoff|touchdown|tds?|field\s*goals?|fgs?|over|under|totals?|matchups?|gameday|game\s*day|qb|rb|wr|te|defense|offense|picks?|parlay|teaser|favorite|underdog|dog|lock|hammer|units?)\b/i

function captionHasSportsContext(original) {
  return SPORTS_CONTEXT_RE.test(String(original || ''))
}

/**
 * @returns {{ abbrev: string, viaName: boolean, viaPlayer: boolean, viaAbbrev: boolean }[]}
 */
function mentionedNflTeamsDetailed(original, haystack, { committed = false } = {}) {
  /** @type {Map<string, { abbrev: string, viaName: boolean, viaPlayer: boolean, viaAbbrev: boolean }>} */
  const byAbbrev = new Map()
  const phraseHit = committed ? hasCommittedPhrase : hasPhrase
  const abbrevHit = committed ? hasCommittedAbbrev : hasAbbrev
  const hay = committed ? softNormForCommit(original) : haystack
  for (const row of NFL_TEAM_CATALOG) {
    const viaName = row.names.some((n) => phraseHit(hay, n))
    const viaPlayer = row.players.some((n) => phraseHit(hay, n))
    const viaAbbrev = abbrevHit(original, row.abbrev) || abbrevHit(original, row.espn)
    if (!viaName && !viaPlayer && !viaAbbrev) continue
    const prev = byAbbrev.get(row.abbrev)
    if (prev) {
      prev.viaName = prev.viaName || viaName
      prev.viaPlayer = prev.viaPlayer || viaPlayer
      prev.viaAbbrev = prev.viaAbbrev || viaAbbrev
    } else {
      byAbbrev.set(row.abbrev, { abbrev: row.abbrev, viaName, viaPlayer, viaAbbrev })
    }
  }
  return [...byAbbrev.values()]
}

function mentionedNflAbbrevs(original, haystack, { committed = false } = {}) {
  return mentionedNflTeamsDetailed(original, haystack, { committed }).map((row) => row.abbrev)
}

/**
 * Abbrev-only one-team hits need a sports cue (or another strong team signal).
 * Full names, players, and clear matchups stay eager.
 */
function shouldSuggestAmbiguousTeam(hit, mentioned, { hasMatchup, hasSportsContext }) {
  if (!hit) return false
  if (hit.viaName || hit.viaPlayer) return true
  if (!hit.viaAbbrev) return false
  if (hasMatchup || hasSportsContext) return true
  const strongOther = mentioned.some(
    (other) => other.abbrev !== hit.abbrev && (other.viaName || other.viaPlayer),
  )
  if (strongOther) return true
  const abbrevPeers = mentioned.filter((other) => other.viaAbbrev && other.abbrev !== hit.abbrev)
  return abbrevPeers.length >= 1
}

function teamContextKey(abbrev) {
  return `team:${String(abbrev || '').toUpperCase()}`
}

function matchupContextKey(a, b) {
  const pair = [String(a || '').toUpperCase(), String(b || '').toUpperCase()].filter(Boolean).sort()
  return pair.length === 2 ? `match:${pair.join('-')}` : ''
}

export function loungeSportsGameTeamAbbrevs(game) {
  return [sideAbbrev(game?.home), sideAbbrev(game?.away)].map((a) => String(a || '').trim().toUpperCase()).filter(Boolean)
}

export function loungeSportsGamesShareTeam(a, b) {
  const left = new Set(loungeSportsGameTeamAbbrevs(a))
  if (!left.size) return false
  return loungeSportsGameTeamAbbrevs(b).some((abbrev) => left.has(abbrev))
}

/**
 * Caption → up to `limit` games with context keys (composer).
 * One card per team / matchup context. Specific matchups replace one-team contexts.
 * Committed mode: uppercase abbrevs only; abbrev-only one-team needs a sports cue.
 * @returns {{ game: object, specific: boolean, contextKey: string }[]}
 */
export function matchLoungePostToSportsGamesDetailed(caption, games, limit = LOUNGE_SPORTS_GAME_PIN_MAX, opts = {}) {
  const committed = opts.committed === true
  const cap = Math.max(1, Math.min(LOUNGE_SPORTS_GAME_PIN_MAX, Number(limit) || LOUNGE_SPORTS_GAME_PIN_MAX))
  const original = String(caption || '')
  const haystack = norm(original)
  if (haystack.length < 3 || !Array.isArray(games) || !games.length) return []

  const pair = committed ? versusTeamsCommitted(original) : versusAbbrevs(original)
  const mentioned = mentionedNflTeamsDetailed(original, haystack, { committed })
  const hasSportsContext = committed ? captionHasSportsContext(original) : true
  const out = []
  const seenIds = new Set()
  const seenContexts = new Set()

  const add = (game, specific, contextKey) => {
    const id = String(game?.id || '')
    const ctx = String(contextKey || '')
    if (!game || !id || !ctx || seenIds.has(id) || seenContexts.has(ctx) || out.length >= cap) return
    seenIds.add(id)
    seenContexts.add(ctx)
    out.push({ game, specific: Boolean(specific), contextKey: ctx })
  }

  if (pair) {
    const candidates = games.filter((game) => gameHasTeam(game, pair[0]) && gameHasTeam(game, pair[1]))
    const picked = pickSpecificMatchupGame(candidates, games)
    if (picked) add(picked, true, matchupContextKey(pair[0], pair[1]))
  }

  for (const hit of mentioned) {
    if (out.length >= cap) break
    if (out.some((row) => gameHasTeam(row.game, hit.abbrev))) continue
    if (
      committed &&
      !shouldSuggestAmbiguousTeam(hit, mentioned, {
        hasMatchup: Boolean(pair),
        hasSportsContext,
      })
    ) {
      continue
    }
    const picked = pickAmbiguousTeamGame(hit.abbrev, games)
    if (picked) add(picked, false, teamContextKey(hit.abbrev))
  }

  return out
}

/**
 * Caption → up to `limit` games (composer suggestions). Prefer specific matchups, then one game per mentioned team.
 */
export function matchLoungePostToSportsGames(caption, games, limit = LOUNGE_SPORTS_GAME_PIN_MAX, opts = {}) {
  return matchLoungePostToSportsGamesDetailed(caption, games, limit, opts).map((row) => row.game)
}

/**
 * Caption → one game. Named matchups pin that game (recent or upcoming).
 * Vague one-team lines use live / most recent until MNF is final, then the next game.
 */
export function matchLoungePostToSportsGame(caption, games) {
  return matchLoungePostToSportsGames(caption, games, 1)[0] || null
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
