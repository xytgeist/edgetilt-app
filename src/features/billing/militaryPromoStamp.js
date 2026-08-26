import { authRedirectUrlWithAffiliateRef } from '../affiliates/affiliateRefApi.js'

const STORAGE_KEY = 'edge_military_promo_v1'
const ATTRIBUTION_MS = 30 * 24 * 60 * 60 * 1000

/** Matches coupon 9zheeC1H (25% forever). UI only ... Checkout still resolves Stripe. */
export const MILITARY_PROMO_PERCENT_OFF = 25

/**
 * @typedef {{ code: string, exp: number }} MilitaryPromoStamp
 */

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/

/** @param {unknown} raw @returns {string} */
export function normalizeMilitaryPromoCode(raw) {
  return String(raw || '')
    .trim()
    .replace(/^\/+/, '')
}

/** @param {string} code */
export function isPlausibleMilitaryPromoCode(code) {
  return CODE_RE.test(code)
}

/**
 * @param {string} [pathname]
 * @param {string} [search]
 * @returns {string | null}
 */
export function parseMilitaryPromoCodeFromLocation(pathname, search) {
  const path = String(pathname || (typeof window !== 'undefined' ? window.location.pathname : '') || '/')
  const qs = String(search || (typeof window !== 'undefined' ? window.location.search : '') || '')
  const params = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs)
  const fromQuery = normalizeMilitaryPromoCode(params.get('mil') || params.get('c') || '')
  if (fromQuery && isPlausibleMilitaryPromoCode(fromQuery)) return fromQuery

  const parts = path.split('/').filter(Boolean)
  if (parts.length === 2 && parts[0].toLowerCase() === 'mil25') {
    let segment = parts[1]
    try {
      segment = decodeURIComponent(segment)
    } catch {
      // keep raw
    }
    const code = normalizeMilitaryPromoCode(segment)
    if (isPlausibleMilitaryPromoCode(code)) return code
  }
  return null
}

/** @returns {MilitaryPromoStamp | null} */
export function readMilitaryPromoStamp() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const code = normalizeMilitaryPromoCode(parsed?.code)
    if (!isPlausibleMilitaryPromoCode(code) || !parsed?.exp) return null
    if (Number(parsed.exp) < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return { code, exp: Number(parsed.exp) }
  } catch {
    return null
  }
}

/** @param {string} code */
export function writeMilitaryPromoStamp(code) {
  if (typeof window === 'undefined') return
  const normalized = normalizeMilitaryPromoCode(code)
  if (!isPlausibleMilitaryPromoCode(normalized)) return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ code: normalized, exp: Date.now() + ATTRIBUTION_MS }),
  )
}

export function clearMilitaryPromoStamp() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function stripMilitaryPromoFromUrl() {
  if (typeof window === 'undefined') return
  try {
    const u = new URL(window.location.href)
    const parts = u.pathname.split('/').filter(Boolean)
    const onMilPath = parts.length >= 1 && parts[0].toLowerCase() === 'mil25'
    const hadQuery = u.searchParams.has('mil') || u.searchParams.has('c')
    if (!onMilPath && !hadQuery) return
    u.searchParams.delete('mil')
    u.searchParams.delete('c')
    if (onMilPath) u.pathname = '/'
    const qs = u.searchParams.toString()
    const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash || ''}`
    window.history.replaceState({}, '', next || '/')
  } catch {
    // ignore
  }
}

/**
 * Stamp localStorage from `/mil25/CODE` or `?mil=` / `?c=`.
 * App then opens Join / Sign in if logged out, Subscribe after auth.
 * @returns {MilitaryPromoStamp | null} stamp when this load captured a URL code
 */
export function captureMilitaryPromoFromUrl() {
  if (typeof window === 'undefined') return null
  const fromUrl = parseMilitaryPromoCodeFromLocation()
  if (fromUrl) {
    writeMilitaryPromoStamp(fromUrl)
    stripMilitaryPromoFromUrl()
    return readMilitaryPromoStamp()
  }
  return null
}

/** @returns {string | null} */
export function getMilitaryPromoCodeForCheckout() {
  return readMilitaryPromoStamp()?.code || null
}

/**
 * @param {string} baseUrl
 */
export function authRedirectUrlWithMilitaryPromo(baseUrl) {
  const base = String(baseUrl || '').trim()
  if (!base) return base
  try {
    const u = new URL(base, typeof window !== 'undefined' ? window.location.origin : base)
    const code = readMilitaryPromoStamp()?.code
    if (code) u.searchParams.set('mil', code)
    return u.toString()
  } catch {
    return base
  }
}

/** Affiliate `?ref=` then military `?mil=` so email/OAuth confirm keeps both stamps. */
export function authRedirectUrlWithPromoStamps(baseUrl) {
  return authRedirectUrlWithMilitaryPromo(authRedirectUrlWithAffiliateRef(baseUrl))
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} _supabaseClient
 * @param {{ user_metadata?: Record<string, unknown> } | null | undefined} user
 */
export function ensureMilitaryPromoStampFromUserMetadata(_supabaseClient, user) {
  if (readMilitaryPromoStamp()) return readMilitaryPromoStamp()
  const code = normalizeMilitaryPromoCode(user?.user_metadata?.military_promo_code)
  if (!isPlausibleMilitaryPromoCode(code)) return null
  writeMilitaryPromoStamp(code)
  return readMilitaryPromoStamp()
}
