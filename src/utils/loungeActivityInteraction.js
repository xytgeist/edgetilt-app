import { LOUNGE_ACTIVITY_EVENT_TYPES } from './loungeActivityApi.js'

/** @returns {'post' | 'comment' | null} */
export function loungeActivityInteractionBarKind(eventType) {
  switch (eventType) {
    case LOUNGE_ACTIVITY_EVENT_TYPES.COMMENT_ON_POST:
    case LOUNGE_ACTIVITY_EVENT_TYPES.REPLY_TO_COMMENT:
    case LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_COMMENT:
      return 'comment'
    case LOUNGE_ACTIVITY_EVENT_TYPES.MENTION_IN_POST:
    case LOUNGE_ACTIVITY_EVENT_TYPES.QUOTE_REPOST:
      return 'post'
    default:
      return null
  }
}

export function loungeActivityInteractionEntityKey(kind, id) {
  if (!kind || id == null || id === '') return ''
  return `${kind}:${String(id)}`
}

export function loungeActivityInteractionEntityFromRow(kind, row) {
  if (!kind || !row?.id) return null
  return {
    id: row.id,
    like_count: typeof row.like_count === 'number' ? row.like_count : 0,
    comment_count: typeof row.comment_count === 'number' ? row.comment_count : 0,
    repost_count: typeof row.repost_count === 'number' ? row.repost_count : 0,
  }
}

const INTERACTION_COUNT_COLS = 'id,like_count,comment_count,repost_count'

/** Refresh like/repost/comment counts for notification interaction bars. */
export async function fetchLoungeActivityInteractionCountRows(supabaseClient, { postIds = [], commentIds = [] } = {}) {
  const postsById = new Map()
  const commentsById = new Map()
  if (!supabaseClient) return { postsById, commentsById }

  const pids = [...new Set(postIds.map(String).filter(Boolean))]
  const cids = [...new Set(commentIds.map(String).filter(Boolean))]

  if (pids.length > 0) {
    const { data } = await supabaseClient
      .from('community_feed_posts')
      .select(INTERACTION_COUNT_COLS)
      .in('id', pids)
      .is('hidden_at', null)
    for (const row of data || []) {
      postsById.set(String(row.id), row)
    }
  }

  if (cids.length > 0) {
    const { data } = await supabaseClient
      .from('feed_comments')
      .select(INTERACTION_COUNT_COLS)
      .in('id', cids)
      .is('hidden_at', null)
    for (const row of data || []) {
      commentsById.set(String(row.id), row)
    }
  }

  return { postsById, commentsById }
}
