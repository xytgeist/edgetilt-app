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
  return room.title || 'Group chat'
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
 * Returns the block status between the viewer and another user.
 * Queries the `blocks` table directly (RLS exposes rows where viewer is on either side).
 * @param {SupabaseClient} supabase
 * @param {string} viewerUserId
 * @param {string} otherUserId
 * @returns {Promise<{ iBlockThem: boolean, theyBlockMe: boolean }>}
 */
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

/** Group owner/admin, or either participant in a DM. */
export function chatCanPinMessages(room, viewerUserId) {
  if (!room || !viewerUserId) return false
  if (room.kind === 'dm') return true
  return chatIsGroupOwner(room, viewerUserId)
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
