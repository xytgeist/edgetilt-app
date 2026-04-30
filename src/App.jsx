import { useState, useEffect, useRef, useMemo, forwardRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import PhoenixLink from './calculators/PhoenixLink'
import BuffaloLink from './calculators/BuffaloLink'
import StackUpPays from './calculators/StackUpPays'
import MHBCalculator from './calculators/MHBCalculator'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Mobile-first: min 16px text (iOS won’t auto-zoom), ~48px min tap height, notched device padding
const mobileShell = 'min-h-dvh bg-gray-950 flex items-center justify-center overflow-y-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]'
const inputBase = 'w-full min-h-12 text-base text-white bg-gray-800 rounded-2xl border-0 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-orange-500/50 touch-manipulation'
const btnPrimary = 'w-full min-h-12 text-base font-bold touch-manipulation active:scale-[0.99] transition-transform'
const btnSecondary = 'w-full min-h-12 text-base font-bold touch-manipulation active:scale-[0.99] transition-transform'
const linkBtn = 'w-full min-h-12 text-base text-gray-400 hover:text-white touch-manipulation py-3 text-center flex items-center justify-center active:scale-[0.99]'

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

function pad2(n) {
  return String(n).padStart(2, '0')
}

function localDateKeyFromIso(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function localDateKeyFromDate(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function toDatetimeLocalValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function dateFromDatetimeLocalValue(v) {
  if (!v) return null
  const [datePart, timePart = '00:00'] = String(v).split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null
  return new Date(y, m - 1, d, hh, mm)
}

function datetimeLocalValueFromDate(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`
}

function isUtcMidnightIso(iso) {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
}

function coerceUtcMidnightToLocalMidnight(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const offsetMin = new Date().getTimezoneOffset()
  const utcMs =
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0) + offsetMin * 60 * 1000
  return new Date(utcMs).toISOString()
}

function normalizeLoadedEvent(ev) {
  if (!ev || ev.source_type !== 'image_ai') return ev
  const next = { ...ev }
  if (isUtcMidnightIso(next.start_at)) {
    next.start_at = coerceUtcMidnightToLocalMidnight(next.start_at)
  }
  if (next.end_at && isUtcMidnightIso(next.end_at)) {
    next.end_at = coerceUtcMidnightToLocalMidnight(next.end_at)
  }
  return next
}

function shuffledCopy(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const DateTimeInput = forwardRef(({ value, onClick, placeholder }, ref) => {
  return (
    <input
      ref={ref}
      value={value || ''}
      onClick={onClick}
      readOnly
      placeholder={placeholder}
      className="w-full h-12 bg-zinc-800 rounded-2xl px-3 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer box-border"
    />
  )
})

function emptyOfferDraft() {
  return {
    casinoName: '',
    offerType: 'free_play',
    title: '',
    startAt: '',
    endAt: '',
    valueAmount: '',
    notes: ''
  }
}

/** Normalizes AI / Edge Function JSON (snake or camel) into the add-event form shape. */
function draftFromAiReviewPayload(raw) {
  if (!raw || typeof raw !== 'object') return emptyOfferDraft()
  const o = raw
  const va = o.valueAmount ?? o.value_amount
  const ot = o.offerType ?? o.offer_type ?? 'free_play'
  const allowedTypes = new Set(['free_play', 'hotel', 'dining', 'gift', 'multiplier', 'tournament', 'drawing', 'other'])
  return {
    casinoName: String(o.casinoName ?? o.casino_name ?? ''),
    offerType: allowedTypes.has(ot) ? ot : 'free_play',
    title: String(o.title ?? ''),
    startAt: String(o.startAt ?? o.start_at ?? ''),
    endAt: String(o.endAt ?? o.end_at ?? ''),
    valueAmount: va !== undefined && va !== null ? String(va) : '',
    notes: String(o.notes ?? ''),
    hasSpecificTime: o.hasSpecificTime === true || o.has_specific_time === true
  }
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeCalculator, setActiveCalculator] = useState(null) // 'phoenix' | 'buffalo' | 'stackup' | 'mhb' | null
  const [intelView, setIntelView] = useState({ screen: 'home', cityId: null, casinoId: null })

  const openCalculator = (key) => {
    setActiveCalculator(key)
    setTab('calculators')
    setMenuOpen(false)
  }

  const navItems = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'calculators', label: 'Calcs', icon: '🧮' },
    { id: 'offers', label: 'Offers', icon: '📅' },
    { id: 'guides', label: 'Guides', icon: '📘' },
    { id: 'intel', label: 'Intel', icon: '📍' },
    { id: 'team', label: 'Team', icon: '🤝' }
  ]

  const LocalIntel = () => {
    const [cities, setCities] = useState([])
    const [casinos, setCasinos] = useState([])
    const [posts, setPosts] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
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
    const fileInputRef = useRef(null)
    const longPressTimerRef = useRef(null)
    const casinoFieldRef = useRef(null)
    const titleFieldRef = useRef(null)
    const [events, setEvents] = useState([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadingTick, setUploadingTick] = useState(0)
    const [uploadingMessageOrder, setUploadingMessageOrder] = useState([])
    const [error, setError] = useState('')
    const [reviewQueue, setReviewQueue] = useState([])
    const [completingReviewItemId, setCompletingReviewItemId] = useState(null)
    const [reviewSourceImagePath, setReviewSourceImagePath] = useState(null)
    const [reviewSourceImageUrl, setReviewSourceImageUrl] = useState('')
    const [reviewSourceImageLoading, setReviewSourceImageLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const [selectedDays, setSelectedDays] = useState([])
    const [cursorMonth, setCursorMonth] = useState(() => {
      const n = new Date()
      return new Date(n.getFullYear(), n.getMonth(), 1)
    })
    const [draft, setDraft] = useState(() => emptyOfferDraft())
    const [allDay, setAllDay] = useState(true)
    const [showCasinoSuggestions, setShowCasinoSuggestions] = useState(false)
    const [showTitleSuggestions, setShowTitleSuggestions] = useState(false)
    const [expandedEventId, setExpandedEventId] = useState(null)
    const notesPreviewRefs = useRef({})
    const [notesOverflowById, setNotesOverflowById] = useState({})
    /** 'auto' = week in landscape, month in portrait; 'month' | 'week' | 'agenda' = forced */
    const [calendarMode, setCalendarMode] = useState('auto')
    const [weekDetailEvent, setWeekDetailEvent] = useState(null)
    const [showWeekPortraitHint, setShowWeekPortraitHint] = useState(false)
    const [viewMenuOpen, setViewMenuOpen] = useState(false)
    const viewMenuRef = useRef(null)
    const [isLandscape, setIsLandscape] = useState(() =>
      typeof window !== 'undefined' ? window.matchMedia('(orientation: landscape)').matches : false
    )
    const [weekAnchor, setWeekAnchor] = useState(() => new Date())
    const uploadSpinnerMessages = useMemo(
      () => [
        'Doing funky stuff... one sec.',
        'Teaching robots to read casino mailers...',
        'Summoning OCR goblins...',
        'Sorting winners from weird blurry photos...',
        'Almost there, polishing your events...',
        'WTF is that image quality...',
        'Please no more dick pics...',
        'Translating casino hieroglyphics...',
        'OCR is squinting aggressively...',
        'Convincing AI this is not a tournament...',
        'Unblurring the blur. Sort of.',
        'Cooking events with extra chaos...',
        'Stealing dates from tiny print...',
        'Checking if this is free play or free pain...',
        'Shaking snacks out of these pixels...',
        'Bribing the parser with virtual coffee...',
        'Reading mailers so you do not have to...',
        'Almost done. Nobody panic.'
      ],
      []
    )
    const uploadSpinnerMessage = uploadingMessageOrder[uploadingTick] || uploadSpinnerMessages[0]

    useEffect(() => {
      if (!uploading) {
        setUploadingTick(0)
        setUploadingMessageOrder([])
        return undefined
      }
      const order = shuffledCopy(uploadSpinnerMessages)
      setUploadingMessageOrder(order)
      setUploadingTick(0)
      const id = window.setInterval(() => {
        setUploadingTick((n) => (n < order.length - 1 ? n + 1 : n))
      }, 1600)
      return () => window.clearInterval(id)
    }, [uploading, uploadSpinnerMessages])

    const offerTypeMeta = useMemo(
      () => ({
        free_play: { label: 'Free play', dot: 'bg-violet-400', chip: 'bg-violet-500/15 text-violet-200 border-violet-500/40', card: 'bg-violet-500/18' },
        hotel: { label: 'Hotel stay', dot: 'bg-sky-400', chip: 'bg-sky-500/15 text-sky-200 border-sky-500/40', card: 'bg-sky-500/16' },
        dining: { label: 'Dining credit', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40', card: 'bg-emerald-500/16' },
        gift: { label: 'Gift day', dot: 'bg-amber-400', chip: 'bg-amber-500/15 text-amber-200 border-amber-500/40', card: 'bg-amber-500/16' },
        multiplier: { label: 'Tier multiplier', dot: 'bg-fuchsia-400', chip: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/40', card: 'bg-fuchsia-500/16' },
        tournament: { label: 'Tournament', dot: 'bg-rose-400', chip: 'bg-rose-500/15 text-rose-200 border-rose-500/40', card: 'bg-rose-500/16' },
        drawing: { label: 'Drawing', dot: 'bg-cyan-400', chip: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40', card: 'bg-cyan-500/16' },
        other: { label: 'Other', dot: 'bg-zinc-400', chip: 'bg-zinc-500/15 text-zinc-200 border-zinc-500/40', card: 'bg-zinc-700/45' }
      }),
      []
    )

    const dayBuckets = useMemo(() => {
      const map = {}
      for (const ev of events) {
        const key = localDateKeyFromIso(ev.start_at)
        if (!map[key]) map[key] = []
        map[key].push(ev)
      }
      return map
    }, [events])

    const dayTypeDots = useMemo(() => {
      const map = {}
      for (const [dayKey, dayEvents] of Object.entries(dayBuckets)) {
        const seen = new Set(dayEvents.map((ev) => ev.offer_type || 'other'))
        map[dayKey] = Array.from(seen).slice(0, 4)
      }
      return map
    }, [dayBuckets])

    const calendarCells = useMemo(() => {
      const y = cursorMonth.getFullYear()
      const month = cursorMonth.getMonth()
      const first = new Date(y, month, 1)
      const lastDay = new Date(y, month + 1, 0).getDate()
      const startDow = first.getDay()
      const cells = []
      for (let i = 0; i < startDow; i++) cells.push(null)
      for (let d = 1; d <= lastDay; d++) cells.push(new Date(y, month, d))
      while (cells.length % 7 !== 0) cells.push(null)
      return cells
    }, [cursorMonth])

    const monthTitle = cursorMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })
    const todayKey = localDateKeyFromDate(new Date())

    const loadEvents = async () => {
      setLoading(true)
      setError('')
      try {
        const { data, error: e } = await supabaseClient
          .from('offer_events')
          .select('id,casino_name,offer_type,title,start_at,end_at,value_amount,notes,created_at,source_type,source_image_path')
          .order('start_at', { ascending: true })
          .limit(500)
        if (e) throw e
        setEvents((data || []).map(normalizeLoadedEvent))
      } catch (e) {
        setError(e?.message || 'Failed to load offers.')
      } finally {
        setLoading(false)
      }
    }

    const loadReviewQueue = async () => {
      try {
        const { data, error } = await supabaseClient
          .from('offer_ai_review_items')
          .select('id,upload_id,batch_id,draft,warnings,created_at, offer_uploads ( file_name, storage_path )')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
        if (error) {
          if (error.code === '42P01' || String(error.message || '').toLowerCase().includes('relation')) {
            setReviewQueue([])
            return
          }
          throw error
        }
        setReviewQueue(data || [])
      } catch {
        setReviewQueue([])
      }
    }

    useEffect(() => {
      void loadEvents()
      void loadReviewQueue()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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

    const closeForm = () => {
      setShowForm(false)
      setEditingId(null)
      setDraft(emptyOfferDraft())
      setAllDay(true)
      setShowCasinoSuggestions(false)
      setShowTitleSuggestions(false)
      setCompletingReviewItemId(null)
      setReviewSourceImagePath(null)
      setReviewSourceImageUrl('')
      setReviewSourceImageLoading(false)
    }

    const toggleExpandedEvent = (eventId) => {
      setExpandedEventId((id) => (id === eventId ? null : eventId))
    }

    const openForm = (dayKey = null) => {
      setCompletingReviewItemId(null)
      setReviewSourceImagePath(null)
      setReviewSourceImageUrl('')
      setReviewSourceImageLoading(false)
      setShowForm(true)
      setEditingId(null)
      if (dayKey) {
        // Default to an all-day event when opening from a calendar day
        setDraft((d) => ({ ...emptyOfferDraft(), startAt: `${dayKey}T00:00` }))
        setAllDay(true)
        setShowCasinoSuggestions(false)
        setShowTitleSuggestions(false)
      } else {
        setDraft(emptyOfferDraft())
        setAllDay(true)
        setShowCasinoSuggestions(false)
        setShowTitleSuggestions(false)
      }
    }

    const beginEdit = (ev) => {
      setCompletingReviewItemId(null)
      setReviewSourceImagePath(null)
      setReviewSourceImageUrl('')
      setReviewSourceImageLoading(false)
      setEditingId(ev.id)
      setShowForm(true)
      const st = new Date(ev.start_at)
      const stHasVisibleTime = st.getHours() !== 0 || st.getMinutes() !== 0
      const en = ev.end_at ? new Date(ev.end_at) : null
      const enHasVisibleTime = en ? en.getHours() !== 0 || en.getMinutes() !== 0 : false
      setAllDay(!(stHasVisibleTime || enHasVisibleTime))
      setDraft({
        casinoName: ev.casino_name || '',
        offerType: ev.offer_type || 'free_play',
        title: ev.title || '',
        startAt: toDatetimeLocalValue(ev.start_at),
        endAt: ev.end_at ? toDatetimeLocalValue(ev.end_at) : '',
        valueAmount:
          ev.value_amount !== null && ev.value_amount !== undefined ? String(ev.value_amount) : '',
        notes: ev.notes || ''
      })
      setShowCasinoSuggestions(false)
      setShowTitleSuggestions(false)
      setError('')
    }

    const beginReviewItem = async (item) => {
      const row = draftFromAiReviewPayload(item.draft || {})
      const hasSpecificTime = row.hasSpecificTime === true
      setAllDay(!hasSpecificTime)
      setDraft({ ...emptyOfferDraft(), ...row })
      setCompletingReviewItemId(item.id)
      const up = item.offer_uploads
      const path = Array.isArray(up) ? up[0]?.storage_path : up?.storage_path
      setReviewSourceImagePath(path || null)
      setReviewSourceImageUrl('')
      setEditingId(null)
      setShowForm(true)
      setShowCasinoSuggestions(false)
      setShowTitleSuggestions(false)
      setError('')
      if (!path) return
      setReviewSourceImageLoading(true)
      try {
        const { data, error: signedErr } = await supabaseClient.storage.from('offer-mailers').createSignedUrl(path, 60 * 30)
        if (signedErr) throw signedErr
        setReviewSourceImageUrl(data?.signedUrl || '')
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not create signed URL for review image:', e)
        setReviewSourceImageUrl('')
      } finally {
        setReviewSourceImageLoading(false)
      }
    }

    const skipReviewItem = async (id) => {
      try {
        const { data: row, error: rowErr } = await supabaseClient
          .from('offer_ai_review_items')
          .select('id, upload_id, offer_uploads ( bucket_id, storage_path )')
          .eq('id', id)
          .single()
        if (rowErr) {
          if (rowErr.code === '42P01') return
          throw rowErr
        }

        const uploadId = row?.upload_id || null
        const up = row?.offer_uploads
        const bucketId = (Array.isArray(up) ? up[0]?.bucket_id : up?.bucket_id) || 'offer-mailers'
        const storagePath = Array.isArray(up) ? up[0]?.storage_path : up?.storage_path

        if (storagePath) {
          const { error: rmErr } = await supabaseClient.storage.from(bucketId).remove([storagePath])
          if (rmErr) {
            // eslint-disable-next-line no-console
            console.warn('Could not delete skipped review image from storage:', rmErr)
          }
        }

        if (uploadId) {
          const { error: delUploadErr } = await supabaseClient.from('offer_uploads').delete().eq('id', uploadId)
          if (delUploadErr) throw delUploadErr
        } else {
          const { error: delReviewErr } = await supabaseClient.from('offer_ai_review_items').delete().eq('id', id)
          if (delReviewErr) throw delReviewErr
        }
        await loadReviewQueue()
      } catch (e) {
        setError(e?.message || 'Could not remove review item.')
      }
    }

    const skipCurrentReviewFromForm = async () => {
      if (!completingReviewItemId) return
      await skipReviewItem(completingReviewItemId)
      closeForm()
    }

    const toggleSelectedDay = (dayKey) => {
      setSelectedDays((current) => (current.includes(dayKey) ? current.filter((d) => d !== dayKey) : [...current, dayKey]))
    }

    const saveEvent = async () => {
      setSaving(true)
      setError('')
      try {
        let payloadDebug = null
        if (!draft.casinoName.trim()) throw new Error('Casino name is required.')
        if (!draft.title.trim()) throw new Error('Title is required.')
        if (!draft.startAt) throw new Error('Start date/time is required.')

        const startDt = new Date(draft.startAt)
        if (Number.isNaN(startDt.getTime())) throw new Error('Start date/time is invalid.')
        const endDt = draft.endAt ? new Date(draft.endAt) : null
        if (endDt && Number.isNaN(endDt.getTime())) throw new Error('End date/time is invalid.')
        const normalizedStart = allDay
          ? new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate(), 0, 0, 0, 0)
          : startDt
        const normalizedEnd = endDt
          ? allDay
            ? new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate(), 0, 0, 0, 0)
            : endDt
          : null
        if (normalizedEnd && normalizedEnd.getTime() < normalizedStart.getTime()) {
          throw new Error('End date/time must be later than (or the same as) start.')
        }

        const payload = {
          casino_name: draft.casinoName.trim(),
          offer_type: draft.offerType,
          title: draft.title.trim(),
          start_at: normalizedStart.toISOString(),
          end_at: normalizedEnd ? normalizedEnd.toISOString() : null,
          value_amount: draft.valueAmount !== '' ? Number(draft.valueAmount) : null,
          value_text: null,
          notes: draft.notes.trim() || null
        }
        payloadDebug = payload

        if (editingId) {
          const { error: e } = await supabaseClient.from('offer_events').update(payload).eq('id', editingId)
          if (e) throw e
        } else {
          const { data: sessionData } = await supabaseClient.auth.getSession()
          const user = sessionData?.session?.user
          if (!user) throw new Error('Sign in to save offers to your calendar.')
          const pendingReviewId = completingReviewItemId
          const pendingImg = reviewSourceImagePath
          const insertPayload = {
            ...payload,
            user_id: user.id,
            source_type: pendingReviewId ? 'image_ai' : 'manual',
            source_image_path: pendingReviewId ? pendingImg : null
          }
          const { data: inserted, error: e } = await supabaseClient.from('offer_events').insert(insertPayload).select('id').single()
          if (e) throw e
          if (pendingReviewId && inserted?.id) {
            const { error: revErr } = await supabaseClient
              .from('offer_ai_review_items')
              .update({
                status: 'resolved',
                resolved_at: new Date().toISOString(),
                resolved_event_id: inserted.id
              })
              .eq('id', pendingReviewId)
            if (revErr) {
              // eslint-disable-next-line no-console
              console.warn('Could not mark AI review item resolved:', revErr)
            }
          }
        }
        if (!editingId) {
          const focusDate = new Date(normalizedStart.getFullYear(), normalizedStart.getMonth(), normalizedStart.getDate())
          setCursorMonth(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1))
          setWeekAnchor(focusDate)
          setSelectedDays([localDateKeyFromDate(focusDate)])
          if (calendarMode === 'agenda') setCalendarMode('month')
        }
        closeForm()
        await loadEvents()
        await loadReviewQueue()
      } catch (e) {
        // Supabase errors are often structured; logging helps diagnose "Load failed" cases.
        // eslint-disable-next-line no-console
        console.error('saveEvent error:', e)
        // eslint-disable-next-line no-console
        console.error('saveEvent payload (partial):', {
          offer_type: draft?.offerType,
          startAt: draft?.startAt,
          endAt: draft?.endAt,
          valueAmount: draft?.valueAmount
        })
        const parts = []
        if (e?.message) parts.push(e.message)
        if (e?.code) parts.push(`code: ${e.code}`)
        if (e?.details) parts.push(`details: ${e.details}`)
        if (e?.hint) parts.push(`hint: ${e.hint}`)
        setError(parts.join('\n') || 'Failed to save offer.')
      } finally {
        setSaving(false)
      }
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

    const handleImportPhotos = async (ev) => {
      const files = Array.from(ev.target.files || []).filter((f) => f.type.startsWith('image/'))
      ev.target.value = ''
      if (!files.length) return
      closeForm()
      setUploading(true)
      setError('')
      try {
        const { data: sessionData } = await supabaseClient.auth.getSession()
        const user = sessionData?.session?.user
        if (!user) throw new Error('Sign in to upload mailer photos.')

        let batchId = null
        const { data: batchRow, error: batchErr } = await supabaseClient
          .from('offer_import_batches')
          .insert({ status: 'awaiting_parse' })
          .select('id')
          .single()
        if (!batchErr && batchRow?.id) {
          batchId = batchRow.id
        }

        let uploaded = 0
        for (const file of files) {
          const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
          const safeName = `${crypto.randomUUID()}${ext}`
          const path = `${user.id}/${safeName}`
          const { error: upErr } = await supabaseClient.storage.from('offer-mailers').upload(path, file, {
            cacheControl: '3600',
            upsert: false
          })
          if (upErr) throw upErr
          const row = {
            storage_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            status: 'queued',
            ...(batchId ? { batch_id: batchId } : {})
          }
          const { error: rowErr } = await supabaseClient.from('offer_uploads').insert(row)
          if (rowErr) throw rowErr
          uploaded += 1
        }

        if (batchId) {
          await supabaseClient.from('offer_import_batches').update({ status: 'awaiting_parse' }).eq('id', batchId)
          // Fire-and-forget parse kickoff; queued rows remain safe if function is not deployed yet.
          const { error: invokeErr } = await supabaseClient.functions.invoke('process-offer-uploads', {
            body: { batchId, timezoneOffsetMinutes: new Date().getTimezoneOffset() }
          })
          if (invokeErr) {
            setError('Uploaded successfully, but AI parsing could not be started right now. Try again in a moment.')
          }
          window.setTimeout(() => {
            void loadEvents()
            void loadReviewQueue()
          }, 2500)
          window.setTimeout(() => {
            void loadEvents()
            void loadReviewQueue()
          }, 7000)
          window.setTimeout(() => {
            void loadEvents()
            void loadReviewQueue()
          }, 14000)
        } else {
          setError('Uploaded successfully, but batch metadata is unavailable. Run supabase/offer_ai_import.sql.')
        }
      } catch (err) {
        setError(
          err?.message ||
            'Upload failed. Run supabase/offer_uploads.sql, offer_ai_import.sql, and storage_offer_mailers.sql if tables or bucket are missing.'
        )
      } finally {
        setUploading(false)
      }
    }

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

    useEffect(() => {
      if (calendarMode !== 'week') setShowWeekPortraitHint(false)
    }, [calendarMode])

    useEffect(() => {
      if (isLandscape) setShowWeekPortraitHint(false)
    }, [isLandscape])

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

        {reviewQueue.length > 0 && (
          <div className="mb-4 rounded-3xl border border-amber-500/35 bg-amber-950/35 p-4">
            <div className="text-amber-100 font-semibold text-sm">Needs your input ({reviewQueue.length})</div>
            <p className="mt-1 text-amber-100/80 text-xs leading-relaxed">
              Partial OCR results — complete the form for each image, or skip. Successful images from the same batch can
              already be on your calendar.
            </p>
            <ul className="mt-3 space-y-2">
              {reviewQueue.map((item) => {
                const up = item.offer_uploads
                const fileName = Array.isArray(up) ? up[0]?.file_name : up?.file_name
                const warns = (item.warnings || []).filter(Boolean)
                return (
                  <li key={item.id} className="rounded-2xl bg-zinc-900/90 px-3 py-2.5 border border-zinc-700/80">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 text-sm font-medium text-zinc-100 truncate">{fileName || 'Image'}</div>
                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => beginReviewItem(item)}
                          className="text-cyan-300 hover:text-cyan-200 text-xs font-semibold touch-manipulation"
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          onClick={() => void skipReviewItem(item.id)}
                          className="text-zinc-400 hover:text-zinc-300 text-xs font-semibold touch-manipulation"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                    {warns.length > 0 && (
                      <div className="mt-1 text-[11px] leading-snug text-amber-200/85">{warns.join(' · ')}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className={isWeekView ? 'flex flex-1 min-h-0 flex-col gap-2' : 'mb-2'}>
            <div className={`flex shrink-0 items-center justify-between gap-2 ${isWeekView ? '' : 'mb-2'}`}>
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
              <div className="text-white text-xl font-black tracking-tight text-center flex-1 truncate">
                {activeCalendarView === 'agenda' ? 'Agenda' : activeCalendarView === 'week' ? weekTitle : monthTitle}
              </div>
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
                  <div className="absolute right-0 top-10 z-20 w-28 rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarMode('month')
                        setViewMenuOpen(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarMode('week')
                        setViewMenuOpen(false)
                        if (typeof window !== 'undefined' && !window.matchMedia('(orientation: landscape)').matches) {
                          setShowWeekPortraitHint(true)
                        }
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      Week
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarMode('agenda')
                        setViewMenuOpen(false)
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      Agenda
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
                      {weekEvents.map((ev) => {
                        const meta = offerTypeMeta[ev.offer_type] || offerTypeMeta.other
                        return (
                          <div key={`wk-${ev.id}-${ev._startCol}`} className="relative min-h-[3.75rem]">
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
                                    key={`row-${ev.id}-day-${i}`}
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
                              <button
                                type="button"
                                onClick={() => setWeekDetailEvent(ev)}
                                className={`pointer-events-auto ${meta.card} flex min-h-[3.5rem] min-w-0 flex-col items-start justify-center gap-0.5 overflow-hidden rounded-lg px-2 py-1.5 text-left text-[10px] leading-tight touch-manipulation`}
                                style={{ gridColumn: `${ev._startCol + 1} / span ${ev._span}` }}
                              >
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

        {showWeekPortraitHint && activeCalendarView === 'week' && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="week-portrait-hint-title"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm"
            onClick={() => setShowWeekPortraitHint(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl border border-violet-500/35 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 text-center shadow-2xl shadow-black/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 text-2xl text-violet-200" aria-hidden>
                ↻
              </div>
              <p id="week-portrait-hint-title" className="text-lg font-bold tracking-tight text-zinc-50">
                Rotate phone for better Week view
              </p>
              <button
                type="button"
                className="mt-8 w-full min-h-12 rounded-2xl bg-violet-600 text-base font-bold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 touch-manipulation"
                onClick={() => setShowWeekPortraitHint(false)}
              >
                OK
              </button>
            </div>
          </div>
        )}

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
          <div className="text-white font-bold mb-2">{activeCalendarView === 'agenda' ? 'Agenda' : 'Events'}</div>
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
                      className={`${meta.card} block w-full rounded-2xl p-2.5 text-left transition-colors hover:bg-opacity-90`}
                    >
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

        {weekDetailEvent &&
          (() => {
            const e = weekDetailEvent
            const meta = offerTypeMeta[e.offer_type] || offerTypeMeta.other
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
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="week-detail-heading"
                className="fixed inset-0 z-[55] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-[1px]"
                onClick={() => setWeekDetailEvent(null)}
              >
                <div
                  className={`w-full max-w-lg max-h-[min(85dvh,calc(100dvh-6rem))] overflow-y-auto rounded-3xl border border-zinc-700 p-5 shadow-2xl ${meta.card}`}
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div id="week-detail-heading" className="text-white font-bold text-lg">
                      Event details
                    </div>
                    <button
                      type="button"
                      onClick={() => setWeekDetailEvent(null)}
                      className="text-zinc-400 hover:text-zinc-200 text-sm font-semibold touch-manipulation"
                    >
                      Close
                    </button>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-zinc-500 text-[10px] font-semibold tracking-wide">{dayLabel}</div>
                      <div className="text-zinc-100 text-2xl font-black leading-tight">{dayNum}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${meta.chip}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-1 text-lg font-semibold leading-snug text-zinc-100">
                        {timeLabel ? `${timeLabel} ` : ''}
                        {e.title}
                      </div>
                      {dateRangeLabel && <div className="mt-1 text-sm text-zinc-300">{dateRangeLabel}</div>}
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                        <span className="font-bold text-zinc-100">{e.casino_name || '—'}</span>
                        {e.value_amount !== null && (
                          <span className="font-semibold tabular-nums text-emerald-400">
                            {e.value_amount !== null ? `$${Number(e.value_amount).toFixed(0)}` : ''}
                          </span>
                        )}
                      </div>
                      {e.notes && (
                        <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-400">{e.notes}</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-zinc-700/80 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setWeekDetailEvent(null)
                        beginEdit(e)
                      }}
                      className="text-cyan-300 hover:text-cyan-200 text-sm font-semibold touch-manipulation"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWeekDetailEvent(null)
                        deleteEvent(e.id)
                      }}
                      className="text-red-300 hover:text-red-200 text-sm font-semibold touch-manipulation"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

        <button
          type="button"
          onClick={() => openForm(null)}
          aria-label="Add event"
          className="fixed right-[4.25rem] bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] z-50 grid h-12 w-12 place-items-center rounded-full bg-violet-600 text-white shadow-lg touch-manipulation hover:bg-violet-500"
        >
          <span aria-hidden className="block leading-none text-[2rem] -translate-y-px">+</span>
        </button>

        {showForm && (
          <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-[1px] px-4 py-6 overflow-y-auto">
            <div className="max-w-lg mx-auto bg-zinc-900 rounded-3xl p-5 border border-zinc-700">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-white font-bold text-lg">{editingId ? 'Edit event' : 'Add event'}</div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="text-zinc-400 hover:text-zinc-200 text-sm font-semibold touch-manipulation"
                >
                  Close
                </button>
              </div>

              <div className="mb-4">
                <div className="text-white font-semibold mb-1">Import from photos (bulk)</div>
                <p className="text-zinc-400 text-xs mb-3 leading-relaxed flex items-center gap-1.5">
                  <span aria-hidden>🪄</span>
                  <span>We&apos;ll use AI to auto-magically create events from your casino mailers.</span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleImportPhotos(e)}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-11 rounded-2xl border border-zinc-600 bg-zinc-800 text-zinc-100 font-semibold hover:bg-zinc-700 disabled:opacity-60 touch-manipulation"
                >
                  {uploading ? 'Uploading…' : 'Choose photo(s)'}
                </button>
              </div>

              {completingReviewItemId && (
                <div className="mb-4 rounded-2xl border border-amber-700/60 bg-amber-950/30 p-3">
                  <div className="text-amber-100 text-xs font-semibold mb-2">Source image for this AI draft</div>
                  {reviewSourceImageLoading ? (
                    <div className="text-amber-200/80 text-xs">Loading image preview...</div>
                  ) : reviewSourceImageUrl ? (
                    <a
                      href={reviewSourceImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                      title="Open full image"
                    >
                      <img
                        src={reviewSourceImageUrl}
                        alt="Source upload for AI draft"
                        className="w-full max-h-64 object-contain rounded-xl border border-amber-700/50 bg-black/20"
                      />
                    </a>
                  ) : (
                    <div className="text-amber-200/80 text-xs">Image preview unavailable. You can still complete this draft manually.</div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 text-xs mb-1">Casino</label>
                  <div ref={casinoFieldRef} className="relative">
                    <input
                      value={draft.casinoName}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, casinoName: e.target.value }))
                        setShowCasinoSuggestions(true)
                      }}
                      onFocus={() => setShowCasinoSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowCasinoSuggestions(false), 120)}
                      className="w-full h-12 appearance-none bg-zinc-800 rounded-2xl pl-3 pr-10 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                      placeholder="e.g. Bellagio"
                    />
                    <button
                      type="button"
                      aria-label="Toggle casino suggestions"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => setShowCasinoSuggestions((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm hover:text-zinc-200"
                    >
                      ▾
                    </button>
                    {showCasinoSuggestions && filteredCasinoOptions.length > 0 && (
                      <div className="absolute z-30 mt-1 w-full max-h-44 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
                        {filteredCasinoOptions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => {
                              setDraft((d) => ({ ...d, casinoName: name }))
                              setShowCasinoSuggestions(false)
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs mb-1">Type</label>
                  <div className="relative">
                    <select
                      value={draft.offerType}
                      onChange={(e) => setDraft((d) => ({ ...d, offerType: e.target.value }))}
                      className="w-full h-12 appearance-none bg-zinc-800 rounded-2xl pl-3 pr-10 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                    >
                      <option value="free_play">Free play</option>
                      <option value="hotel">Hotel stay</option>
                      <option value="dining">Dining credit</option>
                      <option value="gift">Gift day</option>
                      <option value="multiplier">Tier multiplier</option>
                      <option value="tournament">Tournament</option>
                      <option value="drawing">Drawing</option>
                      <option value="other">Other</option>
                    </select>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm"
                    >
                      ▾
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-zinc-400 text-xs mb-1">Title</label>
                <div ref={titleFieldRef} className="relative">
                  <input
                    value={draft.title}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, title: e.target.value }))
                      setShowTitleSuggestions(true)
                    }}
                    onFocus={() => setShowTitleSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 120)}
                    className="w-full h-12 appearance-none bg-zinc-800 rounded-2xl pl-3 pr-10 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                    placeholder="e.g. Weekly Free Play"
                  />
                  <button
                    type="button"
                    aria-label="Toggle title suggestions"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => setShowTitleSuggestions((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm hover:text-zinc-200"
                  >
                    ▾
                  </button>
                  {showTitleSuggestions && filteredTitleOptions.length > 0 && (
                    <div className="absolute z-30 mt-1 w-full max-h-44 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
                      {filteredTitleOptions.map((title) => (
                        <button
                          key={title}
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            setDraft((d) => ({ ...d, title }))
                            setShowTitleSuggestions(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <label className="block text-zinc-400 text-xs">Start</label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => {
                        const v = e.target.checked
                        setAllDay(v)
                        setDraft((cur) => {
                          if (!cur.startAt) return cur
                          if (v) {
                            const dt = dateFromDatetimeLocalValue(cur.startAt)
                            if (!dt) return cur
                            const midnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0)
                            const curEnd = dateFromDatetimeLocalValue(cur.endAt)
                            const endMidnight = curEnd
                              ? new Date(curEnd.getFullYear(), curEnd.getMonth(), curEnd.getDate(), 0, 0, 0, 0)
                              : null
                            return {
                              ...cur,
                              startAt: datetimeLocalValueFromDate(midnight),
                              endAt: endMidnight ? datetimeLocalValueFromDate(endMidnight) : cur.endAt
                            }
                          }
                          return cur
                        })
                      }}
                      className="h-4 w-4 accent-violet-600"
                    />
                    <span className="text-zinc-400 text-[11px] leading-none">All day</span>
                  </label>
                </div>
                <DatePicker
                  selected={startSelected}
                  onChange={(d) =>
                    setDraft((cur) => {
                      if (!d) return { ...cur, startAt: '' }
                      const nextStart = datetimeLocalValueFromDate(d)
                      const curEnd = dateFromDatetimeLocalValue(cur.endAt)
                      const shouldClearEnd = !!curEnd && curEnd.getTime() < d.getTime()
                      return { ...cur, startAt: nextStart, endAt: shouldClearEnd ? '' : cur.endAt }
                    })
                  }
                  showTimeSelect={!allDay}
                  timeIntervals={15}
                  timeCaption="Time"
                  dateFormat={allDay ? 'MMM d, yyyy' : 'MMM d, yyyy h:mm aa'}
                  popperPlacement="bottom-start"
                  wrapperClassName="w-full"
                  calendarClassName="offer-datepicker"
                  withPortal
                  placeholderText="Select start"
                  customInput={<DateTimeInput />}
                />
              </div>

              <div className="mt-3">
                <label className="block text-zinc-400 text-xs mb-1">End (optional)</label>
                <DatePicker
                  selected={endSelected}
                  onChange={(d) => setDraft((cur) => ({ ...cur, endAt: d ? datetimeLocalValueFromDate(d) : '' }))}
                  showTimeSelect={!allDay}
                  timeIntervals={15}
                  timeCaption="Time"
                  dateFormat={allDay ? 'MMM d, yyyy' : 'MMM d, yyyy h:mm aa'}
                  minDate={startSelected || undefined}
                  minTime={!allDay && startSelected ? endMinTime : undefined}
                  maxTime={!allDay && startSelected ? endMaxTime : undefined}
                  popperPlacement="bottom-start"
                  wrapperClassName="w-full"
                  calendarClassName="offer-datepicker"
                  withPortal
                  placeholderText="Select end"
                  isClearable
                  customInput={<DateTimeInput />}
                />
              </div>

              <div className="mt-3">
                <label className="block text-zinc-400 text-xs mb-1">Value amount ($)</label>
                <input
                  type="number"
                  value={draft.valueAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, valueAmount: e.target.value }))}
                  className="w-full h-12 bg-zinc-800 rounded-2xl px-3 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                  placeholder="e.g. 150"
                />
              </div>

              <div className="mt-3">
                <label className="block text-zinc-400 text-xs mb-1">Notes</label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  className="w-full min-h-20 bg-zinc-800 rounded-2xl px-3 py-2 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                  placeholder="Any restrictions, swipe times, or details"
                />
              </div>

              <button
                type="button"
                onClick={saveEvent}
                disabled={saving}
                className="mt-4 w-full min-h-12 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
              >
                {saving ? 'Saving…' : editingId ? 'Update event' : 'Save event'}
              </button>
              {completingReviewItemId && !editingId && (
                <button
                  type="button"
                  onClick={() => void skipCurrentReviewFromForm()}
                  disabled={saving}
                  className="mt-2 w-full min-h-11 rounded-2xl border border-zinc-600 bg-zinc-800 text-zinc-200 font-semibold hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"
                >
                  Not needed — remove from queue
                </button>
              )}
            </div>
          </div>
        )}
        {uploading && (
          <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-3xl border border-violet-500/40 bg-zinc-950/95 p-5 shadow-2xl shadow-black/60">
              <div className="mb-3 flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-violet-200 text-xs font-semibold uppercase tracking-wide">Bulk import in progress</span>
              </div>
              <div className="text-white text-base font-semibold leading-relaxed">{uploadSpinnerMessage}</div>
            </div>
          </div>
        )}
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
        <img src="/phoenix-link-logo.png" alt="Phoenix" className="h-16 w-16 flex-shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 self-center">
          <div className="line-clamp-2 font-semibold text-2xl leading-snug text-orange-400">Phoenix Link EV Calc</div>
          <p className="mt-0.5 line-clamp-1 text-base leading-snug text-gray-400 sm:line-clamp-2">
            Must-hit counter bonus analyzer
          </p>
        </div>
      </button>

      <button
        onClick={() => setActiveCalculator('buffalo')}
        className="w-full bg-gradient-to-br from-amber-600 via-orange-600 to-red-700 hover:from-amber-500 hover:via-orange-500 hover:to-red-600 p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation transition-all active:scale-[0.985]"
      >
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-inner">
          <img src="/buffalo-icon.png" alt="Buffalo" className="h-14 w-14 object-contain" />
        </div>
        <div className="min-w-0 flex-1 self-center">
          <div className="line-clamp-2 font-semibold text-2xl leading-snug text-amber-100">Buffalo Link EV Calc</div>
          <p className="mt-0.5 line-clamp-1 text-base leading-snug text-amber-200 sm:line-clamp-2">
            Midpoint-based counter analyzer
          </p>
        </div>
      </button>

      <button
        onClick={() => setActiveCalculator('stackup')}
        className="w-full bg-gradient-to-br from-cyan-600 via-sky-600 to-blue-700 hover:from-cyan-500 hover:via-sky-500 hover:to-blue-600 p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation transition-all active:scale-[0.985]"
      >
        <img src="/stackup-icon.jpg" alt="Stack Up Pays" className="h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-lg" />
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
        className="w-full bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-700 hover:from-purple-500 hover:via-violet-500 hover:to-fuchsia-600 p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation transition-all active:scale-[0.985]"
      >
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-purple-400 to-fuchsia-400 text-5xl shadow-inner">
          🎰
        </div>
        <div className="min-w-0 flex-1 self-center">
          <div className="line-clamp-2 font-semibold text-2xl leading-snug text-purple-100">Must Hit By Jackpot</div>
          <p className="mt-0.5 line-clamp-1 text-base leading-snug text-purple-200 sm:line-clamp-2">
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

    if (tab === 'home') {
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
              <div className="text-white font-bold">Feed (placeholder)</div>
              <button
                onClick={() => setTab('offers')}
                className="text-cyan-300 text-sm font-semibold hover:text-cyan-200"
              >
                View offers →
              </button>
            </div>
            <div className="space-y-3">
              {[
                { title: 'Big win post', body: 'Photo + caption + tags (coming soon).' },
                { title: 'News/update', body: 'Machine changes, rules, resets (coming soon).' },
              ].map((p) => (
                <div key={p.title} className="rounded-2xl bg-zinc-800/70 p-4">
                  <div className="text-zinc-200 font-semibold">{p.title}</div>
                  <div className="text-zinc-400 text-sm mt-1 leading-relaxed">{p.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (tab === 'guides') {
      return (
        <div className="max-w-lg mx-auto px-4 py-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="mb-6">
            <div className="text-white text-2xl font-black tracking-tight">Guides</div>
            <div className="text-zinc-400 text-sm mt-0.5">How-to playbooks (skeleton)</div>
          </div>

          <div className="space-y-3">
            {[
              { id: 'stackup', title: 'Stack Up Pays (Ascending Fortunes)', subtitle: 'What to look for + meter workflow' },
              { id: 'phoenix', title: 'Phoenix Link', subtitle: 'Counter basics + volatility notes' },
              { id: 'buffalo', title: 'Buffalo Link', subtitle: 'Midpoint method + walk-away' },
            ].map((g) => (
              <div key={g.id} className="bg-zinc-900 rounded-3xl p-5">
                <div className="text-white font-bold text-lg">{g.title}</div>
                <div className="text-zinc-400 text-sm mt-1">{g.subtitle}</div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => openCalculator(g.id)}
                    className="flex-1 min-h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold touch-manipulation"
                  >
                    Open calculator
                  </button>
                  <button
                    onClick={() => setTab('intel')}
                    className="flex-1 min-h-11 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold touch-manipulation"
                  >
                    Ask locals
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (tab === 'offers') return <OffersCalendar />
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
          <div className="w-44 rounded-2xl bg-zinc-950/95 backdrop-blur px-2 py-2 shadow-xl">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id)
                  if (item.id === 'calculators' && activeCalculator) setActiveCalculator(null)
                  setMenuOpen(false)
                }}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm flex items-center gap-2 touch-manipulation ${
                  tab === item.id ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                <span>{item.label}</span>
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