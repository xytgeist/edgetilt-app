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
 * @param {{ kind: string, title?: string | null, slug?: string | null, dm_key?: string | null, peerLabel?: string | null }} room
 * @returns {string}
 */
export function chatRoomLabel(room) {
  if (room.kind === 'dm') return room.peerLabel || 'Direct message'
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
