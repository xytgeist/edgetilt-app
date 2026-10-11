import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadFantasySnapshot,
  loadLeagueDetail,
  linkSleeperUsername,
  setPrimaryFantasyLeague,
  startYahooOAuth,
  syncAllFantasy,
} from './fantasyApi.js'
import { isEdgeiOSShell, openExternalUrl } from '../../utils/edgeNative.js'

const PROVIDER_STUBS = [
  { id: 'espn', label: 'ESPN' },
  { id: 'cbs', label: 'CBS' },
]

function recordLine(t) {
  const w = Number(t.wins) || 0
  const l = Number(t.losses) || 0
  const ti = Number(t.ties) || 0
  return ti > 0 ? `${w}-${l}-${ti}` : `${w}-${l}`
}

function providerLabel(provider) {
  if (provider === 'yahoo') return 'Yahoo'
  if (provider === 'sleeper') return 'Sleeper'
  return provider || ''
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
        {starters.map((r, i) => (
          <li key={`${r.sleeper_id || r.player_name}-${r.slot}-${i}`} className="flex items-baseline justify-between gap-2">
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
            {bench.slice(0, 8).map((r, i) => (
              <li key={`${r.sleeper_id || r.player_name}-b-${i}`} className="truncate text-[12px] text-zinc-500">
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

function ConnectionCard({ title, subtitle, statusLine, errorLine, children }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{title}</div>
          {subtitle ? <p className="mt-1 text-[13px] text-zinc-400">{subtitle}</p> : null}
        </div>
        {statusLine ? (
          <div className="shrink-0 text-right text-[11px] text-zinc-500">{statusLine}</div>
        ) : null}
      </div>
      {errorLine ? <div className="mt-2 text-[12px] text-rose-400">{errorLine}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

/**
 * Fantasy Connect home … Sleeper + Yahoo, league pick, my team + matchup + standings.
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
  const [info, setInfo] = useState('')
  const [snap, setSnap] = useState({ connections: [], leagues: [] })
  const [leagueId, setLeagueId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  /** EdgeiOS opens Yahoo in system Safari … refresh when the user returns. */
  const yahooOAuthPendingRef = useRef(false)

  const sleeper = useMemo(
    () => (snap.connections || []).find((c) => c.provider === 'sleeper'),
    [snap.connections],
  )
  const yahoo = useMemo(
    () => (snap.connections || []).find((c) => c.provider === 'yahoo'),
    [snap.connections],
  )
  const hasConnection = Boolean(sleeper || yahoo)

  const refresh = useCallback(async () => {
    if (!supabaseClient || !signedIn) {
      setSnap({ connections: [], leagues: [] })
      return
    }
    const next = await loadFantasySnapshot(supabaseClient)
    setSnap(next)
    const primary =
      next.leagues.find((l) => l.is_primary)?.id ||
      next.connections.find((c) => c.primary_league_id)?.primary_league_id ||
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

  // Return from Yahoo OAuth redirect (same-tab web, or Universal Link into the IPA).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const u = new URL(window.location.href)
      const yahooFlag = (u.searchParams.get('yahoo') || '').trim()
      if (!yahooFlag) return
      if (yahooFlag === 'linked') {
        yahooOAuthPendingRef.current = false
        setInfo('Yahoo linked. Loading your leagues…')
        void refresh().catch((e) => setErr(e?.message || 'Could not load fantasy.'))
      }
      if (yahooFlag === 'error') {
        yahooOAuthPendingRef.current = false
        setErr(u.searchParams.get('yahoo_error') || 'Yahoo connect failed.')
      }
      u.searchParams.delete('yahoo')
      u.searchParams.delete('yahoo_error')
      const qs = u.searchParams.toString()
      window.history.replaceState(
        {},
        document.title,
        `${u.pathname || '/'}${qs ? `?${qs}` : ''}${u.hash || ''}`,
      )
    } catch {
      /* ignore */
    }
  }, [refresh])

  // EdgeiOS: Yahoo OAuth runs in system Safari. When the user comes back, reload connections.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (!yahooOAuthPendingRef.current) return
      yahooOAuthPendingRef.current = false
      setInfo('Checking Yahoo connection…')
      void refresh()
        .then(() => setInfo(''))
        .catch((e) => setErr(e?.message || 'Could not load fantasy.'))
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
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

  const onLinkSleeper = async () => {
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
    setInfo('')
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

  const onConnectYahoo = async () => {
    if (!signedIn) {
      onRequireAuth?.('login')
      return
    }
    setBusy(true)
    setErr('')
    setInfo('')
    try {
      const url = await startYahooOAuth(supabaseClient)
      // Never load Yahoo login inside the EdgeiOS WKWebView … it has hard-crashed the IPA.
      // System Safari (same path as Stripe). Web / PWA stay same-tab assign.
      if (isEdgeiOSShell()) {
        yahooOAuthPendingRef.current = true
        const result = await openExternalUrl(url, { system: true })
        if (!result?.ok) {
          yahooOAuthPendingRef.current = false
          throw new Error('Could not open Safari for Yahoo connect.')
        }
        setInfo('Finish authorizing in Safari, then return here.')
        setBusy(false)
        return
      }
      window.location.assign(url)
    } catch (e) {
      yahooOAuthPendingRef.current = false
      setErr(e?.message || 'Could not start Yahoo connect.')
      setBusy(false)
    }
  }

  const onSync = async () => {
    if (!signedIn) return
    setBusy(true)
    setErr('')
    setInfo('')
    try {
      const result = await syncAllFantasy(supabaseClient, snap.connections)
      if (result.warnings?.length) setInfo(result.warnings.join(' '))
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
        {hasConnection ? (
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
        {info ? (
          <div className="mb-3 rounded-xl border border-sky-500/30 bg-sky-950/30 px-3 py-2 text-[13px] text-sky-100">
            {info}
          </div>
        ) : null}

        {!signedIn ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 text-center">
            <div className="text-[16px] font-semibold">Connect your fantasy league</div>
            <p className="mt-2 text-[13px] text-zinc-400">
              Sign in to link Sleeper or Yahoo and auto-highlight your players in the game hub.
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

        {signedIn ? (
          <div className="space-y-4">
            {sleeper ? (
              <ConnectionCard
                title="Sleeper"
                subtitle={`@${sleeper.external_username}`}
                statusLine={
                  sleeper.last_sync_at
                    ? `Synced ${new Date(sleeper.last_sync_at).toLocaleString()}`
                    : 'Not synced'
                }
                errorLine={sleeper.status === 'error' ? sleeper.last_error || 'Sync error' : ''}
              />
            ) : (
              <ConnectionCard
                title="Connect Sleeper"
                subtitle="Enter the username you use on sleeper.app (public … no password)."
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="sleeper username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-zinc-600"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onLinkSleeper()
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onLinkSleeper()}
                    className="shrink-0 rounded-full bg-sky-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? '…' : 'Link'}
                  </button>
                </div>
              </ConnectionCard>
            )}

            {yahoo ? (
              <ConnectionCard
                title="Yahoo"
                subtitle={yahoo.external_username || 'Connected'}
                statusLine={
                  yahoo.last_sync_at
                    ? `Synced ${new Date(yahoo.last_sync_at).toLocaleString()}`
                    : 'Not synced'
                }
                errorLine={yahoo.status === 'error' ? yahoo.last_error || 'Sync error' : ''}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onConnectYahoo()}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
                >
                  Reconnect Yahoo
                </button>
              </ConnectionCard>
            ) : (
              <ConnectionCard
                title="Connect Yahoo"
                subtitle="Authorize EdgeTilt to read your Yahoo Fantasy NFL leagues (OAuth … no password stored)."
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onConnectYahoo()}
                  className="rounded-full bg-violet-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? '…' : 'Connect Yahoo'}
                </button>
              </ConnectionCard>
            )}

            {hasConnection ? (
              <>
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
                            <span className="opacity-70"> · {providerLabel(lg.provider)}</span>
                            {lg.is_primary ? ' · Primary' : ''}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-zinc-800 p-4 text-[13px] text-zinc-400">
                    No NFL leagues synced yet. Tap Sync after your league is live, or reconnect the
                    platform.
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
                          {detail.league?.provider
                            ? ` · ${providerLabel(detail.league.provider)}`
                            : ''}
                        </div>
                        <div className="mt-1 text-[16px] font-semibold">
                          {mineTeam?.team_name || 'You'}
                          <span className="mx-2 text-zinc-600">vs</span>
                          {oppTeam?.team_name || 'Opponent'}
                        </div>
                      </div>
                      <div className="text-right text-[20px] font-bold tabular-nums">
                        {detail.matchup.mine_score != null
                          ? Number(detail.matchup.mine_score).toFixed(1)
                          : '-'}
                        <span className="mx-1 text-zinc-600">-</span>
                        {detail.matchup.opp_score != null
                          ? Number(detail.matchup.opp_score).toFixed(1)
                          : '-'}
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
              </>
            ) : null}

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
      </div>
    </div>
  )
}
