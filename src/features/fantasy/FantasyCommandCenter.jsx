import { useMemo, useRef, useState } from 'react'

const TOOLS = [
  {
    id: 'start',
    label: 'Start/Sit',
    body: 'The synced starters are what the host has in the lineup. A suggested swap needs the value engine, which is not computing yet.',
  },
  {
    id: 'waiver',
    label: 'Waivers',
    body: 'Waiver rank is this league’s free agents, not a global top 50. That pool is not synced yet.',
  },
  {
    id: 'trade',
    label: 'Trades',
    body: 'Trade finder and offer review need every roster’s need and surplus. Not computing yet.',
  },
  {
    id: 'live',
    label: 'Live',
    body: 'Live week scores for your starters sit on the NFL game hubs. A fantasy week board is next.',
  },
  {
    id: 'fliers',
    label: 'Fliers',
    body: 'A flier is a small bet that pays when a starter busts or an opponent goes off. Nothing is suggested until that hedge exists.',
  },
]

function providerLabel(provider) {
  if (provider === 'yahoo') return 'Yahoo'
  if (provider === 'sleeper') return 'Sleeper'
  if (provider === 'espn') return 'ESPN'
  if (provider === 'cbs') return 'CBS'
  return provider || ''
}

function recordLine(t) {
  if (!t) return ''
  const w = Number(t.wins) || 0
  const l = Number(t.losses) || 0
  const ti = Number(t.ties) || 0
  return ti > 0 ? `${w}-${l}-${ti}` : `${w}-${l}`
}

function TeamLogo({ team }) {
  const [failed, setFailed] = useState(false)
  const url = String(team?.avatar_url || '').trim()
  const letter = String(team?.team_name || '?').trim().slice(0, 1).toUpperCase() || '?'
  if (!url || failed) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[13px] font-bold"
        style={{ color: '#fff' }}
      >
        {letter}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full bg-zinc-800 object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function scoreText(value) {
  if (value == null || value === '') return '-'
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return n.toFixed(1)
}

function injuryLabel(status) {
  const s = String(status || '').trim()
  if (!s) return ''
  if (/^q(uestionable)?$/i.test(s)) return 'Q'
  if (/^d(oubtful)?$/i.test(s)) return 'D'
  if (/^out$/i.test(s)) return 'Out'
  if (/^ir$/i.test(s)) return 'IR'
  return s.length > 12 ? s.slice(0, 12) : s
}

function startersOf(rows) {
  return (rows || []).filter((r) => r.slot === 'starter')
}

function fantasyPos(position) {
  const p = String(position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (p === 'FB' || p === 'HB') return 'RB'
  if (p === 'DST' || p === 'D' || p === 'DEF') return 'DEF'
  if (p === 'PK') return 'K'
  return p
}

function shortName(name, position) {
  if (fantasyPos(position) === 'DEF') return String(name || 'DEF').toUpperCase()
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0].toUpperCase()
  return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(' ').toUpperCase()}`
}

function slotPill(row, index) {
  const raw = String(row?.slot_label || '')
  const named = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw
  if (named && !/^\d+$/.test(named)) return named
  return fantasyPos(row?.position) || `${index + 1}`
}

function pairBySlot(left, right) {
  const n = Math.max(left.length, right.length)
  const pairs = []
  for (let i = 0; i < n; i += 1) {
    const label = slotPill(left[i] || right[i], i)
    pairs.push({
      key: `${label}-${i}`,
      label,
      left: left[i] || null,
      right: right[i] || null,
    })
  }
  return pairs
}

function benchOf(rows) {
  return (rows || []).filter((r) => r.slot !== 'starter')
}

function pairLineup(leftRows, rightRows) {
  const left = leftRows || []
  const right = rightRows || []
  const nfl = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
  const sample = left.concat(right)
  if (sample.length && !sample.some((row) => nfl.has(fantasyPos(row.position)))) {
    return pairBySlot(left, right)
  }
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  const bucket = (rows) => {
    const map = {}
    for (const row of rows) {
      const pos = fantasyPos(row.position)
      if (!map[pos]) map[pos] = []
      map[pos].push(row)
    }
    return map
  }
  const leftBuckets = bucket(left)
  const rightBuckets = bucket(right)
  const pairs = []
  for (const pos of order) {
    const a = leftBuckets[pos] || []
    const b = rightBuckets[pos] || []
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      pairs.push({
        key: `${pos}-${i}`,
        label: n > 1 ? `${pos}${i + 1}` : pos,
        left: a[i] || null,
        right: b[i] || null,
      })
    }
  }
  return pairs
}

function pairStarters(leftRows, rightRows) {
  return pairLineup(startersOf(leftRows), startersOf(rightRows))
}

function pairBench(leftRows, rightRows) {
  return pairLineup(benchOf(leftRows), benchOf(rightRows))
}

function isDefense(row) {
  const p = String(row?.position || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return p === 'DEF' || p === 'DST' || p === 'D'
}

function teamAbbrev(row) {
  return String(row?.nfl_team || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

function PlayerAvatar({ row, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  const team = teamAbbrev(row)
  const letter = String(row?.player_name || team || '?').slice(0, 1).toUpperCase()
  const box = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'

  if (isDefense(row) && team && !failed) {
    return (
      <img
        src={`/sports/nfl/logos/${team}.png`}
        alt=""
        className={`${box} shrink-0 object-contain`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    )
  }

  if (!row?.headshot_url || failed) {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center text-xs font-bold text-zinc-400`}>
        {letter}
      </span>
    )
  }

  return (
    <span className={`relative ${box} shrink-0 overflow-hidden`}>
      <img
        src={row.headshot_url}
        alt=""
        className="absolute inset-0 h-full w-full origin-[center_22%] scale-[1.42] object-cover object-[center_18%]"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function pts(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(1)
}

function cents(price) {
  const n = Number(price)
  if (!Number.isFinite(n)) return ''
  const p = n <= 1 ? n * 100 : n
  return `${Math.round(p)}¢`
}

function gameWhen(card) {
  if (card?.kickoff) {
    const d = new Date(card.kickoff)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    }
  }
  if (card?.game_date) {
    const d = new Date(`${card.game_date}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return ''
}

function injuryPill(status) {
  const label = injuryLabel(status)
  if (!label) return null
  const out = label === 'Out' || label === 'IR'
  return (
    <span
      className={`shrink-0 rounded px-1 text-[9px] font-bold uppercase ${
        out ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-500/15 text-rose-300'
      }`}
    >
      {label}
    </span>
  )
}

function VsSide({ row, card, align }) {
  if (!row) return <div />
  const when = gameWhen(card)
  const side = card?.bye ? 'Bye' : card?.opponent ? `${card.home ? 'vs' : '@'} ${card.opponent}` : ''
  const gameLine = [when, side].filter(Boolean).join(' ')
  const prop = card?.main_prop
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <PlayerAvatar row={row} size="sm" />
        <div className="min-w-0">
          <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
            <span className="truncate text-[12px] font-bold tracking-wide text-zinc-100">
              {shortName(row.player_name, row.position)}
            </span>
            {injuryPill(row.injury_status)}
          </div>
          <div className="truncate text-[10px] text-zinc-500">
            {fantasyPos(row.position) || row.position}
            {row.nfl_team ? ` · ${row.nfl_team}` : ''}
          </div>
        </div>
      </div>
      {gameLine ? <div className="mt-0.5 truncate text-[10px] text-zinc-500">{gameLine}</div> : null}
      {prop?.label ? (
        <div className="mt-0.5 truncate text-[10px] font-semibold text-sky-300">
          {prop.label}
          {cents(prop.price) ? ` · ${cents(prop.price)}` : ''}
        </div>
      ) : null}
    </div>
  )
}

function MatchupRows({ pairs, cards, cardsLoading, bench }) {
  const [openKey, setOpenKey] = useState(null)
  if (!pairs.length) return null
  return (
    <>
      {pairs.map((pair) => {
        const rowKey = `${bench ? 'b' : 's'}-${pair.key}`
        const open = openKey === rowKey
        const leftCard = pair.left?.sleeper_id ? cards?.[pair.left.sleeper_id] : null
        const rightCard = pair.right?.sleeper_id ? cards?.[pair.right.sleeper_id] : null
        const leftProj = pts(leftCard?.projected)
        const rightProj = pts(rightCard?.projected)
        return (
          <li
            key={rowKey}
            className={`border-b border-zinc-800/80 last:border-b-0 ${bench ? 'fantasy-bench-row' : ''}`}
          >
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : rowKey)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 px-2 py-2.5 text-left"
            >
              <VsSide row={pair.left} card={leftCard} align="left" />
              <div className="flex items-center gap-1">
                <span className="w-8 text-right text-[13px] font-bold tabular-nums text-zinc-100">
                  {leftProj || (cardsLoading ? '…' : '-')}
                </span>
                <span
                  className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ color: '#fff' }}
                >
                  {pair.label}
                </span>
                <span className="w-8 text-[13px] font-bold tabular-nums text-zinc-100">
                  {rightProj || (cardsLoading ? '…' : '-')}
                </span>
              </div>
              <VsSide row={pair.right} card={rightCard} align="right" />
            </button>
            {open ? (
              <div className="grid grid-cols-2 gap-3 px-3 pb-3 text-[12px] leading-snug text-zinc-400">
                <PropList row={pair.left} card={leftCard} />
                <PropList row={pair.right} card={rightCard} />
              </div>
            ) : null}
          </li>
        )
      })}
    </>
  )
}

function VsMatchup({ mine, opp, cards, cardsLoading }) {
  const starters = pairStarters(mine, opp)
  const bench = pairBench(mine, opp)
  if (!starters.length && !bench.length) {
    return <p className="px-1 text-[13px] text-zinc-500">No players synced for this matchup.</p>
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80">
      <ul>
        <MatchupRows pairs={starters} cards={cards} cardsLoading={cardsLoading} />
        <MatchupRows pairs={bench} cards={cards} cardsLoading={cardsLoading} bench />
      </ul>
    </div>
  )
}

function PropList({ row, card }) {
  if (!row) return <div />
  const props = card?.props || []
  if (!props.length) return <p>No open line on {shortName(row.player_name, row.position) || row.player_name}.</p>
  return (
    <ul className="space-y-1">
      {props.map((p) => (
        <li key={p.label}>
          {p.label}
          {cents(p.price) ? ` · ${cents(p.price)}` : ''}
        </li>
      ))}
    </ul>
  )
}

/**
 * Connected fantasy home. Hosts live in the manage sheet, not on this page.
 */
export default function FantasyCommandCenter({
  leagues,
  leagueId,
  onPickLeague,
  detail,
  loadingDetail,
  cards,
  cardsLoading,
  busy,
  onOpenManage,
  onSync,
}) {
  const [page, setPage] = useState(0)
  const [tool, setTool] = useState('start')
  const touchX = useRef(null)

  const pages = useMemo(() => {
    const teams = detail?.teams || []
    const byId = Object.fromEntries(teams.map((t) => [t.id, t]))
    const byTeam = detail?.rostersByTeam || {}
    const mine = teams.find((t) => t.is_mine) || null
    const matchups = detail?.matchups || []
    const usedTeams = new Set()
    const out = []

    const pushPair = (mu, preferLeftId) => {
      if (!mu?.mine_team_id) return
      const pairKey = [mu.mine_team_id, mu.opp_team_id].filter(Boolean).sort().join(':')
      if (out.some((page) => page.key === pairKey)) return
      let leftId = mu.mine_team_id
      let rightId = mu.opp_team_id || null
      let leftScore = mu.mine_score
      let rightScore = mu.opp_score
      if (preferLeftId && preferLeftId === rightId) {
        leftId = rightId
        rightId = mu.mine_team_id
        leftScore = mu.opp_score
        rightScore = mu.mine_score
      }
      usedTeams.add(leftId)
      if (rightId) usedTeams.add(rightId)
      out.push({
        key: pairKey,
        kind: rightId ? 'matchup' : 'bye',
        left: byId[leftId] || null,
        right: rightId ? byId[rightId] || null : null,
        leftScore,
        rightScore,
        yours: Boolean(mine && (leftId === mine.id || rightId === mine.id)),
        roster: byTeam[leftId] || [],
        oppRoster: rightId ? byTeam[rightId] || [] : [],
      })
    }

    const mineMu = matchups.find(
      (mu) => mu.mine_team_id === mine?.id || mu.opp_team_id === mine?.id,
    )
    if (mineMu) pushPair(mineMu, mine?.id)
    for (const mu of matchups) pushPair(mu, null)

    const unpaired = teams.filter((t) => !usedTeams.has(t.id))
    if (unpaired.length && unpaired.length < matchups.length) {
      for (const t of unpaired) {
        out.push({
          key: `bye-${t.id}`,
          kind: 'bye',
          left: t,
          right: null,
          leftScore: null,
          rightScore: null,
          yours: Boolean(mine && t.id === mine.id),
          roster: byTeam[t.id] || [],
          oppRoster: [],
        })
      }
    }
    return out
  }, [detail])

  const safePage = pages.length ? Math.min(page, pages.length - 1) : 0
  const current = pages[safePage] || null
  const activeTool = TOOLS.find((t) => t.id === tool) || TOOLS[0]
  const league = (leagues || []).find((lg) => lg.id === leagueId) || detail?.league || null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-[12px] text-zinc-500">
          {detail?.week != null ? `Week ${detail.week}` : 'This week'}
          {league?.sport && league.sport !== 'nfl' ? ` · ${String(league.sport).toUpperCase()}` : ''}
          {league?.provider ? ` · ${providerLabel(league.provider)}` : ''}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSync()}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            {busy ? '…' : 'Sync'}
          </button>
          <button
            type="button"
            onClick={onOpenManage}
            className="rounded-full bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-950"
          >
            Manage
          </button>
        </div>
      </div>

      {(leagues || []).length ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {leagues.map((lg) => {
            const on = lg.id === leagueId
            return (
              <button
                key={lg.id}
                type="button"
                onClick={() => {
                  setPage(0)
                  void onPickLeague(lg.id)
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                  on
                    ? 'border-sky-400 bg-sky-500 text-white'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                }`}
              >
                {lg.sport && lg.sport !== 'nfl' ? `${lg.name} · ${String(lg.sport).toUpperCase()}` : lg.name}
              </button>
            )
          })}
        </div>
      ) : null}

      {loadingDetail ? <div className="py-6 text-center text-sm text-zinc-500">Loading league…</div> : null}

      {!loadingDetail && !(leagues || []).length ? (
        <div className="rounded-2xl border border-zinc-800 p-4 text-[13px] text-zinc-400">
          No leagues synced yet. Open Manage and sync after the league is live.
        </div>
      ) : null}

      <div
        onTouchStart={(e) => {
          touchX.current = e.changedTouches?.[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          const start = touchX.current
          const end = e.changedTouches?.[0]?.clientX
          touchX.current = null
          if (start == null || end == null || pages.length < 2) return
          const dx = end - start
          if (dx < -48) setPage((n) => Math.min(pages.length - 1, n + 1))
          if (dx > 48) setPage((n) => Math.max(0, n - 1))
        }}
      >
      {current?.kind === 'matchup' || current?.kind === 'bye' ? (
        <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
          <div className={`grid ${current.right ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className={`px-4 py-4 ${current.right ? 'border-r border-zinc-800' : ''}`}>
              <div className="flex items-center gap-2">
                <TeamLogo team={current.left} />
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-semibold">{current.left?.team_name || 'Team'}</div>
                  <div className="text-[12px] text-zinc-500">{recordLine(current.left)}</div>
                </div>
              </div>
              <div className="mt-2 text-[28px] font-bold tabular-nums leading-none">
                {scoreText(current.leftScore)}
              </div>
            </div>
            {current.right ? (
              <div className="px-4 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-semibold">{current.right?.team_name || 'Team'}</div>
                    <div className="text-[12px] text-zinc-500">{recordLine(current.right)}</div>
                  </div>
                  <TeamLogo team={current.right} />
                </div>
                <div className="mt-2 text-[28px] font-bold tabular-nums leading-none">
                  {scoreText(current.rightScore)}
                </div>
              </div>
            ) : (
              <p className="px-4 pb-4 text-[12px] text-zinc-500">Bye this week.</p>
            )}
          </div>
        </div>
      ) : null}
      </div>

      {pages.length > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((n) => Math.max(0, n - 1))}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-30"
          >
            Prev
          </button>
          <div className="text-[12px] text-zinc-500">
            {safePage + 1} / {pages.length}
          </div>
          <button
            type="button"
            disabled={safePage >= pages.length - 1}
            onClick={() => setPage((n) => Math.min(pages.length - 1, n + 1))}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TOOLS.map((item) => {
          const on = item.id === tool
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTool(item.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                on ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      <p className="text-[13px] leading-snug text-zinc-400">{activeTool.body}</p>

      {current ? (
        <VsMatchup
          mine={current.roster}
          opp={current.oppRoster}
          cards={cards}
          cardsLoading={cardsLoading}
        />
      ) : null}
    </div>
  )
}
