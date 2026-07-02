/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} productSlug
 * @param {{ priceInterval?: 'monthly' | 'annual', applyEarlyBird?: boolean }} [options]
 */
export async function startEdgeCheckout(supabaseClient, productSlug, options = {}) {
  const { priceInterval = 'monthly', applyEarlyBird = true } = options
  const { data, error } = await supabaseClient.functions.invoke('stripe-create-checkout-session', {
    body: {
      product_slug: productSlug,
      price_interval: priceInterval,
      apply_early_bird: applyEarlyBird,
    },
  })
  if (error) {
    throw new Error(error.message || 'Could not start checkout.')
  }
  if (data?.error) {
    throw new Error(String(data.error))
  }
  if (!data?.url) {
    throw new Error('Checkout URL missing from server response.')
  }
  window.location.assign(data.url)
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function openBillingPortal(supabaseClient) {
  const { data, error } = await supabaseClient.functions.invoke('stripe-create-portal-session', {
    body: {},
  })
  if (error) {
    throw new Error(error.message || 'Could not open billing portal.')
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
  const { data, error } = await supabaseClient.rpc('get_my_entitlements')
  if (error) {
    if (error.code === 'PGRST202' || error.message?.includes('get_my_entitlements')) {
      return {}
    }
    throw error
  }
  return data && typeof data === 'object' ? data : {}
}
