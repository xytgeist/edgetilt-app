/**
 * Admin-only: comp grant / revoke Slots Edge Lifetime (entitlement, not staff role).
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} targetUserId
 */
export async function adminMemberSlotsEntitlements(supabaseClient, targetUserId) {
  const uid = String(targetUserId || '').trim()
  if (!uid) {
    return { data: null, error: new Error('Missing profile user id.') }
  }

  const { data, error } = await supabaseClient.rpc('admin_member_slots_entitlements', {
    p_target_user_id: uid,
  })

  if (error) return { data: null, error }
  return { data: data && typeof data === 'object' ? data : null, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} targetUserId
 */
export async function adminCompSlotsEdgeLifetime(supabaseClient, targetUserId) {
  const uid = String(targetUserId || '').trim()
  if (!uid) {
    return { data: null, error: new Error('Missing profile user id.') }
  }

  const { data, error } = await supabaseClient.rpc('admin_comp_slots_edge_lifetime', {
    p_target_user_id: uid,
  })

  if (error) return { data: null, error }
  return { data: data && typeof data === 'object' ? data : null, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} targetUserId
 */
export async function adminRevokeCompSlotsEdgeLifetime(supabaseClient, targetUserId) {
  const uid = String(targetUserId || '').trim()
  if (!uid) {
    return { data: null, error: new Error('Missing profile user id.') }
  }

  const { data, error } = await supabaseClient.rpc('admin_revoke_comp_slots_edge_lifetime', {
    p_target_user_id: uid,
  })

  if (error) return { data: null, error }
  return { data: data && typeof data === 'object' ? data : null, error: null }
}
