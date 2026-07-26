/**
 * Per-alert destination routing for Scott Share (lounge feed vs creator fan sub chat).
 */

export type AlertDestination = 'lounge' | 'sub_chat' | 'sub_chat_10' | 'sub_chat_30'

/** @deprecated Legacy feed-only audience values (normalized on read). */
export type LegacyAlertAudience = 'all' | 'subscribers'

export type OddsAlertAudienceKey =
  | 'coffee_covers'
  | 'edge'
  | 'line_movement'
  | 'in_game_edge'
  | 'period_report'
  | 'best_bet_hour'
  | 'arb_watch'
  | 'sharp_report'
  | 'value_bet_radar'
  | 'starter_spotlight'
  | 'confirmed_starters'
  | 'injury_impact'
  | 'rest_travel_edge'
  | 'fade_the_public'

export const ODDS_ALERT_AUDIENCE_KEYS: OddsAlertAudienceKey[] = [
  'coffee_covers',
  'edge',
  'line_movement',
  'in_game_edge',
  'period_report',
  'best_bet_hour',
  'arb_watch',
  'sharp_report',
  'value_bet_radar',
  'starter_spotlight',
  'confirmed_starters',
  'injury_impact',
  'rest_travel_edge',
  'fade_the_public',
]

export const ALERT_DESTINATION_VALUES: AlertDestination[] = [
  'lounge',
  'sub_chat',
  'sub_chat_10',
  'sub_chat_30',
]

export const DEFAULT_ALERT_AUDIENCE: Record<OddsAlertAudienceKey, AlertDestination> = {
  coffee_covers: 'lounge',
  edge: 'sub_chat',
  line_movement: 'sub_chat',
  in_game_edge: 'sub_chat',
  period_report: 'sub_chat',
  best_bet_hour: 'sub_chat',
  arb_watch: 'sub_chat',
  sharp_report: 'sub_chat',
  value_bet_radar: 'lounge',
  starter_spotlight: 'sub_chat',
  confirmed_starters: 'sub_chat',
  injury_impact: 'sub_chat',
  rest_travel_edge: 'sub_chat',
  fade_the_public: 'sub_chat',
}

export const ALERT_AUDIENCE_LABELS: Record<OddsAlertAudienceKey, string> = {
  coffee_covers: 'Coffee & Covers',
  edge: '+EV Edge Alerts',
  line_movement: 'Line Movement',
  in_game_edge: 'In-Game Edge',
  period_report: 'Period / Halftime Report',
  best_bet_hour: 'Best Bet of the Hour',
  arb_watch: 'Arb Watch',
  sharp_report: "Sharpe's Sharp Report",
  value_bet_radar: 'Value Bet Radar',
  starter_spotlight: 'Starter Spotlight',
  confirmed_starters: 'Confirmed Starters',
  injury_impact: 'Injury Impact',
  rest_travel_edge: 'Rest + Travel Advantage',
  fade_the_public: 'Fade the Public',
}

const LINE_KINDS = new Set(['line_movement', 'sharp_move', 'steam', 'rlm'])

/** Map publish_log post_kind to alert_audience config key. */
export function audienceKeyForPostKind(postKind: string): OddsAlertAudienceKey {
  if (LINE_KINDS.has(postKind)) return 'line_movement'
  if (postKind === 'coffee_covers' || postKind === 'slate') return 'coffee_covers'
  if (postKind === 'in_game_edge') return 'in_game_edge'
  if (postKind === 'period_report') return 'period_report'
  if (postKind === 'best_bet_hour') return 'best_bet_hour'
  if (postKind === 'arb_watch') return 'arb_watch'
  if (postKind === 'sharp_report') return 'sharp_report'
  if (postKind === 'value_bet_radar') return 'value_bet_radar'
  if (postKind === 'starter_spotlight') return 'starter_spotlight'
  if (postKind === 'confirmed_starters') return 'confirmed_starters'
  if (postKind === 'injury_impact') return 'injury_impact'
  if (postKind === 'rest_travel_edge') return 'rest_travel_edge'
  if (postKind === 'fade_the_public') return 'fade_the_public'
  return 'edge'
}

export function normalizeAlertDestinationValue(raw: unknown): AlertDestination | null {
  const val = String(raw || '').trim()
  if (val === 'all') return 'lounge'
  if (val === 'subscribers') return 'sub_chat'
  if (ALERT_DESTINATION_VALUES.includes(val as AlertDestination)) return val as AlertDestination
  return null
}

export function normalizeAlertAudience(
  raw: Record<string, unknown> | null | undefined,
): Record<OddsAlertAudienceKey, AlertDestination> {
  const out = { ...DEFAULT_ALERT_AUDIENCE }
  if (!raw || typeof raw !== 'object') return out
  for (const key of ODDS_ALERT_AUDIENCE_KEYS) {
    const normalized = normalizeAlertDestinationValue(raw[key])
    if (normalized) out[key] = normalized
  }
  return out
}

export function resolveAlertDestinationForKey(
  key: OddsAlertAudienceKey,
  alertAudience?: Record<string, unknown> | null,
): AlertDestination {
  const normalized = normalizeAlertAudience(alertAudience)
  return normalized[key]
}

export function resolveAlertDestination(
  postKind: string,
  alertAudience?: Record<string, unknown> | null,
): AlertDestination {
  return resolveAlertDestinationForKey(audienceKeyForPostKind(postKind), alertAudience)
}

export type AlertPublishTargets = {
  subChat: boolean
  loungeFeed: boolean
}

/** Resolve whether this alert posts to sub chat and/or the public lounge feed. */
export function resolvePublishTargets(
  destination: AlertDestination,
  roll = Math.random(),
): AlertPublishTargets {
  switch (destination) {
    case 'lounge':
      return { subChat: false, loungeFeed: true }
    case 'sub_chat':
      return { subChat: true, loungeFeed: false }
    case 'sub_chat_10':
      return { subChat: true, loungeFeed: roll < 0.10 }
    case 'sub_chat_30':
      return { subChat: true, loungeFeed: roll < 0.30 }
    default:
      return { subChat: false, loungeFeed: true }
  }
}

/** Lounge feed posts from Scott routing are always public (fan gating is sub chat). */
export function resolveAlertSubscriberOnly(
  _postKind: string,
  _alertAudience?: Record<string, unknown> | null,
): boolean {
  return false
}
