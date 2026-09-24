import { useMemo, useState } from 'react'
import { kalshiCents, kalshiContracts } from './gameHubFormatters.js'

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

function seriesShort(series) {
  const raw = String(series || '')
  if (raw.startsWith('football_')) {
    return raw
      .replace(/^football_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return raw.replace(/^KXNFL/, '').replace(/([A-Z]+)(\d)/g, '$1 $2').trim() || 'PROP'
}

function SourceChip({ source }) {
  const poly = source === 'polymarket'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        poly
          ? 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/30'
          : 'bg-zinc-700/80 text-zinc-300 ring-1 ring-inset ring-zinc-600/80'
      }`}
    >
      {poly ? 'Poly' : 'Kalshi'}
    </span>
  )
}

function VenueFilter({ value, onChange, counts }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[
        { id: 'all', label: 'All' },
        { id: 'kalshi', label: 'Kalshi' },
        { id: 'polymarket', label: 'Polymarket' },
      ].map((opt) => {
        const n = counts?.[opt.id]
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ${
              value === opt.id
                ? 'bg-zinc-100 text-zinc-950'
                : 'bg-zinc-900 text-zinc-400 ring-1 ring-inset ring-zinc-800'
            }`}
          >
            {opt.label}
            {n != null ? ` · ${n}` : ''}
          </button>
        )
      })}
    </div>
  )
}

function filterByVenue(list, venue) {
  if (venue === 'all') return list
  return (list || []).filter((p) => (p.source || 'kalshi') === venue)
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

/** Compact Yes/No deep-link chips … label + price on one line. */
function YesNoButtons({ prop }) {
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
        className="inline-flex items-center gap-1 bg-emerald-500/15 px-2 py-1 touch-manipulation active:opacity-80"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">Y</span>
        <span className="text-[12px] font-bold tabular-nums text-emerald-300">{kalshiCents(yesPx)}</span>
      </a>
      <a
        href={noHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 border-l border-zinc-700/80 bg-rose-500/10 px-2 py-1 touch-manipulation active:opacity-80"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-300/90">N</span>
        <span className="text-[12px] font-bold tabular-nums text-rose-300">{kalshiCents(noPx)}</span>
      </a>
    </div>
  )
}

function KalshiGamePropCard({ prop, liqScale }) {
  const vol = prop.volume_24h ?? prop.volume
  const oi = prop.open_interest
  const depth = propBookDepth(prop)
  const marketHref = prop.url_market || prop.url

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <a
          href={marketHref}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 touch-manipulation active:opacity-90"
        >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          <SourceChip source={prop.source} />
          <span>{seriesShort(prop.series)}</span>
        </div>
          <div className="mt-0.5 text-[13px] font-semibold leading-snug text-zinc-100">
            {prop.line_label || prop.title}
          </div>
        </a>
        <YesNoButtons prop={prop} />
      </div>
      <div className="mt-2">
        <KalshiLiqStrip vol={vol} oi={oi} book={depth} scale={liqScale} compact />
      </div>
    </div>
  )
}

function KalshiPlayerPropGroup({ group, liqScale }) {
  const { name, roster, lines } = group
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
              {` · ${lines.length} line${lines.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <KalshiLiqStrip vol={aggVol} oi={aggOi} book={aggBook} scale={liqScale} compact />
        </div>
      </div>
      <div className="divide-y divide-zinc-800/70">
        {lines.map((prop) => (
          <div key={prop.ticker} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                <span className="mr-1.5 inline-flex align-middle">
                  <SourceChip source={prop.source} />
                </span>
                {seriesShort(prop.series)}
                <span className="ml-2 font-normal normal-case tracking-normal tabular-nums text-zinc-600">
                  V {kalshiContracts(prop.volume_24h ?? prop.volume)} · OI{' '}
                  {kalshiContracts(prop.open_interest)}
                </span>
              </div>
              <a
                href={prop.url_market || prop.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 block truncate text-[13px] font-semibold leading-snug text-zinc-100 touch-manipulation active:opacity-90"
              >
                {prop.line_label || prop.title}
              </a>
            </div>
            <YesNoButtons prop={prop} />
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
    const la = a.lines.reduce((s, p) => s + ((p.volume_24h ?? p.volume) || 0), 0)
    const lb = b.lines.reduce((s, p) => s + ((p.volume_24h ?? p.volume) || 0), 0)
    if (lb !== la) return lb - la
    return a.name.localeCompare(b.name)
  })
  for (const g of groups) {
    g.lines.sort((a, b) => ((b.volume_24h ?? b.volume) || 0) - ((a.volume_24h ?? a.volume) || 0))
  }
  return groups
}

/** Player strike markets grouped under each player. */
export function KalshiPlayerPropsBoard({ props, players, emptyLabel }) {
  const [venue, setVenue] = useState('all')
  const filtered = useMemo(() => filterByVenue(props, venue), [props, venue])
  const groups = useMemo(() => groupPlayerProps(filtered, players), [filtered, players])
  const scale = useMemo(() => {
    const lines = groups.flatMap((g) => g.lines)
    return liqScaleFor(lines)
  }, [groups])
  const counts = useMemo(() => {
    const list = Array.isArray(props) ? props : []
    const playerOnly = list.filter(
      (p) => p.kind === 'player' || (p.player_name && p.kind !== 'game' && p.kind !== 'period'),
    )
    return {
      all: playerOnly.length,
      kalshi: playerOnly.filter((p) => (p.source || 'kalshi') === 'kalshi').length,
      polymarket: playerOnly.filter((p) => p.source === 'polymarket').length,
    }
  }, [props])

  return (
    <div className="space-y-3" data-lounge-kalshi-player-props>
      <VenueFilter value={venue} onChange={setVenue} counts={counts} />
      {!groups.length ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          {emptyLabel || 'No open player props for this matchup right now.'}
        </div>
      ) : (
        groups.map((group) => (
          <KalshiPlayerPropGroup key={group.key} group={group} liqScale={scale} />
        ))
      )}
    </div>
  )
}

/** Game + period markets (ML / total / halves / quarters) from Kalshi + Polymarket. */
export function KalshiGamePropsBoard({ props, showPeriods = true }) {
  const [venue, setVenue] = useState('all')
  const [filter, setFilter] = useState('all')

  const { game, period, scale, counts } = useMemo(() => {
    const list = filterByVenue(Array.isArray(props) ? props : [], venue)
    const gameList = list.filter((p) => p.kind === 'game' || (!p.kind && !p.player_name))
    const periodList = list.filter((p) => p.kind === 'period')
    const all = Array.isArray(props) ? props : []
    const gamePeriod = all.filter((p) => p.kind === 'game' || p.kind === 'period' || (!p.kind && !p.player_name))
    return {
      game: gameList,
      period: periodList,
      scale: liqScaleFor([...gameList, ...periodList]),
      counts: {
        all: gamePeriod.length,
        kalshi: gamePeriod.filter((p) => (p.source || 'kalshi') === 'kalshi').length,
        polymarket: gamePeriod.filter((p) => p.source === 'polymarket').length,
      },
    }
  }, [props, venue])

  const showGame = filter === 'all' || filter === 'game'
  const showPeriod = showPeriods && (filter === 'all' || filter === 'period')
  const visible =
    (showGame ? game.length : 0) + (showPeriod ? period.length : 0)

  if (!counts.all) {
    return (
      <div className="py-6 text-center text-sm text-zinc-500">
        No open game markets for this matchup right now.
      </div>
    )
  }

  return (
    <div className="space-y-3" data-lounge-kalshi-game-props>
      <VenueFilter value={venue} onChange={setVenue} counts={counts} />
      {showPeriods && period.length ? (
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'game', label: 'Game' },
            { id: 'period', label: 'Periods' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ${
                filter === opt.id
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-zinc-900 text-zinc-400 ring-1 ring-inset ring-zinc-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}

      {showGame && game.length ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Game
            </h3>
            <span className="text-[11px] tabular-nums text-zinc-600">{game.length}</span>
          </div>
          <div className="space-y-2">
            {game.map((prop) => (
              <KalshiGamePropCard key={prop.ticker} prop={prop} liqScale={scale} />
            ))}
          </div>
        </section>
      ) : null}

      {showPeriod && period.length ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Periods
            </h3>
            <span className="text-[11px] tabular-nums text-zinc-600">{period.length}</span>
          </div>
          <div className="space-y-2">
            {period.map((prop) => (
              <KalshiGamePropCard key={prop.ticker} prop={prop} liqScale={scale} />
            ))}
          </div>
        </section>
      ) : null}

      {!visible ? (
        <div className="py-6 text-center text-sm text-zinc-500">Nothing in that filter right now.</div>
      ) : null}
    </div>
  )
}
