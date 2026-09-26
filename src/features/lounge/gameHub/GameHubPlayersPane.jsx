import { useEffect, useMemo, useState, Fragment } from 'react'
import { KalshiPlayerPropsBoard } from './GameHubKalshiProps.jsx'
import { injuryTag } from './GameHubFantasyPane.jsx'
import {
  LoungeSportsTeamLogo,
  useLoungeSportsPillWashAndLogos,
} from '../loungeSportsPillPaint.jsx'

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

function logoTeamKey(team) {
  return String(team || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
}

function PlayerAvatar({ player, accentColor, logoBase = '/sports/nfl/logos' }) {
  const [failed, setFailed] = useState(false)
  const team = logoTeamKey(player?.team)
  const letter = String(player?.name || team || '?').slice(0, 1).toUpperCase()
  const fill = accentColor ? { backgroundColor: accentColor } : undefined

  if (isDefOrDst(player) && team && !failed) {
    return (
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full p-2 ring-1 ring-zinc-700/80"
        style={fill || undefined}
      >
        <img
          src={`${logoBase}/${team}.png`}
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
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ring-1 ring-zinc-700/80"
        style={fill || undefined}
      >
        {letter}
      </span>
    )
  }
  return (
    <span
      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-1 ring-zinc-700/80"
      style={fill || undefined}
    >
      <img
        src={player.headshot_url}
        alt=""
        className="absolute inset-0 h-full w-full origin-[center_22%] scale-[1.42] object-cover object-[center_18%]"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
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

/** Like fmtStat, but null → "0" when the position always shows the column. */
function fmtStatOrZero(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '0'
  return fmtStat(n, digits)
}

function fmtComma(n, digits = 0) {
  const s = fmtStat(n, digits)
  if (s == null) return null
  const [whole, frac] = s.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac != null ? `${withCommas}.${frac}` : withCommas
}

function fmtCommaOrZero(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '0'
  return fmtComma(n, digits) ?? '0'
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

const FUMBLES_COLS = [{ key: 'lost', label: 'FUM' }]

const KICKING_COLS = [
  { key: 'fgPct', label: 'FG%' },
  { key: 'fg', label: 'FG' },
  { key: 'fg019', label: '1-19' },
  { key: 'fg2029', label: '20-29' },
  { key: 'fg3039', label: '30-39' },
  { key: 'fg4049', label: '40-49' },
  { key: 'fg50p', label: '50+' },
  { key: 'avg', label: 'AVG' },
  { key: 'lng', label: 'LNG' },
  { key: 'xpm', label: 'XPM' },
  { key: 'xpa', label: 'XPA' },
  { key: 'pts', label: 'PTS' },
]

const DEFENSE_COLS = [
  { key: 'sack', label: 'SACK' },
  { key: 'int', label: 'INT' },
  { key: 'fr', label: 'FR' },
  { key: 'td', label: 'TD' },
  { key: 'pa', label: 'PA' },
]

/** season | projected (pace) | career (summed Sleeper seasons). */
function getStat(player, mode, seasonKey, careerKey, digits = 0) {
  if (mode === 'projected') return paceSeason(player[seasonKey], player.season_gp, digits)
  if (mode === 'career') {
    const v = player.career?.[careerKey]
    return v == null || !Number.isFinite(Number(v)) ? null : Number(v)
  }
  const v = player[seasonKey]
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v)
}

function fmtMadeAtt(made, miss, forceZeros = false) {
  if (made == null && miss == null) return forceZeros ? '0-0' : null
  const m = Number(made) || 0
  const a = m + (Number(miss) || 0)
  return `${m}-${a}`
}

function passingRow(player, mode, { forceZeros = false } = {}) {
  const cmp = getStat(player, mode, 'season_pass_cmp', 'pass_cmp')
  const att = getStat(player, mode, 'season_pass_att', 'pass_att')
  const yd = getStat(player, mode, 'season_pass_yd', 'pass_yd')
  const td = getStat(player, mode, 'season_pass_td', 'pass_td')
  const ints = getStat(player, mode, 'season_pass_int', 'pass_int')
  const sack = getStat(player, mode, 'season_pass_sack', 'pass_sack', 1)
  const has =
    cmp != null || att != null || yd != null || td != null || ints != null || sack != null
  if (!forceZeros && !has) return null
  const ypa =
    mode === 'season' && player.season_pass_ypa != null
      ? player.season_pass_ypa
      : mode === 'career' && player.career?.pass_ypa != null
        ? player.career.pass_ypa
        : avg(yd, att, 1)
  const cell = forceZeros ? fmtStatOrZero : fmtStat
  const cellComma = forceZeros ? fmtCommaOrZero : fmtComma
  const lngRaw =
    mode === 'projected' ? null : getStat(player, mode, 'season_pass_lng', 'pass_lng')
  const rtgRaw = mode === 'season' ? player.season_pass_rtg : null
  return {
    cmp: cell(cmp, 0),
    att: cell(att, 0),
    cmpPct: forceZeros ? fmtStatOrZero(pct(cmp, att), 1) : fmtStat(pct(cmp, att), 1),
    yds: cellComma(yd, 0),
    avg: forceZeros ? fmtStatOrZero(ypa, 1) : fmtStat(ypa, 1),
    td: cell(td, 0),
    int: cell(ints, 0),
    lng: mode === 'projected' ? null : forceZeros ? fmtStatOrZero(lngRaw, 0) : fmtStat(lngRaw, 0),
    sack: cell(sack, Number(sack) % 1 === 0 ? 0 : 1),
    rtg: mode === 'season' ? fmtStat(rtgRaw, 1) : null,
  }
}

function rushingRow(player, mode, { forceZeros = false } = {}) {
  const car = getStat(player, mode, 'season_rush_att', 'rush_att')
  const yd = getStat(player, mode, 'season_rush_yd', 'rush_yd')
  const td = getStat(player, mode, 'season_rush_td', 'rush_td')
  if (!forceZeros && car == null && yd == null && td == null) return null
  const ypa =
    mode === 'season' && player.season_rush_ypa != null
      ? player.season_rush_ypa
      : mode === 'career' && player.career?.rush_ypa != null
        ? player.career.rush_ypa
        : avg(yd, car, 1)
  const cell = forceZeros ? fmtStatOrZero : fmtStat
  const cellComma = forceZeros ? fmtCommaOrZero : fmtComma
  const lngRaw =
    mode === 'projected' ? null : getStat(player, mode, 'season_rush_lng', 'rush_lng')
  return {
    car: cell(car, 0),
    yds: cellComma(yd, 0),
    avg: forceZeros ? fmtStatOrZero(ypa, 1) : fmtStat(ypa, 1),
    td: cell(td, 0),
    lng: mode === 'projected' ? null : forceZeros ? fmtStatOrZero(lngRaw, 0) : fmtStat(lngRaw, 0),
  }
}

function receivingRow(player, mode, { forceZeros = false } = {}) {
  const tgt = getStat(player, mode, 'season_rec_tgt', 'rec_tgt')
  const rec = getStat(player, mode, 'season_rec', 'rec', 1)
  const yd = getStat(player, mode, 'season_rec_yd', 'rec_yd')
  const td = getStat(player, mode, 'season_rec_td', 'rec_td')
  if (!forceZeros && tgt == null && rec == null && yd == null && td == null) return null
  const cell = forceZeros ? fmtStatOrZero : fmtStat
  const cellComma = forceZeros ? fmtCommaOrZero : fmtComma
  const ypr = avg(yd, rec, 1)
  const lngRaw =
    mode === 'projected' ? null : getStat(player, mode, 'season_rec_lng', 'rec_lng')
  return {
    tgt: cell(tgt, 0),
    rec: cell(rec, Number(rec) % 1 === 0 ? 0 : 1),
    yds: cellComma(yd, 0),
    avg: forceZeros ? fmtStatOrZero(ypr, 1) : fmtStat(ypr, 1),
    td: cell(td, 0),
    lng: mode === 'projected' ? null : forceZeros ? fmtStatOrZero(lngRaw, 0) : fmtStat(lngRaw, 0),
  }
}

function fumblesRow(player, mode, { forceZeros = false } = {}) {
  const lost = getStat(player, mode, 'season_fum_lost', 'fum_lost')
  if (!forceZeros && lost == null) return null
  return {
    lost: forceZeros ? fmtStatOrZero(lost, 0) : fmtStat(lost, 0),
  }
}

function kickingRow(player, mode, { forceZeros = false } = {}) {
  const made = getStat(player, mode, 'season_fgm', 'fgm')
  const miss = getStat(player, mode, 'season_fgmiss', 'fgmiss')
  const m019 = getStat(player, mode, 'season_fgm_0_19', 'fgm_0_19')
  const x019 = getStat(player, mode, 'season_fgmiss_0_19', 'fgmiss_0_19')
  const m2029 = getStat(player, mode, 'season_fgm_20_29', 'fgm_20_29')
  const x2029 = getStat(player, mode, 'season_fgmiss_20_29', 'fgmiss_20_29')
  const m3039 = getStat(player, mode, 'season_fgm_30_39', 'fgm_30_39')
  const x3039 = getStat(player, mode, 'season_fgmiss_30_39', 'fgmiss_30_39')
  const m4049 = getStat(player, mode, 'season_fgm_40_49', 'fgm_40_49')
  const x4049 = getStat(player, mode, 'season_fgmiss_40_49', 'fgmiss_40_49')
  const m50 = getStat(player, mode, 'season_fgm_50p', 'fgm_50p')
  const x50 = getStat(player, mode, 'season_fgmiss_50p', 'fgmiss_50p')
  const yds = getStat(player, mode, 'season_fgm_yds', 'fgm_yds')
  const lng = mode === 'projected' ? null : getStat(player, mode, 'season_fgm_lng', 'fgm_lng')
  const xpm = getStat(player, mode, 'season_xpm', 'xpm')
  const xpa = getStat(player, mode, 'season_xpa', 'xpa')
  const pts = getStat(player, mode, 'season_kick_pts', 'kick_pts', 1)
  const has =
    made != null ||
    miss != null ||
    xpm != null ||
    m2029 != null ||
    m3039 != null ||
    m4049 != null ||
    m50 != null
  if (!forceZeros && !has) return null
  const m = made == null && !forceZeros ? null : Number(made) || 0
  const a = m == null ? null : m + (Number(miss) || 0)
  const fgAvg = avg(yds, made, 1)
  const cell = forceZeros ? fmtStatOrZero : fmtStat
  return {
    fgPct: forceZeros ? fmtStatOrZero(pct(m, a), 1) : fmtStat(pct(m, a), 1),
    fg: fmtMadeAtt(made, miss, forceZeros),
    fg019: fmtMadeAtt(m019, x019, forceZeros),
    fg2029: fmtMadeAtt(m2029, x2029, forceZeros),
    fg3039: fmtMadeAtt(m3039, x3039, forceZeros),
    fg4049: fmtMadeAtt(m4049, x4049, forceZeros),
    fg50p: fmtMadeAtt(m50, x50, forceZeros),
    avg: mode === 'projected' ? null : forceZeros ? fmtStatOrZero(fgAvg, 1) : fmtStat(fgAvg, 1),
    lng: mode === 'projected' ? null : forceZeros ? fmtStatOrZero(lng, 0) : fmtStat(lng, 0),
    xpm: cell(xpm, 0),
    xpa: cell(xpa, 0),
    pts: cell(pts, Number(pts) % 1 === 0 ? 0 : 1),
  }
}

function defenseRow(player, mode, { forceZeros = false } = {}) {
  const sack = getStat(player, mode, 'season_sack', 'sack', 1)
  const ints = getStat(player, mode, 'season_def_int', 'def_int')
  const fr = getStat(player, mode, 'season_fum_rec', 'fum_rec')
  const td = getStat(player, mode, 'season_def_td', 'def_td')
  const pa = getStat(player, mode, 'season_pts_allow', 'pts_allow', 1)
  if (!forceZeros && sack == null && ints == null && fr == null && td == null && pa == null) {
    return null
  }
  const cell = forceZeros ? fmtStatOrZero : fmtStat
  return {
    sack: cell(sack, Number(sack) % 1 === 0 ? 0 : 1),
    int: cell(ints, 0),
    fr: cell(fr, 0),
    td: cell(td, 0),
    pa: cell(pa, Number(pa) % 1 === 0 ? 0 : 1),
  }
}

function buildStatGroups(player) {
  const pos = String(player?.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  const groups = []
  const hasCareer = player?.career != null && typeof player.career === 'object'

  const addGroup = (title, cols, builder, opts = {}) => {
    const season = builder(player, 'season', opts)
    const projected = builder(player, 'projected', opts)
    const career = hasCareer ? builder(player, 'career', opts) : null
    if (!season && !projected && !career) return
    groups.push({
      title,
      cols,
      rows: [
        { label: 'Regular Season', cells: season },
        { label: 'Projected', cells: projected },
        { label: 'Career', cells: career },
      ].filter((r) => r.cells),
    })
  }

  if (pos === 'QB') {
    addGroup('Passing', PASSING_COLS, passingRow)
    addGroup('Rushing', RUSHING_COLS, rushingRow)
  } else if (pos === 'RB' || pos === 'FB' || pos === 'HB') {
    addGroup('Rushing', RUSHING_COLS, rushingRow, { forceZeros: true })
    addGroup('Receiving', RECEIVING_COLS, receivingRow, { forceZeros: true })
    addGroup('Fumbles', FUMBLES_COLS, fumblesRow, { forceZeros: true })
  } else if (pos === 'WR' || pos === 'TE') {
    addGroup('Receiving', RECEIVING_COLS, receivingRow, { forceZeros: true })
    addGroup('Rushing', RUSHING_COLS, rushingRow, { forceZeros: true })
    addGroup('Fumbles', FUMBLES_COLS, fumblesRow, { forceZeros: true })
  } else if (pos === 'K' || pos === 'PK') {
    addGroup('Kicking', KICKING_COLS, kickingRow, { forceZeros: true })
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
function RosterSeasonStatsTable({ player, edgeBleed = false }) {
  const groups = buildStatGroups(player)
  if (!groups.length) return null

  const rowLabels = ['Regular Season', 'Projected', 'Career'].filter((label) =>
    groups.some((g) => g.rows.some((r) => r.label === label)),
  )
  const fatCapable = groups.some((g) => g.cols.length >= FAT_STAT_COL_MIN)
  // Keep Fumbles (1 col) in the same aligned grid as rush/rec when present.
  const fatGroups = fatCapable ? groups : []
  const thinGroups = fatCapable ? [] : groups

  return (
    <div
      data-roster-season-stats
      className={edgeBleed ? 'mt-0' : 'mt-3 -mx-3.5'}
    >
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

  // Fixed min tracks + horizontal scroll … never crush labels into each other with 1fr.
  const gridCols = `minmax(5.5rem, max-content) repeat(${colCount}, minmax(2.4rem, max-content))`

  return (
    <div className="overflow-hidden border-t border-zinc-700/80 bg-zinc-950">
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="grid w-max min-w-full" style={{ gridTemplateColumns: gridCols }}>
          <div className="sticky left-0 z-[1] border-b border-r border-zinc-700/80 bg-zinc-950" />
          {groups.map((group) => (
            <div
              key={`cat-${group.title}`}
              className="flex h-8 items-end justify-center border-b border-zinc-700/80 px-1.5 pb-1"
              style={{ gridColumn: `span ${group.cols.length}` }}
            >
              <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-300">
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
                className="flex h-7 items-center justify-center border-b border-l border-zinc-700/80 px-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400"
              >
                <span className="whitespace-nowrap">{col.label}</span>
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
                    className={`flex h-8 items-center justify-center border-l border-zinc-700/80 px-1.5 text-[12px] tabular-nums text-zinc-200 ${
                      rowIdx < rowLabels.length - 1 ? 'border-b' : ''
                    }`}
                  >
                    <span className="whitespace-nowrap">{row?.cells?.[col.key] ?? '—'}</span>
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
    <div className="border-t border-zinc-700/80 bg-zinc-950 px-3.5 py-2.5">
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
  if (p === 'OT' || p === 'OG' || p === 'G' || p === 'T' || p === 'C' || p === 'OL') return 'OL'
  if (p === 'DE' || p === 'DT' || p === 'NT' || p === 'DL') return 'DL'
  if (p === 'ILB' || p === 'OLB' || p === 'LB' || p === 'MLB') return 'LB'
  if (p === 'CB' || p === 'S' || p === 'SAF' || p === 'FS' || p === 'SS' || p === 'DB') return 'DB'
  if (p === 'PK') return 'K'
  return p
}

function teamAbbrev(value) {
  return logoTeamKey(value)
}

function isCfbGame(game) {
  return String(game?.sport_key || '').includes('ncaaf')
}

function rosterAccentForPlayer(player, game, paint) {
  const team = teamAbbrev(player?.team)
  const away = teamAbbrev(game?.away?.abbrev)
  const home = teamAbbrev(game?.home?.abbrev)
  if (team && away && team === away) {
    return {
      color: paint.awayColor || '#3f3f46',
      side: game?.away || { abbrev: team },
      treatment: paint.awayTreatment || 'halo',
    }
  }
  if (team && home && team === home) {
    return {
      color: paint.homeColor || '#3f3f46',
      side: game?.home || { abbrev: team },
      treatment: paint.homeTreatment || 'halo',
    }
  }
  return {
    color: paint.homeColor || paint.awayColor || '#3f3f46',
    side: game?.home || game?.away || { abbrev: team || '?' },
    treatment: paint.homeTreatment || paint.awayTreatment || 'halo',
  }
}

/** Faded team logo + Fantasy jersey mesh (card-color tint, not team wash). */
function RosterPlayerHeader({ player, accent, expanded, hasStats, onToggle, logoBase }) {
  const headline = seasonHeadline(player)
  return (
    <div data-roster-player-header className="relative overflow-hidden px-3.5 py-3.5">
      <span
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        <img
          data-roster-jersey-mesh
          src="/sports/nfl/textures/jersey-mesh-1.jpg"
          alt=""
        />
        <span data-roster-jersey-tint />
      </span>
      <span
        className="pointer-events-none absolute top-1/2 z-[1] -translate-y-1/2 right-1"
        style={{ opacity: 0.12 }}
        aria-hidden="true"
      >
        <LoungeSportsTeamLogo side={accent.side} treatment={accent.treatment} size={196} />
      </span>
      <button
        type="button"
        disabled={!hasStats}
        aria-expanded={hasStats ? expanded : undefined}
        onClick={onToggle}
        className={`relative z-[2] flex w-full items-start gap-3 text-left touch-manipulation ${
          hasStats ? 'active:opacity-90' : ''
        }`}
      >
        <PlayerAvatar player={player} accentColor={accent.color} logoBase={logoBase} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-[16px] font-semibold text-zinc-100">{player.name}</div>
            <InjuryPill status={player.injury_status} />
          </div>
          <div className="mt-0.5 text-[12px] text-zinc-500">
            {player.position || '-'}
            {player.jersey ? ` #${player.jersey}` : ''}
            {' · '}
            {player.team}
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
    </div>
  )
}

function RosterBoard({ players, game }) {
  const [expandedId, setExpandedId] = useState(null)
  const paint = useLoungeSportsPillWashAndLogos(game)
  const logoBase = isCfbGame(game) ? '/sports/cfb/logos' : '/sports/nfl/logos'
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
      const ja = Number(a.jersey)
      const jb = Number(b.jersey)
      if (Number.isFinite(ja) && Number.isFinite(jb) && ja !== jb) return ja - jb
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

  // One stable <ul> ... expand in place. Splitting into before/mid/after lists remounted
  // every row (new parents) and made headshots + jersey mesh flash on each tap.
  return (
    <ul
      data-roster-list
      className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
    >
      {sorted.map((p) => {
        const id = String(p.sleeper_id)
        const hasStats = buildStatGroups(p).length > 0
        const accent = rosterAccentForPlayer(p, game, paint)
        const expanded = expandedId === id
        return (
          <li
            key={id}
            data-roster-player-card={expanded ? '' : undefined}
            data-expanded={expanded ? '' : undefined}
            className="overflow-hidden"
          >
            <RosterPlayerHeader
              player={p}
              accent={accent}
              expanded={expanded}
              hasStats={hasStats}
              logoBase={logoBase}
              onToggle={() => {
                if (!hasStats) return
                setExpandedId((cur) => (cur === id ? null : id))
              }}
            />
            {expanded && hasStats ? <RosterSeasonStatsTable player={p} edgeBleed /> : null}
          </li>
        )
      })}
    </ul>
  )
}

const NFL_POSITION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'QB', label: 'QB' },
  { id: 'RB', label: 'RB' },
  { id: 'WR', label: 'WR' },
  { id: 'TE', label: 'TE' },
]

const CFB_POSITION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'QB', label: 'QB' },
  { id: 'RB', label: 'RB' },
  { id: 'WR', label: 'WR' },
  { id: 'TE', label: 'TE' },
  { id: 'OL', label: 'OL' },
  { id: 'DL', label: 'DL' },
  { id: 'LB', label: 'LB' },
  { id: 'DB', label: 'DB' },
  { id: 'K', label: 'K' },
  { id: 'P', label: 'P' },
]

/**
 * Players hub surface: Roster + Kalshi/Poly player props (NFL).
 * CFB: roster only from cfb_players.
 */
export default function GameHubPlayersPane({
  players,
  props,
  loading,
  error,
  game = null,
  defaultView = 'roster',
}) {
  const cfb = isCfbGame(game)
  const positionFilters = cfb ? CFB_POSITION_FILTERS : NFL_POSITION_FILTERS
  const [view, setView] = useState(defaultView === 'props' && !cfb ? 'props' : 'roster')
  const [position, setPosition] = useState('all')

  useEffect(() => {
    setView(defaultView === 'props' && !cfb ? 'props' : 'roster')
  }, [defaultView, cfb])

  useEffect(() => {
    setPosition('all')
  }, [game?.id, cfb])

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
        {cfb ? null : (
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
        )}
        <label className={`relative inline-flex items-center ${cfb ? '' : 'ml-auto'}`}>
          <span className="sr-only">Position</span>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="appearance-none rounded-full border border-zinc-700 bg-zinc-900 py-1 pl-3 pr-7 font-sans text-[12px] font-semibold leading-none text-zinc-200 outline-none focus:border-zinc-500"
          >
            {positionFilters.map((opt) => (
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
          <RosterBoard players={filteredPlayers} game={game} />
        )
      ) : null}

      {view === 'props' ? (
        <KalshiPlayerPropsBoard props={filteredProps} players={filteredPlayers} />
      ) : null}
    </div>
  )
}
