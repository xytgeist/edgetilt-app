import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import 'react-datepicker/dist/react-datepicker.css'
import PhoenixLink from './calculators/PhoenixLink'
import BuffaloLink from './calculators/BuffaloLink'
import StackUpPays from './calculators/StackUpPays'
import MHBCalculator from './calculators/MHBCalculator'
import {
  OFFER_ALERT_DAY_9AM,
  OFFER_ALERT_NONE,
  localDateKeyFromIso,
  localDateKeyFromDate,
  dateFromDatetimeLocalValue,
  datetimeLocalValueFromDate,
  normalizeLoadedEvent
} from './features/offers/utils'
import ReviewQueuePanel from './features/offers/components/ReviewQueuePanel'
import UploadProgressOverlay from './features/offers/components/UploadProgressOverlay'
import OfferFormModal from './features/offers/components/OfferFormModal'
import WeekEventDetailModal from './features/offers/components/WeekEventDetailModal'
import AddEventFab from './features/offers/components/AddEventFab'
import useOffersCalendarState from './features/offers/hooks/useOffersCalendarState'
import useOffersCalendarMutations from './features/offers/hooks/useOffersCalendarMutations'
import useWebPushNotifications from './features/offers/hooks/useWebPushNotifications'
import GuidesScreen from './features/guides/GuidesScreen'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Mobile-first: min 16px text (iOS won’t auto-zoom), ~48px min tap height, notched device padding
const mobileShell = 'min-h-dvh bg-gray-950 flex items-center justify-center overflow-y-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]'
const inputBase = 'w-full min-h-12 text-base text-white bg-gray-800 rounded-2xl border-0 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-orange-500/50 touch-manipulation'
const btnPrimary = 'w-full min-h-12 text-base font-bold touch-manipulation active:scale-[0.99] transition-transform'
const btnSecondary = 'w-full min-h-12 text-base font-bold touch-manipulation active:scale-[0.99] transition-transform'
const linkBtn = 'w-full min-h-12 text-base text-gray-400 hover:text-white touch-manipulation py-3 text-center flex items-center justify-center active:scale-[0.99]'
const OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX = 'offers_alert_default_preset_v1:'
const OFFERS_DEFAULT_VIEW_KEY_PREFIX = 'offers_default_view_v1:'
const OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX = 'offers_ios_alert_setup_ack_v1:'
const OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX = 'offers_ios_alert_reminder_suppress_v1:'
const OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX = 'offers_ios_pwa_notif_prompt_v1:'

/**
 * When OAuth fails, Supabase redirects back with error / error_code in the query or hash (not the signInWithOAuth return value).
 */
function readAuthCallbackParams() {
  const { search, hash } = window.location
  const fromSearch = new URLSearchParams(search && search.startsWith('?') ? search.slice(1) : search)
  const fromHash = new URLSearchParams((hash && hash.startsWith('#') ? hash.slice(1) : hash) || '')
  const get = (k) => fromHash.get(k) ?? fromSearch.get(k)
  let errorDescription = get('error_description') || ''
  try {
    errorDescription = decodeURIComponent(errorDescription.replace(/\+/g, ' '))
  } catch {
    // keep raw
  }
  return {
    error: get('error') || '',
    errorCode: get('error_code') || '',
    errorDescription
  }
}

function getOAuthCallbackMessage(error, errorCode, errorDescription) {
  if (!error && !errorCode && !errorDescription) return ''
  const raw = `${error} ${errorCode} ${errorDescription}`.toLowerCase()
  if (error === 'access_denied' || raw.includes('access_denied')) {
    return 'Sign-in with Google was cancelled. You can try again or use your email and password.'
  }
  if (
    raw.includes('identity_already_exists') ||
    raw.includes('user_already_exists') ||
    raw.includes('email address is already registered') ||
    raw.includes('already been registered') ||
    raw.includes('user already registered') ||
    (raw.includes('already') && raw.includes('register'))
  ) {
    return 'This email already has an account. Please sign in with your email and password, or use Forgot password if you need to reset it.'
  }
  return errorDescription || 'Sign-in with Google could not be completed. Please try again or use your email and password.'
}

function OAuthDivider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-gray-700" />
      </div>
      <div className="relative flex justify-center text-xs text-gray-500">
        <span className="bg-gray-900 px-3">or continue with</span>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function AppShell({ onLogout, supabaseClient }) {
  const [tab, setTab] = useState('home')
  const [pendingOfferEventIds, setPendingOfferEventIds] = useState([])
  const [offerSpotlightEventIds, setOfferSpotlightEventIds] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeCalculator, setActiveCalculator] = useState(null) // 'phoenix' | 'buffalo' | 'stackup' | 'mhb' | null
  const [intelView, setIntelView] = useState({ screen: 'home', cityId: null, casinoId: null })
  const [communityPosts, setCommunityPosts] = useState([])
  const [communityFeedLoading, setCommunityFeedLoading] = useState(false)

  const loadCommunityFeed = useCallback(async () => {
    setCommunityFeedLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('community_feed_posts')
        .select('id,title,body,game_title,created_at')
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) {
        setCommunityPosts([])
        return
      }
      setCommunityPosts(data || [])
    } finally {
      setCommunityFeedLoading(false)
    }
  }, [supabaseClient])

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

  useEffect(() => {
    if (tab === 'home') void loadCommunityFeed()
  }, [tab, loadCommunityFeed])

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
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'calculators', label: 'Calcs', icon: '🧮' },
    { id: 'offers', label: 'Offers', icon: '📅' },
    { id: 'bankroll', label: 'Bankroll', icon: '💰' },
    { id: 'guides', label: 'AP Guides', icon: '📗', menuHint: 'Search · +EV cards · ask' },
    { id: 'intel', label: 'Intel', icon: '📍' },
    { id: 'team', label: 'Team', icon: '🤝' }
  ]

  const BankrollTracker = () => {
    const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [bankrollStart, setBankrollStart] = useState('2500')
    const [buyIn, setBuyIn] = useState('500')
    const [cashOut, setCashOut] = useState('0')
    const [notes, setNotes] = useState('')

    const parsedBuyIn = Number(buyIn) || 0
    const parsedCashOut = Number(cashOut) || 0
    const parsedBankrollStart = Number(bankrollStart) || 0
    const sessionPnl = parsedCashOut - parsedBuyIn
    const projectedBankroll = parsedBankrollStart + sessionPnl

    return (
      <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mb-6">
          <div className="text-white text-2xl font-black tracking-tight">Bankroll Tracker</div>
          <div className="text-zinc-400 text-sm mt-0.5">Track sessions, win/loss trends, and bankroll growth</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-zinc-900 p-4">
            <div className="text-zinc-400 text-xs">Session P/L</div>
            <div className={`mt-1 text-xl font-black ${sessionPnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {sessionPnl >= 0 ? '+' : '-'}${Math.abs(sessionPnl).toFixed(2)}
            </div>
          </div>
          <div className="rounded-2xl bg-zinc-900 p-4">
            <div className="text-zinc-400 text-xs">Projected Bankroll</div>
            <div className="mt-1 text-xl font-black text-cyan-200">${projectedBankroll.toFixed(2)}</div>
          </div>
        </div>

        <div className="rounded-3xl bg-zinc-900 p-5 mb-4">
          <div className="text-white font-bold mb-3">Log session (UI scaffold)</div>
          <div className="space-y-3">
            <div>
              <label className="block text-zinc-400 text-xs mb-1">Session date</label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-xs mb-1">Starting bankroll</label>
              <input
                type="number"
                inputMode="decimal"
                value={bankrollStart}
                onChange={(e) => setBankrollStart(e.target.value)}
                className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 text-xs mb-1">Buy-in</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={buyIn}
                  onChange={(e) => setBuyIn(e.target.value)}
                  className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs mb-1">Cash-out</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={cashOut}
                  onChange={(e) => setCashOut(e.target.value)}
                  className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
            </div>
            <div>
              <label className="block text-zinc-400 text-xs mb-1">Session notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-24 rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
                placeholder="Machine mix, promo used, notable hits..."
              />
            </div>
            <button
              type="button"
              className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:scale-[0.99]"
            >
              Save session (coming next)
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-zinc-900 p-5">
          <div className="text-white font-bold">Upcoming dashboard blocks</div>
          <div className="text-zinc-400 text-sm mt-2 leading-relaxed">
            Daily P/L graph, bankroll curve, game-level ROI, and promo-adjusted session analytics.
          </div>
        </div>
      </div>
    )
  }

  const SocialFeed = () => {
    const [postText, setPostText] = useState('')
    const samplePosts = [
      { id: 'a', user: 'VegasGrinder', time: '2h', body: 'Hit a clean bonus train on Buffalo Link. Ended +$620 after 90 min.' },
      { id: 'b', user: 'SlotMathNerd', time: '4h', body: 'Anyone tracking fresh Must Hit By resets at South Point tonight?' },
    ]

    return (
      <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mb-6">
          <div className="text-white text-2xl font-black tracking-tight">Social Feed</div>
          <div className="text-zinc-400 text-sm mt-0.5">Share plays, post media, and discuss live casino conditions</div>
        </div>

        <div className="rounded-3xl bg-zinc-900 p-5 mb-4">
          <div className="text-white font-bold mb-3">Create post (UI scaffold)</div>
          <textarea
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            className="w-full min-h-24 rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-fuchsia-500/40"
            placeholder="Share your hit, strategy, or casino intel..."
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="min-h-10 rounded-xl bg-zinc-800 px-3 text-sm font-semibold text-zinc-100"
            >
              Add photo
            </button>
            <button
              type="button"
              className="min-h-10 rounded-xl bg-zinc-800 px-3 text-sm font-semibold text-zinc-100"
            >
              Add video
            </button>
            <button
              type="button"
              className="ml-auto min-h-10 rounded-xl bg-fuchsia-600 px-4 text-sm font-bold text-white"
            >
              Post
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {samplePosts.map((post) => (
            <div key={post.id} className="rounded-3xl bg-zinc-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-zinc-100 font-semibold">{post.user}</div>
                <div className="text-zinc-500 text-xs">{post.time}</div>
              </div>
              <div className="text-zinc-300 text-sm mt-2 leading-relaxed">{post.body}</div>
              <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
                <button type="button" className="hover:text-zinc-200">Like</button>
                <button type="button" className="hover:text-zinc-200">Comment</button>
                <button type="button" className="hover:text-zinc-200">Share</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const LocalIntel = () => {
    const [cities, setCities] = useState([])
    const [casinos, setCasinos] = useState([])
    const [posts, setPosts] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [draft, setDraft] = useState({ postType: 'conditions', title: '', body: '' })
    const [isPosting, setIsPosting] = useState(false)
    const [follows, setFollows] = useState({ city: new Set(), casino: new Set() })

    const loadFollows = async () => {
      const { data, error: e } = await supabaseClient
        .from('follows')
        .select('target_type,target_id')
        .limit(500)
      if (e) throw e
      const citySet = new Set()
      const casinoSet = new Set()
      ;(data || []).forEach((r) => {
        if (r.target_type === 'city') citySet.add(r.target_id)
        if (r.target_type === 'casino') casinoSet.add(r.target_id)
      })
      setFollows({ city: citySet, casino: casinoSet })
    }

    const loadCities = async () => {
      const { data, error: e } = await supabaseClient.from('cities').select('id,name,region').order('name')
      if (e) throw e
      setCities(data || [])
    }

    const loadCasinosForCity = async (cityId) => {
      const { data, error: e } = await supabaseClient
        .from('casinos')
        .select('id,name,city_id')
        .eq('city_id', cityId)
        .order('name')
      if (e) throw e
      setCasinos(data || [])
    }

    const loadPosts = async ({ targetType, targetId }) => {
      const { data, error: e } = await supabaseClient
        .from('intel_posts')
        .select('id,target_type,target_id,post_type,title,body,created_at')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (e) throw e
      setPosts(data || [])
    }

    const toggleFollow = async ({ targetType, targetId }) => {
      const isFollowing = (targetType === 'city' ? follows.city : follows.casino).has(targetId)
      if (isFollowing) {
        const { error: e } = await supabaseClient
          .from('follows')
          .delete()
          .eq('target_type', targetType)
          .eq('target_id', targetId)
        if (e) throw e
      } else {
        const { error: e } = await supabaseClient
          .from('follows')
          .insert({ target_type: targetType, target_id: targetId })
        if (e) throw e
      }
      await loadFollows()
    }

    const submitPost = async () => {
      setIsPosting(true)
      setError('')
      try {
        const { screen, cityId, casinoId } = intelView
        const targetType = screen === 'casino' ? 'casino' : 'city'
        const targetId = screen === 'casino' ? casinoId : cityId
        if (!targetId) throw new Error('Select a city/casino first.')
        if (!draft.title.trim()) throw new Error('Add a title.')
        if (!draft.body.trim()) throw new Error('Add details.')

        const { error: e } = await supabaseClient.from('intel_posts').insert({
          target_type: targetType,
          target_id: targetId,
          post_type: draft.postType,
          title: draft.title.trim(),
          body: draft.body.trim()
        })
        if (e) throw e
        setDraft({ postType: 'conditions', title: '', body: '' })
        await loadPosts({ targetType, targetId })
      } catch (e) {
        setError(e?.message || 'Failed to post.')
      } finally {
        setIsPosting(false)
      }
    }

    useEffect(() => {
      let cancelled = false
      const run = async () => {
        setLoading(true)
        setError('')
        try {
          await Promise.all([loadCities(), loadFollows()])
        } catch (e) {
          if (!cancelled) setError(e?.message || 'Failed to load Local Intel.')
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
      void run()
      return () => {
        cancelled = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      let cancelled = false
      const run = async () => {
        setError('')
        try {
          if (intelView.screen === 'city' && intelView.cityId) {
            await Promise.all([
              loadCasinosForCity(intelView.cityId),
              loadPosts({ targetType: 'city', targetId: intelView.cityId })
            ])
          }
          if (intelView.screen === 'casino' && intelView.casinoId) {
            await loadPosts({ targetType: 'casino', targetId: intelView.casinoId })
          }
        } catch (e) {
          if (!cancelled) setError(e?.message || 'Failed to load Intel.')
        }
      }
      void run()
      return () => {
        cancelled = true
      }
    }, [intelView.screen, intelView.cityId, intelView.casinoId])

    const Header = ({ title, subtitle, onBack, right }) => (
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-3xl leading-none text-zinc-300 hover:text-white -mt-0.5 mr-1 touch-manipulation"
                aria-label="Back"
              >
                ‹
              </button>
            )}
            <div className="text-white text-2xl font-black tracking-tight truncate">{title}</div>
          </div>
          {subtitle && <div className="text-zinc-400 text-sm mt-0.5">{subtitle}</div>}
        </div>
        {right}
      </div>
    )

    const SetupHint = () => (
      <div className="bg-amber-900/30 border border-amber-500/40 rounded-3xl p-5 mb-4">
        <div className="text-amber-200 font-bold">Local Intel setup</div>
        <div className="text-amber-200/80 text-sm leading-relaxed mt-1">
          If you see errors like “relation does not exist”, you need to create the Supabase tables first. I added a SQL
          script you can paste into Supabase.
        </div>
      </div>
    )

    if (intelView.screen === 'home') {
      return (
        <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Header title="Local Intel" subtitle="City + casino updates (skeleton)" />

          <SetupHint />

          {error && (
            <div className="mb-4 p-4 rounded-3xl bg-red-900/40 border border-red-500/40 text-red-200 text-sm leading-relaxed">
              {error}
            </div>
          )}

          <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
            <div className="text-white font-bold mb-2">Browse cities</div>
            {loading ? (
              <div className="text-zinc-400 text-sm">Loading…</div>
            ) : (
              <div className="space-y-2">
                {cities.slice(0, 30).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setIntelView({ screen: 'city', cityId: c.id, casinoId: null })}
                    className="w-full text-left rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 px-4 py-3 touch-manipulation"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-zinc-200 font-semibold truncate">{c.name}</div>
                        {c.region && <div className="text-zinc-500 text-xs mt-0.5 truncate">{c.region}</div>}
                      </div>
                      <div className="text-zinc-500 text-sm">→</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }

    if (intelView.screen === 'city') {
      const city = cities.find((c) => c.id === intelView.cityId)
      const isFollowing = intelView.cityId ? follows.city.has(intelView.cityId) : false
      return (
        <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Header
            title={city?.name || 'City'}
            subtitle="City feed + casinos"
            onBack={() => setIntelView({ screen: 'home', cityId: null, casinoId: null })}
            right={
              intelView.cityId ? (
                <button
                  type="button"
                  onClick={() => toggleFollow({ targetType: 'city', targetId: intelView.cityId })}
                  className={`min-h-10 px-4 rounded-2xl text-sm font-bold touch-manipulation ${
                    isFollowing ? 'bg-zinc-800 text-zinc-200' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              ) : null
            }
          />

          {error && (
            <div className="mb-4 p-4 rounded-3xl bg-red-900/40 border border-red-500/40 text-red-200 text-sm leading-relaxed">
              {error}
            </div>
          )}

          <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
            <div className="text-white font-bold mb-3">Post an update</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 text-xs mb-1">Type</label>
                <select
                  value={draft.postType}
                  onChange={(e) => setDraft((d) => ({ ...d, postType: e.target.value }))}
                  className="w-full h-12 bg-zinc-800 rounded-2xl px-3 text-zinc-100 font-semibold text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="conditions">Conditions</option>
                  <option value="new_install">New install</option>
                  <option value="paytable">Paytable</option>
                  <option value="reset">Reset</option>
                  <option value="question">Question</option>
                  <option value="trip_report">Trip report</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={submitPost}
                  disabled={isPosting}
                  className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
                >
                  {isPosting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-zinc-400 text-xs mb-1">Title</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full h-12 bg-zinc-800 rounded-2xl px-4 text-zinc-100 font-semibold outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="Short summary"
              />
            </div>
            <div className="mt-3">
              <label className="block text-zinc-400 text-xs mb-1">Details</label>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                className="w-full min-h-24 bg-zinc-800 rounded-2xl px-4 py-3 text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="What changed? Where on the floor? Any notes?"
              />
            </div>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
            <div className="text-white font-bold mb-2">Casinos</div>
            {casinos.length === 0 ? (
              <div className="text-zinc-500 text-sm">No casinos loaded for this city yet.</div>
            ) : (
              <div className="space-y-2">
                {casinos.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setIntelView({ screen: 'casino', cityId: intelView.cityId, casinoId: c.id })}
                    className="w-full text-left rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 px-4 py-3 touch-manipulation"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-zinc-200 font-semibold truncate">{c.name}</div>
                      <div className="text-zinc-500 text-sm">→</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5">
            <div className="text-white font-bold mb-2">Latest updates</div>
            {posts.length === 0 ? (
              <div className="text-zinc-500 text-sm">No posts yet.</div>
            ) : (
              <div className="space-y-3">
                {posts.map((p) => (
                  <div key={p.id} className="rounded-2xl bg-zinc-800/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-zinc-200 font-semibold truncate">{p.title}</div>
                      <div className="text-[11px] text-zinc-500 shrink-0">{new Date(p.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-zinc-500 text-[11px] mt-1 uppercase tracking-wide">{p.post_type}</div>
                    <div className="text-zinc-300 text-sm mt-2 leading-relaxed whitespace-pre-wrap">{p.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }

    if (intelView.screen === 'casino') {
      const casino = casinos.find((c) => c.id === intelView.casinoId)
      const isFollowing = intelView.casinoId ? follows.casino.has(intelView.casinoId) : false
      return (
        <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Header
            title={casino?.name || 'Casino'}
            subtitle="Casino-specific updates"
            onBack={() => setIntelView({ screen: 'city', cityId: intelView.cityId, casinoId: null })}
            right={
              intelView.casinoId ? (
                <button
                  type="button"
                  onClick={() => toggleFollow({ targetType: 'casino', targetId: intelView.casinoId })}
                  className={`min-h-10 px-4 rounded-2xl text-sm font-bold touch-manipulation ${
                    isFollowing ? 'bg-zinc-800 text-zinc-200' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              ) : null
            }
          />

          {error && (
            <div className="mb-4 p-4 rounded-3xl bg-red-900/40 border border-red-500/40 text-red-200 text-sm leading-relaxed">
              {error}
            </div>
          )}

          <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
            <div className="text-white font-bold mb-3">Post an update</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 text-xs mb-1">Type</label>
                <select
                  value={draft.postType}
                  onChange={(e) => setDraft((d) => ({ ...d, postType: e.target.value }))}
                  className="w-full h-12 bg-zinc-800 rounded-2xl px-3 text-zinc-100 font-semibold text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="conditions">Conditions</option>
                  <option value="new_install">New install</option>
                  <option value="paytable">Paytable</option>
                  <option value="reset">Reset</option>
                  <option value="question">Question</option>
                  <option value="trip_report">Trip report</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={submitPost}
                  disabled={isPosting}
                  className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
                >
                  {isPosting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-zinc-400 text-xs mb-1">Title</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full h-12 bg-zinc-800 rounded-2xl px-4 text-zinc-100 font-semibold outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="Short summary"
              />
            </div>
            <div className="mt-3">
              <label className="block text-zinc-400 text-xs mb-1">Details</label>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                className="w-full min-h-24 bg-zinc-800 rounded-2xl px-4 py-3 text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="What changed? Bank location? Any notes?"
              />
            </div>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5">
            <div className="text-white font-bold mb-2">Latest updates</div>
            {posts.length === 0 ? (
              <div className="text-zinc-500 text-sm">No posts yet.</div>
            ) : (
              <div className="space-y-3">
                {posts.map((p) => (
                  <div key={p.id} className="rounded-2xl bg-zinc-800/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-zinc-200 font-semibold truncate">{p.title}</div>
                      <div className="text-[11px] text-zinc-500 shrink-0">{new Date(p.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-zinc-500 text-[11px] mt-1 uppercase tracking-wide">{p.post_type}</div>
                    <div className="text-zinc-300 text-sm mt-2 leading-relaxed whitespace-pre-wrap">{p.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }

    return null
  }

  const OffersCalendar = () => {
    const [sendingTestPush, setSendingTestPush] = useState(false)
    const [testPushMessage, setTestPushMessage] = useState('')
    const [runningReminderCheck, setRunningReminderCheck] = useState(false)
    const [reminderMessage, setReminderMessage] = useState('')
    const [isIosDevice, setIsIosDevice] = useState(false)
    const [isSafariBrowser, setIsSafariBrowser] = useState(false)
    const [isStandaloneMode, setIsStandaloneMode] = useState(false)
    const [showIosInstallHelp, setShowIosInstallHelp] = useState(true)

    const PUSH_LEAD_OPTIONS = [5, 10, 15, 30, 60]
    const [reminderLeadMinutes, setReminderLeadMinutes] = useState(15)
    const [remindersEnabled, setRemindersEnabled] = useState(true)
    const [reminderPrefsLoaded, setReminderPrefsLoaded] = useState(false)
    const [reminderPrefsSaving, setReminderPrefsSaving] = useState(false)
    const [reminderPrefsError, setReminderPrefsError] = useState('')
    const [pushAdvancedOpen, setPushAdvancedOpen] = useState(false)
    const [newEventAlertPresetDefault, setNewEventAlertPresetDefault] = useState(OFFER_ALERT_DAY_9AM)
    const [offersDefaultView, setOffersDefaultView] = useState('auto')
    const [alertPromptHandledForCurrentForm, setAlertPromptHandledForCurrentForm] = useState(false)
    const [alertDialogState, setAlertDialogState] = useState({
      open: false,
      mode: 'confirm',
      title: '',
      message: '',
      images: [],
      checkboxLabel: '',
      checkboxChecked: false,
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel'
    })
    const alertDialogResolverRef = useRef(null)
    const alertDialogReturnCheckedRef = useRef(false)
    const alertDialogCheckedRef = useRef(false)

    const {
      isSupported: pushSupported,
      permission: pushPermission,
      isBusy: pushBusy,
      statusMessage: pushStatusMessage,
      isSubscribed: pushSubscribed,
      canEnable: canEnablePush,
      canDisable: canDisablePush,
      enable: enablePush,
      disable: disablePush,
    } = useWebPushNotifications({ supabaseClient })

    const getAlertDefaultStorageKeyForUser = useCallback((userId) => `${OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX}${userId}`, [])
    const getOffersDefaultViewStorageKeyForUser = useCallback((userId) => `${OFFERS_DEFAULT_VIEW_KEY_PREFIX}${userId}`, [])
    const getIosAlertSetupSeenStorageKeyForUser = useCallback((userId) => `${OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX}${userId}`, [])
    const getIosAlertReminderSuppressStorageKeyForUser = useCallback(
      (userId) => `${OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX}${userId}`,
      []
    )
    const getIosPwaNotifPromptStorageKeyForUser = useCallback((userId) => `${OFFERS_IOS_PWA_NOTIF_PROMPT_KEY_PREFIX}${userId}`, [])

    const setStoredAlertDefaultForCurrentUser = useCallback(
      async (nextPreset) => {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        const userId = session?.user?.id
        if (!userId || typeof window === 'undefined') return
        window.localStorage.setItem(getAlertDefaultStorageKeyForUser(userId), nextPreset)
      },
      [getAlertDefaultStorageKeyForUser, supabaseClient]
    )

    const setStoredOffersDefaultViewForCurrentUser = useCallback(
      async (nextView) => {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        const userId = session?.user?.id
        if (!userId || typeof window === 'undefined') return
        window.localStorage.setItem(getOffersDefaultViewStorageKeyForUser(userId), nextView)
      },
      [getOffersDefaultViewStorageKeyForUser, supabaseClient]
    )

    useEffect(() => {
      let cancelled = false
      ;(async () => {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        if (!session?.user || typeof window === 'undefined') {
          if (!cancelled) setNewEventAlertPresetDefault(OFFER_ALERT_DAY_9AM)
          return
        }
        const stored = window.localStorage.getItem(getAlertDefaultStorageKeyForUser(session.user.id))
        if (cancelled) return
        setNewEventAlertPresetDefault(stored === OFFER_ALERT_NONE ? OFFER_ALERT_NONE : OFFER_ALERT_DAY_9AM)
      })()
      return () => {
        cancelled = true
      }
    }, [getAlertDefaultStorageKeyForUser, supabaseClient])

    useEffect(() => {
      let cancelled = false
      ;(async () => {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        if (!session?.user || typeof window === 'undefined') {
          if (!cancelled) setOffersDefaultView('auto')
          return
        }
        const stored = window.localStorage.getItem(getOffersDefaultViewStorageKeyForUser(session.user.id))
        if (cancelled) return
        if (stored === 'month' || stored === 'week' || stored === 'agenda' || stored === 'auto') {
          setOffersDefaultView(stored)
        } else {
          setOffersDefaultView('auto')
        }
      })()
      return () => {
        cancelled = true
      }
    }, [getOffersDefaultViewStorageKeyForUser, supabaseClient])

    const persistReminderRule = useCallback(
      async (leadMinutes, enabled) => {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession()
        if (sessionError) throw sessionError
        const userId = sessionData?.session?.user?.id
        if (!userId) throw new Error('Sign in required.')
        const { error: disableError } = await supabaseClient
          .from('offer_notification_rules')
          .update({ enabled: false })
          .eq('user_id', userId)
        if (disableError) throw disableError
        if (!enabled) return
        const { error } = await supabaseClient.from('offer_notification_rules').upsert(
          { user_id: userId, lead_minutes: leadMinutes, enabled: true },
          { onConflict: 'user_id,lead_minutes' }
        )
        if (error) throw error
      },
      [supabaseClient]
    )

    useEffect(() => {
      let cancelled = false
      ;(async () => {
        setReminderPrefsError('')
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        if (!session?.user || cancelled) {
          setReminderPrefsLoaded(true)
          return
        }
        const { data: rules, error } = await supabaseClient
          .from('offer_notification_rules')
          .select('lead_minutes, enabled')
          .eq('user_id', session.user.id)
        if (cancelled) return
        if (error) {
          setReminderPrefsError(error.message)
          setReminderPrefsLoaded(true)
          return
        }
        const list = rules || []
        const active = list.find((r) => r.enabled)
        if (active) {
          setReminderLeadMinutes(active.lead_minutes)
          setRemindersEnabled(true)
        } else if (list.length > 0) {
          setReminderLeadMinutes(list[0].lead_minutes)
          setRemindersEnabled(false)
        } else {
          setReminderLeadMinutes(15)
          setRemindersEnabled(true)
        }
        setReminderPrefsLoaded(true)
      })()
      return () => {
        cancelled = true
      }
    }, [supabaseClient])

    const pushSubscribedRef = useRef(false)
    useEffect(() => {
      if (!reminderPrefsLoaded) return
      if (pushSubscribed && !pushSubscribedRef.current && remindersEnabled) {
        void (async () => {
          try {
            await persistReminderRule(reminderLeadMinutes, true)
          } catch {
            /* user can fix via toggles */
          }
        })()
      }
      pushSubscribedRef.current = pushSubscribed
    }, [pushSubscribed, remindersEnabled, reminderLeadMinutes, persistReminderRule, reminderPrefsLoaded])

    useEffect(() => {
      if (typeof window === 'undefined') return
      const ua = window.navigator.userAgent || ''
      const isIos = /iPhone|iPad|iPod/i.test(ua)
      const isSafari =
        /Safari/i.test(ua) &&
        !/CriOS/i.test(ua) &&
        !/FxiOS/i.test(ua) &&
        !/EdgiOS/i.test(ua) &&
        !/OPiOS/i.test(ua)
      const standaloneViaMedia = window.matchMedia?.('(display-mode: standalone)')?.matches === true
      const standaloneViaNavigator = window.navigator.standalone === true
      setIsIosDevice(isIos)
      setIsSafariBrowser(isIos && isSafari)
      setIsStandaloneMode(standaloneViaMedia || standaloneViaNavigator)
    }, [])

    const sendTestPush = useCallback(async () => {
      setSendingTestPush(true)
      setTestPushMessage('')
      try {
        const { data, error } = await supabaseClient.functions.invoke('send-test-push', {
          body: {
            title: 'LVSlotPro Test Notification',
            body: 'If you can read this, web push is working.',
            url: '/?tab=offers',
          },
        })
        if (error) throw error
        const sent = Number(data?.sent || 0)
        const failed = Number(data?.failed || 0)
        const removed = Number(data?.removed || 0)
        setTestPushMessage(`Test sent: ${sent} succeeded, ${failed} failed, ${removed} stale subscription(s) removed.`)
      } catch (error) {
        setTestPushMessage(error?.message || 'Could not send test push.')
      } finally {
        setSendingTestPush(false)
      }
    }, [supabaseClient])

    const saveReminderTiming = useCallback(
      async (nextLead, nextEnabled) => {
        if (!pushSubscribed || !reminderPrefsLoaded) return
        setReminderPrefsSaving(true)
        setReminderPrefsError('')
        try {
          await persistReminderRule(nextLead, nextEnabled)
        } catch (e) {
          setReminderPrefsError(e?.message || 'Could not save reminder settings.')
        } finally {
          setReminderPrefsSaving(false)
        }
      },
      [pushSubscribed, reminderPrefsLoaded, persistReminderRule]
    )

    const runReminderCheckNow = useCallback(async () => {
      setRunningReminderCheck(true)
      setReminderMessage('')
      try {
        const { data, error } = await supabaseClient.functions.invoke('send-due-offer-reminders', {
          body: { lookaheadMinutes: 120 },
        })
        if (error) throw error
        setReminderMessage(
          `Reminder check complete: queued ${Number(data?.queued || 0)}, sent ${Number(data?.sent || 0)}, failed ${Number(
            data?.failed || 0
          )}. (Ensure a reminder rule is enabled and matches your offer times.)`
        )
      } catch (error) {
        setReminderMessage(error?.message || 'Could not run reminder check.')
      } finally {
        setRunningReminderCheck(false)
      }
    }, [supabaseClient])

    const iosInstallRequired = isIosDevice && !isStandaloneMode
    const allowPushControls = !iosInstallRequired
    const canEnablePushUi = canEnablePush && allowPushControls
    const canDisablePushUi = canDisablePush && allowPushControls
    const canSendTestPushUi = pushSubscribed && !sendingTestPush && allowPushControls
    const canRunRemindersUi = pushSubscribed && !runningReminderCheck && allowPushControls

    const closeAlertDialog = useCallback((result) => {
      const resolver = alertDialogResolverRef.current
      const returnChecked = alertDialogReturnCheckedRef.current === true
      const checked = alertDialogCheckedRef.current === true
      alertDialogResolverRef.current = null
      alertDialogReturnCheckedRef.current = false
      alertDialogCheckedRef.current = false
      setAlertDialogState((cur) => ({ ...cur, open: false }))
      if (resolver) {
        if (returnChecked) resolver({ confirmed: result === true, checked })
        else resolver(result)
      }
    }, [])

    const showAlertDialog = useCallback(
      (config) =>
        new Promise((resolve) => {
          alertDialogResolverRef.current = resolve
          alertDialogReturnCheckedRef.current = config.returnChecked === true
          alertDialogCheckedRef.current = config.checkboxDefaultChecked === true
          setAlertDialogState({
            open: true,
            mode: config.mode || 'confirm',
            title: config.title || '',
            message: config.message || '',
            images: Array.isArray(config.images) ? config.images : [],
            checkboxLabel: config.checkboxLabel || '',
            checkboxChecked: config.checkboxDefaultChecked === true,
            confirmLabel: config.confirmLabel || 'Continue',
            cancelLabel: config.cancelLabel || 'Cancel'
          })
        }),
      []
    )

    const showAppConfirm = useCallback(
      async ({ title, message, confirmLabel = 'Continue', cancelLabel = 'Cancel' }) =>
        (await showAlertDialog({ mode: 'confirm', title, message, confirmLabel, cancelLabel })) === true,
      [showAlertDialog]
    )

    const showAppInfo = useCallback(
      async ({ title, message, images = [], confirmLabel = 'OK', checkboxLabel = '', checkboxDefaultChecked = false, returnChecked = false }) =>
        await showAlertDialog({
          mode: 'info',
          title,
          message,
          images,
          confirmLabel,
          checkboxLabel,
          checkboxDefaultChecked,
          returnChecked,
          cancelLabel: ''
        }),
      [showAlertDialog]
    )

    useEffect(
      () => () => {
        if (alertDialogResolverRef.current) {
          alertDialogResolverRef.current(false)
          alertDialogResolverRef.current = null
        }
      },
      []
    )

    const iosPwaPromptShownRef = useRef(false)
    useEffect(() => {
      if (typeof window === 'undefined') return
      if (!isIosDevice || !isStandaloneMode) return
      if (pushSubscribed || pushPermission === 'denied' || iosPwaPromptShownRef.current) return
      let cancelled = false
      ;(async () => {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        const userId = session?.user?.id
        if (!userId || cancelled) return
        const key = getIosPwaNotifPromptStorageKeyForUser(userId)
        let alreadyPrompted = false
        try {
          alreadyPrompted = window.localStorage.getItem(key) === '1'
        } catch {
          alreadyPrompted = false
        }
        if (alreadyPrompted) return
        iosPwaPromptShownRef.current = true
        const shouldEnable = await showAppConfirm({
          title: 'Enable Notifications',
          message: '',
          confirmLabel: 'Enable',
          cancelLabel: 'Not now'
        })
        if (cancelled) return
        try {
          window.localStorage.setItem(key, '1')
        } catch {
          // ignore storage failures
        }
        if (shouldEnable) {
          await enablePush()
        }
      })()
      return () => {
        cancelled = true
      }
    }, [
      enablePush,
      getIosPwaNotifPromptStorageKeyForUser,
      isIosDevice,
      isStandaloneMode,
      pushPermission,
      pushSubscribed,
      showAppConfirm,
      supabaseClient
    ])

    const maybeResolveAlertPresetWithPrompt = useCallback(
      async (alertPreset) => {
        if (alertPreset === OFFER_ALERT_NONE || pushSubscribed) return alertPreset

        const setDefaultNone = async () => {
          setNewEventAlertPresetDefault(OFFER_ALERT_NONE)
          await setStoredAlertDefaultForCurrentUser(OFFER_ALERT_NONE)
        }

        if (iosInstallRequired) {
          const {
            data: { session },
          } = await supabaseClient.auth.getSession()
          const userId = session?.user?.id
          const seenStorageKey = userId ? getIosAlertSetupSeenStorageKeyForUser(userId) : ''
          const suppressStorageKey = userId ? getIosAlertReminderSuppressStorageKeyForUser(userId) : ''
          let setupSeen = false
          let reminderSuppress = false
          if (userId && typeof window !== 'undefined') {
            try {
              setupSeen = window.localStorage.getItem(seenStorageKey) === '1'
              reminderSuppress = window.localStorage.getItem(suppressStorageKey) === '1'
            } catch {
              // ignore storage read failures (private mode/restricted storage)
            }
          }

          const persistFlags = (nextSeen, nextSuppress = reminderSuppress) => {
            if (!userId) return
            if (typeof window !== 'undefined') {
              try {
                if (nextSeen) window.localStorage.setItem(seenStorageKey, '1')
                if (nextSuppress) window.localStorage.setItem(suppressStorageKey, '1')
              } catch {
                // ignore storage write failures
              }
            }
          }

          if (!setupSeen) {
            await showAppInfo({
              title: 'Enable Notifications on iPhone',
              message: isSafariBrowser
                ? "On iPhone, alert notifications only work from the Home Screen app. Don't blame me, blame Apple. 🤷‍♂️\n\nTo enable alerts:\n1) Tap Share -> Add to Home Screen\n2) Open app from Home Screen icon\n3) Allow Notifications"
                : "On iPhone, alert notifications only work from the Home Screen app.\n\nTo enable alerts:\n1) Open Slot Pro in SAFARI (blame Apple 🤷‍♂️)\n2) Tap Share -> Add to Home Screen\n3) Open app from Home Screen icon\n4) Allow Notifications",
              images: [{ src: '/onboarding/ios-setup.gif', alt: 'iPhone Home Screen setup steps', caption: '' }],
              confirmLabel: 'Got it'
            })
            persistFlags(true, reminderSuppress)
            return alertPreset
          }

          if (reminderSuppress) return alertPreset

          const infoResult = await showAppInfo({
            title: 'Remember...',
            message: "We'll save your event and alert, but you won't receive the alerts until you add the app to Home Screen!",
            images: [{ src: '/onboarding/ios-setup.gif', alt: 'iPhone Home Screen setup steps', caption: '' }],
            confirmLabel: 'Got it',
            checkboxLabel: 'No more reminders',
            checkboxDefaultChecked: false,
            returnChecked: true
          })
          const checked = infoResult?.checked === true
          if (checked) persistFlags(true, true)
          return alertPreset
        }

        const shouldEnable = await showAppConfirm({
          title: 'Enable Notifications',
          message: '',
          confirmLabel: 'Enable',
          cancelLabel: 'Cancel'
        })
        if (!shouldEnable) {
          await setDefaultNone()
          return OFFER_ALERT_NONE
        }

        const enabled = await enablePush()
        if (!enabled) {
          return alertPreset
        }
        return alertPreset
      },
      [
        enablePush,
        getIosAlertReminderSuppressStorageKeyForUser,
        getIosAlertSetupSeenStorageKeyForUser,
        iosInstallRequired,
        isSafariBrowser,
        pushSubscribed,
        setStoredAlertDefaultForCurrentUser,
        showAppConfirm,
        showAppInfo,
        supabaseClient
      ]
    )

    const handleAlertPresetSelection = useCallback(
      async (nextPreset, ctx = {}) => {
        const isEditing = ctx?.editingId === true
        if (isEditing || nextPreset === OFFER_ALERT_NONE || pushSubscribed) return nextPreset
        if (iosInstallRequired) return nextPreset
        setAlertPromptHandledForCurrentForm(true)
        return maybeResolveAlertPresetWithPrompt(nextPreset)
      },
      [iosInstallRequired, maybeResolveAlertPresetWithPrompt, pushSubscribed]
    )

    const resolveAlertPresetBeforeSave = useCallback(
      async (alertPreset, { editingId }) => {
        if (editingId || alertPreset === OFFER_ALERT_NONE || pushSubscribed) return alertPreset
        if (alertPromptHandledForCurrentForm) return alertPreset
        try {
          return await maybeResolveAlertPresetWithPrompt(alertPreset)
        } catch {
          return alertPreset
        }
      },
      [alertPromptHandledForCurrentForm, maybeResolveAlertPresetWithPrompt, pushSubscribed]
    )

    const {
      fileInputRef,
      longPressTimerRef,
      casinoFieldRef,
      titleFieldRef,
      importSyncRunningRef,
      events,
      setEvents,
      loading,
      setLoading,
      saving,
      setSaving,
      uploading,
      setUploading,
      syncingImportResults,
      setSyncingImportResults,
      activeImportBatchId,
      setActiveImportBatchId,
      error,
      setError,
      notice,
      setNotice,
      reviewQueue,
      setReviewQueue,
      completingReviewItemId,
      setCompletingReviewItemId,
      completingReviewUploadId,
      setCompletingReviewUploadId,
      propagateCasinoOnSave,
      setPropagateCasinoOnSave,
      propagateTitleOnSave,
      setPropagateTitleOnSave,
      propagateValueOnSave,
      setPropagateValueOnSave,
      reviewSourceImagePath,
      setReviewSourceImagePath,
      reviewSourceImageUrl,
      setReviewSourceImageUrl,
      reviewSourceImageLoading,
      setReviewSourceImageLoading,
      showForm,
      setShowForm,
      editingId,
      setEditingId,
      selectedDays,
      setSelectedDays,
      cursorMonth,
      setCursorMonth,
      draft,
      setDraft,
      allDay,
      setAllDay,
      showCasinoSuggestions,
      setShowCasinoSuggestions,
      showTitleSuggestions,
      setShowTitleSuggestions,
      expandedEventId,
      setExpandedEventId,
      notesPreviewRefs,
      notesOverflowById,
      setNotesOverflowById,
      calendarMode,
      setCalendarMode,
      weekDetailEvent,
      setWeekDetailEvent,
      viewMenuOpen,
      setViewMenuOpen,
      viewMenuRef,
      isLandscape,
      setIsLandscape,
      weekAnchor,
      setWeekAnchor,
      offerTypeMeta,
      dayBuckets,
      dayTypeDots,
      calendarCells,
      monthTitle,
      todayKey,
      uploadSpinnerMessage,
      loadEvents,
      loadReviewQueue,
      refreshImportResults,
      beginReviewItem,
      skipReviewItem,
      skipCurrentReviewFromForm,
      closeForm,
      openForm,
      beginEdit
    } = useOffersCalendarState({
      supabaseClient,
      normalizeLoadedEvent,
      newEventAlertPresetDefault
    })

    useEffect(() => {
      if (tab !== 'offers') return
      if (offersDefaultView === 'month' || offersDefaultView === 'week' || offersDefaultView === 'agenda') {
        setCalendarMode(offersDefaultView)
      } else if (offersDefaultView === 'auto') {
        setCalendarMode('auto')
      }
    }, [offersDefaultView, setCalendarMode, tab])

    useEffect(() => {
      setAlertPromptHandledForCurrentForm(false)
    }, [showForm, editingId])

    useEffect(() => {
      if (!pendingOfferEventIds.length) return
      const existingIds = pendingOfferEventIds.filter((id) => events.some((ev) => ev.id === id))
      if (!existingIds.length) return
      setCalendarMode('agenda')
      setSelectedDays([])
      setExpandedEventId(existingIds[0])
      setOfferSpotlightEventIds(existingIds)
      setPendingOfferEventIds([])
      window.setTimeout(() => setOfferSpotlightEventIds([]), 12000)
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('eventId')
        url.searchParams.delete('eventIds')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      }
    }, [events, pendingOfferEventIds, setCalendarMode, setSelectedDays, setExpandedEventId])

    useEffect(() => {
      const handlePointerDown = (event) => {
        const target = event.target
        if (casinoFieldRef.current && !casinoFieldRef.current.contains(target)) {
          setShowCasinoSuggestions(false)
        }
        if (titleFieldRef.current && !titleFieldRef.current.contains(target)) {
          setShowTitleSuggestions(false)
        }
        if (viewMenuRef.current && !viewMenuRef.current.contains(target)) {
          setViewMenuOpen(false)
        }
      }

      document.addEventListener('pointerdown', handlePointerDown)
      return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [])

    useEffect(() => {
      if (typeof window === 'undefined') return undefined
      const media = window.matchMedia('(orientation: landscape)')
      const sync = () => setIsLandscape(media.matches)
      sync()
      media.addEventListener('change', sync)
      return () => media.removeEventListener('change', sync)
    }, [])

    useEffect(() => {
      const next = {}
      for (const ev of filteredEvents) {
        const el = notesPreviewRefs.current[ev.id]
        if (!el) continue
        next[ev.id] = el.scrollWidth > el.clientWidth
      }
      setNotesOverflowById(next)
    }, [events, selectedDays, expandedEventId])

    const toggleExpandedEvent = (eventId) => {
      setExpandedEventId((id) => (id === eventId ? null : eventId))
    }

    const toggleSelectedDay = (dayKey) => {
      setSelectedDays((current) => (current.includes(dayKey) ? current.filter((d) => d !== dayKey) : [...current, dayKey]))
    }

    const deleteEvent = async (id) => {
      const { error: e } = await supabaseClient.from('offer_events').delete().eq('id', id)
      if (e) {
        setError(e?.message || 'Failed to delete event.')
        return
      }
      if (editingId === id) closeForm()
      await loadEvents()
    }

    const { applyCurrentFieldsToAssociatedReviewItems, saveEvent, handleImportPhotos } = useOffersCalendarMutations({
      supabaseClient,
      state: {
        draft,
        allDay,
        editingId,
        completingReviewItemId,
        completingReviewUploadId,
        propagateCasinoOnSave,
        propagateTitleOnSave,
        propagateValueOnSave,
        reviewSourceImagePath,
        calendarMode
      },
      setters: {
        setCalendarMode,
        setCursorMonth,
        setWeekAnchor,
        setSelectedDays,
        setSaving,
        setError,
        setNotice,
        setUploading,
        setActiveImportBatchId
      },
      actions: {
        closeForm,
        loadEvents,
        loadReviewQueue,
        refreshImportResults,
        resolveAlertPresetBeforeSave
      }
    })

    const filteredEvents = useMemo(() => {
      if (selectedDays.length === 0) return events
      const selectedSet = new Set(selectedDays)
      return events.filter((ev) => selectedSet.has(localDateKeyFromIso(ev.start_at)))
    }, [events, selectedDays])

    const activeCalendarView = useMemo(() => {
      if (calendarMode === 'agenda') return 'agenda'
      if (calendarMode === 'week') return 'week'
      if (calendarMode === 'month') return 'month'
      return isLandscape ? 'week' : 'month'
    }, [calendarMode, isLandscape])

    useEffect(() => {
      if (activeCalendarView !== 'week') setWeekDetailEvent(null)
    }, [activeCalendarView])

    const startOfWeekMonday = (d) => {
      const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const day = dt.getDay()
      const diff = day === 0 ? -6 : 1 - day
      dt.setDate(dt.getDate() + diff)
      dt.setHours(0, 0, 0, 0)
      return dt
    }

    const weekStart = useMemo(() => startOfWeekMonday(weekAnchor), [weekAnchor])
    const weekDays = useMemo(() => {
      return Array.from({ length: 7 }, (_, idx) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + idx)
        return d
      })
    }, [weekStart])
    const weekTitle = `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    })}`
    const weekStartMs = weekDays[0].getTime()
    const weekEndMs = new Date(weekDays[6].getFullYear(), weekDays[6].getMonth(), weekDays[6].getDate(), 23, 59, 59, 999).getTime()

    const weekEvents = useMemo(() => {
      return events
        .map((ev) => {
          const st = new Date(ev.start_at)
          const enRaw = ev.end_at ? new Date(ev.end_at) : st
          const en = Number.isNaN(enRaw.getTime()) ? st : enRaw
          const startDay = new Date(st.getFullYear(), st.getMonth(), st.getDate()).getTime()
          const endDay = new Date(en.getFullYear(), en.getMonth(), en.getDate(), 23, 59, 59, 999).getTime()
          return { ...ev, _startMs: startDay, _endMs: endDay }
        })
        .filter((ev) => ev._endMs >= weekStartMs && ev._startMs <= weekEndMs)
        .sort((a, b) => a._startMs - b._startMs)
        .map((ev) => {
          const startCol = Math.max(0, Math.floor((ev._startMs - weekStartMs) / 86400000))
          const endCol = Math.min(6, Math.floor((ev._endMs - weekStartMs) / 86400000))
          return { ...ev, _startCol: startCol, _span: endCol - startCol + 1 }
        })
    }, [events, weekStartMs, weekEndMs])
    const weekEventLanes = useMemo(() => {
      const lanes = []
      for (const ev of weekEvents) {
        let placed = false
        for (const lane of lanes) {
          const last = lane[lane.length - 1]
          const lastEndCol = last._startCol + last._span - 1
          if (ev._startCol > lastEndCol) {
            lane.push(ev)
            placed = true
            break
          }
        }
        if (!placed) lanes.push([ev])
      }
      return lanes
    }, [weekEvents])

    const upcomingEvents = useMemo(() => {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      return events.filter((ev) => new Date(ev.start_at).getTime() >= todayStart)
    }, [events])

    const casinoNameOptions = useMemo(() => {
      return Array.from(new Set(events.map((ev) => ev.casino_name?.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      )
    }, [events])

    const titleOptions = useMemo(() => {
      return Array.from(new Set(events.map((ev) => ev.title?.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      )
    }, [events])

    const filteredCasinoOptions = useMemo(() => {
      const q = draft.casinoName.trim().toLowerCase()
      if (!q) return casinoNameOptions.slice(0, 8)
      return casinoNameOptions.filter((name) => name.toLowerCase().includes(q)).slice(0, 8)
    }, [casinoNameOptions, draft.casinoName])

    const filteredTitleOptions = useMemo(() => {
      const q = draft.title.trim().toLowerCase()
      if (!q) return titleOptions.slice(0, 8)
      return titleOptions.filter((name) => name.toLowerCase().includes(q)).slice(0, 8)
    }, [titleOptions, draft.title])

    const startDayPress = (dayKey) => {
      longPressTimerRef.current = window.setTimeout(() => {
        openForm(dayKey)
      }, 500)
    }

    const endDayPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }

    const hasVisibleTime = (iso) => {
      const d = new Date(iso)
      return d.getHours() !== 0 || d.getMinutes() !== 0
    }

    const startSelected = dateFromDatetimeLocalValue(draft.startAt)
    const endSelected = dateFromDatetimeLocalValue(draft.endAt)
    const sameDayStartEnd =
      !!startSelected &&
      !!endSelected &&
      startSelected.getFullYear() === endSelected.getFullYear() &&
      startSelected.getMonth() === endSelected.getMonth() &&
      startSelected.getDate() === endSelected.getDate()
    const endMinTime =
      !startSelected || !sameDayStartEnd
        ? new Date(0, 0, 0, 0, 0)
        : new Date(0, 0, 0, startSelected.getHours(), startSelected.getMinutes())
    const endMaxTime = new Date(0, 0, 0, 23, 45)
    const listEvents = activeCalendarView === 'agenda' ? upcomingEvents : filteredEvents
    const listRows = useMemo(() => {
      if (activeCalendarView === 'agenda') return listEvents.map((e) => ({ type: 'event', event: e }))
      const today = new Date()
      const todayStartMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      const rows = []
      let insertedTodayDivider = false
      for (const e of listEvents) {
        const startsTodayOrLater = new Date(e.start_at).getTime() >= todayStartMs
        if (!insertedTodayDivider && startsTodayOrLater) {
          rows.push({ type: 'today-divider' })
          insertedTodayDivider = true
        }
        rows.push({ type: 'event', event: e })
      }
      return rows
    }, [activeCalendarView, listEvents])

    useEffect(() => {
      if (activeCalendarView !== 'month' && selectedDays.length > 0) {
        setSelectedDays([])
      }
    }, [activeCalendarView, selectedDays.length])

    const isWeekView = activeCalendarView === 'week'
    const weekLayoutFullBleed = isWeekView && isLandscape

    return (
      <div
        className={`flex flex-col overflow-hidden px-4 pt-[max(0.5rem,env(safe-area-inset-top))] ${
          weekLayoutFullBleed
            ? 'w-full max-w-none h-[100dvh] pb-[max(4rem,env(safe-area-inset-bottom))] box-border'
            : 'max-w-lg mx-auto pb-2'
        }`}
        style={weekLayoutFullBleed ? undefined : { height: 'calc(100dvh - env(safe-area-inset-bottom) - 0.5rem)' }}
      >

        {error && (
          <div className="mb-4 p-4 rounded-3xl bg-red-900/40 border border-red-500/40 text-red-200 text-sm leading-relaxed">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 p-3 rounded-2xl border border-emerald-500/35 bg-emerald-950/35 text-emerald-100 text-xs leading-relaxed">
            {notice}
          </div>
        )}

        {syncingImportResults && (
          <div className="mb-4 p-3 rounded-2xl border border-violet-500/35 bg-violet-950/35 text-violet-100 text-xs leading-relaxed">
            Syncing AI results... new events and review items will pop in automatically.
          </div>
        )}

        {false && (
        <div className="mb-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-3">
          {iosInstallRequired && showIosInstallHelp ? (
            <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-950/30 p-3 text-[11px] leading-relaxed text-amber-100">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">iPhone setup needed for push</span>
                <button
                  type="button"
                  onClick={() => setShowIosInstallHelp(false)}
                  className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-amber-100/80 hover:bg-amber-500/20"
                >
                  Hide
                </button>
              </div>
              <div>1) Open this site in Safari</div>
              <div>2) Tap Share (square with arrow)</div>
              <div>3) Tap Add to Home Screen</div>
              <div>4) Launch the installed app icon, then tap Enable</div>
            </div>
          ) : null}

          <div className="mb-3">
            <div className="text-sm font-bold text-cyan-50">Offer reminders</div>
            <p className="mt-1 text-[11px] leading-relaxed text-cyan-200/85">
              Get alerted before timed offers start. Turn on notifications on this phone, choose how early to remind, then keep your Offers calendar filled in.
              {!pushSupported ? ' This browser cannot use web push in this mode.' : null}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
            <button
              type="button"
              disabled={!canEnablePushUi}
              onClick={() => void enablePush()}
              className="min-h-11 shrink-0 rounded-xl border border-cyan-300/35 bg-cyan-600 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-cyan-900/35 disabled:text-cyan-100/90 disabled:opacity-100 touch-manipulation"
            >
              {pushBusy ? 'Working…' : 'Turn on alerts on this device'}
            </button>
            <button
              type="button"
              disabled={!canDisablePushUi}
              onClick={() => void disablePush()}
              className="min-h-11 shrink-0 rounded-xl border border-zinc-600/60 bg-zinc-800 px-4 text-xs font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-800/70 disabled:text-zinc-300/85 disabled:opacity-100 touch-manipulation"
            >
              Stop alerts on this device
            </button>
          </div>
          <div className="mt-1 text-[11px] text-cyan-200/80">
            Device:{' '}
            {!pushSupported
              ? 'Not supported here'
              : pushSubscribed
                ? 'Subscribed • tap a notification to open Offers'
                : 'Not subscribed yet'}
          </div>

          <div className={`mt-3 rounded-xl border border-cyan-500/20 bg-black/25 p-3 ${!pushSubscribed || !allowPushControls ? 'opacity-60' : ''}`}>
            <div className="text-[11px] font-semibold text-cyan-100">Before each offer starts</div>
            <p className="mt-1 text-[10px] leading-relaxed text-cyan-200/65">
              Set timing on each offer with the Alert field in Add/Edit event (9:00 AM on the day for all-day, or 1 hour before when a start time is set).
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex rounded-xl border border-zinc-600 bg-zinc-900/90 p-0.5">
                <button
                  type="button"
                  disabled={!pushSubscribed || !allowPushControls || reminderPrefsSaving || !reminderPrefsLoaded}
                  aria-pressed={remindersEnabled}
                  onClick={() => {
                    setRemindersEnabled(true)
                    void saveReminderTiming(reminderLeadMinutes, true)
                  }}
                  className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-bold touch-manipulation disabled:opacity-50 ${
                    remindersEnabled ? 'bg-cyan-600 text-white' : 'text-zinc-400'
                  }`}
                >
                  On
                </button>
                <button
                  type="button"
                  disabled={!pushSubscribed || !allowPushControls || reminderPrefsSaving || !reminderPrefsLoaded}
                  aria-pressed={!remindersEnabled}
                  onClick={() => {
                    setRemindersEnabled(false)
                    void saveReminderTiming(reminderLeadMinutes, false)
                  }}
                  className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-bold touch-manipulation disabled:opacity-50 ${
                    !remindersEnabled ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400'
                  }`}
                >
                  Off
                </button>
              </div>
              <label className="flex flex-wrap items-center gap-2 text-[11px] text-cyan-100/90">
                <span className="shrink-0 text-cyan-200/80">Remind me</span>
                <select
                  value={reminderLeadMinutes}
                  disabled={!pushSubscribed || !allowPushControls || reminderPrefsSaving || !reminderPrefsLoaded || !remindersEnabled}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setReminderLeadMinutes(v)
                    void saveReminderTiming(v, remindersEnabled)
                  }}
                  className="min-h-10 min-w-[5.5rem] rounded-xl border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs font-semibold text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-500/35 disabled:opacity-50"
                >
                  {PUSH_LEAD_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-cyan-200/80">early</span>
              </label>
            </div>
            {!pushSubscribed || !allowPushControls ? (
              <p className="mt-2 text-[10px] leading-relaxed text-cyan-200/70">
                {iosInstallRequired
                  ? 'After installing to Home Screen, turn on alerts above to manage reminder timing.'
                  : 'Turn on alerts on this device to enable scheduled offer reminders.'}
              </p>
            ) : reminderPrefsSaving ? (
              <p className="mt-2 text-[10px] text-cyan-200/70">Saving reminder settings…</p>
            ) : null}
            {reminderPrefsError ? <p className="mt-2 text-[10px] text-amber-200/95">{reminderPrefsError}</p> : null}
          </div>

          {!canEnablePush && !pushSubscribed ? (
            <div className="mt-2 text-[11px] leading-relaxed text-cyan-100/80">
              {iosInstallRequired
                ? 'Alerts are unavailable in a normal iPhone browser tab. Add this site to your Home Screen and open it from the icon first.'
                : !pushSupported
                  ? 'Alerts are unavailable because this browser does not support web push here (try Chrome on Android or your installed app on iPhone).'
                  : pushPermission === 'denied'
                    ? 'This site does not have notification permission. Open your browser’s site settings for this page (lock or info icon → Permissions) and set Notifications to Allow, then try again.'
                    : 'Alerts are temporarily unavailable while setup finishes.'}
            </div>
          ) : null}

          {pushStatusMessage && !pushAdvancedOpen ? (
            <div className="mt-2 text-[11px] leading-relaxed text-cyan-100/90">{pushStatusMessage}</div>
          ) : null}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setPushAdvancedOpen((o) => !o)}
              className="text-[11px] font-semibold text-cyan-300/95 underline underline-offset-2 hover:text-cyan-200 touch-manipulation"
              aria-expanded={pushAdvancedOpen}
            >
              {pushAdvancedOpen ? 'Hide troubleshooting' : 'Troubleshooting / test tools'}
            </button>
            {pushAdvancedOpen ? (
              <div className="mt-3 space-y-3 rounded-xl border border-zinc-600/50 bg-zinc-950/50 p-3">
                <div className="text-[11px] text-zinc-400">
                  Technical: permission{' '}
                  <span className="font-mono text-zinc-300">{pushPermission}</span>
                  {' · '}
                  {pushPermission === 'granted' ? 'Allowed' : pushPermission === 'denied' ? 'Blocked' : 'Not asked yet'}
                  {reminderPrefsLoaded ? '' : ' · Loading reminder prefs…'}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    disabled={!canSendTestPushUi}
                    onClick={() => void sendTestPush()}
                    className="min-h-10 rounded-xl border border-violet-500/35 bg-violet-700/80 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-violet-900/35 disabled:text-violet-100/70 disabled:opacity-100 touch-manipulation"
                  >
                    {sendingTestPush ? 'Sending…' : 'Send test notification'}
                  </button>
                  <button
                    type="button"
                    disabled={!canRunRemindersUi}
                    onClick={() => void runReminderCheckNow()}
                    className="min-h-10 rounded-xl border border-emerald-500/35 bg-emerald-700/80 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-900/35 disabled:text-emerald-100/70 disabled:opacity-100 touch-manipulation"
                  >
                    {runningReminderCheck ? 'Running…' : 'Run reminder check now'}
                  </button>
                </div>
                <p className="text-[10px] leading-relaxed text-zinc-500">
                  “Run reminder check” uses the same server job as automation. It sends only for events that have an alert scheduled and whose alert time falls in the next window. Offer alerts are set on each event (Alert field on the form).
                </p>
                {pushStatusMessage && pushAdvancedOpen ? (
                  <div className="text-[11px] leading-relaxed text-cyan-100/85">{pushStatusMessage}</div>
                ) : null}
                {testPushMessage ? <div className="text-[11px] leading-relaxed text-violet-100/85">{testPushMessage}</div> : null}
                {reminderMessage ? <div className="text-[11px] leading-relaxed text-emerald-100/85">{reminderMessage}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
        )}

        <ReviewQueuePanel reviewQueue={reviewQueue} onComplete={beginReviewItem} onSkip={(itemId) => void skipReviewItem(itemId)} />

        <div className={isWeekView ? 'flex flex-1 min-h-0 flex-col gap-2' : 'mb-2'}>
            <div className={`relative flex shrink-0 items-center gap-2 ${isWeekView ? '' : 'mb-2'}`}>
              <div className="pointer-events-none absolute inset-x-0 text-center">
                <div className="mx-auto max-w-[70%] truncate text-white text-xl font-black tracking-tight">
                  {activeCalendarView === 'agenda' ? 'Agenda' : activeCalendarView === 'week' ? weekTitle : monthTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (activeCalendarView === 'agenda') return
                  if (activeCalendarView === 'week') {
                    setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))
                    return
                  }
                  setCursorMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                }}
                className="min-h-9 min-w-9 rounded-xl bg-zinc-900 text-zinc-200 font-bold touch-manipulation"
                aria-label={
                  activeCalendarView === 'agenda' ? 'Agenda view' : activeCalendarView === 'week' ? 'Previous week' : 'Previous month'
                }
              >
                ‹
              </button>
              <div className="flex-1" />
              <div ref={viewMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setViewMenuOpen((v) => !v)}
                  className="min-h-9 min-w-9 rounded-xl bg-zinc-900 text-zinc-200 font-bold touch-manipulation"
                  aria-label="Calendar display options"
                >
                  ⋯
                </button>
                {viewMenuOpen && (
                  <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                    <button
                      type="button"
                      onClick={async () => {
                        setCalendarMode('month')
                        setOffersDefaultView('month')
                        await setStoredOffersDefaultViewForCurrentUser('month')
                        setViewMenuOpen(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      Calendar {offersDefaultView === 'month' ? '• default' : ''}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setCalendarMode('week')
                        setOffersDefaultView('week')
                        await setStoredOffersDefaultViewForCurrentUser('week')
                        setViewMenuOpen(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      Week {offersDefaultView === 'week' ? '• default' : ''}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setCalendarMode('agenda')
                        setOffersDefaultView('agenda')
                        await setStoredOffersDefaultViewForCurrentUser('agenda')
                        setViewMenuOpen(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      Agenda {offersDefaultView === 'agenda' ? '• default' : ''}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setCalendarMode('auto')
                        setOffersDefaultView('auto')
                        await setStoredOffersDefaultViewForCurrentUser('auto')
                        setViewMenuOpen(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      Auto {offersDefaultView === 'auto' ? '• default' : ''}
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (activeCalendarView === 'agenda') return
                  if (activeCalendarView === 'week') {
                    setWeekAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))
                    return
                  }
                  setCursorMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                }}
                className="min-h-9 min-w-9 rounded-xl bg-zinc-900 text-zinc-200 font-bold touch-manipulation"
                aria-label={activeCalendarView === 'week' ? 'Next week' : 'Next month'}
              >
                ›
              </button>
            </div>

            {activeCalendarView === 'agenda' ? null : activeCalendarView === 'month' ? (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-zinc-500">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, idx) => (
                    <div key={`${w}-${idx}`} className="py-1">
                      {w}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1 mt-1">
                  {calendarCells.map((cell, idx) => {
                    if (!cell) return <div key={`empty-${idx}`} className="h-10" />
                    const key = localDateKeyFromDate(cell)
                    const isToday = key === todayKey
                    const isSelected = selectedDays.includes(key)
                    const dots = dayTypeDots[key] || []
                    return (
                      <button
                        key={`${key}-${idx}`}
                        type="button"
                        onMouseDown={() => startDayPress(key)}
                        onMouseUp={endDayPress}
                        onMouseLeave={endDayPress}
                        onTouchStart={() => startDayPress(key)}
                        onTouchEnd={endDayPress}
                        onClick={() => toggleSelectedDay(key)}
                        className={`h-10 rounded-2xl text-sm touch-manipulation flex flex-col items-center justify-center gap-0.5 border ${
                          isSelected
                            ? 'border-violet-400 text-white'
                            : isToday
                              ? 'border-zinc-500 text-zinc-100'
                              : 'border-transparent text-zinc-200'
                        }`}
                      >
                        <span>{cell.getDate()}</span>
                        <span className="h-2 flex items-center gap-1">
                          {dots.map((t) => (
                            <span key={`${key}-${t}`} className={`h-1.5 w-1.5 rounded-full ${offerTypeMeta[t]?.dot || 'bg-zinc-400'}`} />
                          ))}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className={`flex min-h-0 flex-col rounded-2xl bg-zinc-900/60 p-1.5 ${isWeekView ? 'flex-1' : ''}`}>
                <div className="grid shrink-0 grid-cols-7 gap-0 divide-x divide-zinc-500/20 border-b border-zinc-600/25 text-center text-[9px] font-semibold text-zinc-500">
                  {weekDays.map((d) => {
                    const dayKey = localDateKeyFromDate(d)
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        className="touch-manipulation py-1 text-zinc-400 outline-none hover:bg-zinc-800/40 focus-visible:ring-2 focus-visible:ring-violet-500/40"
                        onMouseDown={() => startDayPress(dayKey)}
                        onMouseUp={endDayPress}
                        onMouseLeave={endDayPress}
                        onTouchStart={() => startDayPress(dayKey)}
                        onTouchEnd={endDayPress}
                        onTouchCancel={endDayPress}
                      >
                        <div>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                        <div className="text-[8px] font-normal text-zinc-500">{d.getDate()}</div>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-0.5 flex min-h-0 flex-1 flex-col space-y-0.5 overflow-y-auto">
                  {weekEvents.length === 0 ? (
                    <div className="relative min-h-[12rem] flex-1">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7 gap-0"
                      >
                        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                          <div key={i} className="border-r border-zinc-500/15 last:border-r-0" />
                        ))}
                      </div>
                      <div className="absolute inset-0 z-[1] grid grid-cols-7 gap-0">
                        {weekDays.map((d, i) => {
                          const dk = localDateKeyFromDate(d)
                          return (
                            <button
                              key={`empty-day-${i}`}
                              type="button"
                              aria-label={`Add event on ${dk}`}
                              className="min-h-full touch-manipulation touch-none bg-transparent outline-none hover:bg-zinc-800/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/30"
                              onMouseDown={() => startDayPress(dk)}
                              onMouseUp={endDayPress}
                              onMouseLeave={endDayPress}
                              onTouchStart={() => startDayPress(dk)}
                              onTouchEnd={endDayPress}
                              onTouchCancel={endDayPress}
                            />
                          )
                        })}
                      </div>
                      <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center px-2 text-center text-zinc-500 text-xs">
                        No events this week.
                      </div>
                    </div>
                  ) : (
                    <>
                      {weekEventLanes.map((lane, laneIdx) => {
                        return (
                          <div key={`wk-lane-${laneIdx}`} className="relative min-h-[3.75rem]">
                            <div
                              aria-hidden
                              className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7 gap-0"
                            >
                              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="border-r border-zinc-500/15 last:border-r-0" />
                              ))}
                            </div>
                            <div className="absolute inset-0 z-[1] grid grid-cols-7 gap-0">
                              {weekDays.map((d, i) => {
                                const dk = localDateKeyFromDate(d)
                                return (
                                  <button
                                    key={`row-lane-${laneIdx}-day-${i}`}
                                    type="button"
                                    aria-label={`Add event on ${dk}`}
                                    className="min-h-full touch-manipulation touch-none bg-transparent outline-none hover:bg-zinc-800/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/30"
                                    onMouseDown={() => startDayPress(dk)}
                                    onMouseUp={endDayPress}
                                    onMouseLeave={endDayPress}
                                    onTouchStart={() => startDayPress(dk)}
                                    onTouchEnd={endDayPress}
                                    onTouchCancel={endDayPress}
                                  />
                                )
                              })}
                            </div>
                            <div className="pointer-events-none relative z-[2] grid grid-cols-7 gap-0">
                              {lane.map((ev) => {
                                const meta = offerTypeMeta[ev.offer_type] || offerTypeMeta.other
                                const hasAlert = !!(ev.alert_preset && ev.alert_preset !== 'none')
                                return (
                                  <button
                                    key={`wk-${ev.id}-${ev._startCol}`}
                                    type="button"
                                    onClick={() => setWeekDetailEvent(ev)}
                                    className={`pointer-events-auto ${meta.card} relative flex min-h-[3.5rem] min-w-0 flex-col items-start justify-center gap-0.5 overflow-hidden rounded-lg px-2 py-1.5 text-left text-[10px] leading-tight touch-manipulation`}
                                    style={{ gridColumn: `${ev._startCol + 1} / span ${ev._span}` }}
                                  >
                                    {hasAlert ? (
                                      <span
                                        title="Has alert"
                                        aria-label="Has alert"
                                        className="absolute right-1.5 top-1 inline-flex items-center justify-center text-[10px] leading-none text-zinc-100"
                                      >
                                        🔔
                                      </span>
                                    ) : null}
                                    <span className="w-full truncate text-left font-bold text-zinc-100">
                                      {ev.casino_name || 'Event'}
                                    </span>
                                    {ev.title ? (
                                      <span className="w-full truncate text-left italic text-zinc-300">{ev.title}</span>
                                    ) : null}
                                    {ev.value_amount !== null && (
                                      <span className="w-full truncate text-left font-semibold tabular-nums text-emerald-400">
                                        {ev.value_amount !== null ? `$${Number(ev.value_amount).toFixed(0)}` : ''}
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                      <div className="relative min-h-[10rem] flex-1 shrink-0">
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7 gap-0"
                        >
                          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={`pad-${i}`} className="border-r border-zinc-500/15 last:border-r-0" />
                          ))}
                        </div>
                        <div className="absolute inset-0 z-[1] grid grid-cols-7 gap-0">
                          {weekDays.map((d, i) => {
                            const dk = localDateKeyFromDate(d)
                            return (
                              <button
                                key={`footer-day-${i}`}
                                type="button"
                                aria-label={`Add event on ${dk}`}
                                className="min-h-full touch-manipulation touch-none bg-transparent outline-none hover:bg-zinc-800/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/30"
                                onMouseDown={() => startDayPress(dk)}
                                onMouseUp={endDayPress}
                                onMouseLeave={endDayPress}
                                onTouchStart={() => startDayPress(dk)}
                                onTouchEnd={endDayPress}
                                onTouchCancel={endDayPress}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

        {activeCalendarView === 'month' && selectedDays.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3 px-1 py-1">
            <div className="text-zinc-300 text-sm">
              {selectedDays.length} day{selectedDays.length > 1 ? 's' : ''} selected
            </div>
            <button
              type="button"
              onClick={() => setSelectedDays([])}
              className="text-violet-300 text-sm font-semibold touch-manipulation"
            >
              Clear
            </button>
          </div>
        )}

        {!isWeekView && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="text-white font-bold mb-2">{activeCalendarView === 'agenda' ? '' : 'Events'}</div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-16">
            {loading ? (
              <div className="text-zinc-400 text-sm">Loading…</div>
            ) : listEvents.length === 0 ? (
              <div className="text-zinc-500 text-sm">
                {activeCalendarView === 'agenda' ? 'No upcoming events.' : 'No events for the current filter.'}
              </div>
            ) : (
              <div className="space-y-2">
                {listRows.map((row, rowIdx) => {
                  if (row.type === 'today-divider') {
                    return (
                      <div key={`today-divider-${rowIdx}`} className="flex items-center gap-2 px-1 py-1">
                        <div className="h-px flex-1 bg-zinc-700/70" />
                        <div className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                          Today
                        </div>
                        <div className="h-px flex-1 bg-zinc-700/70" />
                      </div>
                    )
                  }
                  const e = row.event
                  const meta = offerTypeMeta[e.offer_type] || offerTypeMeta.other
                  const hasAlert = !!(e.alert_preset && e.alert_preset !== 'none')
                  const isSpotlighted = offerSpotlightEventIds.includes(e.id)
                  const isExpanded = expandedEventId === e.id
                  const startDate = new Date(e.start_at)
                  const endDate = e.end_at ? new Date(e.end_at) : null
                  const showTime = hasVisibleTime(e.start_at) || (e.end_at ? hasVisibleTime(e.end_at) : false)
                  const isMultiDay =
                    !!endDate &&
                    new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime() !==
                      new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime()
                  const dateRangeLabel = isMultiDay
                    ? `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : ''
                  const timeLabel = showTime
                    ? new Date(e.start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : ''
                  const dayLabel = startDate.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()
                  const dayNum = startDate.getDate()
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleExpandedEvent(e.id)}
                      aria-expanded={isExpanded}
                      className={`${meta.card} relative block w-full rounded-2xl p-2.5 text-left transition-colors hover:bg-opacity-90 ${isSpotlighted ? 'ring-2 ring-cyan-300/85 shadow-[0_0_20px_rgba(34,211,238,0.35)]' : ''}`}
                    >
                      {hasAlert ? (
                        <span
                          title="Has alert"
                          aria-label="Has alert"
                          className="absolute right-2.5 top-2.5 inline-flex items-center justify-center text-[11px] leading-none text-zinc-100"
                        >
                          🔔
                        </span>
                      ) : null}
                      <div className="flex items-start gap-2">
                        <div className="w-10 shrink-0 text-center">
                          <div className="text-zinc-500 text-[9px] font-semibold tracking-wide">{dayLabel}</div>
                          <div className="text-zinc-100 text-xl leading-tight">{dayNum}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${meta.chip}`}>
                              {meta.label}
                            </span>
                          </div>
                          <div className={`text-zinc-100 text-base mt-0.5 leading-tight ${isExpanded ? 'whitespace-normal break-words' : 'truncate'}`}>
                            {timeLabel ? `${timeLabel} ` : ''}
                            {e.title}
                          </div>
                          {dateRangeLabel && <div className="text-zinc-300 text-xs mt-0.5">{dateRangeLabel}</div>}
                          <div className={`mt-0.5 flex items-center gap-2 text-xs min-w-0 ${isExpanded ? 'flex-wrap' : ''}`}>
                            <span className={`text-zinc-400 min-w-0 ${isExpanded ? 'whitespace-normal break-words' : 'truncate'}`}>{e.casino_name}</span>
                            {e.value_amount !== null && (
                              <span className={`text-emerald-300 min-w-0 ${isExpanded ? 'whitespace-normal break-words' : 'truncate'}`}>
                                {e.value_amount !== null ? `$${Number(e.value_amount).toFixed(0)}` : ''}
                              </span>
                            )}
                          </div>
                          {e.notes && (
                            <div
                              ref={
                                isExpanded
                                  ? undefined
                                  : (el) => {
                                      notesPreviewRefs.current[e.id] = el
                                    }
                              }
                              className={`text-zinc-400 text-xs mt-0.5 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
                            >
                              {e.notes}
                            </div>
                          )}
                          {e.notes && !isExpanded && notesOverflowById[e.id] && (
                            <div className="text-zinc-500 text-[10px] mt-0.5">Tap card to expand</div>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex justify-end gap-3">
                        <button
                          type="button"
                          onMouseDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            beginEdit(e)
                          }}
                          className="text-cyan-300 hover:text-cyan-200 text-[11px] font-semibold touch-manipulation"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onMouseDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            deleteEvent(e.id)
                          }}
                          className="text-red-300 hover:text-red-200 text-[11px] font-semibold touch-manipulation"
                        >
                          Delete
                        </button>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        )}

        <WeekEventDetailModal
          event={weekDetailEvent}
          offerTypeMeta={offerTypeMeta}
          hasVisibleTime={hasVisibleTime}
          onClose={() => setWeekDetailEvent(null)}
          onEdit={(event) => {
            setWeekDetailEvent(null)
            beginEdit(event)
          }}
          onDelete={(eventId) => {
            setWeekDetailEvent(null)
            deleteEvent(eventId)
          }}
        />

        <AddEventFab onClick={() => openForm(null)} />

        <OfferFormModal
          showForm={showForm}
          editingId={editingId}
          closeForm={closeForm}
          completingReviewItemId={completingReviewItemId}
          fileInputRef={fileInputRef}
          handleImportPhotos={handleImportPhotos}
          uploading={uploading}
          reviewSourceImageLoading={reviewSourceImageLoading}
          reviewSourceImageUrl={reviewSourceImageUrl}
          draft={draft}
          setDraft={setDraft}
          setPropagateCasinoOnSave={setPropagateCasinoOnSave}
          setShowCasinoSuggestions={setShowCasinoSuggestions}
          showCasinoSuggestions={showCasinoSuggestions}
          filteredCasinoOptions={filteredCasinoOptions}
          setPropagateTitleOnSave={setPropagateTitleOnSave}
          setShowTitleSuggestions={setShowTitleSuggestions}
          showTitleSuggestions={showTitleSuggestions}
          filteredTitleOptions={filteredTitleOptions}
          allDay={allDay}
          setAllDay={setAllDay}
          startSelected={startSelected}
          endSelected={endSelected}
          endMinTime={endMinTime}
          endMaxTime={endMaxTime}
          saveEvent={saveEvent}
          saving={saving}
          notice={notice}
          propagateCasinoOnSave={propagateCasinoOnSave}
          setPropagateCasinoOnSaveChecked={setPropagateCasinoOnSave}
          propagateTitleOnSave={propagateTitleOnSave}
          setPropagateTitleOnSaveChecked={setPropagateTitleOnSave}
          propagateValueOnSave={propagateValueOnSave}
          setPropagateValueOnSaveChecked={setPropagateValueOnSave}
          skipCurrentReviewFromForm={skipCurrentReviewFromForm}
          casinoFieldRef={casinoFieldRef}
          titleFieldRef={titleFieldRef}
          onRequestSetAlertPreset={handleAlertPresetSelection}
        />
        {alertDialogState.open ? (
          <div
            className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-4 sm:items-center"
            onClick={() => closeAlertDialog(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[17px] font-semibold text-zinc-100">{alertDialogState.title}</div>
              <div className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-zinc-300">{alertDialogState.message}</div>
              {alertDialogState.images?.length ? (
                <div className="mt-3 max-h-[45dvh] space-y-2 overflow-auto pr-0.5">
                  {alertDialogState.images.map((img, idx) => (
                    <div key={`${img.src}-${idx}`} className="rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-2">
                      <img src={img.src} alt={img.alt || ''} className="w-full rounded-xl object-cover" loading="lazy" />
                      {img.caption ? <div className="mt-1 text-[11px] text-zinc-300">{img.caption}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {alertDialogState.checkboxLabel ? (
                <label className="mt-3 flex items-center gap-2 text-[12px] text-zinc-200">
                  <input
                    type="checkbox"
                    checked={alertDialogState.checkboxChecked === true}
                    onChange={(e) => {
                      const checked = e.target.checked
                      alertDialogCheckedRef.current = checked
                      setAlertDialogState((cur) => ({ ...cur, checkboxChecked: checked }))
                    }}
                    className="h-4 w-4 rounded border-zinc-500 bg-zinc-800 text-cyan-500 focus:ring-cyan-400"
                  />
                  <span>{alertDialogState.checkboxLabel}</span>
                </label>
              ) : null}
              <div className="mt-4 flex gap-2">
                {alertDialogState.mode === 'confirm' ? (
                  <button
                    type="button"
                    onClick={() => closeAlertDialog(false)}
                    className="min-h-11 flex-1 rounded-xl border border-zinc-600 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 touch-manipulation"
                  >
                    {alertDialogState.cancelLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => closeAlertDialog(true)}
                  className="min-h-11 flex-1 rounded-xl border border-cyan-400/45 bg-cyan-600 px-3 text-sm font-semibold text-white touch-manipulation"
                >
                  {alertDialogState.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <UploadProgressOverlay show={uploading} message={uploadSpinnerMessage} />
      </div>
    )
  }

  const renderCalculatorsHome = () => (
    <div className="max-w-lg mx-auto px-4 py-6 sm:py-8 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="text-center mb-10 sm:mb-12">
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Las Vegas Slot Pro</h1>
        <p className="text-zinc-400 mt-3 text-base">Select a calculator</p>
      </div>

      <button
        onClick={() => setActiveCalculator('phoenix')}
        className="w-full bg-gray-900 hover:bg-gray-800 transition-colors p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation active:scale-[0.99]"
      >
        <img src="/guides/phoenix-link/phoenix-link-calculator-icon.webp" alt="Phoenix" className="h-16 w-16 flex-shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 self-center">
          <div className="line-clamp-2 font-semibold text-2xl leading-snug text-orange-400">Phoenix Link EV Calc</div>
          <p className="mt-0.5 line-clamp-1 text-base leading-snug text-gray-400 sm:line-clamp-2">
            Must-hit counter bonus analyzer
          </p>
        </div>
      </button>

      <button
        onClick={() => setActiveCalculator('buffalo')}
        className="mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-amber-700 via-orange-700 to-red-800 p-6 text-left ring-1 ring-orange-800/45 transition-all hover:from-amber-600 hover:via-orange-600 hover:to-red-700 hover:ring-orange-700/50 active:scale-[0.985] sm:gap-5 sm:p-8"
      >
        <div className="relative flex h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600/90 to-orange-800 shadow-inner ring-1 ring-orange-900/45">
          <img
            src="/guides/buffalo-link/buffalo-link-calculator-icon.webp"
            alt="Buffalo"
            className="h-full w-full object-cover object-center"
          />
        </div>
        <div className="min-w-0 flex-1 self-center">
          <div className="line-clamp-2 text-2xl font-semibold leading-snug text-amber-100">Buffalo Link EV Calc</div>
          <p className="mt-0.5 line-clamp-1 text-base leading-snug text-amber-200/90 sm:line-clamp-2">
            Midpoint-based counter analyzer
          </p>
        </div>
      </button>

      <button
        onClick={() => setActiveCalculator('stackup')}
        className="w-full bg-gradient-to-br from-cyan-600 via-sky-600 to-blue-700 hover:from-cyan-500 hover:via-sky-500 hover:to-blue-600 p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation transition-all active:scale-[0.985]"
      >
        <img src="/guides/stack-up-pays/stack-up-pays-calculator-icon.webp" alt="Stack Up Pays" className="h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-lg" />
        <div className="min-w-0 flex-1 self-center">
          <div className="line-clamp-2 font-semibold text-2xl leading-snug text-cyan-100">Stack Up Pays</div>
          <p
            className="mt-0.5 line-clamp-1 text-base leading-snug text-cyan-200 sm:line-clamp-2"
            title="Ascending Fortunes • 5-meter analyzer"
          >
            Ascending Fortunes • 5-meter analyzer
          </p>
        </div>
      </button>

      <button
        onClick={() => setActiveCalculator('mhb')}
        className="mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-cyan-700 p-6 text-left shadow-lg shadow-black/30 transition-all hover:from-indigo-600 hover:via-violet-600 hover:to-cyan-600 active:scale-[0.985] sm:gap-5 sm:p-8"
      >
        <img
          src="/guides/mhb/mhb-calculator-icon.webp"
          alt=""
          className="h-16 w-16 shrink-0 rounded-2xl object-cover shadow-lg"
        />
        <div className="min-w-0 flex-1 self-center">
          <div className="line-clamp-2 text-2xl font-semibold leading-snug text-violet-50">Must Hit By Jackpot</div>
          <p className="mt-0.5 line-clamp-1 text-base leading-snug text-cyan-100/95 sm:line-clamp-2">
            Progressive must-hit analyzer
          </p>
        </div>
      </button>

      <div className="mt-10 sm:mt-12 text-center">
        <button
          onClick={onLogout}
          className="min-h-12 inline-flex items-center justify-center text-base text-gray-400 hover:text-red-400 underline touch-manipulation transition-colors px-4 py-2"
        >
          Logout
        </button>
      </div>
    </div>
  )

  const renderTabContent = () => {
    if (tab === 'calculators') {
      if (!activeCalculator) return renderCalculatorsHome()
      if (activeCalculator === 'phoenix') return <PhoenixLink onBack={() => setActiveCalculator(null)} />
      if (activeCalculator === 'buffalo') return <BuffaloLink onBack={() => setActiveCalculator(null)} />
      if (activeCalculator === 'stackup') return <StackUpPays onBack={() => setActiveCalculator(null)} />
      if (activeCalculator === 'mhb') return <MHBCalculator onBack={() => setActiveCalculator(null)} />
      return renderCalculatorsHome()
    }

    if (tab === 'dashboard') {
      return (
        <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-white text-2xl font-black tracking-tight">Las Vegas Slot Pro</div>
              <div className="text-zinc-400 text-sm mt-0.5">Home</div>
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
            {communityFeedLoading ? (
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
                      <div className="text-zinc-200 font-semibold">{p.title}</div>
                      {p.game_title ? (
                        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-400/90 shrink-0">{p.game_title}</span>
                      ) : null}
                    </div>
                    <div className="text-zinc-400 text-sm mt-2 leading-relaxed whitespace-pre-wrap">{p.body}</div>
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

    if (tab === 'home') return <SocialFeed />

    if (tab === 'guides') {
      return (
        <GuidesScreen
          supabaseClient={supabaseClient}
          onOpenCalculator={openCalculator}
          onNavigateHome={() => setTab('home')}
          onCommunityPosted={loadCommunityFeed}
        />
      )
    }

    if (tab === 'offers') return <OffersCalendar />
    if (tab === 'bankroll') return <BankrollTracker />
    if (tab === 'intel') return <LocalIntel />

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
      {renderTabContent()}

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

function App() {
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAllowed, setIsAllowed] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [currentView, setCurrentView] = useState('app')

  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('')
  const [signupMessage, setSignupMessage] = useState('')
  const [signupError, setSignupError] = useState('')

  // Reset password states
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  // Login error (only shown after failed login attempt)
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isOAuthLoading, setIsOAuthLoading] = useState(false)

  // Verification success message
  const [verificationSuccess, setVerificationSuccess] = useState(false)

  useEffect(() => {
    const { error: oauthError, errorCode, errorDescription } = readAuthCallbackParams()
    const oauthMsg = getOAuthCallbackMessage(oauthError, errorCode, errorDescription)
    if (oauthMsg) {
      setLoginError(oauthMsg)
      window.history.replaceState({}, document.title, window.location.pathname || '/')
    }

    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.replace('#', ''))
    // Email confirmation uses type=signup; Google OAuth can too, but the hash includes provider_token
    const isEmailOnlyVerification = (hash.includes('type=signup') || hash.includes('type=confirmation')) && !hash.includes('provider_token')
    if (isEmailOnlyVerification) {
      setVerificationSuccess(true)
      setTimeout(() => {
        if (window.location.hash) {
          window.history.replaceState({}, document.title, window.location.pathname || '/')
        }
      }, 0)
    }

    // Only trigger reset password for actual recovery links
    if (hash.includes('type=recovery')) {
      setCurrentView('reset-password')
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        void supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
      }

      window.history.replaceState({}, document.title, '/reset-password')
    }

    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) checkWhitelist(session.user.email)
      else setIsChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) checkWhitelist(session.user.email)
      else {
        setIsAllowed(false)
        setIsChecking(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkWhitelist = async (userEmail) => {
    if (!userEmail) {
      setIsAllowed(false)
      setIsChecking(false)
      return
    }
    const { data } = await supabase.from('allowed_emails').select('email').eq('email', userEmail).maybeSingle()
    if (!data) {
      setIsAllowed(false)
      setIsChecking(false)
      setLoginError("Your account is not yet approved. Contact Ryan to be whitelisted.")
      await supabase.auth.signOut()
      return
    }
    setIsAllowed(true)
    setIsChecking(false)
  }

  const getFriendlyErrorMessage = (error, context = 'general') => {
    const message = error?.message || 'Unknown error'
    const lower = message.toLowerCase()

    if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('fetch')) {
      return 'Network error. Check your connection and try again.'
    }

    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return 'Too many attempts. Please wait a few minutes and try again.'
    }

    if (context === 'login' && (lower.includes('email not confirmed') || lower.includes('not confirmed'))) {
      return 'Please verify your email before logging in.'
    }

    if (context === 'reset' && (lower.includes('session missing') || lower.includes('invalid') || lower.includes('expired') || lower.includes('jwt'))) {
      return 'This reset link is invalid or expired. Please request a new one.'
    }

    return message
  }

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (isLoggingIn) return
    setIsLoggingIn(true)
    setLoginError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      setLoginError(getFriendlyErrorMessage(error, 'login'))
      setIsLoggingIn(false)
      return
    }

    const { data: whitelistData } = await supabase.from('allowed_emails').select('email').eq('email', email).single()
    
    if (whitelistData) {
      setUser(data.user)
      setIsAllowed(true)
    } else {
      await supabase.auth.signOut()
      setLoginError("Your account is not yet approved. Contact Ryan to be whitelisted.")
    }
    setIsLoggingIn(false)
  }

  const handleOAuthSignIn = async (provider, { setError = setLoginError } = {}) => {
    if (isOAuthLoading) return
    setError('')
    setIsOAuthLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` }
    })
    if (error) {
      setError(getFriendlyErrorMessage(error))
      setIsOAuthLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (isSigningUp) return
    setSignupError('')
    setSignupMessage('')
    if (!signupEmail || !signupPassword || !signupConfirmPassword) return setSignupError("Please fill in all fields")
    if (signupPassword !== signupConfirmPassword) return setSignupError("Passwords do not match")
    if (signupPassword.length < 6) return setSignupError("Password must be at least 6 characters")
    setIsSigningUp(true)

    const { data, error } = await supabase.auth.signUp({ 
      email: signupEmail, 
      password: signupPassword,
      options: {
        emailRedirectTo: window.location.origin

      }
    })
    if (error) {
      const message = error.message?.toLowerCase() || ''
      if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
        setSignupError("Account already exists. Please log in or use Forgot Password.")
      } else {
        setSignupError(getFriendlyErrorMessage(error))
      }
      setIsSigningUp(false)
      return
    }

    // Supabase can return a user with no identities when the email already exists.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setSignupError("Account already exists. Please log in or use Forgot Password.")
      setIsSigningUp(false)
      return
    }

    setSignupMessage("✅ Account created! Please check your email for the confirmation link.")
    setSignupEmail('')
    setSignupPassword('')
    setSignupConfirmPassword('')
    setIsSigningUp(false)
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (isSendingReset) return
    if (!forgotEmail) return setForgotError("Please enter your email")
    setIsSendingReset(true)
    setForgotError('')
    setForgotMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    if (error) {
      setForgotError(getFriendlyErrorMessage(error))
    } else {
      setForgotMessage("If an account exists for that email, a reset link has been sent.")
      setForgotEmail('')
    }
    setIsSendingReset(false)
  }

  const handlePasswordReset = async (e) => {
    e.preventDefault()
    if (isUpdatingPassword) return
    setResetError('')
    if (newPassword !== confirmPassword) return setResetError("Passwords do not match")
    if (newPassword.length < 6) return setResetError("Password must be at least 6 characters")
    setIsUpdatingPassword(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setResetError("This reset link is invalid or expired. Please request a new one.")
      setIsUpdatingPassword(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setResetError(getFriendlyErrorMessage(error, 'reset'))
    } else {
      setResetMessage("✅ Password updated successfully!")
      setTimeout(() => {
        window.location.href = window.location.origin
      }, 2000)
    }
    setIsUpdatingPassword(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  if (isChecking) return <div className={`${mobileShell} text-white`}>Loading...</div>

  // Reset Password Page
  if (currentView === 'reset-password') {
    return (
      <div className={mobileShell}>
        <div className="bg-gray-900 p-6 sm:p-8 rounded-3xl max-w-sm w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Reset Your Password</h2>

          {resetError && <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-2xl text-red-300 text-sm text-center">{resetError}</div>}

          {resetMessage ? (
            <div className="text-center py-8 text-emerald-400 text-base font-medium leading-relaxed">{resetMessage}</div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="next"
                required
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="go"
                required
              />
              <button type="submit" disabled={isUpdatingPassword} className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}>
                {isUpdatingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          <button onClick={() => { window.location.href = window.location.origin }} className={`${linkBtn} text-sm sm:text-base mt-4`}>← Back to Login</button>
        </div>
      </div>
    )
  }

  // Login Screen
  if (!user || !isAllowed) {
    return (
      <div className={mobileShell}>
        <div className="bg-gray-900 p-6 sm:p-8 rounded-3xl max-w-sm w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Las Vegas Slot Pro</h2>

          {verificationSuccess && (
            <div className="mb-6 p-4 bg-emerald-900/50 border border-emerald-500 rounded-2xl text-emerald-300 text-center text-sm sm:text-base font-medium leading-relaxed">
              ✅ Account Verified - have fun!
            </div>
          )}

          {!showForgotPassword && !showCreateAccount ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputBase}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputBase}
                autoComplete="current-password"
                inputMode="text"
                enterKeyHint="go"
                required
              />
              <button 
                type="submit"
                disabled={isLoggingIn}
                className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {isLoggingIn ? 'Logging In...' : 'Log In'}
              </button>

              {loginError && (
                <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">
                  {loginError}
                </div>
              )}

              <OAuthDivider />
              <button
                type="button"
                disabled={isOAuthLoading}
                onClick={() => handleOAuthSignIn('google')}
                className={`${btnPrimary} flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed`}
                aria-label="Continue with Google"
              >
                <GoogleIcon />
                Google
              </button>

              <button 
                type="button" 
                onClick={() => {
                  setShowCreateAccount(true)
                  setShowForgotPassword(false)
                  setSignupError('')
                  setSignupMessage('')
                }}
                className={`${btnSecondary} bg-gray-700 hover:bg-gray-600 border border-orange-600 rounded-2xl text-white`}
              >
                Signup
              </button>

              <div className="pt-1">
                <button type="button" onClick={() => setShowForgotPassword(true)} className="w-full min-h-12 text-base text-orange-400 hover:text-orange-300 touch-manipulation py-3 text-center">
                  Forgot Password?
                </button>
              </div>
            </form>
          ) : showCreateAccount ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className={inputBase}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="next"
                required
              />
              <input
                type="password"
                placeholder="Confirm Password"
                value={signupConfirmPassword}
                onChange={(e) => setSignupConfirmPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="go"
                required
              />
              {signupError && <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">{signupError}</div>}
              {signupMessage && <div className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center leading-relaxed">{signupMessage}</div>}
              <button type="submit" disabled={isSigningUp} className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}>
                {isSigningUp ? 'Creating Account...' : 'Create Account'}
              </button>
              <OAuthDivider />
              <button
                type="button"
                disabled={isOAuthLoading}
                onClick={() => handleOAuthSignIn('google', { setError: setSignupError })}
                className={`${btnPrimary} flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed`}
                aria-label="Sign up with Google"
              >
                <GoogleIcon />
                Google
              </button>
              <button type="button" onClick={() => {
                setShowCreateAccount(false)
                setSignupError('')
                setSignupMessage('')
              }} className={`${linkBtn} text-sm sm:text-base`}>← Back to Login</button>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <input
                type="email"
                placeholder="Enter your email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className={inputBase}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="go"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              {forgotError && <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">{forgotError}</div>}
              {forgotMessage && <div className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center leading-relaxed">{forgotMessage}</div>}
              <button type="submit" disabled={isSendingReset} className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}>
                {isSendingReset ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => setShowForgotPassword(false)} className={`${linkBtn} text-sm sm:text-base`}>← Back to Login</button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // Logged-in app shell
  if (currentView === 'app') {
    return <AppShell onLogout={handleLogout} supabaseClient={supabase} />
  }

  return null
}

export default App