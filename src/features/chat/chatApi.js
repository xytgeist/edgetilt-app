import { loungeChatInvoke } from '../../utils/loungeChatApi.js'

/** @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient */

/**
 * Open or retrieve a DM room with the given peer user.
 * @param {SupabaseClient} supabase
 * @param {string} peerUserId
 * @returns {Promise<{ room_id: string }>}
 */
export function chatOpenDm(supabase, peerUserId) {
  return loungeChatInvoke(supabase, { action: 'open_dm', peer_user_id: peerUserId })
}

/**
 * Create a new group chat with a title and list of member user IDs.
 * @param {SupabaseClient} supabase
 * @param {{ title: string, memberUserIds: string[] }} opts
 * @returns {Promise<{ room_id: string }>}
 */
export function chatCreateGroup(supabase, { title, memberUserIds }) {
  return loungeChatInvoke(supabase, { action: 'create_group', title, member_user_ids: memberUserIds })
}

/**
 * Generate a short unique key for send idempotency.
 * @returns {string}
 */
function newIdempotencyKey() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/**
 * Send a message, optionally as a reply to another message.
 * Generates an idempotency key per call so automatic retries and rapid
 * double-taps don't produce duplicate messages.
 * Pass `idempotencyKey` to supply a pre-generated key (e.g. from a video prep job).
 * @param {SupabaseClient} supabase
 * @param {{ roomId: string, body: string, imageUrls?: string[], videoUrl?: string | null, streamVideoUid?: string | null, streamPosterUrl?: string | null, streamVideoWidth?: number | null, streamVideoHeight?: number | null, replyToMessageId?: string | null, idempotencyKey?: string | null, clientCreatedAt?: string | null }} opts
 */
export function chatSendMessage(supabase, {
  roomId,
  body,
  imageUrls = [],
  hasPendingImages = false,
  videoUrl = null,
  streamVideoUid = null,
  streamPosterUrl = null,
  streamVideoWidth = null,
  streamVideoHeight = null,
  replyToMessageId = null,
  idempotencyKey = null,
  clientCreatedAt = null,
}) {
  return loungeChatInvoke(supabase, {
    action: 'send_message',
    room_id: roomId,
    body,
    image_urls: imageUrls,
    has_pending_images: hasPendingImages || undefined,
    video_url:           videoUrl         || undefined,
    stream_video_uid:    streamVideoUid    || undefined,
    stream_poster_url:   streamPosterUrl   || undefined,
    stream_video_width:  streamVideoWidth  ?? undefined,
    stream_video_height: streamVideoHeight ?? undefined,
    reply_to_message_id: replyToMessageId  || undefined,
    idempotency_key: idempotencyKey || newIdempotencyKey(),
    client_created_at: clientCreatedAt || undefined,
  })
}

/**
 * Patch image_urls on a sent message (background upload completion).
 * @param {SupabaseClient} supabase
 * @param {string} messageId
 * @param {string[]} imageUrls
 */
export function chatUpdateMessageImageUrls(supabase, messageId, imageUrls) {
  return loungeChatInvoke(supabase, { action: 'update_image_urls', message_id: messageId, image_urls: imageUrls })
}

/**
 * Soft-delete a message.
 * @param {SupabaseClient} supabase
 * @param {string} messageId
 */
export function chatDeleteMessage(supabase, messageId) {
  return loungeChatInvoke(supabase, { action: 'delete_message', message_id: messageId })
}

/**
 * Add an emoji reaction to a message.
 * @param {SupabaseClient} supabase
 * @param {string} messageId
 * @param {string} emoji
 */
export function chatAddReaction(supabase, messageId, emoji) {
  return loungeChatInvoke(supabase, { action: 'add_reaction', message_id: messageId, emoji })
}

/**
 * Remove an emoji reaction from a message.
 * @param {SupabaseClient} supabase
 * @param {string} messageId
 * @param {string} emoji
 */
export function chatRemoveReaction(supabase, messageId, emoji) {
  return loungeChatInvoke(supabase, { action: 'remove_reaction', message_id: messageId, emoji })
}

/**
 * Per-user reaction rows for attribution sheet.
 * @param {SupabaseClient} supabase
 * @param {string} messageId
 */
export async function chatMessageReactionsPage(supabase, messageId) {
  const { data, error } = await supabase.rpc('chat_message_reactions_page', {
    p_message_id: messageId,
  })
  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Mark the latest read message in a room.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} messageId
 */
export function chatUpdateLastRead(supabase, roomId, messageId) {
  return loungeChatInvoke(supabase, { action: 'update_last_read', room_id: roomId, message_id: messageId })
}

/**
 * Peer read positions for delivered/read UI (respects mutual read-receipt privacy).
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<{ viewer_receipts_enabled: boolean, members: import('./chatReceiptStatus.js').ChatPeerReadState[] }>}
 */
export async function chatRoomReadReceipts(supabase, roomId) {
  const { data, error } = await supabase.rpc('chat_room_read_receipts', { p_room_id: roomId })
  if (error) throw new Error(error.message)
  const payload = data && typeof data === 'object' ? data : {}
  return {
    viewer_receipts_enabled: payload.viewer_receipts_enabled !== false,
    members: Array.isArray(payload.members) ? payload.members : [],
  }
}

/**
 * @param {SupabaseClient} supabase
 * @param {string} userId
 */
export async function chatFetchReadReceiptsEnabled(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('chat_read_receipts_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (/chat_read_receipts_enabled/i.test(error.message || '')) return true
    throw new Error(error.message)
  }
  return data?.chat_read_receipts_enabled !== false
}

/**
 * @param {SupabaseClient} supabase
 * @param {string} userId
 * @param {boolean} enabled
 */
export async function chatSetReadReceiptsEnabled(supabase, userId, enabled) {
  const { error } = await supabase
    .from('profiles')
    .update({ chat_read_receipts_enabled: enabled })
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

async function chatInboxRpc(supabase, fn, params) {
  const { error } = await supabase.rpc(fn, params)
  if (error) throw new Error(error.message)
}

/**
 * Mark a room as unread (clears last_read_at).
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 */
export function chatMarkUnread(supabase, roomId) {
  return chatInboxRpc(supabase, 'chat_mark_room_unread', { p_room_id: roomId })
}

/**
 * Pin a room to the top of the inbox.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 */
export function chatPinRoom(supabase, roomId) {
  return chatInboxRpc(supabase, 'chat_set_room_pinned', { p_room_id: roomId, p_pinned: true })
}

/**
 * Unpin a room.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 */
export function chatUnpinRoom(supabase, roomId) {
  return chatInboxRpc(supabase, 'chat_set_room_pinned', { p_room_id: roomId, p_pinned: false })
}

/**
 * Leave (delete from inbox) a room.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 */
export function chatLeaveRoom(supabase, roomId) {
  return chatInboxRpc(supabase, 'chat_leave_room', { p_room_id: roomId })
}

/**
 * Archive a room (hide from inbox; membership retained).
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 */
export function chatArchiveRoom(supabase, roomId) {
  return chatInboxRpc(supabase, 'chat_archive_room', { p_room_id: roomId })
}

/**
 * Restore an archived room to the main inbox.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 */
export function chatUnarchiveRoom(supabase, roomId) {
  return chatInboxRpc(supabase, 'chat_unarchive_room', { p_room_id: roomId })
}

/**
 * Count of archived conversations for the signed-in user.
 * @param {SupabaseClient} supabase
 */
export async function chatArchivedRoomCount(supabase) {
  const { data, error } = await supabase.rpc('chat_archived_room_count')
  if (error) throw error
  return Number(data) || 0
}

/**
 * Map `chat_rooms_for_user` / `chat_archived_rooms_for_user` RPC rows to inbox UI rows.
 * @param {unknown[] | null | undefined} rows
 * @param {string} viewerUserId
 * @param {Record<string, unknown>} [profilesCache]
 */
export function mapChatRoomsRpcRows(rows, viewerUserId, profilesCache = {}) {
  return (rows || []).map((r) => {
    if (r.peer_user_id) {
      profilesCache[r.peer_user_id] = {
        user_id: r.peer_user_id,
        handle: r.peer_handle,
        display_name: r.peer_display_name,
        avatar_url: r.peer_avatar_url,
      }
    }
    if (r.last_message_sender_id && r.sender_handle) {
      profilesCache[r.last_message_sender_id] = {
        ...profilesCache[r.last_message_sender_id],
        user_id: r.last_message_sender_id,
        handle: r.sender_handle,
        display_name: r.sender_display_name,
      }
    }
    return enrichChatRoomRow(r, viewerUserId)
  })
}

/**
 * Delete a group chat for all members (owner or admin).
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 */
export function chatDeleteGroup(supabase, roomId) {
  return chatInboxRpc(supabase, 'chat_delete_group', { p_room_id: roomId })
}

/**
 * Mute push notifications for a room.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {number} [muteHours=8] - 0 = indefinite
 */
export function chatMuteRoom(supabase, roomId, muteHours = 8) {
  return loungeChatInvoke(supabase, { action: 'mute_room', room_id: roomId, mute_hours: muteHours })
}

/**
 * Unmute a room.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 */
export function chatUnmuteRoom(supabase, roomId) {
  return loungeChatInvoke(supabase, { action: 'unmute_room', room_id: roomId })
}

/**
 * Join a subscriber topic channel.
 * @param {SupabaseClient} supabase
 * @param {string} slug
 */
export function chatJoinChannel(supabase, slug) {
  return loungeChatInvoke(supabase, { action: 'join_channel', slug })
}

/**
 * Derive a human-readable label for a chat room.
 * @param {{ kind: string, title?: string | null, slug?: string | null, dm_key?: string | null, peerLabel?: string | null, peer_display_name?: string | null }} room
 * @returns {string}
 */
/**
 * Normalize a `chat_rooms_for_user` row for inbox + conversation props.
 * @param {Record<string, unknown>} r
 * @param {string} viewerUserId
 */
/** Minimal DM row so conversation can open before inbox refresh catches up. */
export function buildProvisionalDmRoom(roomId, peerProfile, viewerUserId) {
  return enrichChatRoomRow(
    {
      id: roomId,
      kind: 'dm',
      peer_user_id: peerProfile.user_id,
      peer_handle: peerProfile.handle,
      peer_display_name: peerProfile.display_name,
      peer_avatar_url: peerProfile.avatar_url ?? null,
      member_role: 'member',
      has_unread: false,
      muted_until: null,
    },
    viewerUserId,
  )
}

export function enrichChatRoomRow(r, viewerUserId) {
  const peerLabel = (r.peer_display_name && String(r.peer_display_name).trim())
    || (r.peer_handle ? `@${r.peer_handle}` : null)
  const senderName = r.last_message_sender_id === viewerUserId
    ? 'You'
    : r.sender_handle
      ? `@${r.sender_handle}`
      : r.sender_display_name || ''
  const previewText = r.last_message_preview
    ? (senderName ? `${senderName}: ${r.last_message_preview}` : r.last_message_preview)
    : null
  return {
    ...r,
    peerLabel,
    peerAvatarUrl: r.peer_avatar_url || null,
    previewText,
    memberRole: r.member_role || 'member',
    member_role: r.member_role || 'member',
    created_by: r.created_by || null,
    avatar_url: r.avatar_url || null,
    description: r.description || null,
    hasUnread: Boolean(r.has_unread),
    isMuted: chatRoomIsMuted(r.muted_until),
  }
}

/** Load one room row for the viewer (for dock/deep-link open before inbox list catches up). */
export async function chatFetchRoomForViewer(supabase, roomId, viewerUserId) {
  const { data, error } = await supabase.rpc('chat_rooms_for_user', { p_user_id: viewerUserId })
  if (error) throw new Error(error.message)
  const row = (data || []).find((r) => r.id === roomId)
  return row ? enrichChatRoomRow(row, viewerUserId) : null
}

export function chatRoomLabel(room) {
  if (room.kind === 'dm') {
    const name = room.peer_display_name && String(room.peer_display_name).trim()
    return name || room.peerLabel || 'Direct message'
  }
  if (room.kind === 'channel') return room.title ? `#${room.slug} · ${room.title}` : `#${room.slug}`
  if (room.kind === 'creator_fan') return room.title || 'Private Sub'
  if (room.kind === 'platform_sub') return room.title || 'Slots Pro Lounge'
  return room.title || 'Group chat'
}

/**
 * Build a chat room row from Private Subs catalog RPC for opening conversation.
 * @param {Record<string, unknown>} row
 * @param {string} viewerUserId
 */
export function buildProvisionalFanRoom(row, viewerUserId) {
  const preview = row.last_message_preview
    ? String(row.last_message_preview)
    : null
  const roomKind = row.room_kind === 'platform_sub' ? 'platform_sub' : 'creator_fan'
  return enrichChatRoomRow(
    {
      id: row.room_id,
      kind: roomKind,
      title: row.title,
      description: row.description,
      avatar_url: row.avatar_url,
      member_role: row.is_host ? 'admin' : (row.member_role || 'member'),
      memberRole: row.is_host ? 'admin' : (row.member_role || 'member'),
      topic_keywords: row.topic_keywords,
      has_unread: row.has_unread,
      last_message_at: row.last_message_at,
      last_message_preview: preview,
      created_by: row.creator_user_id,
      creator_user_id: row.creator_user_id,
      catalog_kind: row.catalog_kind,
    },
    viewerUserId,
  )
}

/** Claim Slots Pro Lounge membership when eligible (Pro / Lifetime / staff). */
export async function chatClaimPlatformSubMembership(supabase) {
  const { data, error } = await supabase.rpc('platform_sub_claim_membership')
  if (error) throw new Error(error.message)
  return data
}

/** Resolve singleton Slots Pro Lounge room id (no membership write). */
export async function chatGetPlatformSubRoomId(supabase, scope = 'slots_edge_pro') {
  const { data, error } = await supabase.rpc('get_platform_sub_room_id', { p_scope: scope })
  if (error) throw new Error(error.message)
  return data
}

/**
 * Extract the peer user id from a DM room's dm_key.
 * dm_key format: "<uid_a>::<uid_b>" (lexically sorted).
 * @param {string | null | undefined} dmKey
 * @param {string} viewerUserId
 * @returns {string | null}
 */
export function chatDmPeerUserId(dmKey, viewerUserId) {
  if (!dmKey || !viewerUserId) return null
  const [a, b] = String(dmKey).split('::').map((s) => s.trim())
  if (a === viewerUserId) return b
  if (b === viewerUserId) return a
  return null
}

/**
 * Returns true if the room is currently muted for the viewer.
 * @param {string | null | undefined} mutedUntil
 */
export function chatRoomIsMuted(mutedUntil) {
  if (!mutedUntil) return false
  return new Date(mutedUntil) > new Date()
}

/**
 * Returns true if the viewer has unread messages in the room.
 * @param {{ last_message_at?: string | null, last_read_at?: string | null }} room
 */
export function chatRoomHasUnread(room) {
  if (!room.last_message_at) return false
  if (!room.last_read_at) return true
  return new Date(room.last_message_at) > new Date(room.last_read_at)
}

/**
 * Block a user (viewer → target).
 * @param {SupabaseClient} supabase
 * @param {string} targetUserId
 */
export function chatBlockUser(supabase, targetUserId) {
  return loungeChatInvoke(supabase, { action: 'block_user', target_user_id: targetUserId })
}

/**
 * Unblock a user (viewer → target).
 * @param {SupabaseClient} supabase
 * @param {string} targetUserId
 */
export function chatUnblockUser(supabase, targetUserId) {
  return loungeChatInvoke(supabase, { action: 'unblock_user', target_user_id: targetUserId })
}

/**
 * Owner toggle: later joiners see prior messages, or start from a blank room.
 * Join-time only... flipping this does not rewrite people already in the room.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {boolean} enabled
 */
export async function chatSetNewMembersSeeHistory(supabase, roomId, enabled) {
  const { data, error } = await supabase.rpc('chat_set_new_members_see_history', {
    p_room_id: roomId,
    p_enabled: enabled,
  })
  if (error) throw new Error(error.message || 'Could not update history setting.')
  return data
}

/**
 * Owner toggle: members may send messages, or only the owner / room admins.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {boolean} enabled
 */
export async function chatSetMembersCanPost(supabase, roomId, enabled) {
  const { data, error } = await supabase.rpc('chat_set_members_can_post', {
    p_room_id: roomId,
    p_enabled: enabled,
  })
  if (error) throw new Error(error.message || 'Could not update posting setting.')
  return data
}

export function chatUpdateGroup(supabase, { roomId, title, description, avatarUrl }) {
  const body = { action: 'update_group', room_id: roomId }
  if (title != null) body.title = title
  if (description != null) body.description = description
  if (avatarUrl != null) body.avatar_url = avatarUrl
  return loungeChatInvoke(supabase, body)
}

export function chatAddGroupMembers(supabase, roomId, memberUserIds) {
  return loungeChatInvoke(supabase, {
    action: 'add_group_members',
    room_id: roomId,
    member_user_ids: memberUserIds,
  })
}

export function chatRemoveGroupMember(supabase, roomId, targetUserId) {
  return loungeChatInvoke(supabase, {
    action: 'remove_group_member',
    room_id: roomId,
    target_user_id: targetUserId,
  })
}

/** @param {number} muteMinutes - 0 = permanent */
export function chatMuteGroupMember(supabase, roomId, targetUserId, muteMinutes) {
  return loungeChatInvoke(supabase, {
    action: 'mute_group_member',
    room_id: roomId,
    target_user_id: targetUserId,
    mute_minutes: muteMinutes,
  })
}

export function chatUnmuteGroupMember(supabase, roomId, targetUserId) {
  return loungeChatInvoke(supabase, {
    action: 'unmute_group_member',
    room_id: roomId,
    target_user_id: targetUserId,
  })
}

export function chatMuteRoomUntil(supabase, roomId, mutedUntilIso) {
  return loungeChatInvoke(supabase, {
    action: 'mute_room_until',
    room_id: roomId,
    muted_until: mutedUntilIso,
  })
}

export function chatStarMessage(supabase, messageId) {
  return loungeChatInvoke(supabase, { action: 'star_message', message_id: messageId })
}

export function chatUnstarMessage(supabase, messageId) {
  return loungeChatInvoke(supabase, { action: 'unstar_message', message_id: messageId })
}

export function chatPinMessage(supabase, roomId, messageId) {
  return loungeChatInvoke(supabase, { action: 'pin_message', room_id: roomId, message_id: messageId })
}

export function chatUnpinMessage(supabase, roomId, messageId) {
  return loungeChatInvoke(supabase, { action: 'unpin_message', room_id: roomId, message_id: messageId })
}

export async function chatGroupHeaderMembers(supabase, roomId) {
  const { data, error } = await supabase.rpc('chat_group_header_members', { p_room_id: roomId })
  if (error) throw new Error(error.message)
  return data || []
}

/**
 * First 3 members for stacked avatar - falls back to full member list RPC if header RPC is missing.
 * @returns {Promise<{ members: any[], error: string | null }>}
 */
export async function chatGroupHeaderMembersResolved(supabase, roomId) {
  let lastErr = /** @type {string | null} */ (null)
  try {
    const header = await chatGroupHeaderMembers(supabase, roomId)
    if (header.length > 0) return { members: header, error: null }
  } catch (e) {
    lastErr = e?.message || 'chat_group_header_members failed'
  }
  try {
    const list = await chatGroupMembersList(supabase, roomId)
    const members = list.slice(0, 3).map((m) => ({
      user_id: m.user_id,
      display_name: m.display_name,
      handle: m.handle,
      avatar_url: m.avatar_url,
      joined_at: m.joined_at,
    }))
    if (members.length > 0) return { members, error: null }
    if (list.length > 0) return { members, error: null }
    return { members: [], error: lastErr || 'No members returned (check Supabase project + migrations).' }
  } catch (e) {
    const msg = e?.message || lastErr || 'chat_group_members_list failed'
    const hint = msg.includes('chat_group_members_list') || msg.includes('chat_group_header_members')
      ? ' Apply supabase/migrations/20260603150000_chat_group_member_rpcs_repair.sql in the SQL editor, then reload the app.'
      : ''
    return { members: [], error: msg + hint }
  }
}

/** @param {string[]} roomIds */
export async function chatGroupHeaderMembersBatch(supabase, roomIds) {
  const ids = [...new Set(roomIds.filter(Boolean))]
  const out = /** @type {Record<string, any[]>} */ ({})
  await Promise.all(
    ids.map(async (id) => {
      const { members } = await chatGroupHeaderMembersResolved(supabase, id)
      out[id] = members
    }),
  )
  return out
}

export async function chatGroupMembersList(supabase, roomId) {
  const { data, error } = await supabase.rpc('chat_group_members_list', { p_room_id: roomId })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatStarredMessageIds(supabase, roomId) {
  const { data, error } = await supabase.rpc('chat_starred_message_ids', { p_room_id: roomId })
  if (error) return new Set()
  return new Set((data || []).map((r) => r.message_id))
}

export async function chatPinnedMessageIds(supabase, roomId) {
  const { data, error } = await supabase.rpc('chat_pinned_message_ids', { p_room_id: roomId })
  if (error) return new Set()
  return new Set((data || []).map((r) => r.message_id))
}

export async function chatStarredMessagesPage(supabase, roomId, limit = 50, senderUserId = null) {
  const { data, error } = await supabase.rpc('chat_starred_messages_page', {
    p_room_id: roomId,
    p_limit: limit,
    p_sender_id: senderUserId || null,
  })
  if (error) return []
  return data || []
}

export function chatIsGroupOwner(room, viewerUserId) {
  if (!room || room.kind !== 'group' || !viewerUserId) return false
  if (room.created_by === viewerUserId) return true
  return room.memberRole === 'admin' || room.member_role === 'admin'
}

export function chatIsFanRoom(room) {
  return room?.kind === 'creator_fan'
}

export function chatIsPlatformSubRoom(room) {
  return room?.kind === 'platform_sub'
}

export function chatCanEditPlatformSubRoomMeta(room, viewerUserId, viewerRole = null) {
  if (!chatIsPlatformSubRoom(room) || !viewerUserId) return false
  if (viewerRole === 'admin' || viewerRole === 'moderator') return true
  const role = room.memberRole || room.member_role
  return role === 'admin'
}

export function chatIsPrivateSubsGroupRoom(room) {
  return chatIsFanRoom(room) || chatIsPlatformSubRoom(room)
}

export function chatIsFanRoomOwner(room, viewerUserId) {
  if (!room || room.kind !== 'creator_fan' || !viewerUserId) return false
  if (room.creator_user_id === viewerUserId || room.created_by === viewerUserId) return true
  return room.memberRole === 'admin' || room.member_role === 'admin'
}

export function chatIsFanRoomModerator(room, viewerUserId) {
  if (!room || room.kind !== 'creator_fan' || !viewerUserId) return false
  const role = room.memberRole || room.member_role
  return role === 'moderator'
}

/** Creator/admin or assigned room moderator; platform_sub adds staff + room mods. */
export function chatCanModerateFanRoom(room, viewerUserId, viewerRole = null) {
  if (chatIsPlatformSubRoom(room)) {
    if (viewerRole === 'admin' || viewerRole === 'moderator') return true
    const role = room.memberRole || room.member_role
    return role === 'admin' || role === 'moderator'
  }
  return chatIsFanRoomOwner(room, viewerUserId) || chatIsFanRoomModerator(room, viewerUserId)
}

export async function chatSetFanRoomMemberRole(supabase, roomId, targetUserId, role) {
  const { error } = await supabase.rpc('creator_fan_set_member_role', {
    p_room_id: roomId,
    p_target_user_id: targetUserId,
    p_role: role,
  })
  if (error) throw new Error(error.message)
}

/** Group owner/admin, or either participant in a DM. */
export function chatCanPinMessages(room, viewerUserId, viewerRole = null) {
  if (!room || !viewerUserId) return false
  if (room.kind === 'dm') return true
  if (room.kind === 'creator_fan' || room.kind === 'platform_sub') {
    return chatCanModerateFanRoom(room, viewerUserId, viewerRole)
  }
  return chatIsGroupOwner(room, viewerUserId)
}

/** Sender, group owner/admin, fan/platform moderators, or either DM participant. */
export function chatCanDeleteCallRecording(room, viewerUserId, message, viewerRole = null) {
  if (!room || !viewerUserId || !message) return false
  if (message.sender_id === viewerUserId) return true
  if (room.kind === 'dm') return true
  if (room.kind === 'creator_fan' || room.kind === 'platform_sub') {
    return chatCanModerateFanRoom(room, viewerUserId, viewerRole)
  }
  return chatIsGroupOwner(room, viewerUserId)
}

/** DMs always. Locked rooms: owner / room admin / platform staff only. */
export function chatViewerCanPostInRoom(room, viewerUserId, viewerRole = null) {
  if (!room || !viewerUserId) return false
  if (room.kind === 'dm') return true
  if (room.members_can_post !== false) return true
  if (room.kind === 'group') return chatIsGroupOwner(room, viewerUserId)
  if (room.kind === 'creator_fan') return chatIsFanRoomOwner(room, viewerUserId)
  if (room.kind === 'platform_sub') return chatCanEditPlatformSubRoomMeta(room, viewerUserId, viewerRole)
  return true
}

export async function chatSearchMessages(supabase, roomId, query, limit = 30) {
  const { data, error } = await supabase.rpc('chat_search_messages', {
    p_room_id: roomId,
    p_query: query,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatPinnedMessagesPage(supabase, roomId, limit = 50) {
  const { data, error } = await supabase.rpc('chat_pinned_messages_page', {
    p_room_id: roomId,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatRoomSharedMedia(supabase, roomId, limit = 80, senderUserId = null) {
  const { data, error } = await supabase.rpc('chat_room_shared_media', {
    p_room_id: roomId,
    p_limit: limit,
    p_sender_id: senderUserId || null,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatRoomSharedLinks(supabase, roomId, { docsOnly = false, limit = 80, senderUserId = null } = {}) {
  const { data, error } = await supabase.rpc('chat_room_shared_links', {
    p_room_id: roomId,
    p_limit: limit,
    p_docs_only: docsOnly,
    p_sender_id: senderUserId || null,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatRoomSharedCalls(supabase, roomId, limit = 80, senderUserId = null) {
  const { data, error } = await supabase.rpc('chat_room_shared_calls', {
    p_room_id: roomId,
    p_limit: limit,
    p_sender_id: senderUserId || null,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatMessagesWindow(supabase, roomId, messageId, limit = 40) {
  const { data, error } = await supabase.rpc('chat_messages_window', {
    p_room_id: roomId,
    p_message_id: messageId,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatGetBlockStatus(supabase, viewerUserId, otherUserId) {
  if (!viewerUserId || !otherUserId) return { iBlockThem: false, theyBlockMe: false }
  const { data } = await supabase
    .from('blocks')
    .select('blocker_id')
    .or(
      `and(blocker_id.eq.${viewerUserId},blocked_id.eq.${otherUserId}),` +
      `and(blocker_id.eq.${otherUserId},blocked_id.eq.${viewerUserId})`,
    )
  const rows = data || []
  return {
    iBlockThem: rows.some((r) => r.blocker_id === viewerUserId),
    theyBlockMe: rows.some((r) => r.blocker_id === otherUserId),
  }
}
