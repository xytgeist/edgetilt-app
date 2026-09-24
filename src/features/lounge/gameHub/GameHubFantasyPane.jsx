import { useMemo, useState } from 'react'
import { kalshiCents, kalshiContracts } from './gameHubFormatters.js'

function PlayerAvatar({ player, name, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  const letter = String(name || player?.name || '?').slice(0, 1).toUpperCase()
  const dim = size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'
  if (!player?.headshot_url || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-zinc-800 font-bold text-zinc-300 ${dim}`}
      >
        {letter}
      </span>
    )
  }
  return (
    <img
      src={player.headshot_url}
      alt=""
      className={`${dim.split(' ').slice(0, 2).join(' ')} shrink-0 rounded-full object-cover bg-zinc-800`}
      onError={() => setFailed(true)}
    />
  )
}

function fmt(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  return Number.isInteger(v) || digits === 0 ? String(Math.round(v)) : v.toFixed(digits)
}

function yardLine(player, mode) {
  if (mode === 'weekly') {
    const parts = []
    if (player.projected_pass_yd != null) parts.push(`${fmt(player.projected_pass_yd, 0)} pass`)
    if (player.projected_rush_yd != null) parts.push(`${fmt(player.projected_rush_yd, 0)} rush`)
    if (player.projected_rec_yd != null) parts.push(`${fmt(player.projected_rec_yd, 0)} rec`)
    else if (player.projected_rec != null) parts.push(`${fmt(player.projected_rec, 1)} rec`)
    return parts.join(' · ')
  }
  const parts = []
  if (player.season_pass_yd != null) parts.push(`${fmt(player.season_pass_yd, 0)} pass`)
  if (player.season_rush_yd != null) parts.push(`${fmt(player.season_rush_yd, 0)} rush`)
  if (player.season_rec_yd != null) parts.push(`${fmt(player.season_rec_yd, 0)} rec`)
  else if (player.season_rec != null) parts.push(`${fmt(player.season_rec, 1)} rec`)
  if (player.season_gp != null) parts.push(`${fmt(player.season_gp, 0)} gp`)
  return parts.join(' · ')
}

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
  return String(series || '')
    .replace(/^KXNFL/, '')
    .replace(/([A-Z]+)(\d)/g, '$1 $2')
    .trim() || 'PROP'
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

/**
 * Relative liquidity meters ... three thin fills for Vol / OI / Book.
 * `scale` is the max value in the current view so bars read comparatively.
 */
function KalshiLiqStrip({ vol, oi, book, scale, compact = false }) {
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

function YesNoButtons({ prop, tight = false }) {
  const yesPx = prop.yes_ask ?? prop.yes_bid ?? prop.last
  const noPx =
    prop.no_ask ??
    prop.no_bid ??
    (yesPx != null && Number.isFinite(Number(yesPx)) ? Math.max(0, 1 - Number(yesPx)) : null)
  const yesHref = prop.url_yes || prop.url_market || prop.url
  const noHref = prop.url_no || prop.url_market || prop.url
  const pad = tight ? 'px-2 py-1.5' : 'px-2 py-2'
  const pxSize = tight ? 'text-[14px]' : 'text-[16px]'
  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={yesHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex flex-col items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-500/15 ${pad} touch-manipulation active:opacity-90`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">Yes</span>
        <span className={`${pxSize} font-bold tabular-nums text-emerald-300`}>{kalshiCents(yesPx)}</span>
      </a>
      <a
        href={noHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex flex-col items-center justify-center rounded-xl border border-rose-400/35 bg-rose-500/10 ${pad} touch-manipulation active:opacity-90`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-300/90">No</span>
        <span className={`${pxSize} font-bold tabular-nums text-rose-300`}>{kalshiCents(noPx)}</span>
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
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3">
      <a
        href={marketHref}
        target="_blank"
        rel="noopener noreferrer"
        className="block min-w-0 touch-manipulation active:opacity-90"
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Kalshi · {seriesShort(prop.series)}
        </div>
        <div className="mt-0.5 text-[14px] font-semibold leading-snug text-zinc-100">
          {prop.line_label || prop.title}
        </div>
      </a>
      <div className="mt-2.5">
        <KalshiLiqStrip vol={vol} oi={oi} book={depth} scale={liqScale} compact />
      </div>
      <div className="mt-2.5">
        <YesNoButtons prop={prop} />
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
          <div key={prop.ticker} className="px-3 py-2.5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {seriesShort(prop.series)}
                </div>
                <a
                  href={prop.url_market || prop.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 block text-[13px] font-semibold leading-snug text-zinc-100 touch-manipulation active:opacity-90"
                >
                  {prop.line_label || prop.title}
                </a>
              </div>
              <div className="shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
                <div>V {kalshiContracts(prop.volume_24h ?? prop.volume)}</div>
                <div>OI {kalshiContracts(prop.open_interest)}</div>
              </div>
            </div>
            <YesNoButtons prop={prop} tight />
          </div>
        ))}
      </div>
    </div>
  )
}

function PropsSection({ title, count, children }) {
  if (!count) return null
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{title}</h3>
        <span className="text-[11px] tabular-nums text-zinc-600">{count}</span>
      </div>
      {children}
    </section>
  )
}

/**
 * Sleeper weekly (DFF) + season fantasy stats, plus Kalshi props (separate).
 */
export default function GameHubFantasyPane({
  players,
  props,
  loading,
  error,
  season,
  week,
  sources,
}) {
  const [view, setView] = useState('weekly')
  const [propFilter, setPropFilter] = useState('all')

  const ranked = useMemo(() => {
    const list = [...(players || [])].filter((p) =>
      ['QB', 'RB', 'WR', 'TE'].includes(String(p.position || '').toUpperCase()),
    )
    list.sort((a, b) => {
      if (view === 'season') {
        const sa = a.season_ppr ?? -1
        const sb = b.season_ppr ?? -1
        if (sb !== sa) return sb - sa
      } else {
        const pa = a.projected_ppr ?? a.fantasypros_pts ?? -1
        const pb = b.projected_ppr ?? b.fantasypros_pts ?? -1
        if (pb !== pa) return pb - pa
      }
      return (a.search_rank ?? 9999) - (b.search_rank ?? 9999)
    })
    return list
  }, [players, view])

  const rosterByName = useMemo(() => {
    const map = new Map()
    for (const p of players || []) {
      const k = nameKey(p.name)
      if (k) map.set(k, p)
    }
    return map
  }, [players])

  const propsBoard = useMemo(() => {
    const list = Array.isArray(props) ? props : []
    const liqValues = []
    for (const p of list) {
      const vol = p.volume_24h ?? p.volume
      if (vol != null) liqValues.push(Number(vol))
      if (p.open_interest != null) liqValues.push(Number(p.open_interest))
      const depth = propBookDepth(p)
      if (depth != null) liqValues.push(depth)
    }
    const liqScale = Math.max(1, ...liqValues, 1)

    const game = list.filter((p) => p.kind === 'game' || (!p.kind && !p.player_name))
    const period = list.filter((p) => p.kind === 'period')
    const playerProps = list.filter((p) => p.kind === 'player' || (p.player_name && p.kind !== 'game' && p.kind !== 'period'))

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
    const playerGroups = [...byPlayer.values()]
    playerGroups.sort((a, b) => {
      const la = a.lines.reduce((s, p) => s + ((p.volume_24h ?? p.volume) || 0), 0)
      const lb = b.lines.reduce((s, p) => s + ((p.volume_24h ?? p.volume) || 0), 0)
      if (lb !== la) return lb - la
      return a.name.localeCompare(b.name)
    })
    for (const g of playerGroups) {
      g.lines.sort((a, b) => {
        const va = (a.volume_24h ?? a.volume) || 0
        const vb = (b.volume_24h ?? b.volume) || 0
        return vb - va
      })
    }

    return { game, period, playerGroups, liqScale }
  }, [props, rosterByName])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading fantasy…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>

  const hasKalshi = Array.isArray(sources) && sources.includes('kalshi')
  const hasSleeper =
    Array.isArray(sources) &&
    (sources.includes('sleeper_projections') || sources.includes('sleeper_season_stats'))

  const showGame = propFilter === 'all' || propFilter === 'game'
  const showPeriod = propFilter === 'all' || propFilter === 'period'
  const showPlayers = propFilter === 'all' || propFilter === 'player'
  const visibleCount =
    (showGame ? propsBoard.game.length : 0) +
    (showPeriod ? propsBoard.period.length : 0) +
    (showPlayers ? propsBoard.playerGroups.length : 0)

  return (
    <div data-lounge-game-fantasy className="space-y-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-zinc-500">
          {season && week != null ? `Week ${week} · ${season}` : 'This matchup'}
          {hasSleeper ? ' · Sleeper' : ''}
          {hasKalshi ? ' · Kalshi props' : ''}
        </div>
        <div className="flex gap-1 rounded-full bg-zinc-900 p-0.5">
          {[
            { id: 'weekly', label: 'Weekly' },
            { id: 'season', label: 'Season' },
            { id: 'props', label: 'Props' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setView(opt.id)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                view === opt.id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'props' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'game', label: 'Game' },
              { id: 'period', label: 'Periods' },
              { id: 'player', label: 'Players' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPropFilter(opt.id)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ${
                  propFilter === opt.id
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'bg-zinc-900 text-zinc-400 ring-1 ring-inset ring-zinc-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {showGame ? (
            <PropsSection title="Game" count={propsBoard.game.length}>
              <div className="space-y-2">
                {propsBoard.game.map((prop) => (
                  <KalshiGamePropCard key={prop.ticker} prop={prop} liqScale={propsBoard.liqScale} />
                ))}
              </div>
            </PropsSection>
          ) : null}

          {showPeriod ? (
            <PropsSection title="Periods" count={propsBoard.period.length}>
              <div className="space-y-2">
                {propsBoard.period.map((prop) => (
                  <KalshiGamePropCard key={prop.ticker} prop={prop} liqScale={propsBoard.liqScale} />
                ))}
              </div>
            </PropsSection>
          ) : null}

          {showPlayers ? (
            <PropsSection title="Players" count={propsBoard.playerGroups.length}>
              <div className="space-y-3">
                {propsBoard.playerGroups.map((group) => (
                  <KalshiPlayerPropGroup
                    key={group.key}
                    group={group}
                    liqScale={propsBoard.liqScale}
                  />
                ))}
              </div>
            </PropsSection>
          ) : null}

          {!visibleCount ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              No open Kalshi props for this matchup right now.
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          {ranked.slice(0, 40).map((p, i) => {
            const pts = view === 'season' ? p.season_ppr : (p.projected_ppr ?? p.fantasypros_pts)
            const detail = yardLine(p, view)
            return (
              <li key={p.sleeper_id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-5 shrink-0 text-center text-[12px] font-semibold tabular-nums text-zinc-500">
                  {i + 1}
                </span>
                <PlayerAvatar player={p} name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-zinc-100">{p.name}</div>
                  <div className="truncate text-[12px] text-zinc-500">
                    {p.position} · {p.team}
                    {detail ? ` · ${detail}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-bold tabular-nums text-zinc-100">{fmt(pts)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {view === 'season' ? 'YTD PPR' : 'Proj PPR'}
                  </div>
                </div>
              </li>
            )
          })}
          {!ranked.length ? (
            <li className="px-3 py-8 text-center text-sm text-zinc-500">
              No Sleeper fantasy board for this game yet.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  )
}
