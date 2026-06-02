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
 * @param {SupabaseClient} supabase
 * @param {{ roomId: string, body: string, imageUrls?: string[], replyToMessageId?: string | null }} opts
 */
export function chatSendMessage(supabase, { roomId, body, imageUrls = [], replyToMessageId = null }) {
  return loungeChatInvoke(supabase, {
    action: 'send_message',
    room_id: roomId,
    body,
    image_urls: imageUrls,
    reply_to_message_id: replyToMessageId || undefined,
    idempotency_key: newIdempotencyKey(),
  })
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
 * Mark the latest read message in a room.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} messageId
 */
export function chatUpdateLastRead(supabase, roomId, messageId) {
  return loungeChatInvoke(supabase, { action: 'update_last_read', room_id: roomId, message_id: messageId })
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
 * Mute push notifications for a room.
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {number} [muteHours=8] — 0 = indefinite
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

/** @param {number} muteMinutes — 0 = permanent */
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

export async function chatGroupMembersList(supabase, roomId) {
  const { data, error } = await supabase.rpc('chat_group_members_list', { p_room_id: roomId })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatStarredMessageIds(supabase, roomId) {
  const { data, error } = await supabase.rpc('chat_starred_message_ids', { p_room_id: roomId })
  if (error) throw new Error(error.message)
  return new Set((data || []).map((r) => r.message_id))
}

export async function chatStarredMessagesPage(supabase, roomId, limit = 50) {
  const { data, error } = await supabase.rpc('chat_starred_messages_page', {
    p_room_id: roomId,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export function chatIsGroupOwner(room, viewerUserId) {
  if (!room || room.kind !== 'group' || !viewerUserId) return false
  if (room.created_by === viewerUserId) return true
  return room.memberRole === 'admin' || room.member_role === 'admin'
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

export async function chatPinnedMessageIds(supabase, roomId) {
  const { data, error } = await supabase.rpc('chat_pinned_message_ids', { p_room_id: roomId })
  if (error) throw new Error(error.message)
  return new Set((data || []).map((r) => r.message_id))
}

export async function chatRoomSharedMedia(supabase, roomId, limit = 80) {
  const { data, error } = await supabase.rpc('chat_room_shared_media', {
    p_room_id: roomId,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function chatRoomSharedLinks(supabase, roomId, { docsOnly = false, limit = 80 } = {}) {
  const { data, error } = await supabase.rpc('chat_room_shared_links', {
    p_room_id: roomId,
    p_limit: limit,
    p_docs_only: docsOnly,
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
