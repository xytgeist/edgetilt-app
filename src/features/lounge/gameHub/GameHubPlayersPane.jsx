import { useEffect, useMemo, useState, Fragment } from 'react'
import { KalshiPlayerPropsBoard } from './GameHubKalshiProps.jsx'
import { injuryTag } from './GameHubFantasyPane.jsx'

function InjuryPill({ status }) {
  const tag = injuryTag(status)
  if (!tag) return null
  return (
    <span
      title={tag.label}
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ring-inset ${tag.className}`}
    >
      {tag.code}
    </span>
  )
}

function isDefOrDst(player) {
  const p = String(player?.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return p === 'DEF' || p === 'DST' || p === 'D'
}

function PlayerAvatar({ player }) {
  const [failed, setFailed] = useState(false)
  const team = String(player?.team || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  const letter = String(player?.name || team || '?').slice(0, 1).toUpperCase()

  if (isDefOrDst(player) && team && !failed) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-800 p-2 ring-1 ring-zinc-700/80">
        <img
          src={`/sports/nfl/logos/${team}.png`}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }

  if (!player?.headshot_url || failed) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-base font-bold text-zinc-300">
        {letter}
      </span>
    )
  }
  return (
    <img
      src={player.headshot_url}
      alt=""
      className="h-14 w-14 shrink-0 rounded-full object-cover bg-zinc-800"
      onError={() => setFailed(true)}
    />
  )
}

const POSITION_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3 }

function positionRank(pos) {
  const p = String(pos || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p in POSITION_ORDER) return POSITION_ORDER[p]
  if (p === 'FB' || p === 'HB') return POSITION_ORDER.RB
  return 50
}

function fmtStat(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return null
  const v = Number(n)
  if (digits === 0 || Number.isInteger(v)) return String(Math.round(v))
  return v.toFixed(digits)
}

function fmtComma(n, digits = 0) {
  const s = fmtStat(n, digits)
  if (s == null) return null
  const [whole, frac] = s.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac != null ? `${withCommas}.${frac}` : withCommas
}

function pct(numer, denom) {
  if (numer == null || denom == null) return null
  const a = Number(numer)
  const b = Number(denom)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null
  return Math.round((a / b) * 1000) / 10
}

function avg(numer, denom, digits = 1) {
  if (numer == null || denom == null) return null
  const a = Number(numer)
  const b = Number(denom)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null
  return Math.round((a / b) * 10 ** digits) / 10 ** digits
}

/** Pace season counting stats out to a 17-game slate when gp is known. */
function paceSeason(value, gp, digits = 0) {
  if (value == null || gp == null) return null
  const v = Number(value)
  const g = Number(gp)
  if (!Number.isFinite(v) || !Number.isFinite(g) || g < 1) return null
  const paced = (v / g) * 17
  return digits === 0 ? Math.round(paced) : Math.round(paced * 10 ** digits) / 10 ** digits
}

const PASSING_COLS = [
  { key: 'cmp', label: 'CMP' },
  { key: 'att', label: 'ATT' },
  { key: 'cmpPct', label: 'CMP%' },
  { key: 'yds', label: 'YDS' },
  { key: 'avg', label: 'AVG' },
  { key: 'td', label: 'TD' },
  { key: 'int', label: 'INT' },
  { key: 'lng', label: 'LNG' },
  { key: 'sack', label: 'SACK' },
  { key: 'rtg', label: 'RTG' },
]

const RUSHING_COLS = [
  { key: 'car', label: 'CAR' },
  { key: 'yds', label: 'YDS' },
  { key: 'avg', label: 'AVG' },
  { key: 'td', label: 'TD' },
  { key: 'lng', label: 'LNG' },
]

const RECEIVING_COLS = [
  { key: 'tgt', label: 'TGT' },
  { key: 'rec', label: 'REC' },
  { key: 'yds', label: 'YDS' },
  { key: 'avg', label: 'AVG' },
  { key: 'td', label: 'TD' },
  { key: 'lng', label: 'LNG' },
]

const KICKING_COLS = [
  { key: 'fgm', label: 'FGM' },
  { key: 'fga', label: 'FGA' },
  { key: 'fgPct', label: 'FG%' },
]

const DEFENSE_COLS = [
  { key: 'sack', label: 'SACK' },
  { key: 'int', label: 'INT' },
  { key: 'fr', label: 'FR' },
  { key: 'td', label: 'TD' },
  { key: 'pa', label: 'PA' },
]

function passingRow(player, mode) {
  const gp = player.season_gp
  const take = (v, digits = 0) => (mode === 'projected' ? paceSeason(v, gp, digits) : v)
  const cmp = take(player.season_pass_cmp)
  const att = take(player.season_pass_att)
  const yd = take(player.season_pass_yd)
  const td = take(player.season_pass_td)
  const ints = take(player.season_pass_int)
  const sack = take(player.season_pass_sack, 1)
  const has =
    cmp != null || att != null || yd != null || td != null || ints != null || sack != null
  if (!has) return null
  const ypa =
    mode === 'season' && player.season_pass_ypa != null
      ? player.season_pass_ypa
      : avg(yd, att, 1)
  return {
    cmp: fmtStat(cmp, 0),
    att: fmtStat(att, 0),
    cmpPct: fmtStat(pct(cmp, att), 1),
    yds: fmtComma(yd, 0),
    avg: fmtStat(ypa, 1),
    td: fmtStat(td, 0),
    int: fmtStat(ints, 0),
    lng: mode === 'season' ? fmtStat(player.season_pass_lng, 0) : null,
    sack: fmtStat(sack, Number(sack) % 1 === 0 ? 0 : 1),
    rtg: mode === 'season' ? fmtStat(player.season_pass_rtg, 1) : null,
  }
}

function rushingRow(player, mode) {
  const gp = player.season_gp
  const take = (v, digits = 0) => (mode === 'projected' ? paceSeason(v, gp, digits) : v)
  const car = take(player.season_rush_att)
  const yd = take(player.season_rush_yd)
  const td = take(player.season_rush_td)
  if (car == null && yd == null && td == null) return null
  const ypa =
    mode === 'season' && player.season_rush_ypa != null
      ? player.season_rush_ypa
      : avg(yd, car, 1)
  return {
    car: fmtStat(car, 0),
    yds: fmtComma(yd, 0),
    avg: fmtStat(ypa, 1),
    td: fmtStat(td, 0),
    lng: mode === 'season' ? fmtStat(player.season_rush_lng, 0) : null,
  }
}

function receivingRow(player, mode) {
  const gp = player.season_gp
  const take = (v, digits = 0) => (mode === 'projected' ? paceSeason(v, gp, digits) : v)
  const tgt = take(player.season_rec_tgt)
  const rec = take(player.season_rec, 1)
  const yd = take(player.season_rec_yd)
  const td = take(player.season_rec_td)
  if (tgt == null && rec == null && yd == null && td == null) return null
  return {
    tgt: fmtStat(tgt, 0),
    rec: fmtStat(rec, Number(rec) % 1 === 0 ? 0 : 1),
    yds: fmtComma(yd, 0),
    avg: fmtStat(avg(yd, rec, 1), 1),
    td: fmtStat(td, 0),
    lng: mode === 'season' ? fmtStat(player.season_rec_lng, 0) : null,
  }
}

function kickingRow(player, mode) {
  const gp = player.season_gp
  const take = (v) => (mode === 'projected' ? paceSeason(v, gp, 0) : v)
  const made = take(player.season_fgm)
  const miss = take(player.season_fgmiss)
  if (made == null && miss == null) return null
  const m = Number(made) || 0
  const a = m + (Number(miss) || 0)
  return {
    fgm: fmtStat(m, 0),
    fga: fmtStat(a, 0),
    fgPct: fmtStat(pct(m, a), 1),
  }
}

function defenseRow(player, mode) {
  const gp = player.season_gp
  const take = (v, digits = 0) => (mode === 'projected' ? paceSeason(v, gp, digits) : v)
  const sack = take(player.season_sack, 1)
  const ints = take(player.season_def_int)
  const fr = take(player.season_fum_rec)
  const td = take(player.season_def_td)
  const pa = take(player.season_pts_allow, 1)
  if (sack == null && ints == null && fr == null && td == null && pa == null) return null
  return {
    sack: fmtStat(sack, Number(sack) % 1 === 0 ? 0 : 1),
    int: fmtStat(ints, 0),
    fr: fmtStat(fr, 0),
    td: fmtStat(td, 0),
    pa: fmtStat(pa, Number(pa) % 1 === 0 ? 0 : 1),
  }
}

function buildStatGroups(player) {
  const pos = String(player?.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  const groups = []

  const addGroup = (title, cols, builder) => {
    const season = builder(player, 'season')
    const projected = builder(player, 'projected')
    if (!season && !projected) return
    groups.push({
      title,
      cols,
      rows: [
        { label: 'Regular Season', cells: season },
        { label: 'Projected', cells: projected },
      ].filter((r) => r.cells),
    })
  }

  if (pos === 'QB') {
    addGroup('Passing', PASSING_COLS, passingRow)
    addGroup('Rushing', RUSHING_COLS, rushingRow)
  } else if (pos === 'RB' || pos === 'FB' || pos === 'HB') {
    addGroup('Rushing', RUSHING_COLS, rushingRow)
    addGroup('Receiving', RECEIVING_COLS, receivingRow)
  } else if (pos === 'WR' || pos === 'TE') {
    addGroup('Receiving', RECEIVING_COLS, receivingRow)
    addGroup('Rushing', RUSHING_COLS, rushingRow)
  } else if (pos === 'K' || pos === 'PK') {
    addGroup('Kicking', KICKING_COLS, kickingRow)
  } else if (pos === 'DEF' || pos === 'DST' || pos === 'D') {
    addGroup('Defense', DEFENSE_COLS, defenseRow)
  } else {
    addGroup('Passing', PASSING_COLS, passingRow)
    addGroup('Rushing', RUSHING_COLS, rushingRow)
    addGroup('Receiving', RECEIVING_COLS, receivingRow)
  }

  return groups
}

const FAT_STAT_COL_MIN = 5

/**
 * Fat groups (Passing / Rushing / Receiving): one CSS grid with sticky STATS col
 * so vertical rules share a single track. Thin groups (Kicking / Defense): full-width
 * Regular Season | Projected stacks … no empty ESPN chrome.
 */
function RosterSeasonStatsTable({ player }) {
  const groups = buildStatGroups(player)
  if (!groups.length) return null

  const rowLabels = ['Regular Season', 'Projected'].filter((label) =>
    groups.some((g) => g.rows.some((r) => r.label === label)),
  )
  const fatGroups = groups.filter((g) => g.cols.length >= FAT_STAT_COL_MIN)
  const thinGroups = groups.filter((g) => g.cols.length < FAT_STAT_COL_MIN)

  return (
    <div data-roster-season-stats className="mt-3 space-y-2">
      {fatGroups.length ? <RosterFatStatsGrid groups={fatGroups} rowLabels={rowLabels} /> : null}
      {thinGroups.map((group) => (
        <RosterThinStatsBlock key={group.title} group={group} rowLabels={rowLabels} />
      ))}
    </div>
  )
}

function RosterFatStatsGrid({ groups, rowLabels }) {
  const dataCols = groups.flatMap((g) => g.cols.map((c) => ({ ...c, group: g.title })))
  const colCount = dataCols.length
  if (!colCount) return null

  const gridCols = `minmax(5.75rem, max-content) repeat(${colCount}, minmax(2.5rem, max-content))`

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950">
      <div className="overflow-x-auto overscroll-x-contain">
        <div
          className="grid w-max min-w-full border-collapse"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="sticky left-0 z-[1] border-b border-r border-zinc-700/80 bg-zinc-950" />
          {groups.map((group) => (
            <div
              key={`cat-${group.title}`}
              className="flex h-8 items-end justify-center border-b border-zinc-700/80 px-1 pb-1"
              style={{ gridColumn: `span ${group.cols.length}` }}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-300">
                {group.title}
              </span>
            </div>
          ))}

          <div className="sticky left-0 z-[1] flex h-7 items-center border-b border-r border-zinc-700/80 bg-zinc-950 px-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-400">
              Stats
            </span>
          </div>
          {groups.map((group) =>
            group.cols.map((col) => (
              <div
                key={`h-${group.title}-${col.key}`}
                className="flex h-7 items-center justify-center border-b border-l border-zinc-700/80 px-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400"
              >
                {col.label}
              </div>
            )),
          )}

          {rowLabels.map((label, rowIdx) => (
            <Fragment key={label}>
              <div
                className={`sticky left-0 z-[1] flex h-8 items-center border-r border-zinc-700/80 bg-zinc-950 px-2.5 ${
                  rowIdx < rowLabels.length - 1 ? 'border-b' : ''
                }`}
              >
                <span className="whitespace-nowrap text-[11px] text-zinc-400">{label}</span>
              </div>
              {groups.map((group) => {
                const row = group.rows.find((r) => r.label === label)
                return group.cols.map((col) => (
                  <div
                    key={`${label}-${group.title}-${col.key}`}
                    className={`flex h-8 items-center justify-center border-l border-zinc-700/80 px-1 text-[12px] tabular-nums text-zinc-200 ${
                      rowIdx < rowLabels.length - 1 ? 'border-b' : ''
                    }`}
                  >
                    {row?.cells?.[col.key] ?? '—'}
                  </div>
                ))
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

function RosterThinStatsBlock({ group, rowLabels }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-300">{group.title}</div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {rowLabels.map((label) => {
          const row = group.rows.find((r) => r.label === label)
          return (
            <div key={label} className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {label}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
                {group.cols.map((col) => (
                  <div key={col.key} className="min-w-[2.5rem]">
                    <div className="text-[14px] font-bold tabular-nums leading-none text-zinc-100">
                      {row?.cells?.[col.key] ?? '—'}
                    </div>
                    <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                      {col.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Position-primary season number for the right rail (stats card … not fantasy PPR). */
function seasonHeadline(player) {
  const pos = String(player.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (pos === 'QB' && player.season_pass_yd != null) {
    return { value: fmtComma(player.season_pass_yd, 0), label: 'Pass yd' }
  }
  if ((pos === 'RB' || pos === 'FB' || pos === 'HB') && player.season_rush_yd != null) {
    return { value: fmtComma(player.season_rush_yd, 0), label: 'Rush yd' }
  }
  if ((pos === 'WR' || pos === 'TE') && player.season_rec_yd != null) {
    return { value: fmtComma(player.season_rec_yd, 0), label: 'Rec yd' }
  }
  if (pos === 'K' || pos === 'PK') {
    if (player.season_fgm != null || player.season_fgmiss != null) {
      const made = Number(player.season_fgm) || 0
      const miss = Number(player.season_fgmiss) || 0
      return { value: `${made}/${made + miss}`, label: 'FG' }
    }
  }
  if (pos === 'DEF' || pos === 'DST' || pos === 'D') {
    if (player.season_sack != null) {
      return {
        value: fmtStat(player.season_sack, Number(player.season_sack) % 1 === 0 ? 0 : 1),
        label: 'Sack',
      }
    }
  }
  if (player.season_pass_yd != null) {
    return { value: fmtComma(player.season_pass_yd, 0), label: 'Pass yd' }
  }
  if (player.season_rush_yd != null) {
    return { value: fmtComma(player.season_rush_yd, 0), label: 'Rush yd' }
  }
  if (player.season_rec_yd != null) {
    return { value: fmtComma(player.season_rec_yd, 0), label: 'Rec yd' }
  }
  if (player.season_rec != null) {
    return { value: fmtStat(player.season_rec, 1), label: 'Rec' }
  }
  return null
}

function seasonPrimaryYards(player) {
  const pos = String(player.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (pos === 'QB') return Number(player.season_pass_yd) || 0
  if (pos === 'RB' || pos === 'FB' || pos === 'HB') return Number(player.season_rush_yd) || 0
  if (pos === 'WR' || pos === 'TE') return Number(player.season_rec_yd) || 0
  return (
    Number(player.season_pass_yd) ||
    Number(player.season_rush_yd) ||
    Number(player.season_rec_yd) ||
    0
  )
}

function normalizePos(pos) {
  const p = String(pos || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p === 'FB' || p === 'HB') return 'RB'
  return p
}

function RosterBoard({ players }) {
  const [expandedId, setExpandedId] = useState(null)
  const sorted = useMemo(() => {
    const list = [...(players || [])]
    list.sort((a, b) => {
      const sa = a.is_starter === true ? 0 : 1
      const sb = b.is_starter === true ? 0 : 1
      if (sa !== sb) return sa - sb
      const pa = positionRank(a.position)
      const pb = positionRank(b.position)
      if (pa !== pb) return pa - pb
      const da = a.depth_chart_order != null ? Number(a.depth_chart_order) : 99
      const db = b.depth_chart_order != null ? Number(b.depth_chart_order) : 99
      if (da !== db) return da - db
      const ya = seasonPrimaryYards(a)
      const yb = seasonPrimaryYards(b)
      if (yb !== ya) return yb - ya
      return (a.search_rank ?? 9999) - (b.search_rank ?? 9999)
    })
    return list
  }, [players])

  if (!sorted.length) {
    return <div className="py-6 text-center text-sm text-zinc-500">No players for that filter.</div>
  }

  return (
    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {sorted.map((p) => {
        const headline = seasonHeadline(p)
        const rank =
          p.season_pos_rank != null
            ? `#${p.season_pos_rank}${p.season_pos_rank_of != null ? `/${p.season_pos_rank_of}` : ''}`
            : null
        const id = String(p.sleeper_id)
        const expanded = expandedId === id
        const hasStats = buildStatGroups(p).length > 0
        return (
          <li key={id} className="px-3.5 py-3.5">
            <button
              type="button"
              disabled={!hasStats}
              aria-expanded={hasStats ? expanded : undefined}
              onClick={() => {
                if (!hasStats) return
                setExpandedId((cur) => (cur === id ? null : id))
              }}
              className={`flex w-full items-start gap-3 text-left touch-manipulation ${
                hasStats ? 'active:opacity-90' : ''
              }`}
            >
              <PlayerAvatar player={p} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="truncate text-[16px] font-semibold text-zinc-100">{p.name}</div>
                  <InjuryPill status={p.injury_status} />
                </div>
                <div className="mt-0.5 text-[12px] text-zinc-500">
                  {p.position || '-'} · {p.team}
                  {p.is_starter ? ' · Starter' : ''}
                  {rank ? ` · ${rank}` : ''}
                </div>
              </div>
              {headline ? (
                <div className="shrink-0 pt-0.5 text-right">
                  <div className="text-[18px] font-bold tabular-nums text-zinc-100">{headline.value}</div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">{headline.label}</div>
                </div>
              ) : null}
              {hasStats ? (
                <span
                  aria-hidden
                  className={`mt-2 shrink-0 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : null}
            </button>
            {expanded ? <RosterSeasonStatsTable player={p} /> : null}
          </li>
        )
      })}
    </ul>
  )
}

const POSITION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'QB', label: 'QB' },
  { id: 'RB', label: 'RB' },
  { id: 'WR', label: 'WR' },
  { id: 'TE', label: 'TE' },
]

/**
 * Players hub surface: Roster + Kalshi/Poly player props.
 */
export default function GameHubPlayersPane({
  players,
  props,
  loading,
  error,
  defaultView = 'roster',
}) {
  const [view, setView] = useState(defaultView === 'props' ? 'props' : 'roster')
  const [position, setPosition] = useState('all')

  useEffect(() => {
    setView(defaultView === 'props' ? 'props' : 'roster')
  }, [defaultView])

  const filteredPlayers = useMemo(() => {
    if (position === 'all') return players || []
    return (players || []).filter((p) => normalizePos(p.position) === position)
  }, [players, position])

  const filteredProps = useMemo(() => {
    if (position === 'all') return props || []
    const names = new Set(
      (players || [])
        .filter((p) => normalizePos(p.position) === position)
        .map((p) => String(p.name || '').trim().toLowerCase())
        .filter(Boolean),
    )
    return (props || []).filter((p) => {
      const name = String(p.player_name || '').trim().toLowerCase()
      return name && names.has(name)
    })
  }, [props, players, position])

  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading players…</div>
  if (error) return <div className="py-10 text-center text-sm text-lv-red">{error}</div>

  return (
    <div data-lounge-game-players className="space-y-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-zinc-900 p-0.5">
          {[
            { id: 'roster', label: 'Roster' },
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
        <label className="relative ml-auto inline-flex items-center">
          <span className="sr-only">Position</span>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="appearance-none rounded-full border border-zinc-700 bg-zinc-900 py-1 pl-3 pr-7 font-sans text-[12px] font-semibold leading-none text-zinc-200 outline-none focus:border-zinc-500"
          >
            {POSITION_FILTERS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id === 'all' ? 'All positions' : opt.label}
              </option>
            ))}
          </select>
          <svg
            data-pos-filter-caret
            viewBox="0 0 20 20"
            className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-zinc-200"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.936a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </label>
      </div>

      {view === 'roster' ? (
        !players?.length ? (
          <div className="py-10 text-center text-sm text-zinc-500">No roster data for this matchup yet.</div>
        ) : (
          <RosterBoard players={filteredPlayers} />
        )
      ) : null}

      {view === 'props' ? (
        <KalshiPlayerPropsBoard props={filteredProps} players={filteredPlayers} />
      ) : null}
    </div>
  )
}
