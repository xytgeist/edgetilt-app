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
