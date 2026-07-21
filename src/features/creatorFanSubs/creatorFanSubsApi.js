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
  } catch {
    // ignore
  }
  return ''
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function fetchMyCreatorFanMonetization(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('get_my_creator_fan_monetization')
  if (error) {
    if (error.code === 'PGRST202') return null
    throw error
  }
  return data && typeof data === 'object' ? data : null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} fanTierKey
 * @param {boolean} enabled
 */
export async function saveCreatorFanMonetization(supabaseClient, fanTierKey, enabled) {
  const { data, error } = await supabaseClient.rpc('creator_fan_save_monetization', {
    p_fan_tier_key: fanTierKey,
    p_enabled: enabled,
  })
  if (error) throw new Error(error.message || 'Could not save fan subscription settings.')
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ offerHeadline?: string, offerIntro?: string, offerPrivatePosts?: string, offerFanChat?: string }} fields
 */
export async function saveCreatorFanOffer(supabaseClient, fields) {
  const { data, error } = await supabaseClient.rpc('creator_fan_save_offer', {
    p_offer_headline: fields.offerHeadline ?? '',
    p_offer_intro: fields.offerIntro ?? '',
    p_offer_private_posts: fields.offerPrivatePosts ?? '',
    p_offer_fan_chat: fields.offerFanChat ?? '',
  })
  if (error) throw new Error(error.message || 'Could not save your offer.')
  return data
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function startCreatorFanConnectOnboarding(supabaseClient) {
  const { data, error, response } = await supabaseClient.functions.invoke('creator-fan-connect', {
    body: { action: 'onboard' },
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not start Connect onboarding.')
  }
  if (data?.error) throw new Error(String(data.error))
  if (!data?.url) throw new Error('Connect URL missing from server.')
  window.location.assign(data.url)
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function refreshCreatorFanConnectStatus(supabaseClient) {
  const { data, error, response } = await supabaseClient.functions.invoke('creator-fan-connect', {
    body: { action: 'refresh' },
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not refresh Connect status.')
  }
  if (data?.error) throw new Error(String(data.error))
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} creatorUserId
 */
export async function startCreatorFanCheckout(supabaseClient, creatorUserId) {
  const { data, error, response } = await supabaseClient.functions.invoke('creator-fan-checkout', {
    body: { creator_user_id: creatorUserId },
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not start checkout.')
  }
  if (data?.error) throw new Error(String(data.error))
  if (!data?.url) throw new Error('Checkout URL missing.')
  window.location.assign(data.url)
}

/**
 * Stripe Customer Portal cancel flow for one creator fan sub (uses real sub_ id from creator_subscriptions).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} creatorUserId
 */
export async function openCreatorFanBillingPortal(supabaseClient, creatorUserId) {
  const id = String(creatorUserId || '').trim()
  if (!id) throw new Error('Creator id required.')
  const { data, error, response } = await supabaseClient.functions.invoke('stripe-create-portal-session', {
    body: { creator_user_id: id },
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

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function fetchCreatorFanOffer(supabaseClient, creatorUserId) {
  const { data, error } = await supabaseClient.rpc('get_creator_fan_offer', {
    p_creator_user_id: creatorUserId,
  })
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  if (data.enabled !== true) return null
  if (data.offer_complete !== true) return null
  return data
}
