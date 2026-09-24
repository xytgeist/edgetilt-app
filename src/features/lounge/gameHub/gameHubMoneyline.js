/**
 * Resolve full-game moneyline for the hub hero strip …
 * prefer Polymarket / Kalshi yes prices, fall back to sportsbook American.
 */

const NFL_ABBR =
  'ATL|ARI|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LAC|LAR|LV|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SEA|SF|TB|TEN|WAS'

const CLUB_TO_ABBR = [
  [/green\s*bay\s*packers/gi, 'GB'],
  [/kansas\s*city\s*chiefs/gi, 'KC'],
  [/los\s*angeles\s*rams/gi, 'LAR'],
  [/los\s*angeles\s*chargers/gi, 'LAC'],
  [/new\s*england\s*patriots/gi, 'NE'],
  [/new\s*orleans\s*saints/gi, 'NO'],
  [/new\s*york\s*giants/gi, 'NYG'],
  [/new\s*york\s*jets/gi, 'NYJ'],
  [/san\s*francisco\s*49ers/gi, 'SF'],
  [/tampa\s*bay\s*buccaneers/gi, 'TB'],
  [/las\s*vegas\s*raiders/gi, 'LV'],
  [/jacksonville\s*jaguars/gi, 'JAX'],
  [/atlanta\s*falcons/gi, 'ATL'],
  [/arizona\s*cardinals/gi, 'ARI'],
  [/baltimore\s*ravens/gi, 'BAL'],
  [/buffalo\s*bills/gi, 'BUF'],
  [/carolina\s*panthers/gi, 'CAR'],
  [/chicago\s*bears/gi, 'CHI'],
  [/cincinnati\s*bengals/gi, 'CIN'],
  [/cleveland\s*browns/gi, 'CLE'],
  [/dallas\s*cowboys/gi, 'DAL'],
  [/denver\s*broncos/gi, 'DEN'],
  [/detroit\s*lions/gi, 'DET'],
  [/houston\s*texans/gi, 'HOU'],
  [/indianapolis\s*colts/gi, 'IND'],
  [/miami\s*dolphins/gi, 'MIA'],
  [/minnesota\s*vikings/gi, 'MIN'],
  [/philadelphia\s*eagles/gi, 'PHI'],
  [/pittsburgh\s*steelers/gi, 'PIT'],
  [/seattle\s*seahawks/gi, 'SEA'],
  [/tennessee\s*titans/gi, 'TEN'],
  [/washington\s*(?:commanders|football\s*team|redskins)/gi, 'WAS'],
]

const NICK_TO_ABBR = [
  [/\bpackers\b/gi, 'GB'],
  [/\bfalcons\b/gi, 'ATL'],
  [/\bcardinals\b/gi, 'ARI'],
  [/\bravens\b/gi, 'BAL'],
  [/\bbills\b/gi, 'BUF'],
  [/\bpanthers\b/gi, 'CAR'],
  [/\bbears\b/gi, 'CHI'],
  [/\bbengals\b/gi, 'CIN'],
  [/\bbrowns\b/gi, 'CLE'],
  [/\bcowboys\b/gi, 'DAL'],
  [/\bbroncos\b/gi, 'DEN'],
  [/\blions\b/gi, 'DET'],
  [/\btexans\b/gi, 'HOU'],
  [/\bcolts\b/gi, 'IND'],
  [/\bchiefs\b/gi, 'KC'],
  [/\bchargers\b/gi, 'LAC'],
  [/\brams\b/gi, 'LAR'],
  [/\braiders\b/gi, 'LV'],
  [/\bdolphins\b/gi, 'MIA'],
  [/\bvikings\b/gi, 'MIN'],
  [/\bpatriots\b/gi, 'NE'],
  [/\bsaints\b/gi, 'NO'],
  [/\bgiants\b/gi, 'NYG'],
  [/\bjets\b/gi, 'NYJ'],
  [/\beagles\b/gi, 'PHI'],
  [/\bsteelers\b/gi, 'PIT'],
  [/\bseahawks\b/gi, 'SEA'],
  [/\b49ers\b/gi, 'SF'],
  [/\bbuccaneers\b/gi, 'TB'],
  [/\btitans\b/gi, 'TEN'],
  [/\bcommanders\b/gi, 'WAS'],
  [/\bjaguars\b/gi, 'JAX'],
]

function compressTeams(text) {
  let s = String(text || '')
  for (const [re, abbr] of CLUB_TO_ABBR) s = s.replace(re, abbr)
  for (const [re, abbr] of NICK_TO_ABBR) s = s.replace(re, abbr)
  return s
}

function propYesPrice(prop) {
  const v = prop?.yes_ask ?? prop?.yes_bid ?? prop?.last
  if (v == null || !Number.isFinite(Number(v))) return null
  return Math.max(0.01, Math.min(0.99, Number(v)))
}

function sideFromProb(prob, { abbrev, label, url, source, volume }) {
  if (prob == null) return null
  return {
    abbrev: String(abbrev || '').toUpperCase(),
    label: String(label || abbrev || '').trim(),
    pct: Math.round(prob * 100),
    mult: (1 / prob).toFixed(2),
    url: url || null,
    source: source || null,
    volume: volume != null && Number.isFinite(Number(volume)) ? Number(volume) : null,
  }
}

function americanToProb(ml) {
  const n = Number(ml)
  if (!Number.isFinite(n) || n === 0) return null
  if (n > 0) return 100 / (n + 100)
  return -n / (-n + 100)
}

function isFullGameMoneyline(prop) {
  if (!prop || prop.kind === 'player') return false
  if (prop.kind === 'period') return false
  const series = String(prop.series || '').toLowerCase()
  const text = `${prop.line_label || ''} ${prop.title || ''}`.toLowerCase()
  if (series.includes('2h') || series.includes('1h') || series.includes('half')) return false
  if (/\b(?:1st|2nd|first|second)\s*half\b/.test(text)) return false
  if (series.includes('spread') || series.includes('total') || series.includes('teamtotal')) return false
  if (/\bspread\b|\bover\b|\bunder\b|\btotal\b/.test(text) && !/\bwinner\b|\bmoneyline\b/.test(text)) {
    return false
  }
  if (series.includes('kxnflgame') || series.includes('winner') || series.includes('moneyline')) return true
  if (/\bwinner\b|\bmoneyline\b|\bml\b|\bvs\b|\bwins?\b/.test(text)) return true
  // Bare abbrev labels like "GB" / "ATL"
  const compressed = compressTeams(prop.line_label || prop.title || '').trim()
  return new RegExp(`^(?:${NFL_ABBR})$`, 'i').test(compressed)
}

function propTeamAbbrev(prop) {
  const compressed = compressTeams(`${prop?.line_label || ''} ${prop?.title || ''} ${prop?.team_hint || ''}`)
  const m = compressed.match(new RegExp(`\\b(${NFL_ABBR})\\b`, 'i'))
  return m ? m[1].toUpperCase() : ''
}

function propLiquidity(prop) {
  return (
    Number(prop?.volume_24h ?? prop?.volume ?? 0) +
    Number(prop?.open_interest ?? 0) * 0.25 +
    (prop?.source === 'polymarket' ? 50 : 0)
  )
}

function teamLabel(side) {
  const abbr = String(side?.abbrev || '').toUpperCase()
  const mascot = String(side?.mascot || '').trim()
  const name = String(side?.name || '').trim()
  if (mascot) return `${abbr} ${mascot}`.trim()
  if (name && !new RegExp(`^${abbr}\\b`, 'i').test(name)) return `${abbr} ${name}`.trim()
  return name || abbr
}

function sideFromProp(prop, side) {
  const prob = propYesPrice(prop)
  if (prob == null) return null
  return sideFromProb(prob, {
    abbrev: side?.abbrev,
    label: teamLabel(side),
    url: prop.url_yes || prop.url_market || prop.url,
    source: prop.source,
    volume: prop.volume_24h ?? prop.volume,
  })
}

/**
 * @returns {{ away: object, home: object, volume: number|null, source: string|null } | null}
 */
export function pickGameMoneyline({ props, books, game } = {}) {
  const awayAbbr = String(game?.away?.abbrev || '').toUpperCase()
  const homeAbbr = String(game?.home?.abbrev || '').toUpperCase()
  if (!awayAbbr || !homeAbbr) return null

  const mls = (Array.isArray(props) ? props : []).filter(isFullGameMoneyline)
  const byTeam = (abbr) =>
    mls
      .filter((p) => propTeamAbbrev(p) === abbr)
      .sort((a, b) => propLiquidity(b) - propLiquidity(a))[0] || null

  const awayProp = byTeam(awayAbbr)
  const homeProp = byTeam(homeAbbr)
  if (awayProp && homeProp) {
    const away = sideFromProp(awayProp, game.away)
    const home = sideFromProp(homeProp, game.home)
    if (away && home) {
      const vol =
        (away.volume || 0) + (home.volume || 0) ||
        null
      return {
        away,
        home,
        volume: vol > 0 ? vol : null,
        source: awayProp.source || homeProp.source || null,
      }
    }
  }

  // Sportsbook American ML fallback (first book with both sides).
  for (const row of Array.isArray(books) ? books : []) {
    const awayP = americanToProb(row?.away_ml)
    const homeP = americanToProb(row?.home_ml)
    if (awayP == null || homeP == null) continue
    return {
      away: sideFromProb(awayP, {
        abbrev: awayAbbr,
        label: teamLabel(game.away),
        url: null,
        source: row.book || 'odds',
        volume: null,
      }),
      home: sideFromProb(homeP, {
        abbrev: homeAbbr,
        label: teamLabel(game.home),
        url: null,
        source: row.book || 'odds',
        volume: null,
      }),
      volume: null,
      source: row.book || 'odds',
    }
  }

  return null
}
