/** Labels + merge helpers for Edge Monitor activity_events breakdown. */

/** @type {Record<string, string>} */
export const OPS_ACTIVITY_EVENT_LABELS = {
  comment_on_post: 'Comment on post',
  reply_to_comment: 'Reply to comment',
  mention_in_post: 'Mention in post',
  mention_in_comment: 'Mention in comment',
  follow: 'Follow',
  repost: 'Repost',
  quote_repost: 'Quote repost',
  bookmark: 'Bookmark',
  like: 'Like',
  play_log_shared: 'Play log shared',
  play_log_partner_paid: 'Play log partner paid',
  play_log_partner_unpaid: 'Play log partner unpaid',
  chat_dm: 'Chat DM alert',
  chat_group_invite: 'Chat group invite',
  starter_weekly_guide_drop: 'Starter weekly drop',
  creator_fan_sub: 'Creator fan sub',
  poker_tournament_swap: 'Poker tournament swap',
}

/** @param {string | null | undefined} eventType */
export function opsMonitorActivityEventLabel(eventType) {
  const slug = String(eventType || '').trim()
  if (!slug) return 'Unknown'
  return OPS_ACTIVITY_EVENT_LABELS[slug] || slug.replace(/_/g, ' ')
}

/**
 * Merge 24h + 7d activity type rows for table display.
 * @param {{ by_type_24h?: Array<{ event_type?: string, count?: number }>, by_type_7d?: Array<{ event_type?: string, count?: number }> } | null | undefined} activity
 */
export function opsMonitorActivityTypeRows(activity) {
  /** @type {Map<string, { event_type: string, count24h: number, count7d: number }>} */
  const map = new Map()

  for (const row of activity?.by_type_24h || []) {
    const eventType = String(row.event_type || '').trim()
    if (!eventType) continue
    map.set(eventType, {
      event_type: eventType,
      count24h: Number(row.count) || 0,
      count7d: 0,
    })
  }

  for (const row of activity?.by_type_7d || []) {
    const eventType = String(row.event_type || '').trim()
    if (!eventType) continue
    const existing = map.get(eventType) || { event_type: eventType, count24h: 0, count7d: 0 }
    existing.count7d = Number(row.count) || 0
    map.set(eventType, existing)
  }

  return [...map.values()].sort(
    (a, b) => b.count24h - a.count24h || b.count7d - a.count7d || a.event_type.localeCompare(b.event_type),
  )
}
