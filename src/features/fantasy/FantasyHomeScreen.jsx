import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadFantasySnapshot,
  loadLeagueDetail,
  linkSleeperUsername,
  setPrimaryFantasyLeague,
  syncSleeperFantasy,
} from './fantasyApi.js'

const PROVIDER_STUBS = [
  { id: 'yahoo', label: 'Yahoo' },
  { id: 'espn', label: 'ESPN' },
  { id: 'cbs', label: 'CBS' },
]

function recordLine(t) {
  const w = Number(t.wins) || 0
  const l = Number(t.losses) || 0
  const ti = Number(t.ties) || 0
  return ti > 0 ? `${w}-${l}-${ti}` : `${w}-${l}`
}

function RosterList({ title, rows, tone = 'mine' }) {
  const starters = (rows || []).filter((r) => r.slot === 'starter')
  const bench = (rows || []).filter((r) => r.slot !== 'starter')
  const accent =
    tone === 'enemy'
      ? 'border-rose-500/40 bg-rose-950/20'
      : 'border-sky-500/40 bg-sky-950/20'
  return (
    <div className={`rounded-2xl border ${accent} p-3`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{title}</div>
      <ul className="mt-2 space-y-1.5">
        {starters.map((r) => (
          <li key={`${r.sleeper_id}-${r.slot}`} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[14px] font-semibold text-zinc-100">
              {r.player_name}
            </span>
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">
              {r.position || '-'}
              {r.nfl_team ? ` · ${r.nfl_team}` : ''}
            </span>
          </li>
        ))}
        {!starters.length ? (
          <li className="text-[13px] text-zinc-500">No starters synced yet.</li>
        ) : null}
      </ul>
      {bench.length ? (
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Bench</div>
          <ul className="mt-1 space-y-1">
            {bench.slice(0, 8).map((r) => (
              <li key={`${r.sleeper_id}-b`} className="truncate text-[12px] text-zinc-500">
                {r.player_name}
                {r.position ? ` · ${r.position}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Fantasy Connect home … Sleeper link, league pick, my team + matchup + standings.
 */
export default function FantasyHomeScreen({
  supabaseClient,
  titleBarNavSlot = null,
  titleBarCenterSlot = null,
  onRequireAuth = null,
  signedIn = false,
}) {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [snap, setSnap] = useState({ connections: [], leagues: [] })
  const [leagueId, setLeagueId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const sleeper = useMemo(
    () => (snap.connections || []).find((c) => c.provider === 'sleeper'),
    [snap.connections],
  )

  const refresh = useCallback(async () => {
    if (!supabaseClient || !signedIn) {
      setSnap({ connections: [], leagues: [] })
      return
    }
    const next = await loadFantasySnapshot(supabaseClient)
    setSnap(next)
    const primary =
      next.leagues.find((l) => l.is_primary)?.id ||
      next.connections.find((c) => c.provider === 'sleeper')?.primary_league_id ||
      next.leagues[0]?.id ||
      null
    setLeagueId((cur) => cur || primary)
  }, [supabaseClient, signedIn])

  useEffect(() => {
    let cancelled = false
    void refresh().catch((e) => {
      if (!cancelled) setErr(e?.message || 'Could not load fantasy.')
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    if (!supabaseClient || !leagueId || !signedIn) {
      setDetail(null)
      return undefined
    }
    let cancelled = false
    setLoadingDetail(true)
    void loadLeagueDetail(supabaseClient, leagueId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || 'Could not load league.')
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabaseClient, leagueId, signedIn])

  const onLink = async () => {
    if (!signedIn) {
      onRequireAuth?.('login')
      return
    }
    const u = username.trim().replace(/^@/, '')
    if (!u) {
      setErr('Enter your Sleeper username.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await linkSleeperUsername(supabaseClient, u)
      setUsername('')
      await refresh()
    } catch (e) {
      setErr(e?.message || 'Link failed.')
    } finally {
      setBusy(false)
    }
  }

  const onSync = async () => {
    if (!signedIn) return
    setBusy(true)
    setErr('')
    try {
      await syncSleeperFantasy(supabaseClient)
      await refresh()
      if (leagueId) {
        setDetail(await loadLeagueDetail(supabaseClient, leagueId))
      }
    } catch (e) {
      setErr(e?.message || 'Sync failed.')
    } finally {
      setBusy(false)
    }
  }

  const onPickLeague = async (id) => {
    setLeagueId(id)
    if (!signedIn || !id) return
    setBusy(true)
    setErr('')
    try {
      await setPrimaryFantasyLeague(supabaseClient, id)
      await refresh()
    } catch (e) {
      setErr(e?.message || 'Could not set primary league.')
    } finally {
      setBusy(false)
    }
  }

  const mineTeam = detail?.teams?.find((t) => t.is_mine)
  const oppTeam = detail?.teams?.find((t) => t.id === detail?.matchup?.opp_team_id)

  return (
    <div
      data-fantasy-home
      className="flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950 text-white"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
        {titleBarNavSlot}
        <div className="min-w-0 flex-1">{titleBarCenterSlot || (
          <div className="truncate text-[17px] font-semibold tracking-tight">Fantasy</div>
        )}</div>
        {sleeper ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSync()}
            className="rounded-full border border-zinc-700 px-3 py-1 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
          >
            {busy ? '…' : 'Sync'}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        {err ? (
          <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-[13px] text-rose-200">
            {err}
          </div>
        ) : null}

        {!signedIn ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 text-center">
            <div className="text-[16px] font-semibold">Connect your fantasy league</div>
            <p className="mt-2 text-[13px] text-zinc-400">
              Sign in to link Sleeper (Yahoo, ESPN, and CBS next) and auto-highlight your players in the
              game hub.
            </p>
            <button
              type="button"
              onClick={() => onRequireAuth?.('login')}
              className="mt-4 rounded-full bg-zinc-100 px-4 py-2 text-[13px] font-semibold text-zinc-950"
            >
              Sign in
            </button>
          </div>
        ) : null}

        {signedIn && !sleeper ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <div className="text-[15px] font-semibold">Connect Sleeper</div>
              <p className="mt-1 text-[13px] text-zinc-400">
                Enter the username you use on sleeper.app (public leagues only need this … no password).
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="sleeper username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-zinc-600"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onLink()
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onLink()}
                  className="shrink-0 rounded-full bg-sky-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? '…' : 'Link'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 p-4">
              <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                Coming next
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROVIDER_STUBS.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[12px] font-semibold text-zinc-500"
                  >
                    {p.label} · Soon
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {signedIn && sleeper ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Sleeper
                  </div>
                  <div className="text-[15px] font-semibold">@{sleeper.external_username}</div>
                </div>
                <div className="text-right text-[11px] text-zinc-500">
                  {sleeper.last_sync_at
                    ? `Synced ${new Date(sleeper.last_sync_at).toLocaleString()}`
                    : 'Not synced'}
                  {sleeper.status === 'error' ? (
                    <div className="text-rose-400">{sleeper.last_error || 'Sync error'}</div>
                  ) : null}
                </div>
              </div>
            </div>

            {(snap.leagues || []).length ? (
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                  Leagues
                </div>
                <div className="flex flex-wrap gap-2">
                  {snap.leagues.map((lg) => {
                    const on = lg.id === leagueId
                    return (
                      <button
                        key={lg.id}
                        type="button"
                        onClick={() => void onPickLeague(lg.id)}
                        className={`rounded-full px-3 py-1.5 text-[12px] font-semibold border ${
                          on
                            ? 'border-sky-400 bg-sky-500 text-white'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                        }`}
                      >
                        {lg.name}
                        {lg.is_primary ? ' · Primary' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 p-4 text-[13px] text-zinc-400">
                No NFL leagues found for this Sleeper user this season. Tap Sync after your league is
                live.
              </div>
            )}

            {loadingDetail ? (
              <div className="py-8 text-center text-sm text-zinc-500">Loading league…</div>
            ) : null}

            {detail?.matchup ? (
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                      Week {detail.matchup.week} matchup
                    </div>
                    <div className="mt-1 text-[16px] font-semibold">
                      {mineTeam?.team_name || 'You'}
                      <span className="mx-2 text-zinc-600">vs</span>
                      {oppTeam?.team_name || 'Opponent'}
                    </div>
                  </div>
                  <div className="text-right text-[20px] font-bold tabular-nums">
                    {detail.matchup.mine_score != null ? Number(detail.matchup.mine_score).toFixed(1) : '-'}
                    <span className="mx-1 text-zinc-600">-</span>
                    {detail.matchup.opp_score != null ? Number(detail.matchup.opp_score).toFixed(1) : '-'}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <RosterList title="Your lineup" rows={detail.mineRoster} tone="mine" />
                  <RosterList title="Opponent" rows={detail.oppRoster} tone="enemy" />
                </div>
              </div>
            ) : null}

            {detail?.teams?.length ? (
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                  Standings
                </div>
                <ul className="overflow-hidden rounded-2xl border border-zinc-800 divide-y divide-zinc-800">
                  {[...detail.teams]
                    .sort((a, b) => {
                      if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0)
                      return (Number(b.points_for) || 0) - (Number(a.points_for) || 0)
                    })
                    .map((t) => (
                      <li
                        key={t.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 ${
                          t.is_mine ? 'bg-sky-500/10' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-semibold text-zinc-100">
                            {t.team_name}
                            {t.is_mine ? (
                              <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                                You
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-[12px] text-zinc-500">{t.owner_name}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[14px] font-bold tabular-nums">{recordLine(t)}</div>
                          <div className="text-[11px] tabular-nums text-zinc-500">
                            {t.points_for != null ? Number(t.points_for).toFixed(1) : '-'} PF
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-2xl border border-zinc-800/80 p-4">
              <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                More platforms
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROVIDER_STUBS.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[12px] font-semibold text-zinc-500"
                  >
                    {p.label} · Soon
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
