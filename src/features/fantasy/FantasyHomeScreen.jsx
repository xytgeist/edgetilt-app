import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import TitleBarScreenTitle from '../../components/TitleBarScreenTitle.jsx'
import {
  loadFantasySnapshot,
  loadLeagueDetail,
  linkCbsSession,
  linkEspnSession,
  linkSleeperUsername,
  setPrimaryFantasyLeague,
  startYahooOAuth,
  syncAllFantasy,
} from './fantasyApi.js'
import {
  canStartCbsFantasyLogin,
  canStartEdgeWebAuthSession,
  canStartEspnFantasyLogin,
  isEdgeiOSShell,
  openExternalUrl,
  startCbsFantasyLogin,
  startEdgeWebAuthSession,
  startEspnFantasyLogin,
} from '../../utils/edgeNative.js'

function recordLine(t) {
  const w = Number(t.wins) || 0
  const l = Number(t.losses) || 0
  const ti = Number(t.ties) || 0
  return ti > 0 ? `${w}-${l}-${ti}` : `${w}-${l}`
}

function providerLabel(provider) {
  if (provider === 'yahoo') return 'Yahoo'
  if (provider === 'sleeper') return 'Sleeper'
  if (provider === 'espn') return 'ESPN'
  if (provider === 'cbs') return 'CBS'
  return provider || ''
}

const YAHOO_HANDOFF_KEY = 'edge.fantasy.yahooHandoff'

function readYahooHandoff() {
  if (typeof window === 'undefined') return null
  try {
    const u = new URL(window.location.href)
    const fromUrl = (u.searchParams.get('yahoo') || '').trim()
    if (fromUrl) {
      return {
        yahoo: fromUrl,
        yahoo_error: (u.searchParams.get('yahoo_error') || '').trim(),
        fromUrl: true,
      }
    }
    const raw = sessionStorage.getItem(YAHOO_HANDOFF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const age = Date.now() - (Number(parsed?.at) || 0)
    if (!parsed?.yahoo || age < 0 || age > 15 * 60_000) return null
    return {
      yahoo: String(parsed.yahoo || '').trim(),
      yahoo_error: String(parsed.yahoo_error || '').trim(),
      fromUrl: false,
    }
  } catch {
    return null
  }
}

function clearYahooHandoff() {
  try {
    sessionStorage.removeItem(YAHOO_HANDOFF_KEY)
  } catch {
    /* ignore */
  }
}

/** Decode / shorten Yahoo Edge errors for the Fantasy banner. */
function friendlyYahooError(raw) {
  let s = String(raw || '').trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    /* already plain */
  }
  if (/not approved for this EdgeTilt app|sports\.yahoo\.com\/developer/i.test(s)) return s
  if (/403/i.test(s) && /not authorized|not allowed|not authorised/i.test(s)) {
    return (
      'Yahoo Fantasy API access is not approved for this EdgeTilt app yet. ' +
      'OAuth worked, but Yahoo is blocking league data until they approve App ID i4wW6xoc ' +
      '(apply at sports.yahoo.com/developer).'
    )
  }
  if (s.length > 240) return `${s.slice(0, 240)}…`
  return s
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
  /** EdgeiOS ASWebAuth / Safari fallback … refresh when the user returns. */
  const yahooOAuthPendingRef = useRef(false)

  const sleeper = useMemo(
    () => (snap.connections || []).find((c) => c.provider === 'sleeper'),
    [snap.connections],
  )
  const yahoo = useMemo(
    () => (snap.connections || []).find((c) => c.provider === 'yahoo'),
    [snap.connections],
  )
  const espn = useMemo(
    () => (snap.connections || []).find((c) => c.provider === 'espn'),
    [snap.connections],
  )
  const cbs = useMemo(
    () => (snap.connections || []).find((c) => c.provider === 'cbs'),
    [snap.connections],
  )
  const hasConnection = Boolean(sleeper || yahoo || espn || cbs)
  const espnInApp = canStartEspnFantasyLogin()
  const cbsInApp = canStartCbsFantasyLogin()

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

  const applyYahooHandoffResult = useCallback(
    (handoff) => {
      if (!handoff?.yahoo) return
      yahooOAuthPendingRef.current = false
      if (handoff.yahoo === 'linked') {
        setInfo('Yahoo linked. Loading your leagues…')
        void refresh()
          .then(() => setInfo(''))
          .catch((e) => setErr(friendlyYahooError(e?.message || 'Could not load fantasy.')))
      } else if (handoff.yahoo === 'error') {
        setErr(friendlyYahooError(handoff.yahoo_error || 'Yahoo connect failed.'))
      }
      clearYahooHandoff()
    },
    [refresh],
  )

  useEffect(() => {
    let cancelled = false
    void refresh().catch((e) => {
      if (!cancelled) setErr(e?.message || 'Could not load fantasy.')
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  // Return from Yahoo OAuth redirect (same-tab web, custom-scheme handoff, or sessionStorage).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const handoff = readYahooHandoff()
      if (!handoff?.yahoo) return
      applyYahooHandoffResult(handoff)
      const u = new URL(window.location.href)
      if (u.searchParams.has('yahoo') || u.searchParams.has('yahoo_error')) {
        u.searchParams.delete('yahoo')
        u.searchParams.delete('yahoo_error')
        const qs = u.searchParams.toString()
        window.history.replaceState(
          {},
          document.title,
          `${u.pathname || '/'}${qs ? `?${qs}` : ''}${u.hash || ''}`,
        )
      }
    } catch {
      /* ignore */
    }
  }, [applyYahooHandoffResult])

  // EdgeiOS Safari fallback: when the user comes back from system Safari, reload connections.
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

  const onConnectCbs = async () => {
    if (!signedIn) {
      onRequireAuth?.('login')
      return
    }
    if (!cbsInApp) {
      setErr('CBS connect is in the EdgeTilt app. Update the app, then log in on the CBS page. We never store the password.')
      return
    }
    setBusy(true)
    setErr('')
    setInfo('Opening CBS…')
    try {
      const session = await startCbsFantasyLogin()
      if (session?.cancelled) {
        setInfo('')
        return
      }
      if (!session?.ok || !session.access_token) {
        setInfo('')
        setErr(session?.error || 'CBS login did not finish.')
        return
      }
      setInfo('Syncing CBS leagues…')
      const linked = await linkCbsSession(supabaseClient, session)
      setInfo(
        linked?.leagues
          ? `CBS linked. ${linked.leagues} league${linked.leagues === 1 ? '' : 's'}.`
          : 'CBS linked.',
      )
      await refresh()
    } catch (e) {
      setInfo('')
      setErr(e?.message || 'CBS link failed.')
    } finally {
      setBusy(false)
    }
  }

  const onConnectEspn = async () => {
    if (!signedIn) {
      onRequireAuth?.('login')
      return
    }
    if (!espnInApp) {
      setErr('ESPN connect is in the EdgeTilt app. Update the app, then log in on the ESPN page. We never store the password.')
      return
    }
    setBusy(true)
    setErr('')
    setInfo('Opening ESPN…')
    try {
      const session = await startEspnFantasyLogin()
      if (session?.cancelled) {
        setInfo('')
        return
      }
      if (!session?.ok || !session.espn_s2 || !session.swid) {
        setInfo('')
        setErr(session?.error || 'ESPN login did not finish.')
        return
      }
      setInfo('Syncing ESPN leagues…')
      const linked = await linkEspnSession(supabaseClient, session)
      setInfo(
        linked?.leagues
          ? `ESPN linked. ${linked.leagues} league${linked.leagues === 1 ? '' : 's'}.`
          : 'ESPN linked.',
      )
      await refresh()
    } catch (e) {
      setInfo('')
      setErr(e?.message || 'ESPN link failed.')
    } finally {
      setBusy(false)
    }
  }

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
      // Never load Yahoo login inside the EdgeiOS WKWebView … it has hard-crashed the IPA.
      // Prefer ASWebAuthenticationSession (Gameday-style). Old IPA → system Safari + HTML handoff.
      // Web / PWA stay same-tab assign.
      // EdgeiOS ASWebAuth or EdgeAndroid Custom Tabs (same bridge helper).
      if (canStartEdgeWebAuthSession()) {
        const url = await startYahooOAuth(supabaseClient, { returnMode: 'native' })
        yahooOAuthPendingRef.current = true
        setInfo('Connecting Yahoo…')
        const result = await startEdgeWebAuthSession(url, { callbackScheme: 'edgetilt' })
        yahooOAuthPendingRef.current = false
        if (result?.cancelled) {
          setInfo('')
          setBusy(false)
          return
        }
        if (!result?.ok) {
          throw new Error(result?.error || 'Could not open Yahoo connect.')
        }
        // Parse edgetilt://yahoo-oauth?tab=fantasy&yahoo=…
        let handoff = { yahoo: 'linked', yahoo_error: '' }
        try {
          const cb = new URL(String(result.url || ''))
          handoff = {
            yahoo: (cb.searchParams.get('yahoo') || 'linked').trim(),
            yahoo_error: (cb.searchParams.get('yahoo_error') || '').trim(),
          }
        } catch {
          /* treat as linked + refresh */
        }
        applyYahooHandoffResult(handoff)
        setBusy(false)
        return
      }
      const url = await startYahooOAuth(supabaseClient, { returnMode: 'web' })
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
      setErr(friendlyYahooError(e?.message || 'Could not start Yahoo connect.'))
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
    <ScrollLinkedEdgeTitleBarShell
      publishScrollReveal
      titleBarNavSlot={titleBarNavSlot}
      titleBarCenterSlot={titleBarCenterSlot}
      titleBarToolCloseVisible
      titleBarBrand={<TitleBarScreenTitle>Fantasy</TitleBarScreenTitle>}
      contentClassName="px-4 pt-3 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
    >
      <div data-fantasy-home className="text-white">
        {hasConnection ? (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSync()}
              className="rounded-full border border-zinc-700 px-3 py-1 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
            >
              {busy ? '…' : 'Sync'}
            </button>
          </div>
        ) : null}
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
              Sign in to link Sleeper, Yahoo, or ESPN and auto-highlight your players in the game hub.
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
                subtitle="Authorize EdgeTilt to read your Yahoo Fantasy NFL leagues (OAuth ... no password stored)."
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

            {espn ? (
              <ConnectionCard
                title="ESPN"
                subtitle={espn.external_username || 'Connected'}
                statusLine={
                  espn.last_sync_at
                    ? `Synced ${new Date(espn.last_sync_at).toLocaleString()}`
                    : 'Not synced'
                }
                errorLine={espn.status === 'error' ? espn.last_error || 'Sync error' : ''}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onConnectEspn()}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
                >
                  Reconnect ESPN
                </button>
              </ConnectionCard>
            ) : (
              <ConnectionCard
                title="Connect ESPN"
                subtitle={
                  espnInApp
                    ? 'Log in on the ESPN page inside EdgeTilt. We keep the session cookie and never store your password.'
                    : 'Available in the EdgeTilt iPhone or Android app after this update. A normal browser cannot read an ESPN login.'
                }
              >
                <button
                  type="button"
                  disabled={busy || !espnInApp}
                  onClick={() => void onConnectEspn()}
                  className="rounded-full bg-sky-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? '…' : 'Connect ESPN'}
                </button>
              </ConnectionCard>
            )}

            {cbs ? (
              <ConnectionCard
                title="CBS"
                subtitle={cbs.external_username || 'Connected'}
                statusLine={
                  cbs.last_sync_at
                    ? `Synced ${new Date(cbs.last_sync_at).toLocaleString()}`
                    : 'Not synced'
                }
                errorLine={cbs.status === 'error' ? cbs.last_error || 'Sync error' : ''}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onConnectCbs()}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200 disabled:opacity-40"
                >
                  Reconnect CBS
                </button>
              </ConnectionCard>
            ) : (
              <ConnectionCard
                title="Connect CBS"
                subtitle={
                  cbsInApp
                    ? 'Log in on the CBS page inside EdgeTilt. We keep the session and never store your password.'
                    : 'Available in the EdgeTilt iPhone or Android app after this update. A normal browser cannot read a CBS login.'
                }
              >
                <button
                  type="button"
                  disabled={busy || !cbsInApp}
                  onClick={() => void onConnectCbs()}
                  className="rounded-full bg-sky-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? '…' : 'Connect CBS'}
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

          </div>
        ) : null}
      </div>
    </ScrollLinkedEdgeTitleBarShell>
  )
}
