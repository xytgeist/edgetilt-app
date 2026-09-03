import {
  BOT_IMPERSONATE_OPEN_DOCK_KEY,
  BOT_IMPERSONATE_SETTINGS_FOCUS_KEY,
} from '../bots/botPortalApi.js'
import { openExternalBillingUrl } from '../../utils/edgeNative.js'

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

function stashCreatorFanConnectReturnNavigation() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(BOT_IMPERSONATE_OPEN_DOCK_KEY, 'settings')
  sessionStorage.setItem(BOT_IMPERSONATE_SETTINGS_FOCUS_KEY, 'subscriptions-fan')
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
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
  stashCreatorFanConnectReturnNavigation()
  await openExternalBillingUrl(data.url)
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
 * @param {string} [promoCode]
 */
export async function startCreatorFanCheckout(supabaseClient, creatorUserId, promoCode = '') {
  const body = { creator_user_id: creatorUserId }
  const code = String(promoCode || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (code) body.promo_code = code
  const { data, error, response } = await supabaseClient.functions.invoke('creator-fan-checkout', {
    body,
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not start checkout.')
  }
  if (data?.error) throw new Error(String(data.error))
  if (!data?.url) throw new Error('Checkout URL missing.')
  await openExternalBillingUrl(data.url)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function listCreatorFanPromoCodes(supabaseClient) {
  const { data, error, response } = await supabaseClient.functions.invoke('creator-fan-promo', {
    body: { action: 'list' },
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not load promo codes.')
  }
  if (data?.error) throw new Error(String(data.error))
  return Array.isArray(data?.codes) ? data.codes : []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {Record<string, unknown>} fields
 */
export async function createCreatorFanPromoCode(supabaseClient, fields) {
  const { data, error, response } = await supabaseClient.functions.invoke('creator-fan-promo', {
    body: { action: 'create', ...fields },
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not create promo code.')
  }
  if (data?.error) throw new Error(String(data.error))
  return data?.code || null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} id
 */
export async function deactivateCreatorFanPromoCode(supabaseClient, id) {
  const { data, error, response } = await supabaseClient.functions.invoke('creator-fan-promo', {
    body: { action: 'deactivate', id },
  })
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not deactivate promo code.')
  }
  if (data?.error) throw new Error(String(data.error))
  return data?.code || null
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
  await openExternalBillingUrl(data.url)
}

/**
 * Undo cancel-at-period-end for one creator fan sub (Stripe + creator_subscriptions).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} creatorUserId
 */
export async function resumeCreatorFanSubscription(supabaseClient, creatorUserId) {
  const id = String(creatorUserId || '').trim()
  if (!id) throw new Error('Creator id required.')
  const { data, error, response } = await supabaseClient.functions.invoke(
    'creator-fan-resume-subscription',
    {
      body: { creator_user_id: id },
    },
  )
  if (error) {
    const detail = await readEdgeFunctionError(response)
    throw new Error(detail || error.message || 'Could not resume subscription.')
  }
  if (data?.error) throw new Error(String(data.error))
  if (!data?.ok) throw new Error('Resume did not complete.')
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('edge:creator-fan-billing-return', {
        detail: { creatorUserId: id },
      }),
    )
  }
}

/**
 * Active creator fan subs for the signed-in user (from `get_my_creator_fan_entitlements`).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<Array<{
 *   creatorUserId: string,
 *   active: boolean,
 *   status: string,
 *   currentPeriodEnd: string | null,
 *   cancelAtPeriodEnd: boolean,
 *   fanTierKey: string,
 * }>>}
 */
export async function fetchMyCreatorFanSubscriptions(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('get_my_creator_fan_entitlements')
  if (error) {
    if (error.code === 'PGRST202') return []
    throw error
  }
  if (!data || typeof data !== 'object') return []

  /** @type {Array<{ creatorUserId: string, active: boolean, status: string, currentPeriodEnd: string | null, cancelAtPeriodEnd: boolean, fanTierKey: string }>} */
  const rows = []
  for (const [key, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue
    const grant = /** @type {Record<string, unknown>} */ (raw)
    const fromKey = String(key).replace(/^creator-fan:/, '').trim()
    const creatorUserId = String(grant.creator_user_id || fromKey).trim()
    if (!creatorUserId) continue
    rows.push({
      creatorUserId,
      active: Boolean(grant.active),
      status: typeof grant.status === 'string' ? grant.status : '',
      currentPeriodEnd:
        typeof grant.current_period_end === 'string' ? grant.current_period_end : null,
      cancelAtPeriodEnd: Boolean(grant.cancel_at_period_end),
      fanTierKey: typeof grant.fan_tier_key === 'string' ? grant.fan_tier_key : '',
    })
  }
  rows.sort((a, b) => a.creatorUserId.localeCompare(b.creatorUserId))
  return rows
}

const FAN_SUB_PROFILE_SELECT = 'user_id,handle,display_name,avatar_url'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string[]} creatorUserIds
 */
export async function fetchCreatorProfilesForFanSubs(supabaseClient, creatorUserIds) {
  const ids = [...new Set(creatorUserIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return {}
  const { data, error } = await supabaseClient.from('profiles').select(FAN_SUB_PROFILE_SELECT).in('user_id', ids)
  if (error) throw error
  /** @type {Record<string, { user_id: string, handle?: string, display_name?: string, avatar_url?: string }>} */
  const map = {}
  for (const row of data || []) {
    if (row?.user_id) map[String(row.user_id)] = row
  }
  return map
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function fetchCreatorFanOffer(supabaseClient, creatorUserId) {
  const { data, error } = await supabaseClient.rpc('get_creator_fan_offer', {
    p_creator_user_id: creatorUserId,
  })
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  if (data.enabled !== true) return null
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} [searchQuery]
 */
export async function listCreatorFanPrivateSubs(supabaseClient, searchQuery = '') {
  const { data, error } = await supabaseClient.rpc('list_creator_fan_private_subs', {
    p_search: searchQuery?.trim() || '',
  })
  if (error) {
    if (error.code === 'PGRST202') return []
    throw new Error(error.message || 'Could not load Private Subs.')
  }
  return Array.isArray(data) ? data : []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ title: string, description?: string, topicKeywords?: string, avatarUrl?: string | null }} fields
 */
export async function saveCreatorFanPrivateSubsRoom(supabaseClient, fields) {
  const { data, error } = await supabaseClient.rpc('creator_fan_update_room', {
    p_title: fields.title ?? '',
    p_description: fields.description ?? '',
    p_topic_keywords: fields.topicKeywords ?? '',
    p_avatar_url: fields.avatarUrl === undefined ? null : fields.avatarUrl,
  })
  if (error) throw new Error(error.message || 'Could not save fan chat room.')
  return data
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function fetchMyCreatorFanSubscriberStats(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('get_my_creator_fan_subscriber_stats')
  if (error) {
    if (error.code === 'PGRST202') return null
    throw error
  }
  return data && typeof data === 'object' ? data : null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ search?: string, limit?: number, offset?: number }} [opts]
 */
export async function listMyCreatorFanSubscribers(supabaseClient, opts = {}) {
  const { data, error } = await supabaseClient.rpc('list_my_creator_fan_subscribers', {
    p_search: opts.search ?? '',
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
  })
  if (error) {
    if (error.code === 'PGRST202') return []
    throw error
  }
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** @param {Array<Record<string, unknown>>} rows */
export function creatorFanSubscribersToCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const header = 'handle,display_name,tier_key,status,cancel_at_period_end,period_end,subscribed_at'
  const lines = rows.map((r) =>
    [
      esc(r.handle),
      esc(r.display_name),
      esc(r.fan_tier_key),
      esc(r.status),
      r.cancel_at_period_end ? 'yes' : 'no',
      esc(r.current_period_end),
      esc(r.subscribed_at),
    ].join(','),
  )
  return `${header}\n${lines.join('\n')}\n`
}
