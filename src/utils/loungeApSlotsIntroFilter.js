import {
  displayPostCategoryPills,
  feedPostCategoryPills,
  LOUNGE_POST_CATEGORY_PILL_SLUGS,
} from './loungePostCategoryPills.js'

/** SEO hub CTAs stamp this so Lounge can intro-filter AP Slots without a referrer. */
export const AP_SLOTS_LOUNGE_INTRO_QUERY_PARAM = 'apSlotsLounge'

export const AP_SLOTS_LOUNGE_INTRO_KEEP_SLUG = 'ap_slots'

/** First couple Lounge visits from /slots, /guides, /advantage-play-slots. */
export const AP_SLOTS_LOUNGE_INTRO_MAX_VISITS = 2

const VISITS_STORAGE_KEY = 'loungeApSlotsIntroVisits:v1'
const ELIGIBLE_STORAGE_KEY = 'loungeApSlotsIntroEligible:v1'
const STAY_STORAGE_KEY = 'loungeApSlotsIntroStay:v1'

const URL_TABS_THAT_LEAVE_LOUNGE_HOME = new Set([
  'offers',
  'logbook',
  'w2g-scanner',
  'chat',
  'monitor',
  'bots',
  'affiliates',
  'stable-smoke',
  'creator',
  'poker-bankroll',
  'poker-stable',
])

function readStorage(storage, key) {
  if (typeof window === 'undefined') return ''
  try {
    return String(storage.getItem(key) || '')
  } catch {
    return ''
  }
}

function writeStorage(storage, key, value) {
  if (typeof window === 'undefined') return
  try {
    if (value == null || value === '') storage.removeItem(key)
    else storage.setItem(key, String(value))
  } catch {
    // ignore
  }
}

/** Exclude every tribe except AP Slots. Untagged posts still pass the RPC ... client filter drops those. */
export function apSlotsLoungeIntroExcludedSlugs() {
  return LOUNGE_POST_CATEGORY_PILL_SLUGS.filter((slug) => slug !== AP_SLOTS_LOUNGE_INTRO_KEEP_SLUG)
}

/** True when the row itself (or hydrated OP fallback) has the AP Slots pill. */
export function loungePostHasApSlotsIntroPill(post) {
  if (feedPostCategoryPills(post).includes(AP_SLOTS_LOUNGE_INTRO_KEEP_SLUG)) return true
  return displayPostCategoryPills(post).includes(AP_SLOTS_LOUNGE_INTRO_KEEP_SLUG)
}

export function filterLoungePostsForApSlotsIntro(posts) {
  return (posts || []).filter(loungePostHasApSlotsIntroPill)
}

/** Extra RPC pages while filling an AP Slots-only first screen. */
export const AP_SLOTS_LOUNGE_INTRO_MAX_RPC_PAGES = 8

export function isApSlotsLoungeIntroHubPath(pathname) {
  const raw = String(pathname || '').split('?')[0]
  const p = raw.replace(/\/+$/, '') || '/'
  if (p === '/slots' || p === '/guides' || p === '/advantage-play-slots') return true
  return /^\/guides\/[a-z0-9-]+$/i.test(p)
}

export function isApSlotsLoungeIntroHubTab(tab) {
  return tab === 'slots' || tab === 'guides'
}

/**
 * True when AppShell URL bootstrap will leave Lounge this tick
 * (`?tab=guides&guide=` / Offers / Chat / etc.).
 * `?tab=slots` and bare `?tab=guides` stay on home today.
 */
export function urlLeavesLoungeHomeForApSlotsIntro(search, pathname) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
  const targetTab = String(params.get('tab') || '').trim()
  if (URL_TABS_THAT_LEAVE_LOUNGE_HOME.has(targetTab)) return true
  if (String(params.get('guide') || '').trim()) return true
  return /^\/guides\/[a-z0-9-]+/i.test(String(pathname || ''))
}

export function readApSlotsLoungeIntroVisits() {
  const n = Number.parseInt(readStorage(window.localStorage, VISITS_STORAGE_KEY), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function writeApSlotsLoungeIntroVisits(n) {
  writeStorage(window.localStorage, VISITS_STORAGE_KEY, String(Math.max(0, Math.floor(n))))
}

export function markApSlotsLoungeIntroEligible() {
  writeStorage(window.sessionStorage, ELIGIBLE_STORAGE_KEY, '1')
}

export function isApSlotsLoungeIntroEligible() {
  return readStorage(window.sessionStorage, ELIGIBLE_STORAGE_KEY) === '1'
}

export function endApSlotsLoungeIntroStay() {
  writeStorage(window.sessionStorage, STAY_STORAGE_KEY, '')
}

/** Tribes edit or Show all ... never re-apply on this device. */
export function retireApSlotsLoungeIntro() {
  writeApSlotsLoungeIntroVisits(AP_SLOTS_LOUNGE_INTRO_MAX_VISITS)
  writeStorage(window.sessionStorage, ELIGIBLE_STORAGE_KEY, '')
  endApSlotsLoungeIntroStay()
}

function arrivalLooksLikeApSlotsHub(search, pathname, referrer) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
  const stamped = String(params.get(AP_SLOTS_LOUNGE_INTRO_QUERY_PARAM) || '').trim()
  if (stamped === '1' || stamped.toLowerCase() === 'true') return true
  if (isApSlotsLoungeIntroHubTab(String(params.get('tab') || '').trim())) return true
  if (isApSlotsLoungeIntroHubPath(pathname)) return true
  if (referrer) {
    try {
      const ref = new URL(referrer, typeof window !== 'undefined' ? window.location.origin : 'https://edgetilt.com')
      if (isApSlotsLoungeIntroHubPath(ref.pathname)) return true
    } catch {
      // ignore
    }
  }
  return false
}

function stripApSlotsLoungeIntroQueryParam() {
  if (typeof window === 'undefined') return
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has(AP_SLOTS_LOUNGE_INTRO_QUERY_PARAM)) return
    u.searchParams.delete(AP_SLOTS_LOUNGE_INTRO_QUERY_PARAM)
    const qs = u.searchParams.toString()
    window.history.replaceState({}, '', `${u.pathname}${qs ? `?${qs}` : ''}${u.hash || ''}`)
  } catch {
    // ignore
  }
}

/** Stamp session eligibility from hub CTAs / referrer / `?tab=slots|guides`. */
export function consumeApSlotsLoungeIntroArrival(opts = {}) {
  if (typeof window === 'undefined') return false
  const search = opts.search ?? window.location.search
  const pathname = opts.pathname ?? window.location.pathname
  const referrer = opts.referrer ?? document.referrer
  const hit = arrivalLooksLikeApSlotsHub(search, pathname, referrer)
  if (hit) markApSlotsLoungeIntroEligible()
  if (!opts.skipStrip) stripApSlotsLoungeIntroQueryParam()
  return hit
}

/**
 * In-memory AP Slots overlay for this Lounge stay.
 * Does not write `loungeFeedCategoryFilter:v2`.
 * @param {string[]} savedExcluded
 * @returns {string[] | null}
 */
export function beginApSlotsLoungeIntroOverlay(savedExcluded) {
  if (typeof window === 'undefined') return null
  if (Array.isArray(savedExcluded) && savedExcluded.length > 0) return null
  if (!isApSlotsLoungeIntroEligible()) return null
  const alreadyThisStay = readStorage(window.sessionStorage, STAY_STORAGE_KEY) === '1'
  const visits = readApSlotsLoungeIntroVisits()
  if (!alreadyThisStay && visits >= AP_SLOTS_LOUNGE_INTRO_MAX_VISITS) return null
  if (!alreadyThisStay) {
    writeApSlotsLoungeIntroVisits(visits + 1)
    writeStorage(window.sessionStorage, STAY_STORAGE_KEY, '1')
  }
  return apSlotsLoungeIntroExcludedSlugs()
}
