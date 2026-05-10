import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost'
import { renderRichCaption } from '../lounge/loungeCaption'
import {
  OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX,
  OFFERS_DEFAULT_VIEW_KEY_PREFIX,
  OFFERS_DELETE_CONFIRM_SKIP_KEY_PREFIX,
  OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX,
  OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX,
  OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX,
  OFFERS_IOS_PWA_ENABLE_PENDING_KEY_PREFIX,
} from '../offers/offerStorageKeys'

const SocialFeed = lazy(() => import('../lounge/SocialFeed.jsx'))
const OffersCalendar = lazy(() => import('../offers/OffersCalendar.jsx'))
const GuidesScreen = lazy(() => import('../guides/GuidesScreen.jsx'))
const BankrollTracker = lazy(() => import('../bankroll/BankrollTracker.jsx'))
const LocalIntel = lazy(() => import('../intel/LocalIntel.jsx'))
const CalculatorsTab = lazy(() => import('../calculators/CalculatorsTab.jsx'))

function TabLoadingFallback() {
  return (
    <div className="flex min-h-[45vh] w-full items-center justify-center px-4 text-zinc-500 text-[15px]">
      Loading…
    </div>
  )
}

export default function AppShell({ onLogout, supabaseClient, onRequireAuth }) {
  const COMMUNITY_FEED_PAGE_SIZE = 20
  const [tab, setTab] = useState('home')
  const [pendingOfferEventIds, setPendingOfferEventIds] = useState([])
  const [offerSpotlightEventIds, setOfferSpotlightEventIds] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeCalculator, setActiveCalculator] = useState(null) // 'phoenix' | 'buffalo' | 'stackup' | 'mhb' | null
  const [communityPosts, setCommunityPosts] = useState([])
  const [communityFeedLoading, setCommunityFeedLoading] = useState(false)
  const [communityFeedLoadingMore, setCommunityFeedLoadingMore] = useState(false)
  const [communityFeedHasMore, setCommunityFeedHasMore] = useState(false)
  const [communityFeedCursor, setCommunityFeedCursor] = useState(null)
  /** True while the first page of the Lounge feed is being reloaded (including silent pull-to-refresh). */
  const communityFeedHeadReloadingRef = useRef(false)
  const iosPwaGlobalPromptShownRef = useRef(false)
  const [globalConfirmState, setGlobalConfirmState] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel'
  })
  const globalConfirmResolverRef = useRef(null)

  const closeGlobalConfirm = useCallback((result) => {
    const resolver = globalConfirmResolverRef.current
    globalConfirmResolverRef.current = null
    setGlobalConfirmState((cur) => ({ ...cur, open: false }))
    if (resolver) resolver(result === true)
  }, [])

  const showGlobalConfirm = useCallback(
    ({ title, message = '', confirmLabel = 'Continue', cancelLabel = 'Cancel' }) =>
      new Promise((resolve) => {
        globalConfirmResolverRef.current = resolve
        setGlobalConfirmState({
          open: true,
          title,
          message,
          confirmLabel,
          cancelLabel
        })
      }),
    []
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = window.navigator.userAgent || ''
    const isIos = /iPhone|iPad|iPod/i.test(ua)
    const standaloneViaMedia = window.matchMedia?.('(display-mode: standalone)')?.matches === true
    const standaloneViaNavigator = window.navigator.standalone === true
    const isStandalone = standaloneViaMedia || standaloneViaNavigator
    if (!isIos || !isStandalone || iosPwaGlobalPromptShownRef.current) return
    let cancelled = false
    ;(async () => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      const userId = session?.user?.id
      if (!userId || cancelled) return
      const promptKey = `${OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX}${userId}`
      const pendingEnableKey = `${OFFERS_IOS_PWA_ENABLE_PENDING_KEY_PREFIX}${userId}`
      let alreadyPrompted = false
      try {
        alreadyPrompted = window.localStorage.getItem(promptKey) === '1'
      } catch {
        alreadyPrompted = false
      }
      if (alreadyPrompted) return
      iosPwaGlobalPromptShownRef.current = true
      const shouldEnable = await showGlobalConfirm({
        title: 'Enable Notifications',
        message: 'Allow notifications for this Home Screen app now?',
        confirmLabel: 'Enable',
        cancelLabel: 'Not now'
      })
      if (cancelled) return
      try {
        window.localStorage.setItem(promptKey, '1')
      } catch {
        // Ignore local storage failures.
      }
      if (!shouldEnable) return
      try {
        const permission = await window.Notification?.requestPermission?.()
        if (permission === 'granted') {
          try {
            window.localStorage.setItem(pendingEnableKey, '1')
          } catch {
            // Ignore local storage failures.
          }
        }
      } catch {
        // Ignore prompt errors; user can still enable later.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showGlobalConfirm, supabaseClient])

  const hydrateCommunityPosts = useCallback(
    async (rows) => {
      if (!rows?.length) return []
      const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
      let profileByUserId = {}
      if (ids.length > 0) {
        const { data: profiles } = await supabaseClient
          .from('profiles')
          .select('user_id,handle,display_name,avatar_url')
          .in('user_id', ids)
        profileByUserId = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]))
      }
      return rows.map((r) => ({
        ...r,
        author_profile: profileByUserId[r.user_id] || null,
      }))
    },
    [supabaseClient]
  )

  const loadCommunityFeed = useCallback(async (opts) => {
    const silent = opts?.silent === true
    if (!silent) {
      setCommunityFeedLoading(true)
      setCommunityFeedLoadingMore(false)
    }
    communityFeedHeadReloadingRef.current = true
    try {
      const selectCols =
        'id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count'
      const [{ data: pinnedRows }, { data: rows, error }] = await Promise.all([
        supabaseClient
          .from('community_feed_posts')
          .select(selectCols)
          .eq('pinned', true)
          .order('created_at', { ascending: false })
          .limit(1),
        supabaseClient
          .from('community_feed_posts')
          .select(selectCols)
          .eq('pinned', false)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(COMMUNITY_FEED_PAGE_SIZE + 1),
      ])

      if (error) {
        setCommunityPosts([])
        setCommunityFeedHasMore(false)
        setCommunityFeedCursor(null)
        return
      }

      const list = rows || []
      const hasMore = list.length > COMMUNITY_FEED_PAGE_SIZE
      const pageRows = hasMore ? list.slice(0, COMMUNITY_FEED_PAGE_SIZE) : list
      const pageLast = pageRows.at(-1) || null
      const merged = [...(pinnedRows || []), ...pageRows]
      const deduped = merged.filter((row, idx, arr) => arr.findIndex((x) => x.id === row.id) === idx)
      const hydrated = await hydrateCommunityPosts(deduped)

      setCommunityPosts(hydrated)
      setCommunityFeedHasMore(hasMore)
      setCommunityFeedCursor(pageLast ? { created_at: pageLast.created_at, id: pageLast.id } : null)
    } finally {
      communityFeedHeadReloadingRef.current = false
      if (!silent) setCommunityFeedLoading(false)
    }
  }, [COMMUNITY_FEED_PAGE_SIZE, hydrateCommunityPosts, supabaseClient])

  const loadCommunityFeedRef = useRef(loadCommunityFeed)
  loadCommunityFeedRef.current = loadCommunityFeed

  const loadMoreCommunityFeed = useCallback(async () => {
    if (
      !communityFeedHasMore ||
      !communityFeedCursor ||
      communityFeedLoading ||
      communityFeedLoadingMore ||
      communityFeedHeadReloadingRef.current
    )
      return
    setCommunityFeedLoadingMore(true)
    try {
      const cursorFilter = `created_at.lt.${communityFeedCursor.created_at},and(created_at.eq.${communityFeedCursor.created_at},id.lt.${communityFeedCursor.id})`
      const { data: rows, error } = await supabaseClient
        .from('community_feed_posts')
        .select('id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count')
        .eq('pinned', false)
        .or(cursorFilter)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(COMMUNITY_FEED_PAGE_SIZE + 1)

      if (error) return

      const list = rows || []
      const hasMore = list.length > COMMUNITY_FEED_PAGE_SIZE
      const pageRows = hasMore ? list.slice(0, COMMUNITY_FEED_PAGE_SIZE) : list
      const pageLast = pageRows.at(-1) || null
      const hydrated = await hydrateCommunityPosts(pageRows)

      setCommunityPosts((prev) => [
        ...prev,
        ...hydrated.filter((row) => !prev.some((existing) => existing.id === row.id)),
      ])
      setCommunityFeedHasMore(hasMore)
      setCommunityFeedCursor(pageLast ? { created_at: pageLast.created_at, id: pageLast.id } : null)
    } finally {
      setCommunityFeedLoadingMore(false)
    }
  }, [
    COMMUNITY_FEED_PAGE_SIZE,
    communityFeedCursor,
    communityFeedHasMore,
    communityFeedLoading,
    communityFeedLoadingMore,
    hydrateCommunityPosts,
    supabaseClient,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyFromUrl = () => {
      const params = new URLSearchParams(window.location.search || '')
      const targetTab = params.get('tab')
      const targetEventId = params.get('eventId')
      const targetEventIdsRaw = params.get('eventIds')
      const targetEventIds = targetEventIdsRaw
        ? targetEventIdsRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
        : []
      if (targetTab === 'offers') setTab('offers')
      if (targetEventId && !targetEventIds.includes(targetEventId)) targetEventIds.unshift(targetEventId)
      if (targetEventIds.length > 0) setPendingOfferEventIds(targetEventIds)
    }
    applyFromUrl()
    window.addEventListener('popstate', applyFromUrl)
    return () => window.removeEventListener('popstate', applyFromUrl)
  }, [])

  /** Only refire when entering Lounge — not when `loadCommunityFeed` identity changes (avoids scroll reset mid-feed). */
  useEffect(() => {
    if (tab === 'home') void loadCommunityFeedRef.current()
  }, [tab])

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator?.serviceWorker) return
    const handleServiceWorkerMessage = (event) => {
      if (event?.data?.type !== 'offers-open-tab') return
      setTab('offers')
    }
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
  }, [])

  const openCalculator = (key) => {
    setActiveCalculator(key)
    setTab('calculators')
    setMenuOpen(false)
  }

  const navItems = [
    { id: 'home', label: 'Lounge', icon: '🍻' },
    { id: 'calculators', label: 'Calcs', icon: '🧮' },
    { id: 'offers', label: 'Offers', icon: '📅' },
    { id: 'bankroll', label: 'Bankroll', icon: '💰' },
    { id: 'guides', label: 'AP Guides', icon: '📗', menuHint: 'Search · +EV cards · ask' },
    { id: 'intel', label: 'Intel', icon: '📍' },
    { id: 'team', label: 'Team', icon: '🤝' }
  ]


  const renderTabContent = () => {
    if (tab === 'calculators') {
      return (
        <CalculatorsTab
          activeCalculator={activeCalculator}
          setActiveCalculator={setActiveCalculator}
          onLogout={onLogout}
        />
      )
    }

    if (tab === 'dashboard') {
      return (
        <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-white text-2xl font-black tracking-tight">Las Vegas Slot Pro</div>
              <div className="text-zinc-400 text-sm mt-0.5">Lounge</div>
            </div>
            <button
              onClick={onLogout}
              className="min-h-10 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-sm font-semibold touch-manipulation"
            >
              Logout
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setTab('calculators')}
              className="bg-zinc-900 rounded-3xl p-4 text-left touch-manipulation active:scale-[0.99]"
            >
              <div className="text-zinc-400 text-xs">Quick action</div>
              <div className="text-white font-bold text-lg mt-1">Open calculators</div>
              <div className="text-zinc-500 text-xs mt-1">Favorites + recent</div>
            </button>
            <button
              onClick={() => openCalculator('stackup')}
              className="bg-zinc-900 rounded-3xl p-4 text-left touch-manipulation active:scale-[0.99]"
            >
              <div className="text-zinc-400 text-xs">Quick eval</div>
              <div className="text-white font-bold text-lg mt-1">Stack Up Pays</div>
              <div className="text-zinc-500 text-xs mt-1">Jump into meters</div>
            </button>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white font-bold">Community feed</div>
              <button
                onClick={() => setTab('offers')}
                className="text-cyan-300 text-sm font-semibold hover:text-cyan-200"
              >
                View offers →
              </button>
            </div>
            <p className="text-zinc-500 text-xs mb-3 leading-relaxed">
              Questions posted from <span className="text-zinc-400">Guides → Ask community</span> land here once{' '}
              <code className="text-zinc-400">community_feed_posts</code> is applied in Supabase.
            </p>
            {communityFeedLoading && communityPosts.length === 0 ? (
              <div className="text-zinc-500 text-sm py-2">Loading feed…</div>
            ) : communityPosts.length === 0 ? (
              <div className="rounded-2xl bg-zinc-800/70 p-4 text-zinc-400 text-sm leading-relaxed">
                No posts yet. Open a guide card and use <span className="text-zinc-200 font-semibold">Ask community</span>, or run{' '}
                <code className="text-amber-200/90">supabase/community_feed_posts.sql</code> if inserts fail.
              </div>
            ) : (
              <div className="space-y-3">
                {communityPosts.map((p) => (
                  <div key={p.id} className="rounded-2xl bg-zinc-800/70 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-zinc-200 font-semibold">
                        {renderRichCaption(feedPostDisplayCaption(p) || 'Post', {
                          hashtagClassName: 'font-semibold text-cyan-400',
                        })}
                      </div>
                      {p.game_title ? (
                        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-400/90 shrink-0">{p.game_title}</span>
                      ) : null}
                    </div>
                    <div className="text-zinc-600 text-[11px] mt-2">
                      {p.created_at
                        ? new Date(p.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }

    if (tab === 'home') {
      return (
        <SocialFeed
          supabaseClient={supabaseClient}
          onRequireAuth={onRequireAuth}
          communityPosts={communityPosts}
          setCommunityPosts={setCommunityPosts}
          communityFeedLoading={communityFeedLoading}
          communityFeedLoadingMore={communityFeedLoadingMore}
          communityFeedHasMore={communityFeedHasMore}
          loadCommunityFeed={loadCommunityFeed}
          loadMoreCommunityFeed={loadMoreCommunityFeed}
        />
      )
    }

    if (tab === 'guides') {
      return (
        <GuidesScreen
          supabaseClient={supabaseClient}
          onOpenCalculator={openCalculator}
          onNavigateHome={() => setTab('home')}
          onCommunityPosted={loadCommunityFeed}
          onRequireAuth={onRequireAuth}
        />
      )
    }

    if (tab === 'offers')
      return (
        <OffersCalendar
          supabaseClient={supabaseClient}
          pendingOfferEventIds={pendingOfferEventIds}
          setPendingOfferEventIds={setPendingOfferEventIds}
          offerSpotlightEventIds={offerSpotlightEventIds}
          setOfferSpotlightEventIds={setOfferSpotlightEventIds}
        />
      )
    if (tab === 'bankroll') return <BankrollTracker />
    if (tab === 'intel') return <LocalIntel supabaseClient={supabaseClient} />

    if (tab === 'team') {
      return (
        <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="mb-6">
            <div className="text-white text-2xl font-black tracking-tight">Team / Deals</div>
            <div className="text-zinc-400 text-sm mt-0.5">Bring our team in (skeleton)</div>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
            <div className="text-white font-bold">Request help on a play</div>
            <div className="text-zinc-400 text-sm mt-1">
              Intake flow for large plays you can’t take solo. (Run it / buy it / partner.)
            </div>
            <button
              type="button"
              className="mt-4 w-full min-h-12 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold touch-manipulation"
            >
              Start intake (coming soon)
            </button>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5">
            <div className="text-white font-bold">Submission status</div>
            <div className="text-zinc-500 text-sm mt-1">Submitted → Reviewing → Accepted → Coordinating</div>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="min-h-dvh bg-gray-950">
      <Suspense fallback={<TabLoadingFallback />}>{renderTabContent()}</Suspense>

      {globalConfirmState.open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={() => closeGlobalConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[17px] font-semibold text-zinc-100">{globalConfirmState.title}</div>
            {globalConfirmState.message ? (
              <div className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-zinc-300">{globalConfirmState.message}</div>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => closeGlobalConfirm(false)}
                className="min-h-11 flex-1 rounded-xl border border-zinc-600 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 touch-manipulation"
              >
                {globalConfirmState.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => closeGlobalConfirm(true)}
                className="min-h-11 flex-1 rounded-xl border border-cyan-400/45 bg-cyan-600 px-3 text-sm font-semibold text-white touch-manipulation"
              >
                {globalConfirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {menuOpen && (
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/35"
        />
      )}

      <div className="fixed right-4 bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] z-50 flex flex-col items-end gap-2">
        {menuOpen && (
          <div className="min-w-[11.5rem] max-w-[15rem] w-max rounded-2xl bg-zinc-950/95 backdrop-blur px-2 py-2 shadow-xl">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id !== 'calculators') setActiveCalculator(null)
                  else if (activeCalculator) setActiveCalculator(null)
                  setTab(item.id)
                  setMenuOpen(false)
                }}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm touch-manipulation ${
                  tab === item.id ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                } ${item.menuHint ? 'pb-2' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>{item.icon}</span>
                  <span className="font-semibold">{item.label}</span>
                </span>
                {item.menuHint ? (
                  <span className="mt-0.5 block pl-8 text-[11px] leading-snug text-zinc-500">{item.menuHint}</span>
                ) : null}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Open navigation menu"
          className="grid h-12 w-12 place-items-center rounded-full bg-zinc-900/95 text-white shadow-lg backdrop-blur touch-manipulation"
        >
          <span aria-hidden className="block leading-none text-2xl -translate-y-px">
            {menuOpen ? '×' : '☰'}
          </span>
        </button>
      </div>
    </div>
  )
}
