/** @typedef {'user' | 'moderator' | 'admin'} ProfileStaffRole */

/**
 * Admin-only: set another member's `profiles.role` via RPC.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} targetUserId
 * @param {ProfileStaffRole} role
 */
export async function adminSetProfileRole(supabaseClient, targetUserId, role) {
  const uid = String(targetUserId || '').trim()
  if (!uid) {
    return { data: null, error: new Error('Missing profile user id.') }
  }
  const nextRole = String(role || '').trim().toLowerCase()
  if (nextRole !== 'user' && nextRole !== 'moderator' && nextRole !== 'admin') {
    return { data: null, error: new Error('Invalid role.') }
  }

  const { data, error } = await supabaseClient.rpc('admin_set_profile_role', {
    p_target_user_id: uid,
    p_role: nextRole,
  })

  if (error) return { data: null, error }
  const row = Array.isArray(data) ? data[0] : data
  return { data: row || null, error: null }
}
