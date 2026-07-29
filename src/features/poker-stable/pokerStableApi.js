/**
 * Thin Stable Manager API. Graceful when migration not yet applied on the env.
 */

export function isMissingStableTableError(err) {
  const msg = String(err?.message || err?.details || '')
  const code = String(err?.code || '')
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /poker_stable_deals|poker_deal_bankroll/i.test(msg) ||
    /Could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  )
}

/** @param {string} raw */
export function normalizeHandleInput(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} handle
 */
export async function lookupProfileByHandle(supabase, handle) {
  const h = normalizeHandleInput(handle)
  if (!h) return { profile: null, error: new Error('Enter a handle.') }
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .ilike('handle', h)
    .maybeSingle()
  if (error) return { profile: null, error }
  if (!data) return { profile: null, error: new Error(`No Edge user @${h}.`) }
  return { profile: data, error: null }
}

/**
 * Deals where I am staker (horses) or stakee (incoming / my On Stake deals).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadMyStableDeals(supabase, userId) {
  const { data, error } = await supabase
    .from('poker_stable_deals')
    .select(
      'id, staker_user_id, stakee_user_id, status, label, notes, created_at, updated_at, responded_at',
    )
    .or(`staker_user_id.eq.${userId},stakee_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
  if (error) return { deals: [], error }
  return { deals: data || [], error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} dealIds
 */
export async function loadDealBankrollProfiles(supabase, dealIds) {
  /** @type {Record<string, { deal_id: string, overall_bankroll: number }>} */
  const byDeal = {}
  if (!dealIds.length) return { byDeal, error: null }
  const { data, error } = await supabase
    .from('poker_deal_bankroll_profiles')
    .select('deal_id, overall_bankroll')
    .in('deal_id', dealIds)
  if (error) return { byDeal, error }
  for (const row of data || []) byDeal[row.deal_id] = row
  return { byDeal, error: null }
}

/**
 * Profiles for the other party on each deal.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ staker_user_id: string, stakee_user_id: string }>} deals
 * @param {string} selfUserId
 */
export async function loadDealCounterpartyProfiles(supabase, deals, selfUserId) {
  const ids = [
    ...new Set(
      (deals || [])
        .map((d) => (d.staker_user_id === selfUserId ? d.stakee_user_id : d.staker_user_id))
        .filter(Boolean),
    ),
  ]
  if (ids.length === 0) return { byId: {}, error: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .in('user_id', ids)
  if (error) return { byId: {}, error }
  /** @type {Record<string, object>} */
  const byId = {}
  for (const p of data || []) byId[p.user_id] = p
  return { byId, error: null }
}

/**
 * Session aggregates for active deals (staker sync / horse cards).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} dealIds
 */
export async function loadDealSessionStats(supabase, dealIds) {
  /** @type {Record<string, { sessions: number, profit: number }>} */
  const byDeal = {}
  for (const id of dealIds) byDeal[id] = { sessions: 0, profit: 0 }
  if (!dealIds.length) return { byDeal, error: null }

  const { data, error } = await supabase
    .from('poker_bankroll_sessions')
    .select('deal_id, buy_in, cash_out, bounty_winnings, status')
    .in('deal_id', dealIds)
    .eq('status', 'completed')
    .limit(2000)
  if (error) return { byDeal, error }

  for (const s of data || []) {
    const id = s.deal_id
    if (!id || !byDeal[id]) continue
    if (s.cash_out == null) continue
    const wl =
      (Number(s.cash_out) || 0) + (Number(s.bounty_winnings) || 0) - (Number(s.buy_in) || 0)
    byDeal[id].sessions += 1
    byDeal[id].profit += wl
  }
  return { byDeal, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ stakerUserId: string, stakeeUserId: string, label?: string, notes?: string }} args
 */
export async function requestHorseDeal(supabase, { stakerUserId, stakeeUserId, label, notes }) {
  if (stakerUserId === stakeeUserId) {
    return { deal: null, error: new Error('You cannot stake yourself.') }
  }
  const { data, error } = await supabase
    .from('poker_stable_deals')
    .insert({
      staker_user_id: stakerUserId,
      stakee_user_id: stakeeUserId,
      status: 'pending',
      label: label?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select('*')
    .single()
  return { deal: data || null, error }
}

/**
 * Stakee accepts → active + empty deal bankroll profile.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} stakeeUserId
 */
export async function acceptHorseDeal(supabase, dealId, stakeeUserId) {
  const { data: deal, error: uErr } = await supabase
    .from('poker_stable_deals')
    .update({
      status: 'active',
      responded_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('stakee_user_id', stakeeUserId)
    .eq('status', 'pending')
    .select('*')
    .single()
  if (uErr) return { deal: null, error: uErr }

  const { error: pErr } = await supabase.from('poker_deal_bankroll_profiles').upsert(
    { deal_id: dealId, overall_bankroll: 0 },
    { onConflict: 'deal_id' },
  )
  if (pErr) return { deal, error: pErr }
  return { deal, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} stakeeUserId
 */
export async function declineHorseDeal(supabase, dealId, stakeeUserId) {
  const { data, error } = await supabase
    .from('poker_stable_deals')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('stakee_user_id', stakeeUserId)
    .eq('status', 'pending')
    .select('*')
    .single()
  return { deal: data || null, error }
}

/**
 * Staker revokes an active/pending deal.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dealId
 * @param {string} stakerUserId
 */
export async function revokeHorseDeal(supabase, dealId, stakerUserId) {
  const { data, error } = await supabase
    .from('poker_stable_deals')
    .update({ status: 'revoked', responded_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('staker_user_id', stakerUserId)
    .in('status', ['pending', 'active'])
    .select('*')
    .single()
  return { deal: data || null, error }
}
