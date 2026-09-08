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
 * Edge-user directory for tournament swaps (same row shape as Logbook partner picker).
 * Connections (followers ∪ following) first, then everyone else A→Z.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} viewerUserId
 */
export async function fetchEdgeUserDirectoryPickerData(supabaseClient, viewerUserId) {
  const uid = String(viewerUserId || '').trim()
  if (!uid) {
    return {
      candidates: [],
      viewerFollowingIds: new Set(),
      connectionIds: new Set(),
      error: null,
    }
  }

  const network = await fetchPlayLogPartnerPickerData(supabaseClient, uid)
  const connectionIds = new Set(
    (network.candidates || []).map((p) => String(p.user_id || '')).filter(Boolean),
  )

  const { data: allRows, error: allErr } = await supabaseClient
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url, role, is_og')
    .is('banned_at', null)
    .neq('user_id', uid)
    .or('is_bot.is.null,is_bot.eq.false')
    .not('handle', 'is', null)
    .order('display_name', { ascending: true, nullsFirst: false })
    .limit(800)

  if (allErr) {
    return {
      candidates: network.candidates || [],
      viewerFollowingIds: network.viewerFollowingIds || new Set(),
      connectionIds,
      error: network.error || allErr.message,
    }
  }

  /** @type {Map<string, object>} */
  const byId = new Map()
  for (const p of network.candidates || []) {
    const id = String(p?.user_id || '')
    if (id) byId.set(id, p)
  }
  for (const p of allRows || []) {
    const id = String(p?.user_id || '')
    if (!id || id === uid || byId.has(id)) continue
    byId.set(id, p)
  }

  const rest = [...byId.values()]
    .filter((p) => !connectionIds.has(String(p.user_id)))
    .sort((a, b) =>
      playLogPartnerLabel(a).localeCompare(playLogPartnerLabel(b), undefined, {
        sensitivity: 'base',
      }),
    )

  const candidates = [...(network.candidates || []), ...rest]
  const ids = candidates.map((p) => String(p.user_id)).filter(Boolean)
  let viewerFollowingIds = network.viewerFollowingIds || new Set()
  if (ids.length > 0) {
    const among = await fetchViewerFollowingAmong(supabaseClient, uid, ids)
    viewerFollowingIds = new Set([...viewerFollowingIds, ...among])
  }

  return {
    candidates,
    viewerFollowingIds,
    connectionIds,
    error: network.error || null,
  }
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

const PLAY_LOG_PARTNER_SESSION_CHUNK = 80

/**
 * Partners for every shared session the viewer can see (RLS). Used by Ledger.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string[]} sessionIds
 * @returns {Promise<Map<string, object[]>>}
 */
export async function fetchPlayLogSessionPartnersBySessionIds(supabaseClient, sessionIds) {
  const ids = [...new Set((sessionIds || []).filter(Boolean).map(id => String(id)))]
  /** @type {Map<string, object[]>} */
  const bySession = new Map()
  if (!ids.length) return bySession

  /** @type {object[]} */
  const rows = []
  for (let i = 0; i < ids.length; i += PLAY_LOG_PARTNER_SESSION_CHUNK) {
    const chunk = ids.slice(i, i + PLAY_LOG_PARTNER_SESSION_CHUNK)
    const { data, error } = await supabaseClient
      .from('play_log_session_partners')
      .select('id, session_id, participant_kind, user_id, guest_label, share_percent, is_manager, paid')
      .in('session_id', chunk)
    if (error) throw error
    rows.push(...(data || []))
  }

  const userIds = [
    ...new Set(
      rows
        .map(row => (row.user_id ? String(row.user_id) : ''))
        .filter(Boolean),
    ),
  ]
  /** @type {Map<string, { handle?: string, display_name?: string, avatar_url?: string }>} */
  const profilesById = new Map()
  for (let i = 0; i < userIds.length; i += PLAY_LOG_PARTNER_SESSION_CHUNK) {
    const chunk = userIds.slice(i, i + PLAY_LOG_PARTNER_SESSION_CHUNK)
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('user_id, handle, display_name, avatar_url')
      .in('user_id', chunk)
    if (error) throw error
    for (const profile of data || []) {
      profilesById.set(String(profile.user_id), profile)
    }
  }

  for (const row of rows) {
    const sid = String(row.session_id || '')
    if (!sid) continue
    const profile = row.user_id ? profilesById.get(String(row.user_id)) : null
    const list = bySession.get(sid) || []
    list.push({
      ...row,
      handle: profile?.handle || '',
      display_name: profile?.display_name || '',
      avatar_url: profile?.avatar_url || '',
    })
    bySession.set(sid, list)
  }
  return bySession
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
 *   templateId?: string | null,
 * }} args
 */
export async function updatePlayLogSharedSession(supabaseClient, args) {
  if (args.templateId) {
    const { error: templateError } = await supabaseClient.rpc(
      'play_log_set_shared_session_template',
      {
        p_session_id: args.sessionId,
        p_template_id: args.templateId,
      },
    )
    if (templateError) throw templateError
  }
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

function isPlayLogLedgerSettlementsMissingError(error) {
  if (!error) return false
  const code = String(error.code || '')
  const msg = String(error.message || '').toLowerCase()
  if (code === '42P01' || code === 'PGRST205') return true
  if (msg.includes('play_log_ledger_settlements')) return true
  return false
}

/**
 * Pairwise Settle All history visible to actor and counterpart.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function fetchPlayLogLedgerSettlements(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('play_log_ledger_settlements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    if (isPlayLogLedgerSettlementsMissingError(error)) return []
    throw error
  }
  const rows = data || []
  const userIds = [
    ...new Set(
      rows.flatMap(row =>
        [row.actor_user_id, row.counterpart_user_id].map(id => String(id || '').trim()).filter(Boolean),
      ),
    ),
  ]
  /** @type {Map<string, { handle?: string, display_name?: string, avatar_url?: string }>} */
  const profilesById = new Map()
  if (userIds.length) {
    const { data: profiles, error: profErr } = await supabaseClient
      .from('profiles')
      .select('user_id, handle, display_name, avatar_url')
      .in('user_id', userIds)
    if (!profErr) {
      for (const profile of profiles || []) {
        profilesById.set(String(profile.user_id), profile)
      }
    }
  }
  return rows.map(row => {
    const actor = profilesById.get(String(row.actor_user_id || '')) || {}
    const counterpart = profilesById.get(String(row.counterpart_user_id || '')) || {}
    return {
      ...row,
      actorHandle: actor.handle || '',
      actorDisplayName: actor.display_name || '',
      counterpartHandle: counterpart.handle || '',
      counterpartDisplayName: counterpart.display_name || '',
    }
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} actorUserId
 * @param {object[]} records
 */
export async function insertPlayLogLedgerSettlements(supabaseClient, actorUserId, records) {
  const uid = String(actorUserId || '').trim()
  const payload = (records || [])
    .filter(Boolean)
    .map(row => ({
      actor_user_id: uid,
      counterpart_kind: row.counterpart_kind,
      counterpart_user_id: row.counterpart_kind === 'user' ? row.counterpart_user_id : null,
      counterpart_guest_label:
        row.counterpart_kind === 'guest' ? row.counterpart_guest_label : null,
      they_owe_you: row.they_owe_you,
      you_owe_them: row.you_owe_them,
      net: row.net,
      play_count: row.play_count,
      session_ids: row.session_ids || [],
      message: row.message,
    }))
  if (!payload.length) return []
  const { data, error } = await supabaseClient
    .from('play_log_ledger_settlements')
    .insert(payload)
    .select('*')
  if (error) {
    if (isPlayLogLedgerSettlementsMissingError(error)) return []
    throw error
  }
  return data || []
}

/**
 * Counterpart updates their own books for a Settle All row.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} settlementId
 */
export async function acceptPlayLogLedgerSettlement(supabaseClient, settlementId) {
  const id = String(settlementId || '').trim()
  if (!id) throw new Error('Settlement required')
  const { data, error } = await supabaseClient.rpc('play_log_ledger_accept_settlement', {
    p_id: id,
  })
  if (error) {
    const code = String(error.code || '')
    if (
      code === 'PGRST202' ||
      code === '42883' ||
      isPlayLogLedgerSettlementsMissingError(error)
    ) {
      throw new Error(
        'Ledger accept needs SQL 20260907230000_play_log_ledger_settled_notify.sql on this project.',
      )
    }
    throw error
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) throw new Error('Settlement not found or already updated')
  return row
}
