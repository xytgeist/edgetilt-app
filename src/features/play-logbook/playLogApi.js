import { fetchProfileFollowListProfiles } from '../lounge/loungeProfileFollowList.js'
import { playLogPartnerLabel } from './playLogPartners.js'

/**
 * Same source as Lounge profile Following/Followers lists (followers ∪ following).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 */
export async function fetchPlayLogPartnerCandidatesFromFollowLists(supabaseClient, viewerUserId) {
  const uid = String(viewerUserId || '').trim()
  if (!uid) return []

  const [followingRes, followersRes] = await Promise.all([
    fetchProfileFollowListProfiles(supabaseClient, uid, 'following'),
    fetchProfileFollowListProfiles(supabaseClient, uid, 'followers'),
  ])
  if (followingRes.error) throw followingRes.error
  if (followersRes.error) throw followersRes.error

  const byId = new Map()
  for (const p of [...(followingRes.profiles || []), ...(followersRes.profiles || [])]) {
    const id = String(p?.user_id || '')
    if (!id || id === uid) continue
    byId.set(id, p)
  }

  return [...byId.values()].sort((a, b) =>
    playLogPartnerLabel(a).localeCompare(playLogPartnerLabel(b), undefined, { sensitivity: 'base' }),
  )
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 */
export async function fetchPlayLogPartnerCandidates(supabaseClient, viewerUserId) {
  try {
    return await fetchPlayLogPartnerCandidatesFromFollowLists(supabaseClient, viewerUserId)
  } catch {
    const { data, error } = await supabaseClient.rpc('play_log_partner_candidates')
    if (error) throw error
    return Array.isArray(data) ? data : []
  }
}
/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} sessionId
 */
export async function fetchPlayLogSessionPartners(supabaseClient, sessionId) {
  const { data, error } = await supabaseClient.rpc('play_log_session_partners_list', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return Array.isArray(data) ? data : []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   templateId: string,
 *   capturedAt: string,
 *   casinoName: string | null,
 *   notes: string | null,
 *   values: Record<string, unknown>,
 *   partners: unknown[],
 * }} args
 */
export async function savePlayLogSharedSession(supabaseClient, args) {
  const { data, error } = await supabaseClient.rpc('play_log_save_shared_session', {
    p_template_id: args.templateId,
    p_captured_at: args.capturedAt,
    p_casino_name: args.casinoName,
    p_notes: args.notes,
    p_values: args.values,
    p_partners: args.partners,
  })
  if (error) throw error
  return data
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   sessionId: string,
 *   capturedAt: string,
 *   casinoName: string | null,
 *   notes: string | null,
 *   values: Record<string, unknown>,
 *   partners: unknown[],
 * }} args
 */
export async function updatePlayLogSharedSession(supabaseClient, args) {
  const { error } = await supabaseClient.rpc('play_log_update_shared_session', {
    p_session_id: args.sessionId,
    p_captured_at: args.capturedAt,
    p_casino_name: args.casinoName,
    p_notes: args.notes,
    p_values: args.values,
    p_partners: args.partners,
  })
  if (error) throw error
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} sessionId
 */
export async function deletePlayLogSharedSession(supabaseClient, sessionId) {
  const { error } = await supabaseClient.rpc('play_log_delete_shared_session', {
    p_session_id: sessionId,
  })
  if (error) throw error
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string[]} sessionIds
 */
export async function fetchPlayLogSessionsMeta(supabaseClient, sessionIds) {
  const ids = [...new Set((sessionIds || []).filter(Boolean))]
  if (!ids.length) return new Map()
  const { data, error } = await supabaseClient
    .from('play_log_sessions')
    .select('id, created_by_user_id')
    .in('id', ids)
  if (error) throw error
  return new Map((data || []).map(row => [String(row.id), row]))
}
