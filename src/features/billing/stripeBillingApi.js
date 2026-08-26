import { openExternalBillingUrl } from '../../utils/edgeNative.js'
import { restoreSupabaseSession } from '../../utils/supabaseSessionRestore.js'

export const CHECKOUT_AUTH_REQUIRED_CODE = 'CHECKOUT_AUTH_REQUIRED'
export const CHECKOUT_AUTH_REQUIRED_MESSAGE = 'Sign in to continue to checkout.'

/**
 * @param {unknown} err
 */
export function isCheckoutAuthRequiredError(err) {
  if (!err || typeof err !== 'object') {
    const msg = String(err || '')
    return /sign in to continue to checkout/i.test(msg) || /invalid or expired session/i.test(msg)
  }
  if ('code' in err && err.code === CHECKOUT_AUTH_REQUIRED_CODE) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /sign in to continue to checkout/i.test(msg) || /invalid or expired session/i.test(msg)
}

function throwCheckoutAuthRequired() {
  const err = new Error(CHECKOUT_AUTH_REQUIRED_MESSAGE)
  err.code = CHECKOUT_AUTH_REQUIRED_CODE
  throw err
}

function isAuthRequiredDetail(detail) {
  const msg = String(detail || '').trim()
  if (!msg) return false
  return /invalid or expired session/i.test(msg) || /missing authorization bearer/i.test(msg)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} fnName
 * @param {Record<string, unknown>} body
 */
async function invokeBillingFunction(supabaseClient, fnName, body) {
  const session = await restoreSupabaseSession(supabaseClient)
  if (!session?.access_token) throwCheckoutAuthRequired()

  return supabaseClient.functions.invoke(fnName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
}

/**
 * @param {Response | undefined} response
 */
async function readEdgeFunctionError(response) {
  if (!response || typeof response.status !== 'number') return ''
  try {
    const raw = await response.clone().text()
    if (!raw) return ''
    const body = JSON.parse(raw)
    if (body && typeof body === 'object' && body.error != null) {
      return String(body.error).trim()
    }
    if (body && typeof body === 'object' && body.message != null) {
      return String(body.message).trim()
    }
  } catch {
    // ignore parse failures
  }
  return ''
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} productSlug
 * @param {{ priceInterval?: 'monthly' | 'annual', applyEarlyBird?: boolean, affiliateCode?: string | null, militaryPromoCode?: string | null }} [options]
 */
export async function startEdgeCheckout(supabaseClient, productSlug, options = {}) {
  const {
    priceInterval = 'monthly',
    applyEarlyBird = true,
    affiliateCode = null,
    militaryPromoCode = null,
  } = options
  /** @type {Record<string, unknown>} */
  const body = {
    product_slug: productSlug,
    price_interval: priceInterval,
    apply_early_bird: applyEarlyBird,
  }
  const military = typeof militaryPromoCode === 'string' ? militaryPromoCode.trim() : ''
  const code = typeof affiliateCode === 'string' ? affiliateCode.trim() : ''
  if (military) body.military_promo_code = military
  else if (code) body.affiliate_code = code

  const { data, error, response } = await invokeBillingFunction(
    supabaseClient,
    'stripe-create-checkout-session',
    body,
  )
  if (error) {
    const detail = await readEdgeFunctionError(response)
    if (isAuthRequiredDetail(detail) || isAuthRequiredDetail(error.message)) throwCheckoutAuthRequired()
    throw new Error(detail || error.message || 'Could not start checkout.')
  }
  if (data?.error) {
    if (isAuthRequiredDetail(data.error)) throwCheckoutAuthRequired()
    throw new Error(String(data.error))
  }
  if (!data?.url) {
    throw new Error('Checkout URL missing from server response.')
  }
  await openExternalBillingUrl(data.url)
  return data
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function openBillingPortal(supabaseClient) {
  const { data, error, response } = await invokeBillingFunction(
    supabaseClient,
    'stripe-create-portal-session',
    {},
  )
  if (error) {
    const detail = await readEdgeFunctionError(response)
    if (isAuthRequiredDetail(detail) || isAuthRequiredDetail(error.message)) throwCheckoutAuthRequired()
    throw new Error(detail || error.message || 'Could not open billing portal.')
  }
  if (data?.error) {
    if (isAuthRequiredDetail(data.error)) throwCheckoutAuthRequired()
    throw new Error(String(data.error))
  }
  if (!data?.url) {
    throw new Error('Portal URL missing from server response.')
  }
  await openExternalBillingUrl(data.url)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<Record<string, { active?: boolean, status?: string, current_period_end?: string | null, cancel_at_period_end?: boolean }>>}
 */
export async function fetchMyEntitlements(supabaseClient) {
  const [platformRes, fanRes] = await Promise.all([
    supabaseClient.rpc('get_my_entitlements'),
    supabaseClient.rpc('get_my_creator_fan_entitlements'),
  ])

  const { data: platformData, error: platformError } = platformRes
  if (platformError) {
    if (platformError.code === 'PGRST202' || platformError.message?.includes('get_my_entitlements')) {
      // migration not applied yet
    } else {
      throw platformError
    }
  }

  const platform =
    platformData && typeof platformData === 'object' && !platformError ? platformData : {}

  let fan = {}
  const { data: fanData, error: fanError } = fanRes
  if (fanError) {
    if (
      fanError.code === 'PGRST202' ||
      fanError.message?.includes('get_my_creator_fan_entitlements')
    ) {
      fan = {}
    } else {
      throw fanError
    }
  } else if (fanData && typeof fanData === 'object') {
    fan = fanData
  }

  return { ...platform, ...fan }
}
