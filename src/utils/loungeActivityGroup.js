import { LOUNGE_ACTIVITY_EVENT_TYPES } from './loungeActivityApi.js'

const GROUPABLE_TYPES = new Set([
  LOUNGE_ACTIVITY_EVENT_TYPES.LIKE,
  LOUNGE_ACTIVITY_EVENT_TYPES.BOOKMARK,
])

const FOLLOW_GROUP_KEY = 'follow'
const FOLLOW_GROUP_WINDOW_MS = 24 * 60 * 60 * 1000

export function loungeActivityIsBatchGroupable(event) {
  if (GROUPABLE_TYPES.has(event?.event_type)) return true
  if (event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW) return true
  return (
    event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.REPOST &&
    !event?.comment_id &&
    Boolean(event?.repost_group_target_id)
  )
}

export function loungeActivityGroupKey(event) {
  if (event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW) {
    return FOLLOW_GROUP_KEY
  }
  if (
    event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.REPOST &&
    !event?.comment_id &&
    event?.repost_group_target_id
  ) {
    return `repost:post:${event.repost_group_target_id}`
  }
  if (!GROUPABLE_TYPES.has(event?.event_type)) return ''
  return `${event.event_type}:${event.post_id || ''}:${event.comment_id || ''}`
}

export function loungeActivityEventToActorProfile(event) {
  return {
    user_id: event.actor_user_id,
    handle: event.actor_handle,
    display_name: event.actor_display_name,
    avatar_url: event.actor_avatar_url,
    role: event.actor_role,
    is_og: event.actor_is_og,
  }
}

export function loungeActivityActorDisplayName(actor) {
  const name = String(actor?.display_name || '').trim()
  if (name) return name
  const handle = String(actor?.handle || '').trim()
  if (handle) return `@${handle}`
  return 'Member'
}

/** post | comment | reply - for grouped like/bookmark copy. */
export function loungeActivityGroupedTargetKind(event, previewMeta = {}) {
  if (event?.comment_id) {
    return previewMeta?.preview_is_reply ? 'reply' : 'comment'
  }
  return 'post'
}

function groupedTargetPhrase(targetKind) {
  if (targetKind === 'reply') return 'your reply'
  if (targetKind === 'comment') return 'your comment'
  return 'your post'
}

function groupedVerb(eventType) {
  if (eventType === LOUNGE_ACTIVITY_EVENT_TYPES.BOOKMARK) return 'bookmarked'
  if (eventType === LOUNGE_ACTIVITY_EVENT_TYPES.REPOST) return 'reposted'
  if (eventType === LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW) return 'followed'
  return 'liked'
}

/** Split grouped copy so the lead name can wrap in UI (`max-w-[10ch]`) without ellipsis. */
export function loungeActivityGroupedActionCopy(event, firstActor, othersCount, previewMeta = {}) {
  const leadName = loungeActivityActorDisplayName(firstActor)
  if (event?.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW) {
    if (othersCount <= 0) {
      return { leadName, rest: 'followed you' }
    }
    const otherLabel = othersCount === 1 ? '1 other' : `${othersCount} others`
    return { leadName, rest: `and ${otherLabel} followed you` }
  }
  const targetPhrase = groupedTargetPhrase(loungeActivityGroupedTargetKind(event, previewMeta))
  const verb = groupedVerb(event.event_type)
  if (othersCount <= 0) {
    return { leadName, rest: `${verb} ${targetPhrase}` }
  }
  const otherLabel = othersCount === 1 ? '1 other' : `${othersCount} others`
  return { leadName, rest: `and ${otherLabel} ${verb} ${targetPhrase}` }
}

/**
 * @param {object} event Representative row (newest in group).
 * @param {object} firstActor Chronologically first unique actor.
 * @param {number} othersCount Additional unique actors after the first.
 * @param {object} [previewMeta]
 */
export function loungeActivityGroupedActionPhrase(event, firstActor, othersCount, previewMeta = {}) {
  const { leadName, rest } = loungeActivityGroupedActionCopy(event, firstActor, othersCount, previewMeta)
  return `${leadName} ${rest}`
}

function uniqueActorsChronological(groupEvents) {
  const sorted = [...groupEvents].sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return ta - tb
    return String(a.id).localeCompare(String(b.id))
  })
  const seen = new Set()
  const actors = []
  for (const row of sorted) {
    const uid = String(row.actor_user_id || '')
    if (!uid || seen.has(uid)) continue
    seen.add(uid)
    actors.push(loungeActivityEventToActorProfile(row))
  }
  return actors
}

function newestEventInGroup(groupEvents) {
  return [...groupEvents].sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return tb - ta
    return String(b.id).localeCompare(String(a.id))
  })[0]
}

const GROUP_MIN_ACTORS = 3

function followEventsWithin24h(events) {
  if (!Array.isArray(events) || events.length === 0) return []
  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return tb - ta
    return String(b.id).localeCompare(String(a.id))
  })
  const newestMs = new Date(sorted[0].created_at).getTime()
  if (!Number.isFinite(newestMs)) return []
  return sorted.filter((row) => {
    const ms = new Date(row.created_at).getTime()
    return Number.isFinite(ms) && newestMs - ms <= FOLLOW_GROUP_WINDOW_MS
  })
}

/**
 * Collapse like/bookmark/repost/follow rows when grouping rules match.
 * Follow batches require 3+ unique actors within 24 hours. Preserves overall newest-first order.
 * @param {Array<object>} events
 * @returns {Array<{ type: 'single', event: object } | { type: 'grouped', event: object, actors: object[], firstActor: object, othersCount: number, eventIds: string[], groupKey: string }>}
 */
export function buildLoungeActivityDisplayRows(events) {
  if (!Array.isArray(events) || events.length === 0) return []

  const buckets = new Map()
  for (const event of events) {
    const key = loungeActivityGroupKey(event)
    if (!key) continue
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(event)
  }

  const consumed = new Set()
  const rows = []

  for (const event of events) {
    if (consumed.has(event.id)) continue

    if (event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW) {
      const bucket = buckets.get(FOLLOW_GROUP_KEY) || []
      const available = bucket.filter((row) => !consumed.has(row.id))
      const windowEvents = followEventsWithin24h(available)
      const actors = uniqueActorsChronological(windowEvents)
      if (actors.length >= GROUP_MIN_ACTORS) {
        const representative = newestEventInGroup(windowEvents)
        if (event.id !== representative.id) continue
        const firstActor = actors[0]
        const othersCount = Math.max(0, actors.length - 1)
        for (const row of windowEvents) consumed.add(row.id)
        rows.push({
          type: 'grouped',
          event: representative,
          actors,
          firstActor,
          othersCount,
          eventIds: windowEvents.map((row) => row.id),
          groupKey: FOLLOW_GROUP_KEY,
        })
        continue
      }
      rows.push({ type: 'single', event })
      continue
    }

    const key = loungeActivityGroupKey(event)
    const bucket = key ? buckets.get(key) : null

    if (bucket && bucket.length >= GROUP_MIN_ACTORS) {
      const actors = uniqueActorsChronological(bucket)
      if (actors.length < GROUP_MIN_ACTORS) {
        rows.push({ type: 'single', event })
        continue
      }
      const representative = newestEventInGroup(bucket)
      const firstActor = actors[0]
      const othersCount = Math.max(0, actors.length - 1)
      for (const row of bucket) consumed.add(row.id)
      rows.push({
        type: 'grouped',
        event: representative,
        actors,
        firstActor,
        othersCount,
        eventIds: bucket.map((row) => row.id),
        groupKey: key,
      })
      continue
    }

    rows.push({ type: 'single', event })
  }

  return rows
}

export function loungeActivityGroupedSummary(event, firstActor, othersCount, previewMeta = {}) {
  return loungeActivityGroupedActionPhrase(event, firstActor, othersCount, previewMeta)
}
