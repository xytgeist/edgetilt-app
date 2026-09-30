/**
 * Landscape pregame board picks from the Kalshi / Polymarket prop feed: one headline line per player
 * (per team side), team totals, and 1H spread / total. Each pick is the ladder rung priced closest to 50¢.
 */

function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Near-locks and long shots (<5¢ / >95¢) aren't a useful headline line. */
function price(p) {
  const v = p?.yes_ask ?? p?.last ?? p?.yes_bid
  const n = Number(v)
  return Number.isFinite(n) && n >= 0.05 && n <= 0.95 ? n : null
}

function marketUrl(p) {
  return p?.url_yes || p?.url_market || p?.url || ''
}

function lineNumber(p) {
  const text = String(p?.line_label || p?.title || '')
    .replace(/\b[12][HQ]\b|\b\d(?:st|nd|rd|th)\s+(?:half|quarter)\b/gi, ' ')
  const m = text.match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/**
 * Live: a real bid on the book. In-game Kalshi keeps decided / abandoned rungs `active` with a $0 bid and a
 * stale ask, which would otherwise read as a coin flip.
 */
function isBettable(p) {
  const bid = Number(p?.yes_bid)
  const ask = Number(p?.yes_ask)
  return Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask < 1
}

/** Rung closest to a coin flip; Kalshi wins ties. */
function nearestEven(list) {
  let best = null
  let bestGap = Infinity
  for (const p of list) {
    const px = price(p)
    if (px == null || lineNumber(p) == null) continue
    const gap = Math.abs(px - 0.5) - (p.source === 'kalshi' ? 0.001 : 0)
    if (gap < bestGap) {
      best = p
      bestGap = gap
    }
  }
  return best
}

const STAT_BY_POSITION = {
  QB: 'pass',
  RB: 'rush',
  FB: 'rush',
  WR: 'rec',
  TE: 'rec',
}

const STAT_LABEL = { pass: 'pass yds', rush: 'rush yds', rec: 'rec yds', td: 'TD' }

function propStat(p) {
  const hay = `${p?.series || ''} ${p?.line_label || ''}`.toLowerCase()
  if (/pass(ing)?[\s_]*y(ar)?ds|passyds/.test(hay)) return 'pass'
  if (/rush(ing)?[\s_]*y(ar)?ds|rshyds/.test(hay)) return 'rush'
  if (/rec(eiving)?[\s_]*y(ar)?ds|recyds/.test(hay)) return 'rec'
  if (/\d\+\s*(td|touchdown)|player_touchdowns/.test(hay) && !/first|1st/.test(hay)) return 'td'
  return null
}

function positionOrder(pos) {
  const i = ['QB', 'RB', 'WR', 'TE', 'FB'].indexOf(String(pos || '').toUpperCase())
  return i === -1 ? 9 : i
}

function lastName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter((w) => !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(w))
  return parts.length ? parts[parts.length - 1] : String(name || '')
}

const STAT_ORDER = ['pass', 'rush', 'rec', 'td']

/**
 * Up to `limit` players per side: QB pass yds, RB rush yds, WR/TE rec yds (anytime TD when the
 * yardage ladder is missing). Rows: `{ key, name, position, stat, line, price, source, url }`.
 * `live`: bettable rungs only, and one row per stat the player has a ladder for (position stat first).
 * `allStats`: pregame also gets one row per stat ladder (the scrolling landscape rail).
 */
export function pregamePlayerPropRails(props, players, limit = 5, { live = false, allStats = false } = {}) {
  const roster = new Map()
  for (const pl of Array.isArray(players) ? players : []) {
    const k = nameKey(pl?.name)
    if (k && (pl.side === 'away' || pl.side === 'home')) roster.set(k, pl)
  }
  const byPlayer = new Map()
  for (const p of Array.isArray(props) ? props : []) {
    if (p?.kind !== 'player' || !p.player_name) continue
    if (live && !isBettable(p)) continue
    const stat = propStat(p)
    if (!stat || (stat === 'td' && lineNumber(p) !== 1)) continue
    const pl = roster.get(nameKey(p.player_name))
    if (!pl) continue
    const k = nameKey(pl.name)
    if (!byPlayer.has(k)) byPlayer.set(k, { player: pl, byStat: {} })
    const entry = byPlayer.get(k)
    ;(entry.byStat[stat] ||= []).push(p)
  }
  const out = { away: [], home: [] }
  for (const { player, byStat } of byPlayer.values()) {
    const want = STAT_BY_POSITION[String(player.position || '').toUpperCase()]
    const stats = live || allStats
      ? STAT_ORDER.filter((s) => byStat[s]).sort((a, b) => (b === want) - (a === want))
      : [want && byStat[want] ? want : byStat.td ? 'td' : null].filter(Boolean)
    stats.forEach((stat, statIdx) => {
      const pick = nearestEven(byStat[stat])
      if (!pick) return
      const line = lineNumber(pick)
      out[player.side].push({
        key: `${nameKey(player.name)}:${stat}`,
        playerKey: nameKey(player.name),
        name: lastName(player.name),
        position: String(player.position || '').toUpperCase(),
        stat: STAT_LABEL[stat],
        line: `${line}+`,
        price: price(pick),
        source: pick.source,
        url: marketUrl(pick),
        rank: Number(player.search_rank) || 9999,
        statIdx,
      })
    })
  }
  for (const side of ['away', 'home']) {
    out[side] = out[side]
      .sort(
        (a, b) =>
          positionOrder(a.position) - positionOrder(b.position) ||
          a.rank - b.rank ||
          a.playerKey.localeCompare(b.playerKey) ||
          a.statIdx - b.statIdx,
      )
      .slice(0, limit)
  }
  return out
}

function sideMatcher(side) {
  const words = [side?.abbrev, side?.name, side?.mascot]
    .map((w) => String(w || '').trim())
    .filter(Boolean)
  return (text) => {
    const t = String(text || '').toLowerCase()
    return words.some((w) => new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t))
  }
}

/** Which team a game/period line is about (away / home / null). */
function lineSide(p, game) {
  const text = `${p?.line_label || ''} ${p?.title || ''}`
  const isAway = sideMatcher(game?.away)(text)
  const isHome = sideMatcher(game?.home)(text)
  if (isAway && !isHome) return 'away'
  if (isHome && !isAway) return 'home'
  return null
}

function seriesHay(p) {
  return `${p?.series || ''} ${p?.line_label || ''}`.toLowerCase()
}

const isFirstHalf = (p) => /1h|first[_\s]half|1st half/.test(seriesHay(p))
const isSecondHalf = (p) => /2h|second[_\s]half|2nd half/.test(seriesHay(p))
const isTeamTotal = (p) => /teamtotal|team_points|team_first_half_total|team_second_half_total/.test(String(p?.series || '').toLowerCase())
const isSpread = (p) => /spread/.test(String(p?.series || '').toLowerCase())
const isGameTotal = (p) => /total/.test(String(p?.series || '').toLowerCase()) && !isTeamTotal(p)

/**
 * Team totals `{ away, home }` and 1H `{ spread, total }` picks, each `{ line, price, source, url, side? }`.
 */
export function pregameGameMarketPicks(props, game) {
  const list = (Array.isArray(props) ? props : []).filter((p) => p?.kind === 'game' || p?.kind === 'period')
  const pick = (rows, extra = {}) => {
    const p = nearestEven(rows)
    return p ? { line: lineNumber(p), price: price(p), source: p.source, url: marketUrl(p), ...extra } : null
  }
  const fullTeamTotals = list.filter((p) => p.kind === 'game' && isTeamTotal(p))
  const teamTotal = (side) => pick(fullTeamTotals.filter((p) => lineSide(p, game) === side))

  const h1 = list.filter((p) => p.kind === 'period' && isFirstHalf(p) && !isSecondHalf(p))
  const h1Spreads = h1.filter(isSpread)
  const h1SpreadRow = nearestEven(h1Spreads)
  const h1Spread = h1SpreadRow
    ? {
        side: lineSide(h1SpreadRow, game),
        line: lineNumber(h1SpreadRow),
        price: price(h1SpreadRow),
        source: h1SpreadRow.source,
        url: marketUrl(h1SpreadRow),
      }
    : null
  const h1Total = pick(h1.filter((p) => isGameTotal(p)))

  return {
    teamTotal: { away: teamTotal('away'), home: teamTotal('home') },
    firstHalf: { spread: h1Spread, total: h1Total },
  }
}
