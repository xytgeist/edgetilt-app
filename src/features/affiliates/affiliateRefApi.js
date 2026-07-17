const STORAGE_KEY = 'edge_affiliate_ref_v1'
const ATTRIBUTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * @typedef {{ code: string, affiliateId: string, promoCode?: string | null, exp: number }} AffiliateStamp
 */

/** @returns {AffiliateStamp | null} */
export function readAffiliateStamp() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.code || !parsed?.affiliateId || !parsed?.exp) return null
    if (Number(parsed.exp) < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return {
      code: String(parsed.code),
      affiliateId: String(parsed.affiliateId),
      promoCode: parsed.promoCode ? String(parsed.promoCode) : null,
      exp: Number(parsed.exp),
    }
  } catch {
    return null
  }
}

/** @param {AffiliateStamp} stamp */
export function writeAffiliateStamp(stamp) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      code: stamp.code,
      affiliateId: stamp.affiliateId,
      promoCode: stamp.promoCode || null,
      exp: stamp.exp,
    }),
  )
}

export function clearAffiliateStamp() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function stripRefQueryParam() {
  if (typeof window === 'undefined') return
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('ref')) return
    u.searchParams.delete('ref')
    const qs = u.searchParams.toString()
    const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash || ''}`
    window.history.replaceState({}, '', next)
  } catch {
    // ignore
  }
}

/**
 * Resolve ?ref= against public RPC and stamp localStorage for 30 days.
 * Safe to call before auth (anon RPC).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function captureAffiliateRefFromUrl(supabaseClient) {
  if (typeof window === 'undefined' || !supabaseClient) return null
  const params = new URLSearchParams(window.location.search || '')
  const code = (params.get('ref') || '').trim().toLowerCase()
  if (!code) return readAffiliateStamp()

  const { data, error } = await supabaseClient.rpc('resolve_affiliate_ref', { p_code: code })
  if (error) {
    console.warn('resolve_affiliate_ref failed', error.message)
    stripRefQueryParam()
    return readAffiliateStamp()
  }
  if (!data?.affiliate_id || !data?.code) {
    stripRefQueryParam()
    return readAffiliateStamp()
  }

  const stamp = {
    code: String(data.code),
    affiliateId: String(data.affiliate_id),
    promoCode: data.promo_code ? String(data.promo_code) : null,
    exp: Date.now() + ATTRIBUTION_MS,
  }
  writeAffiliateStamp(stamp)
  stripRefQueryParam()
  return stamp
}

/** @returns {string | null} */
export function getAffiliateCodeForCheckout() {
  return readAffiliateStamp()?.code || null
}
