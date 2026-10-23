import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import TitleBarScreenTitle from '../../components/TitleBarScreenTitle.jsx'
import {
  loadFantasySnapshot,
  loadLeagueDetail,
  loadLineupCards,
  linkCbsSession,
  linkEspnSession,
  linkSleeperUsername,
  linkYahooSession,
  setPrimaryFantasyLeague,
  startYahooOAuth,
  autoSyncStaleFantasy,
  fantasyAutoSyncInFlight,
  syncAllFantasy,
} from './fantasyApi.js'
import { cardIsLive } from './fantasyBoxScore.js'
import {
  canStartCbsFantasyLogin,
  canStartEdgeWebAuthSession,
  canStartEspnFantasyLogin,
  canStartYahooFantasyLogin,
  isEdgeiOSShell,
  openExternalUrl,
  startCbsFantasyLogin,
  startEdgeWebAuthSession,
  startEspnFantasyLogin,
  startYahooFantasyLogin,
} from '../../utils/edgeNative.js'
import FantasyCommandCenter from './FantasyCommandCenter.jsx'
import FantasyConnectPanel from './FantasyConnectPanel.jsx'
import FantasyHomeSkeleton from './FantasyHomeSkeleton.jsx'
import { SportsBetLogGameProvider } from '../sports-bet-tracker/sportsBetLogContext.jsx'

/** Each lineup pill carries its own game fields; the provider only needs a non-null game to enable logging. */
const FANTASY_BET_GAME = {}

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

function decodeYahooError(raw) {
  const s = String(raw || '').trim()
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** OAuth worked but Yahoo's Fantasy API approval for our App ID is still pending (league calls 403). */
function isYahooApprovalError(raw) {
  const s = decodeYahooError(raw)
  return (
    /not approved for this EdgeTilt app|sports\.yahoo\.com\/developer/i.test(s) ||
    (/403/.test(s) && /not authorized|not allowed|not authorised/i.test(s))
  )
}

/** Decode / shorten Yahoo Edge errors for the Fantasy banner. */
function friendlyYahooError(raw) {
  let s = String(raw || '').trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    /* already plain */
  }
  if (isYahooApprovalError(s)) {
    return "Yahoo hasn't approved our league access yet. Until then, connect Yahoo in the EdgeTilt app (update to the latest version) and sign in to Yahoo there."
  }
  if (s.length > 240) return `${s.slice(0, 240)}…`
  return s
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
  // Each league carries its connection's last sync (League outlook shows "Synced 2h ago").
  const leaguesWithSync = useMemo(() => {
    const byConn = new Map((snap.connections || []).map((c) => [c.id, c]))
    return (snap.leagues || []).map((lg) => ({ ...lg, last_sync_at: byConn.get(lg.connection_id)?.last_sync_at || null }))
  }, [snap.connections, snap.leagues])
  const [booted, setBooted] = useState(false)
  const [shown, setShown] = useState(false)
  const [detailEpoch, setDetailEpoch] = useState(null)
  const [cardsEpoch, setCardsEpoch] = useState(null)
  const [details, setDetails] = useState({})
  const [detailNonce, setDetailNonce] = useState(0)
  const [cards, setCards] = useState(null)
  const [cardsLoading, setCardsLoading] = useState(false)
  const cardsRef = useRef(null)
  cardsRef.current = cards
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
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
  }, [supabaseClient, signedIn])

  /** Stopgap while Yahoo approval is pending: Yahoo's own login in a native sheet, leagues read with that session. */
  const connectYahooSession = useCallback(async () => {
    setBusy(true)
    setErr('')
    setInfo('Opening Yahoo sign-in…')
    try {
      const session = await startYahooFantasyLogin()
      if (session?.cancelled) {
        setInfo('')
        return
      }
      if (!session?.ok || !session.cookie) {
        setInfo('')
        setErr(session?.error || 'Yahoo sign-in did not finish.')
        return
      }
      setInfo('Syncing Yahoo leagues…')
      const linked = await linkYahooSession(supabaseClient, session.cookie)
      setInfo(
        linked?.leagues
          ? `Yahoo linked. ${linked.leagues} league${linked.leagues === 1 ? '' : 's'}.`
          : 'Yahoo linked.',
      )
      await refresh()
    } catch (e) {
      setInfo('')
      setErr(friendlyYahooError(e?.message || 'Yahoo link failed.'))
    } finally {
      setBusy(false)
    }
  }, [refresh, supabaseClient])

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
        if (isYahooApprovalError(handoff.yahoo_error) && canStartYahooFantasyLogin()) {
          // The OAuth sheet is still animating away; iOS drops a sheet presented mid-transition.
          window.setTimeout(() => void connectYahooSession(), 900)
        } else {
          setErr(friendlyYahooError(handoff.yahoo_error || 'Yahoo connect failed.'))
        }
      }
      clearYahooHandoff()
    },
    [refresh, connectYahooSession],
  )

  useEffect(() => {
    let cancelled = false
    void refresh()
      .catch((e) => {
        if (!cancelled) setErr(e?.message || 'Could not load fantasy.')
      })
      .finally(() => {
        if (!cancelled) setBooted(true)
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

  const leagueKey = (snap.leagues || []).map((lg) => lg.id).join(',')

  useEffect(() => {
    if (!supabaseClient || !signedIn) {
      setDetails({})
      setDetailEpoch('')
      return undefined
    }
    const ids = leagueKey ? leagueKey.split(',') : []
    if (!ids.length) {
      setDetails({})
      setLoadingDetail(false)
      setDetailEpoch(leagueKey)
      return undefined
    }
    let cancelled = false
    setLoadingDetail(true)
    void Promise.all(
      ids.map((id) =>
        loadLeagueDetail(supabaseClient, id)
          .then((d) => [id, d])
          .catch(() => [id, null]),
      ),
    )
      .then((pairs) => {
        if (cancelled) return
        const next = {}
        for (const [id, d] of pairs) {
          if (d) next[id] = d
        }
        setDetails(next)
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || 'Could not load leagues.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDetail(false)
          setDetailEpoch(leagueKey)
        }
      })
    return () => {
      cancelled = true
    }
  }, [supabaseClient, signedIn, leagueKey, detailNonce])

  useEffect(() => {
    if (!supabaseClient || !signedIn) {
      setCards(null)
      setCardsLoading(false)
      return undefined
    }
    const bySport = new Map()
    for (const detail of Object.values(details || {})) {
      const sport = String(detail?.league?.sport || 'nfl').toLowerCase()
      if (!['nfl', 'nba', 'nhl', 'mlb'].includes(sport)) continue
      const seen = bySport.get(sport) || new Set()
      const list = bySport.get(`${sport}:rows`) || []
      for (const rows of Object.values(detail.rostersByTeam || {})) {
        for (const row of rows || []) {
          const id = String(row?.sleeper_id || '').trim()
          if (!id || seen.has(id)) continue
          seen.add(id)
          list.push(row)
        }
      }
      bySport.set(sport, seen)
      bySport.set(`${sport}:rows`, list)
    }
    const sports = ['nfl', 'nba', 'nhl', 'mlb'].filter((sport) => (bySport.get(`${sport}:rows`) || []).length)
    const detailSig = Object.keys(details || {}).sort().join(',')
    if (!sports.length) {
      setCards({})
      setCardsLoading(false)
      setCardsEpoch(detailSig)
      return undefined
    }
    let cancelled = false
    const pull = (quiet) => {
      if (!quiet) setCardsLoading(true)
      return Promise.all(
        sports.map((sport) => loadLineupCards(supabaseClient, bySport.get(`${sport}:rows`), sport).catch(() => ({}))),
      )
        .then((maps) => {
          if (cancelled) return
          // One map per sport: Sleeper NFL and NBA ids overlap (1945 is Chris Boswell and Trae Young).
          const next = {}
          sports.forEach((sport, i) => {
            next[sport] = maps[i] || {}
          })
          setCards(next)
        })
        .finally(() => {
          if (!cancelled && !quiet) {
            setCardsLoading(false)
            setCardsEpoch(detailSig)
          }
        })
    }
    void pull(false)
    const timer = setInterval(() => {
      if (Object.values(cardsRef.current || {}).some((map) => Object.values(map || {}).some((card) => cardIsLive(card)))) void pull(true)
    }, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [supabaseClient, signedIn, details])

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
        setBusy(false)
        applyYahooHandoffResult(handoff)
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

  const [manualSyncing, setManualSyncing] = useState(false)

  const onSync = async () => {
    if (!signedIn) return
    setBusy(true)
    setErr('')
    setInfo('')
    setManualSyncing(true)
    try {
      const result = await syncAllFantasy(supabaseClient, snap.connections)
      if (result.warnings?.length) setInfo(result.warnings.join(' '))
      await refresh()
      setDetailNonce((n) => n + 1)
    } catch (e) {
      setErr(e?.message || 'Sync failed.')
    } finally {
      setBusy(false)
      setManualSyncing(false)
    }
  }

  // Hosts change lineups and rosters outside EdgeTilt, so opening (or returning to) the screen re-syncs stale links.
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [wake, setWake] = useState(0)
  const autoSyncWatchRef = useRef(null)
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVis = () => {
      if (document.visibilityState === 'visible') setWake((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  useEffect(() => {
    if (!supabaseClient || !signedIn || !booted || busy) return
    // Joins a background sync the app already started (app open / foreground), else starts one for stale links.
    const running = fantasyAutoSyncInFlight() || autoSyncStaleFantasy(supabaseClient, snap.connections)
    if (!running || autoSyncWatchRef.current === running) return
    autoSyncWatchRef.current = running
    setAutoSyncing(true)
    void running
      .then(() => refresh())
      .then(() => setDetailNonce((n) => n + 1))
      .catch(() => {})
      .finally(() => setAutoSyncing(false))
  }, [supabaseClient, signedIn, booted, busy, snap.connections, wake, refresh])

  const onSetPrimary = async (id) => {
    if (!signedIn || !id) return
    setBusy(true)
    setErr('')
    try {
      await setPrimaryFantasyLeague(supabaseClient, id)
      await refresh()
    } catch (e) {
      setErr(e?.message || 'Could not set the hub league.')
    } finally {
      setBusy(false)
    }
  }

  const detailSig = Object.keys(details || {}).sort().join(',')
  const fantasyReady =
    !signedIn ||
    (booted && (!hasConnection || (detailEpoch === leagueKey && cardsEpoch === detailSig)))

  useEffect(() => {
    if (fantasyReady) setShown(true)
  }, [fantasyReady])

  const connectPanel = (
    <FantasyConnectPanel
      sleeper={sleeper}
      yahoo={yahoo}
      espn={espn}
      cbs={cbs}
      username={username}
      setUsername={setUsername}
      busy={busy}
      espnInApp={espnInApp}
      cbsInApp={cbsInApp}
      onLinkSleeper={onLinkSleeper}
      onConnectYahoo={onConnectYahoo}
      onConnectEspn={onConnectEspn}
      onConnectCbs={onConnectCbs}
    />
  )

  return (
    <ScrollLinkedEdgeTitleBarShell
      publishScrollReveal
      titleBarNavSlot={titleBarNavSlot}
      titleBarCenterSlot={titleBarCenterSlot}
      titleBarBrand={<TitleBarScreenTitle>Fantasy</TitleBarScreenTitle>}
      autoTuckMs={3000}
      contentClassName="px-4 pt-3 pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
    >
      <div data-fantasy-home className="text-white">
        {!shown ? (
          signedIn ? <FantasyHomeSkeleton cards={(snap.leagues || []).length} /> : null
        ) : (<>
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
              Sign in to link Sleeper, Yahoo, ESPN, or CBS. The roster is what unlocks the tools.
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

        {signedIn && !hasConnection ? connectPanel : null}

        {signedIn && hasConnection ? (
          <SportsBetLogGameProvider game={FANTASY_BET_GAME} supabaseClient={supabaseClient}>
            <FantasyCommandCenter
              supabaseClient={supabaseClient}
              leagues={leaguesWithSync}
              details={details}
              loadingDetail={loadingDetail}
              cards={cards}
              cardsLoading={cardsLoading}
              busy={busy || autoSyncing}
              syncing={autoSyncing || manualSyncing}
              onSetPrimary={onSetPrimary}
              onOpenManage={() => setManageOpen(true)}
              onSync={onSync}
            />
          </SportsBetLogGameProvider>
        ) : null}

        {signedIn && manageOpen ? (
          <div className="fixed inset-0 z-[96] flex flex-col justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Manage fantasy connects">
            <button type="button" className="min-h-0 flex-1" aria-label="Close" onClick={() => setManageOpen(false)} />
            <div className="max-h-[88%] overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 px-4 pb-[calc(1.5rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] pt-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[16px] font-semibold">Connects</div>
                <button
                  type="button"
                  onClick={() => setManageOpen(false)}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-200"
                >
                  Done
                </button>
              </div>
              {connectPanel}
            </div>
          </div>
        ) : null}
        </>)}
      </div>
    </ScrollLinkedEdgeTitleBarShell>
  )
}
