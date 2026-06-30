/** Lounge in-app activity notifications (Phase H1). */

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
      return 'mention'
    case LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW:
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
    default:
      return 'interacted with you'
  }
}

export function loungeActivitySummary(event) {
  const who = loungeActivityActorLabel(event)
  return `${who} ${loungeActivityActionPhrase(event)}`
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
