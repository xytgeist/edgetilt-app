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

function PlayerRow({ row }) {
  const [open, setOpen] = useState(false)
  const inj = injuryLabel(row.injury_status)
  return (
    <li className="border-b border-zinc-800/80 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="w-8 shrink-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          {row.position || '–'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-zinc-100">
            {row.player_name}
          </span>
          <span className="block truncate text-[12px] text-zinc-500">
            {row.nfl_team || 'FA'}
            {inj ? ` · ${inj}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-[12px] font-semibold text-sky-300">
          {open ? 'Hide' : 'Props'}
        </span>
      </button>
      {open ? (
        <div className="px-3 pb-3 pl-14 text-[13px] leading-snug text-zinc-400">
          No prop board on {row.player_name} yet. The first line here will be the most relevant
          one, and this list is the rest.
        </div>
      ) : null}
    </li>
  )
}

function LineupCard({ title, rows }) {
  const starters = startersOf(rows)
  const bench = (rows || []).filter((r) => r.slot !== 'starter')
  const hurt = starters.filter((r) => injuryLabel(r.injury_status))
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80">
      <div className="flex items-baseline justify-between gap-2 px-3 pt-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">{title}</div>
        <div className="text-[11px] text-zinc-600">{starters.length} starters</div>
      </div>
      {starters.length ? (
        <ul className="mt-1">
          {starters.map((r, i) => (
            <PlayerRow key={`${r.sleeper_id || r.player_name}-${i}`} row={r} />
          ))}
        </ul>
      ) : (
        <p className="px-3 py-4 text-[13px] text-zinc-500">No starters synced for this team.</p>
      )}
      {bench.length ? (
        <p className="border-t border-zinc-800 px-3 py-2 text-[12px] text-zinc-500">
          Bench {bench.map((r) => r.player_name).filter(Boolean).slice(0, 6).join(', ')}
          {bench.length > 6 ? '…' : ''}
        </p>
      ) : null}
      {hurt.length ? (
        <div className="border-t border-zinc-800 px-3 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
            Injuries
          </div>
          <ul className="mt-2 space-y-1">
            {hurt.map((r) => (
              <li key={r.sleeper_id || r.player_name} className="text-[13px] text-zinc-300">
                <span className="font-semibold text-amber-300">{injuryLabel(r.injury_status)}</span>
                {' · '}
                {r.player_name}
                {r.nfl_team ? ` · ${r.nfl_team}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="border-t border-zinc-800 px-3 py-2 text-[12px] text-zinc-600">
          No injury tags on these starters.
        </p>
      )}
    </div>
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
  busy,
  onOpenManage,
  onSync,
}) {
  const [page, setPage] = useState(0)
  const [tool, setTool] = useState('start')
  const touchX = useRef(null)

  const pages = useMemo(() => {
    const teams = detail?.teams || []
    const mine = teams.find((t) => t.is_mine) || null
    const opp = teams.find((t) => t.id === detail?.matchup?.opp_team_id) || null
    const byTeam = detail?.rostersByTeam || {}
    const out = []
    if (mine) {
      out.push({
        key: 'mine',
        kind: 'matchup',
        team: mine,
        opp,
        roster: byTeam[mine.id] || detail?.mineRoster || [],
      })
    }
    for (const t of teams) {
      if (mine && t.id === mine.id) continue
      out.push({
        key: t.id,
        kind: 'team',
        team: t,
        roster: byTeam[t.id] || [],
      })
    }
    return out
  }, [detail])

  const safePage = pages.length ? Math.min(page, pages.length - 1) : 0
  const current = pages[safePage] || null
  const activeTool = TOOLS.find((t) => t.id === tool) || TOOLS[0]
  const league = (leagues || []).find((lg) => lg.id === leagueId) || detail?.league || null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-semibold text-zinc-100">
            {league?.name || 'Fantasy'}
          </div>
          <div className="mt-0.5 text-[12px] text-zinc-500">
            {detail?.matchup?.week != null ? `Week ${detail.matchup.week}` : 'This week'}
            {league?.provider ? ` · ${providerLabel(league.provider)}` : ''}
          </div>
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

      {(leagues || []).length > 1 ? (
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
                {lg.name}
              </button>
            )
          })}
        </div>
      ) : null}

      {loadingDetail ? <div className="py-6 text-center text-sm text-zinc-500">Loading league…</div> : null}

      {!loadingDetail && !(leagues || []).length ? (
        <div className="rounded-2xl border border-zinc-800 p-4 text-[13px] text-zinc-400">
          No NFL leagues synced yet. Open Manage and sync after the league is live.
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
      {current?.kind === 'matchup' ? (
        <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
          <div className="grid grid-cols-2">
            <div className="border-r border-zinc-800 px-4 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-300">You</div>
              <div className="mt-1 truncate text-[16px] font-semibold">{current.team?.team_name || 'You'}</div>
              <div className="text-[12px] text-zinc-500">{recordLine(current.team)}</div>
              <div className="mt-2 text-[28px] font-bold tabular-nums leading-none">
                {scoreText(detail?.matchup?.mine_score)}
              </div>
            </div>
            <div className="px-4 py-4 text-right">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-rose-300">Opp</div>
              <div className="mt-1 truncate text-[16px] font-semibold">{current.opp?.team_name || 'Opponent'}</div>
              <div className="text-[12px] text-zinc-500">{recordLine(current.opp)}</div>
              <div className="mt-2 text-[28px] font-bold tabular-nums leading-none">
                {scoreText(detail?.matchup?.opp_score)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {current?.kind === 'team' ? (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
            League team
          </div>
          <div className="mt-1 text-[18px] font-semibold">{current.team?.team_name}</div>
          <div className="mt-1 text-[13px] text-zinc-400">
            {recordLine(current.team)}
            {current.team?.points_for != null
              ? ` · ${Number(current.team.points_for).toFixed(1)} PF`
              : ''}
          </div>
          <p className="mt-2 text-[12px] leading-snug text-zinc-500">
            Opponent score is only stored for your matchup. This is their synced lineup.
          </p>
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
        <LineupCard
          title={current.kind === 'matchup' ? 'Your starters' : 'Their starters'}
          rows={current.roster}
        />
      ) : null}
    </div>
  )
}
