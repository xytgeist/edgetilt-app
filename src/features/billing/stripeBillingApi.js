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
 * @param {{ priceInterval?: 'monthly' | 'annual', applyEarlyBird?: boolean, affiliateCode?: string | null }} [options]
 */
export async function startEdgeCheckout(supabaseClient, productSlug, options = {}) {
  const { priceInterval = 'monthly', applyEarlyBird = true, affiliateCode = null } = options
  /** @type {Record<string, unknown>} */
  const body = {
    product_slug: productSlug,
    price_interval: priceInterval,
    apply_early_bird: applyEarlyBird,
  }
  const code = typeof affiliateCode === 'string' ? affiliateCode.trim() : ''
  if (code) body.affiliate_code = code

  const { data, error, response } = await supabaseClient.functions.invoke('stripe-create-checkout-session', {
    body,
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not start checkout.')
  }
  if (data?.error) {
    throw new Error(String(data.error))
  }
  if (!data?.url) {
    throw new Error('Checkout URL missing from server response.')
  }
  window.location.assign(data.url)
  return data
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function openBillingPortal(supabaseClient) {
  const { data, error, response } = await supabaseClient.functions.invoke('stripe-create-portal-session', {
    body: {},
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not open billing portal.')
  }
  if (data?.error) {
    throw new Error(String(data.error))
  }
  if (!data?.url) {
    throw new Error('Portal URL missing from server response.')
  }
  window.location.assign(data.url)
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
