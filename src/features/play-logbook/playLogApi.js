import {
  fetchProfileFollowListProfiles,
  fetchViewerFollowingAmong,
} from '../lounge/loungeProfileFollowList.js'
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

function sortPartnerProfiles(rows, viewerUserId) {
  const uid = String(viewerUserId || '').trim()
  return (rows || [])
    .filter(p => {
      const id = String(p?.user_id || '')
      return id && id !== uid
    })
    .sort((a, b) =>
      playLogPartnerLabel(a).localeCompare(playLogPartnerLabel(b), undefined, { sensitivity: 'base' }),
    )
}

/** @param {object[]} profiles @param {string} viewerUserId @param {Map<string, number>} partnerCounts */
function sortProfilesByPartnerCount(profiles, viewerUserId, partnerCounts) {
  const uid = String(viewerUserId || '').trim()
  return [...(profiles || [])].sort((a, b) => {
    const ca = partnerCounts.get(String(a.user_id)) || 0
    const cb = partnerCounts.get(String(b.user_id)) || 0
    if (cb !== ca) return cb - ca
    return playLogPartnerLabel(a).localeCompare(playLogPartnerLabel(b), undefined, {
      sensitivity: 'base',
    })
  })
}

/**
 * How often each user appeared as a partner on plays the viewer can see.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 */
export async function fetchPlayLogPartnerUserCounts(supabaseClient, viewerUserId) {
  const uid = String(viewerUserId || '').trim()
  const { data, error } = await supabaseClient
    .from('play_log_session_partners')
    .select('user_id')
    .eq('participant_kind', 'user')
  if (error) throw error
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const row of data || []) {
    const id = String(row.user_id || '').trim()
    if (!id || id === uid) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  return counts
}

/**
 * Guest label usage across visible shared plays (for picker ordering).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function fetchPlayLogGuestUsageCounts(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('play_log_session_partners')
    .select('guest_label')
    .eq('participant_kind', 'guest')
  if (error) throw error
  /** @type {Map<string, { label: string, count: number }>} */
  const counts = new Map()
  for (const row of data || []) {
    const label = String(row.guest_label || '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    const prev = counts.get(key)
    counts.set(key, { label, count: (prev?.count || 0) + 1 })
  }
  return counts
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 */
export async function fetchPlayLogPartnerCandidates(supabaseClient, viewerUserId) {
  const data = await fetchPlayLogPartnerPickerData(supabaseClient, viewerUserId)
  if (data.error) throw new Error(data.error)
  return data.candidates
}

/**
 * Partner picker: merged list + who the viewer already follows (for Follow buttons).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 */
export async function fetchPlayLogPartnerPickerData(supabaseClient, viewerUserId) {
  const uid = String(viewerUserId || '').trim()
  if (!uid) {
    return { candidates: [], viewerFollowingIds: new Set(), error: null }
  }

  try {
    const [followingRes, followersRes] = await Promise.all([
      fetchProfileFollowListProfiles(supabaseClient, uid, 'following'),
      fetchProfileFollowListProfiles(supabaseClient, uid, 'followers'),
    ])
    if (followingRes.error) throw followingRes.error
    if (followersRes.error) throw followersRes.error

    const viewerFollowingIds = new Set(
      (followingRes.profiles || []).map(p => String(p.user_id)).filter(id => id && id !== uid),
    )
    const byId = new Map()
    for (const p of [...(followingRes.profiles || []), ...(followersRes.profiles || [])]) {
      const id = String(p?.user_id || '')
      if (!id || id === uid) continue
      byId.set(id, p)
    }
    let candidates = [...byId.values()]
    try {
      const partnerCounts = await fetchPlayLogPartnerUserCounts(supabaseClient, uid)
      candidates = sortProfilesByPartnerCount(candidates, uid, partnerCounts)
    } catch {
      candidates.sort((a, b) =>
        playLogPartnerLabel(a).localeCompare(playLogPartnerLabel(b), undefined, { sensitivity: 'base' }),
      )
    }
    return { candidates, viewerFollowingIds, error: null }
  } catch (e) {
    try {
      const { data, error } = await supabaseClient.rpc('play_log_partner_candidates')
      if (error) throw error
      let candidates = sortPartnerProfiles(Array.isArray(data) ? data : [], uid)
      try {
        const partnerCounts = await fetchPlayLogPartnerUserCounts(supabaseClient, uid)
        candidates = sortProfilesByPartnerCount(candidates, uid, partnerCounts)
      } catch {
        /* keep alpha sort */
      }
      const ids = candidates.map(p => String(p.user_id)).filter(Boolean)
      const viewerFollowingIds = await fetchViewerFollowingAmong(supabaseClient, uid, ids)
      return { candidates, viewerFollowingIds, error: null }
    } catch (fallbackErr) {
      const msg =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : e instanceof Error
            ? e.message
            : 'Could not load partners.'
      return { candidates: [], viewerFollowingIds: new Set(), error: msg }
    }
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

/** PostgREST 404 / PGRST202 when `play_log_update_session_partners_paid` is not deployed. */
export function isPlayLogPartnersPaidRpcMissingError(error) {
  if (!error) return false
  const code = String(error.code || '')
  const msg = String(error.message || '').toLowerCase()
  const status = Number(error.status ?? error.statusCode ?? 0)
  if (status === 404) return true
  if (code === 'PGRST202' || code === '42883') return true
  if (msg.includes('play_log_update_session_partners_paid')) return true
  if (msg.includes('could not find the function')) return true
  if (msg.includes('function') && msg.includes('does not exist')) return true
  return false
}

/**
 * Creator or play manager - update paid flags only.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ sessionId: string, partners: unknown[] }} args
 */
export async function updatePlayLogSessionPartnersPaid(supabaseClient, args) {
  const { error } = await supabaseClient.rpc('play_log_update_session_partners_paid', {
    p_session_id: args.sessionId,
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
