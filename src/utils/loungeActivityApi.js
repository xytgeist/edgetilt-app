/** Lounge in-app activity notifications (Phase H1). */

import {
  parsePokerStableActivityDetail,
  pokerStableSessionCompleteNotificationEmoji,
} from '../features/poker-stable/pokerStableActivityDetail.js'

export const LOUNGE_ACTIVITY_PAGE_SIZE = 30

export const LOUNGE_ACTIVITY_EVENT_TYPES = {
  COMMENT_ON_POST: 'comment_on_post',
  REPLY_TO_COMMENT: 'reply_to_comment',
  MENTION_IN_POST: 'mention_in_post',
  MENTION_IN_COMMENT: 'mention_in_comment',
  FOLLOW: 'follow',
  REPOST: 'repost',
  QUOTE_REPOST: 'quote_repost',
  LIKE: 'like',
  BOOKMARK: 'bookmark',
  PLAY_LOG_SHARED: 'play_log_shared',
  PLAY_LOG_PARTNER_PAID: 'play_log_partner_paid',
  PLAY_LOG_PARTNER_UNPAID: 'play_log_partner_unpaid',
  STARTER_WEEKLY_GUIDE_DROP: 'starter_weekly_guide_drop',
  AP_GUIDE_RELEASED: 'ap_guide_released',
  CREATOR_FAN_SUB: 'creator_fan_sub',
  CHAT_CALL_MISSED: 'chat_call_missed',
  CHAT_MENTION: 'chat_mention',
  POKER_TOURNAMENT_SWAP: 'poker_tournament_swap',
  POKER_TOURNAMENT_SWAP_RESULT: 'poker_tournament_swap_result',
  POKER_STABLE_SLICE_INVITE: 'poker_stable_slice_invite',
  POKER_STABLE_SLICE_NUDGE: 'poker_stable_slice_nudge',
  POKER_STABLE_SESSION_COMPLETE: 'poker_stable_session_complete',
  POKER_STABLE_SETTLEMENT_PROPOSED: 'poker_stable_settlement_proposed',
  POKER_STABLE_SETTLEMENT_RESOLVED: 'poker_stable_settlement_resolved',
  POKER_STABLE_COMMIT_RECORDED: 'poker_stable_commit_recorded',
  POKER_STABLE_BACKER_OFFER: 'poker_stable_backer_offer',
  POKER_STABLE_STAKEE_ACCEPTED: 'poker_stable_stakee_accepted',
  POKER_STABLE_STAKEE_DECLINED: 'poker_stable_stakee_declined',
  POKER_STABLE_STAKEE_COUNTER_PROPOSED: 'poker_stable_stakee_counter_proposed',
  POKER_STABLE_STAKER_COUNTER_ACCEPTED: 'poker_stable_staker_counter_accepted',
  POKER_STABLE_STAKER_COUNTER_DECLINED: 'poker_stable_staker_counter_declined',
  POKER_STABLE_SLICE_ACCEPTED: 'poker_stable_slice_accepted',
  POKER_STABLE_SLICE_DECLINED: 'poker_stable_slice_declined',
  POKER_STABLE_OFFER_WITHDRAWN: 'poker_stable_offer_withdrawn',
}

const POKER_STABLE_LOUNGE_ACTIVITY_TYPES = new Set([
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_INVITE,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_NUDGE,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SESSION_COMPLETE,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SETTLEMENT_PROPOSED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SETTLEMENT_RESOLVED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_COMMIT_RECORDED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_BACKER_OFFER,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_ACCEPTED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_DECLINED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_COUNTER_PROPOSED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKER_COUNTER_ACCEPTED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKER_COUNTER_DECLINED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_ACCEPTED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_DECLINED,
  LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_OFFER_WITHDRAWN,
])

export function isPokerStableLoungeActivityEvent(eventType) {
  return POKER_STABLE_LOUNGE_ACTIVITY_TYPES.has(eventType)
}

/** Maps `activity_events.event_type` → notification avatar badge kind (null = no badge). */
export function loungeActivityNotificationBadgeKind(eventType) {
  switch (eventType) {
    case LOUNGE_ACTIVITY_EVENT_TYPES.COMMENT_ON_POST:
      return 'comment'
    case LOUNGE_ACTIVITY_EVENT_TYPES.REPLY_TO_COMMENT:
      return 'reply'
    case LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_POST:
    case LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_COMMENT:
    case LOUNGE_ACTIVITY_EVENT_TYPES.CHAT_MENTION:
      return 'mention'
    case LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW:
    case LOUNGE_ACTIVITY_EVENT_TYPES.CREATOR_FAN_SUB:
      return 'follow'
    case LOUNGE_ACTIVITY_EVENT_TYPES.LIKE:
      return 'like'
    case LOUNGE_ACTIVITY_EVENT_TYPES.REPOST:
      return 'repost'
    case LOUNGE_ACTIVITY_EVENT_TYPES.QUOTE_REPOST:
      return 'quote_repost'
    case LOUNGE_ACTIVITY_EVENT_TYPES.BOOKMARK:
      return 'bookmark'
    case LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_SHARED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_PARTNER_PAID:
    case LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_PARTNER_UNPAID:
      return 'play_log'
    case LOUNGE_ACTIVITY_EVENT_TYPES.STARTER_WEEKLY_GUIDE_DROP:
      return 'play_log'
    case LOUNGE_ACTIVITY_EVENT_TYPES.AP_GUIDE_RELEASED:
      return 'mention'
    case LOUNGE_ACTIVITY_EVENT_TYPES.CHAT_CALL_MISSED:
      return 'missed_call'
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_TOURNAMENT_SWAP:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_TOURNAMENT_SWAP_RESULT:
      return 'play_log'
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_INVITE:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_NUDGE:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SESSION_COMPLETE:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SETTLEMENT_PROPOSED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SETTLEMENT_RESOLVED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_COMMIT_RECORDED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_BACKER_OFFER:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_ACCEPTED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_DECLINED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_COUNTER_PROPOSED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKER_COUNTER_ACCEPTED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKER_COUNTER_DECLINED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_ACCEPTED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_DECLINED:
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_OFFER_WITHDRAWN:
      return 'play_log'
    default:
      return null
  }
}

/** True when PostgREST reports the RPC/table is not deployed yet. */
export function isLoungeActivitySchemaMissingError(error) {
  if (!error) return false
  const code = String(error.code || '')
  const msg = String(error.message || '').toLowerCase()
  if (code === 'PGRST202' || code === '42883') return true
  if (msg.includes('could not find the function')) return true
  if (msg.includes('function') && msg.includes('does not exist')) return true
  if (msg.includes('relation') && msg.includes('activity_events') && msg.includes('does not exist')) {
    return true
  }
  return false
}

export function formatLoungeActivityWhen(iso) {
  if (!iso) return ''
  const createdMs = new Date(iso).getTime()
  if (!Number.isFinite(createdMs)) return ''
  const diffMs = Date.now() - createdMs
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (diffMinutes < 60) return `${Math.max(0, diffMinutes)}m`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays <= 3) return `${diffDays}d`
  const dt = new Date(iso)
  const now = new Date()
  const sameYear = dt.getFullYear() === now.getFullYear()
  return dt.toLocaleDateString(
    undefined,
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' },
  )
}

export function loungeActivityActorLabel(event) {
  const name = String(event?.actor_display_name || '').trim()
  if (name) return name
  const handle = String(event?.actor_handle || '').trim()
  if (handle) return `@${handle}`
  const { backerName } = parsePokerStableActivityDetail(event?.detail_text)
  if (backerName) return backerName
  return 'Someone'
}

/** Plain post repost: `post_id` is the reposter's feed shell, not a useful deep link (often deleted with the original). */
export function loungeActivityPlainPostRepostEvent(event) {
  return (
    event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.REPOST &&
    !event?.comment_id &&
    Boolean(event?.post_id)
  )
}

/** Comment repost: `post_id` is the reposter's shell; `comment_id` is the source comment. */
export function loungeActivityCommentRepostEvent(event) {
  return (
    event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.REPOST &&
    Boolean(event?.comment_id) &&
    Boolean(event?.post_id)
  )
}

/** Post detail deep link from a notification row (`postId` always set when returned). */
export function loungeActivityOpenPostTarget(event) {
  if (loungeActivityPlainPostRepostEvent(event)) {
    const originalId = String(event?.repost_group_target_id || '').trim()
    if (!originalId) return null
    return { postId: originalId, commentId: null }
  }
  if (loungeActivityCommentRepostEvent(event)) {
    return null
  }
  if (!event?.post_id) return null
  const type = event.event_type
  const drillComment =
    type === LOUNGE_ACTIVITY_EVENT_TYPES.COMMENT_ON_POST ||
    type === LOUNGE_ACTIVITY_EVENT_TYPES.REPLY_TO_COMMENT ||
    type === LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_COMMENT ||
    (type === LOUNGE_ACTIVITY_EVENT_TYPES.BOOKMARK && event.comment_id) ||
    (type === LOUNGE_ACTIVITY_EVENT_TYPES.LIKE && event.comment_id)
  return {
    postId: event.post_id,
    commentId: drillComment && event.comment_id ? event.comment_id : null,
  }
}

/**
 * Resolve notification tap target - repost shells need a lookup for the original post/comment parent.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {object} event
 */
export async function resolveLoungeActivityOpenPostTarget(supabaseClient, event) {
  const synced = loungeActivityOpenPostTarget(event)
  if (!event || !supabaseClient) return synced

  if (loungeActivityPlainPostRepostEvent(event)) {
    if (synced?.postId) return synced
    const shellId = String(event.post_id || '').trim()
    if (!shellId) return null
    const { data, error } = await supabaseClient
      .from('community_feed_posts')
      .select('repost_of_post_id')
      .eq('id', shellId)
      .maybeSingle()
    if (error || data?.repost_of_post_id == null) return null
    return { postId: String(data.repost_of_post_id), commentId: null }
  }

  if (loungeActivityCommentRepostEvent(event)) {
    const commentId = String(event.comment_id || '').trim()
    if (!commentId) return null
    const { data, error } = await supabaseClient
      .from('feed_comments')
      .select('post_id')
      .eq('id', commentId)
      .is('hidden_at', null)
      .maybeSingle()
    if (error || !data?.post_id) return null
    return { postId: String(data.post_id), commentId }
  }

  return synced
}

export function loungeActivityActionPhrase(event) {
  const isReply = event?.preview_is_reply === true
  switch (event?.event_type) {
    case LOUNGE_ACTIVITY_EVENT_TYPES.COMMENT_ON_POST:
      return 'commented on your post'
    case LOUNGE_ACTIVITY_EVENT_TYPES.REPLY_TO_COMMENT:
      return 'replied to your comment'
    case LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_POST:
      return 'mentioned you in a post'
    case LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_COMMENT:
      return 'mentioned you in a comment'
    case LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW:
      return 'followed you'
    case LOUNGE_ACTIVITY_EVENT_TYPES.CREATOR_FAN_SUB:
      return 'subscribed to your fan tier'
    case LOUNGE_ACTIVITY_EVENT_TYPES.REPOST:
      return event?.comment_id ? 'reposted your comment' : 'reposted your post'
    case LOUNGE_ACTIVITY_EVENT_TYPES.QUOTE_REPOST:
      return 'quote reposted your post'
    case LOUNGE_ACTIVITY_EVENT_TYPES.BOOKMARK:
      if (!event?.comment_id) return 'bookmarked your post'
      return isReply ? 'bookmarked your reply' : 'bookmarked your comment'
    case LOUNGE_ACTIVITY_EVENT_TYPES.LIKE:
      if (!event?.comment_id) return 'liked your post'
      return isReply ? 'liked your reply' : 'liked your comment'
    case LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_SHARED: {
      const game = String(event?.play_log_game_name || '').trim() || 'a play log'
      const pct = event?.play_log_share_percent
      const pctStr =
        pct != null && Number.isFinite(Number(pct)) ? ` (${Number(pct)}%)` : ''
      return `added you to ${game}${pctStr}`
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_PARTNER_PAID: {
      const game = String(event?.play_log_game_name || '').trim() || 'a play log'
      return `marked your share as paid on ${game}`
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_PARTNER_UNPAID: {
      const game = String(event?.play_log_game_name || '').trim() || 'a play log'
      return `marked your share as unpaid on ${game}`
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.STARTER_WEEKLY_GUIDE_DROP:
      return 'Weekly guide drop ready — scratch to reveal'
    case LOUNGE_ACTIVITY_EVENT_TYPES.AP_GUIDE_RELEASED: {
      const guideTitle = String(event?.detail_text || '').trim()
      return guideTitle
        ? `New AP Slot Guide released: ${guideTitle}`
        : 'New AP Slot Guide released'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.CHAT_CALL_MISSED:
      return 'called you'
    case LOUNGE_ACTIVITY_EVENT_TYPES.CHAT_MENTION: {
      const roomName = String(event?.detail_text || '').trim()
      return roomName ? `tagged you in ${roomName}` : 'tagged you in a chat'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_TOURNAMENT_SWAP:
      return 'offered you a tournament swap'
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_TOURNAMENT_SWAP_RESULT: {
      const detail = String(event?.detail_text || '').trim()
      return detail || 'finished a tournament swap with you'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_INVITE: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `invited you to back ${detail}` : 'invited you to back a stake'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_NUDGE: {
      const detail = String(event?.detail_text || '').trim()
      return detail
        ? `reminded you to accept your backing slice · ${detail}`
        : 'reminded you to accept your backing slice'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SESSION_COMPLETE: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `completed a stake session · ${detail}` : 'completed a stake session'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SETTLEMENT_PROPOSED: {
      const detail = String(event?.detail_text || '').trim()
      return detail || 'proposed a settlement that needs your response'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SETTLEMENT_RESOLVED: {
      const detail = String(event?.detail_text || '').trim()
      return detail || 'responded to your settlement proposal'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_COMMIT_RECORDED: {
      const detail = String(event?.detail_text || '').trim()
      return detail || 'recorded a stake update — sync your books'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_BACKER_OFFER: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `offered you a backing stake · ${detail}` : 'offered you a backing stake'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_ACCEPTED: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `accepted your backing offer · ${detail}` : 'accepted your backing offer'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_DECLINED: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `declined your backing offer · ${detail}` : 'declined your backing offer'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKEE_COUNTER_PROPOSED: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `proposed new stake terms · ${detail}` : 'proposed new stake terms'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKER_COUNTER_ACCEPTED: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `accepted your counter-proposal · ${detail}` : 'accepted your counter-proposal'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_STAKER_COUNTER_DECLINED: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `declined your counter-proposal · ${detail}` : 'declined your counter-proposal'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_ACCEPTED: {
      const { dealLabel } = parsePokerStableActivityDetail(event?.detail_text)
      const detail = dealLabel || String(event?.detail_text || '').trim()
      return detail ? `accepted your backing slice · ${detail}` : 'accepted your backing slice'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SLICE_DECLINED: {
      const { dealLabel } = parsePokerStableActivityDetail(event?.detail_text)
      const detail = dealLabel || String(event?.detail_text || '').trim()
      return detail ? `declined your backing slice · ${detail}` : 'declined your backing slice'
    }
    case LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_OFFER_WITHDRAWN: {
      const detail = String(event?.detail_text || '').trim()
      return detail ? `withdrew the stake offer · ${detail}` : 'withdrew the stake offer'
    }
    default: {
      if (String(event?.guide_slug || '').trim()) {
        const guideTitle = String(event?.detail_text || '').trim()
        return guideTitle
          ? `New AP Slot Guide released: ${guideTitle}`
          : 'New AP Slot Guide released'
      }
      return 'interacted with you'
    }
  }
}

export function loungeActivitySummary(event) {
  if (
    event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.AP_GUIDE_RELEASED ||
    String(event?.guide_slug || '').trim()
  ) {
    return loungeActivityActionPhrase(event)
  }
  const who = loungeActivityActorLabel(event)
  const phrase = loungeActivityActionPhrase(event)
  if (event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.POKER_STABLE_SESSION_COMPLETE) {
    const emoji = pokerStableSessionCompleteNotificationEmoji(event)
    const prefix = emoji ? `${emoji} ` : ''
    return `${prefix}${who} ${phrase}`
  }
  return `${who} ${phrase}`
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function loungeActivityUnreadCount(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('lounge_activity_unread_count')
  if (error) throw error
  const n = Number(data)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ limit?: number, beforeCreatedAt?: string|null, beforeId?: string|null }} [opts]
 */
export async function loungeActivityEventsPage(supabaseClient, opts = {}) {
  const {
    limit = LOUNGE_ACTIVITY_PAGE_SIZE,
    beforeCreatedAt = null,
    beforeId = null,
  } = opts

  const { data, error } = await supabaseClient.rpc('lounge_activity_events_page', {
    p_limit: limit,
    p_before_created_at: beforeCreatedAt,
    p_before_id: beforeId,
  })
  if (error) throw error
  return Array.isArray(data) ? data : []
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function loungeActivityMarkAllRead(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('lounge_activity_mark_all_read')
  if (error) throw error
  const n = Number(data)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Mark the activity event(s) tied to a push notification as read (single event or batched push).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ activityEventId?: string | null, batchId?: string | null }} opts
 */
export async function loungeActivityMarkPushOpened(supabaseClient, { activityEventId, batchId } = {}) {
  const eventId = String(activityEventId || '').trim()
  const batch = String(batchId || '').trim()
  if (!eventId && !batch) return 0

  const { data, error } = await supabaseClient.rpc('lounge_activity_mark_push_opened', {
    p_activity_event_id: eventId || null,
    p_batch_id: batch || null,
  })
  if (error) throw error
  const n = Number(data)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}
