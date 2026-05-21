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
  const handle = String(event?.actor_handle || '').trim()
  if (handle) return `@${handle}`
  const name = String(event?.actor_display_name || '').trim()
  if (name) return name
  return 'Someone'
}

/** Post detail deep link from a notification row (`post_id` always set when returned). */
export function loungeActivityOpenPostTarget(event) {
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

export function loungeActivitySummary(event) {
  const who = loungeActivityActorLabel(event)
  switch (event?.event_type) {
    case LOUNGE_ACTIVITY_EVENT_TYPES.COMMENT_ON_POST:
      return `${who} commented on your post`
    case LOUNGE_ACTIVITY_EVENT_TYPES.REPLY_TO_COMMENT:
      return `${who} replied to your comment`
    case LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_POST:
      return `${who} mentioned you in a post`
    case LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_COMMENT:
      return `${who} mentioned you in a comment`
    case LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW:
      return `${who} followed you`
    case LOUNGE_ACTIVITY_EVENT_TYPES.REPOST:
      return event?.comment_id
        ? `${who} reposted your comment`
        : `${who} reposted your post`
    case LOUNGE_ACTIVITY_EVENT_TYPES.QUOTE_REPOST:
      return `${who} quote reposted your post`
    case LOUNGE_ACTIVITY_EVENT_TYPES.BOOKMARK:
      return event?.comment_id
        ? `${who} bookmarked your comment`
        : `${who} bookmarked your post`
    case LOUNGE_ACTIVITY_EVENT_TYPES.LIKE:
      return event?.comment_id ? `${who} liked your comment` : `${who} liked your post`
    default:
      return `${who} interacted with you`
  }
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
