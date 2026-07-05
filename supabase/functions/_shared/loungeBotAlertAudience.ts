/**
 * Per-alert audience routing for Scott Share (freemium feed gating).
 */

export type AlertAudience = 'all' | 'subscribers'

export type OddsAlertAudienceKey =
  | 'coffee_covers'
  | 'edge'
  | 'line_movement'
  | 'in_game_edge'
  | 'period_report'

export const ODDS_ALERT_AUDIENCE_KEYS: OddsAlertAudienceKey[] = [
  'coffee_covers',
  'edge',
  'line_movement',
  'in_game_edge',
  'period_report',
]

export const DEFAULT_ALERT_AUDIENCE: Record<OddsAlertAudienceKey, AlertAudience> = {
  coffee_covers: 'all',
  edge: 'subscribers',
  line_movement: 'subscribers',
  in_game_edge: 'subscribers',
  period_report: 'subscribers',
}

export const ALERT_AUDIENCE_LABELS: Record<OddsAlertAudienceKey, string> = {
  coffee_covers: 'Coffee & Covers',
  edge: '+EV Edge Alerts',
  line_movement: 'Line Movement',
  in_game_edge: 'In-Game Edge',
  period_report: 'Period / Halftime Report',
}

const LINE_KINDS = new Set(['line_movement', 'sharp_move', 'steam', 'rlm'])

/** Map publish_log post_kind to alert_audience config key. */
export function audienceKeyForPostKind(postKind: string): OddsAlertAudienceKey {
  if (LINE_KINDS.has(postKind)) return 'line_movement'
  if (postKind === 'coffee_covers' || postKind === 'slate') return 'coffee_covers'
  if (postKind === 'in_game_edge') return 'in_game_edge'
  if (postKind === 'period_report') return 'period_report'
  return 'edge'
}

export function normalizeAlertAudience(
  raw: Record<string, unknown> | null | undefined,
): Record<OddsAlertAudienceKey, AlertAudience> {
  const out = { ...DEFAULT_ALERT_AUDIENCE }
  if (!raw || typeof raw !== 'object') return out
  for (const key of ODDS_ALERT_AUDIENCE_KEYS) {
    const val = String(raw[key] || '').trim()
    if (val === 'all' || val === 'subscribers') out[key] = val
  }
  return out
}

/** True when the post should be subscriber_only on community_feed_posts. */
export function resolveAlertSubscriberOnly(
  postKind: string,
  alertAudience?: Record<string, unknown> | null,
): boolean {
  const key = audienceKeyForPostKind(postKind)
  const normalized = normalizeAlertAudience(alertAudience)
  return normalized[key] === 'subscribers'
}
