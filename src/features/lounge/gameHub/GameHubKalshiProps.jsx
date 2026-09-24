import { useMemo, useState } from 'react'
import { kalshiCents, kalshiContracts } from './gameHubFormatters.js'
import { GameStrikeLaddersBoard } from './GameHubStrikeLadders.jsx'

function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

function propBookDepth(prop) {
  const bid = prop?.yes_bid_size
  const ask = prop?.yes_ask_size
  if (bid == null && ask == null) return null
  return (bid || 0) + (ask || 0)
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const NFL_CLUB_TO_ABBR = [
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

/** Lone nicknames (no city) → abbrev so Poly/Kalshi wording still matches. */
const NFL_NICK_TO_ABBR = [
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

const NFL_NICKNAMES =
  'Packers|Falcons|Cardinals|Ravens|Bills|Panthers|Bears|Bengals|Browns|Cowboys|Broncos|Lions|Texans|Colts|Chiefs|Chargers|Rams|Raiders|Dolphins|Vikings|Patriots|Saints|Giants|Jets|Eagles|Steelers|Seahawks|49ers|Buccaneers|Titans|Commanders|Jaguars'

const NFL_ABBR =
  'ATL|ARI|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LAC|LAR|LV|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SEA|SF|TB|TEN|WAS'

function compressTeamNames(text) {
  let s = String(text || '')
  for (const [re, abbr] of NFL_CLUB_TO_ABBR) s = s.replace(re, abbr)
  s = s.replace(new RegExp(`\\b(${NFL_ABBR})\\s+(?:${NFL_NICKNAMES})\\b`, 'gi'), '$1')
  for (const [re, abbr] of NFL_NICK_TO_ABBR) s = s.replace(re, abbr)
  return s
}

/**
 * Shared display cleanup for Kalshi + Polymarket line text …
 * drop fluff, compress teams/periods/stats, keep the strike readable.
 */
function normalizeMarketLabel(raw, { playerName = '' } = {}) {
  let s = String(raw || '').trim()
  if (!s) return ''

  const name = String(playerName || '').trim()
  if (name) {
    s = s.replace(new RegExp(`^${escapeRegExp(name)}\\s*[:\\-]?\\s*`, 'i'), '')
    s = s.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'ig'), ' ')
  }

  s = s.replace(/^will\s+/i, '').replace(/\?+\s*$/g, '')
  s = compressTeamNames(s)

  s = s
    .replace(/\b(?:1st|first)\s*half\b/gi, '1H')
    .replace(/\b(?:2nd|second)\s*half\b/gi, '2H')
    .replace(/\b(?:1st|first)\s*quarter\b/gi, '1Q')
    .replace(/\b(?:2nd|second)\s*quarter\b/gi, '2Q')
    .replace(/\b(?:3rd|third)\s*quarter\b/gi, '3Q')
    .replace(/\b(?:4th|fourth)\s*quarter\b/gi, '4Q')
    .replace(/\bmoneyline\b/gi, '')
    .replace(/\bto (?:win|cover)\b/gi, '')
    .replace(/\bwins?\b/gi, '')
    .replace(/\brecord\b/gi, ' ')
    .replace(/\bfantasy\s*points?(?:\s*\(?\s*ppr\s*\)?)?/gi, 'fantasy')
    .replace(/\bpassing yards?\b/gi, 'pass yds')
    .replace(/\bpass yds?\b/gi, 'pass yds')
    .replace(/\brushing yards?\b/gi, 'rush yds')
    .replace(/\brush yds?\b/gi, 'rush yds')
    .replace(/\breceiving yards?\b/gi, 'rec yds')
    .replace(/\brec yds?\b/gi, 'rec yds')
    .replace(/\bcompletions?\b/gi, 'comp')
    .replace(/\battempts?\b/gi, 'att')
    .replace(/\breceptions?\b/gi, 'rec')
    .replace(/\btouchdowns?\b/gi, 'TDs')
    .replace(/\btds?\b/gi, 'TDs')
    .replace(/\bpoints?\b/gi, '')
    .replace(/\bthe\b/gi, ' ')
    .replace(/\s*([+/])\s*/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // "Over45.5" from the +/- collapse above … keep space before digit groups after words.
  s = s.replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/\s{2,}/g, ' ').trim()
  return s
}

function preferShorterLabel(current, next) {
  const a = String(current || '')
  const b = String(next || '')
  if (!a) return b
  if (!b) return a
  if (b.length < a.length) return b
  if (a.length < b.length) return a
  const score = (x) =>
    (new RegExp(`\\b(?:${NFL_ABBR})\\b`, 'i').test(x) ? 2 : 0) +
    (/\b(?:1H|2H|TDs|yds|fantasy|comp|att|rec)\b/.test(x) ? 1 : 0)
  return score(b) > score(a) ? b : a
}

function sumField(props, key) {
  let total = 0
  let any = false
  for (const p of props || []) {
    const v = p?.[key]
    if (v != null && Number.isFinite(Number(v))) {
      total += Number(v)
      any = true
    }
  }
  return any ? total : null
}

function PlayerAvatar({ player, name, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  const letter = String(name || player?.name || '?').slice(0, 1).toUpperCase()
  const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const text = size === 'lg' ? 'text-sm' : 'text-xs'
  if (!player?.headshot_url || failed) {
    return (
      <span
        className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-zinc-800 ${text} font-bold text-zinc-300`}
      >
        {letter}
      </span>
    )
  }
  return (
    <img
      src={player.headshot_url}
      alt=""
      className={`${box} shrink-0 rounded-full object-cover bg-zinc-800`}
      onError={() => setFailed(true)}
    />
  )
}

/** Relative Vol / OI / Book meters. */
export function KalshiLiqStrip({ vol, oi, book, scale, compact = false }) {
  const max = Math.max(1, Number(scale) || 1)
  const rows = [
    { key: 'vol', label: 'Vol', value: vol, tone: 'from-sky-400/90 to-sky-500/40' },
    { key: 'oi', label: 'OI', value: oi, tone: 'from-violet-400/90 to-violet-500/40' },
    { key: 'book', label: 'Book', value: book, tone: 'from-amber-400/90 to-amber-500/40' },
  ]
  return (
    <div
      className={`grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}
      data-kalshi-liq
    >
      {rows.map((row) => {
        const n = row.value != null && Number.isFinite(Number(row.value)) ? Number(row.value) : null
        const pct = n == null ? 0 : Math.max(4, Math.min(100, Math.round((n / max) * 100)))
        return (
          <div key={row.key} className="min-w-0">
            <div className="mb-0.5 flex items-baseline justify-between gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                {row.label}
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-zinc-300">
                {kalshiContracts(n)}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-zinc-800/90">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${row.tone}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Compact Yes/No deep-link chips … price only (Y/N labeled in column headers). */
function YesNoButtons({ prop }) {
  if (!prop) {
    return (
      <div className="inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-zinc-800 opacity-55">
        <span className="inline-flex min-w-[2rem] items-center justify-center px-1.5 py-1">
          <span className="text-[12px] font-bold tabular-nums text-zinc-500">-</span>
        </span>
        <span className="inline-flex min-w-[2rem] items-center justify-center border-l border-zinc-800 px-1.5 py-1">
          <span className="text-[12px] font-bold tabular-nums text-zinc-500">-</span>
        </span>
      </div>
    )
  }
  const yesPx = prop.yes_ask ?? prop.yes_bid ?? prop.last
  const noPx =
    prop.no_ask ??
    prop.no_bid ??
    (yesPx != null && Number.isFinite(Number(yesPx)) ? Math.max(0, 1 - Number(yesPx)) : null)
  const yesHref = prop.url_yes || prop.url_market || prop.url
  const noHref = prop.url_no || prop.url_market || prop.url
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-inset ring-zinc-700/80">
      <a
        href={yesHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-[2rem] items-center justify-center bg-emerald-500/15 px-1.5 py-1 touch-manipulation active:opacity-80"
      >
        <span className="text-[12px] font-bold tabular-nums text-emerald-300">{kalshiCents(yesPx)}</span>
      </a>
      <a
        href={noHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-[2rem] items-center justify-center border-l border-zinc-700/80 bg-rose-500/10 px-1.5 py-1 touch-manipulation active:opacity-80"
      >
        <span className="text-[12px] font-bold tabular-nums text-rose-300">{kalshiCents(noPx)}</span>
      </a>
    </div>
  )
}

/** Strip player name + normalize synonyms so Kalshi/Poly lines can share a row. */
function lineMatchKey(prop, playerName) {
  let s = String(prop?.line_label || prop?.title || '')
  const name = String(playerName || prop?.player_name || '').trim()
  if (name) s = s.replace(new RegExp(`^${escapeRegExp(name)}\\s*[:\\-]?\\s*`, 'i'), '')
  s = compressTeamNames(s)
  s = s
    .toLowerCase()
    .replace(/\bwill\b/g, ' ')
    .replace(/\brecord\b/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/\bfirst touchdown\b/g, 'firsttd')
    .replace(/\bfirst td\b/g, 'firsttd')
    .replace(/\bfirst tds\b/g, 'firsttd')
    .replace(/\btouchdowns?\b/g, 'td')
    .replace(/\btds?\b/g, 'td')
    .replace(/\bpassing yards?\b/g, 'passyd')
    .replace(/\bpass yds?\b/g, 'passyd')
    .replace(/\brushing yards?\b/g, 'rushyd')
    .replace(/\brush yds?\b/g, 'rushyd')
    .replace(/\breceiving yards?\b/g, 'recyd')
    .replace(/\brec yds?\b/g, 'recyd')
    .replace(/\breceptions?\b/g, 'rec')
    .replace(/\bfantasy points?(?:\s*ppr)?\b/g, 'fpts')
    .replace(/\bfantasy\b/g, 'fpts')
    .replace(/\bcompletions?\b/g, 'comp')
    .replace(/\battempts?\b/g, 'att')
    .replace(/[^a-z0-9+.]/g, '')
  return s || String(prop?.ticker || '')
}

function displayLineLabel(prop, playerName) {
  const name = String(playerName || prop?.player_name || '').trim()
  const raw = String(prop?.line_label || prop?.title || '').trim()
  return normalizeMarketLabel(raw, { playerName: name }) || raw || 'Line'
}

/** Skill-group rank for in-card market order (pass → rush → rec → TD → fantasy → other). */
function lineCategoryRank(key) {
  const k = String(key || '')
  if (k.includes('passyd')) return 10
  if (k.includes('comp')) return 20
  if (k.includes('att') && !k.includes('pass')) return 30
  if (k.includes('pass') && k.includes('td')) return 40
  if (k.includes('rushyd')) return 50
  if (k.includes('rush') && k.includes('td')) return 60
  if (k.includes('recyd')) return 70
  if (k.includes('rec') && !k.includes('td') && !k.includes('recyd')) return 80
  if (k.includes('rec') && k.includes('td')) return 90
  if (k.includes('firsttd')) return 100
  if (k.includes('td')) return 110
  if (k.includes('fpts')) return 120
  return 200
}

function lineStrikeNum(key, label) {
  const fromKey = String(key || '').match(/(\d+(?:\.\d+)?)/)
  if (fromKey) return Number(fromKey[1])
  const fromLabel = String(label || '').match(/(\d+(?:\.\d+)?)/)
  return fromLabel ? Number(fromLabel[1]) : 0
}

/** Pair Kalshi + Polymarket books that describe the same strike. */
function pairPlayerLines(lines, playerName) {
  const byKey = new Map()
  for (const p of lines || []) {
    const key = lineMatchKey(p, playerName)
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: displayLineLabel(p, playerName),
        kalshi: null,
        polymarket: null,
      })
    }
    const row = byKey.get(key)
    const src = p.source || 'kalshi'
    if (src === 'polymarket') row.polymarket = p
    else row.kalshi = p
    row.label = preferShorterLabel(row.label, displayLineLabel(p, playerName))
  }
  const rows = [...byKey.values()]
  rows.sort((a, b) => {
    const ca = lineCategoryRank(a.key)
    const cb = lineCategoryRank(b.key)
    if (ca !== cb) return ca - cb
    const na = lineStrikeNum(a.key, a.label)
    const nb = lineStrikeNum(b.key, b.label)
    if (na !== nb) return na - nb
    return String(a.label).localeCompare(String(b.label))
  })
  return rows
}

const POSITION_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3 }

function positionRank(pos) {
  const p = String(pos || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p in POSITION_ORDER) return POSITION_ORDER[p]
  // FB / HB → RB bucket; everything else after skill positions
  if (p === 'FB' || p === 'HB') return POSITION_ORDER.RB
  return 50
}

function KalshiPlayerPropGroup({ group, liqScale }) {
  const { name, roster, lines } = group
  const pairs = useMemo(() => pairPlayerLines(lines, name), [lines, name])
  const aggVol = sumField(lines, 'volume_24h') ?? sumField(lines, 'volume')
  const aggOi = sumField(lines, 'open_interest')
  const aggBook = lines.reduce((acc, p) => {
    const d = propBookDepth(p)
    return d == null ? acc : (acc || 0) + d
  }, null)

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800/80 px-3 py-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={roster} name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-zinc-100">{name}</div>
            <div className="truncate text-[12px] text-zinc-500">
              {[roster?.position, roster?.team].filter(Boolean).join(' · ') || 'Player props'}
              {` · ${pairs.length} line${pairs.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <KalshiLiqStrip vol={aggVol} oi={aggOi} book={aggBook} scale={liqScale} compact />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(4.5rem,auto)] gap-x-2 border-b border-zinc-800/80 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
        <span className="self-end">Line</span>
        <span className="text-center leading-tight">
          Kalshi
          <span className="mt-0.5 flex justify-center gap-3 font-semibold normal-case tracking-normal text-zinc-500">
            <span className="text-emerald-400/80">Y</span>
            <span className="text-rose-400/80">N</span>
          </span>
        </span>
        <span className="text-center leading-tight">
          Poly
          <span className="mt-0.5 flex justify-center gap-3 font-semibold normal-case tracking-normal text-zinc-500">
            <span className="text-emerald-400/80">Y</span>
            <span className="text-rose-400/80">N</span>
          </span>
        </span>
      </div>

      <div className="divide-y divide-zinc-800/70">
        {pairs.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(4.5rem,auto)] items-center gap-x-2 px-3 py-2"
          >
            <div className="min-w-0 truncate text-[13px] font-semibold leading-snug text-zinc-100">
              {row.label}
            </div>
            <div className="flex justify-center">
              <YesNoButtons prop={row.kalshi} />
            </div>
            <div className="flex justify-center">
              <YesNoButtons prop={row.polymarket} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function liqScaleFor(list) {
  const values = []
  for (const p of list || []) {
    const vol = p.volume_24h ?? p.volume
    if (vol != null) values.push(Number(vol))
    if (p.open_interest != null) values.push(Number(p.open_interest))
    const depth = propBookDepth(p)
    if (depth != null) values.push(depth)
  }
  return Math.max(1, ...values, 1)
}

function groupPlayerProps(props, rosterPlayers) {
  const rosterByName = new Map()
  for (const p of rosterPlayers || []) {
    const k = nameKey(p.name)
    if (k) rosterByName.set(k, p)
  }
  const playerProps = (props || []).filter(
    (p) => p.kind === 'player' || (p.player_name && p.kind !== 'game' && p.kind !== 'period'),
  )
  const byPlayer = new Map()
  for (const p of playerProps) {
    const name = String(p.player_name || '').trim() || 'Unknown'
    const key = nameKey(name) || name
    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        key,
        name,
        roster: rosterByName.get(nameKey(name)) || null,
        lines: [],
      })
    }
    byPlayer.get(key).lines.push(p)
  }
  const groups = [...byPlayer.values()]
  groups.sort((a, b) => {
    const pa = positionRank(a.roster?.position)
    const pb = positionRank(b.roster?.position)
    if (pa !== pb) return pa - pb
    const la = a.lines.reduce((s, p) => s + ((p.volume_24h ?? p.volume) || 0), 0)
    const lb = b.lines.reduce((s, p) => s + ((p.volume_24h ?? p.volume) || 0), 0)
    if (lb !== la) return lb - la
    return a.name.localeCompare(b.name)
  })
  return groups
}

/** Player strike markets grouped under each player … Kalshi | Poly columns. */
export function KalshiPlayerPropsBoard({ props, players, emptyLabel }) {
  const groups = useMemo(() => groupPlayerProps(props, players), [props, players])
  const scale = useMemo(() => {
    const lines = groups.flatMap((g) => g.lines)
    return liqScaleFor(lines)
  }, [groups])

  if (!groups.length) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        {emptyLabel || 'No open player props for this matchup right now.'}
      </div>
    )
  }

  return (
    <div className="space-y-3" data-lounge-kalshi-player-props>
      {groups.map((group) => (
        <KalshiPlayerPropGroup key={group.key} group={group} liqScale={scale} />
      ))}
    </div>
  )
}

function isSecondHalfProp(prop) {
  const series = String(prop?.series || '').toUpperCase()
  if (series.includes('2H') || series.includes('SECOND_HALF') || series.includes('2ND_HALF')) {
    return true
  }
  const text = `${prop?.line_label || ''} ${prop?.title || ''}`.toLowerCase()
  return /\b2nd half\b|\bsecond half\b|\b2h\b/.test(text)
}

/** 2H markets unlock at halftime (or once 3Q+ is on the board). */
function isPastHalftime(game, live) {
  if (game?.status === 'post') return true
  if (game?.status !== 'in') return false
  const label = String(game?.status_label || live?.status_label || '').toLowerCase()
  if (/half\s*time|\bhalftime\b|\bht\b/.test(label)) return true
  const period = Number(live?.period ?? game?.live?.period)
  return Number.isFinite(period) && period >= 3
}

/** Game + period markets … strike ladders (Total / Spread) instead of 20 Over rows. */
export function KalshiGamePropsBoard({ props, game = null, live = null, showPeriods = true }) {
  const pastHalftime = isPastHalftime(game, live)

  const filtered = useMemo(() => {
    return (Array.isArray(props) ? props : []).filter((p) => {
      if (p.kind === 'player') return false
      if (!(p.kind === 'game' || p.kind === 'period' || (!p.kind && !p.player_name))) return false
      if (isSecondHalfProp(p) && !pastHalftime) return false
      if (!showPeriods && p.kind === 'period') return false
      return true
    })
  }, [props, pastHalftime, showPeriods])

  if (!filtered.length) {
    return (
      <div className="py-6 text-center text-sm text-zinc-500">
        No open game markets for this matchup right now.
      </div>
    )
  }

  return (
    <div className="space-y-3" data-lounge-kalshi-game-props>
      <GameStrikeLaddersBoard props={filtered} game={game} />
    </div>
  )
}
