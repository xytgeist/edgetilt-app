/**
 * Per-alert destination routing for Scott Share (lounge feed vs creator fan sub chat).
 */

export type LoungeTeaserPct = 0 | 10 | 30

export type AlertRouteConfig = {
  lounge: boolean
  sub_chat: boolean
  lounge_teaser_pct: LoungeTeaserPct
}

/** @deprecated Legacy single-value routing (normalized on read). */
export type AlertDestination = 'lounge' | 'sub_chat' | 'sub_chat_10' | 'sub_chat_30'

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

export const DEFAULT_ALERT_ROUTES: Record<OddsAlertAudienceKey, AlertRouteConfig> = {
  coffee_covers: { lounge: true, sub_chat: false, lounge_teaser_pct: 0 },
  edge: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  line_movement: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  in_game_edge: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  period_report: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  best_bet_hour: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  arb_watch: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  sharp_report: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  value_bet_radar: { lounge: true, sub_chat: false, lounge_teaser_pct: 0 },
  starter_spotlight: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  confirmed_starters: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  injury_impact: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  rest_travel_edge: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
  fade_the_public: { lounge: false, sub_chat: true, lounge_teaser_pct: 0 },
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

function legacyStringToRoute(val: string): AlertRouteConfig | null {
  switch (val) {
    case 'all':
    case 'lounge':
      return { lounge: true, sub_chat: false, lounge_teaser_pct: 0 }
    case 'subscribers':
    case 'sub_chat':
      return { lounge: false, sub_chat: true, lounge_teaser_pct: 0 }
    case 'sub_chat_10':
      return { lounge: false, sub_chat: true, lounge_teaser_pct: 10 }
    case 'sub_chat_30':
      return { lounge: false, sub_chat: true, lounge_teaser_pct: 30 }
    default:
      return null
  }
}

function normalizeTeaserPct(raw: unknown): LoungeTeaserPct {
  const n = Number(raw)
  if (n === 10) return 10
  if (n === 30) return 30
  return 0
}

/** Parse one alert_audience value (legacy string or route object). */
export function parseAlertRouteConfig(raw: unknown): AlertRouteConfig | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    const lounge = obj.lounge === true
    const sub_chat = obj.sub_chat === true
    let lounge_teaser_pct = normalizeTeaserPct(obj.lounge_teaser_pct)
    if (lounge) lounge_teaser_pct = 0
    if (!lounge && !sub_chat && lounge_teaser_pct === 0) return null
    if (lounge_teaser_pct > 0 && !sub_chat) {
      return { lounge: false, sub_chat: true, lounge_teaser_pct }
    }
    return { lounge, sub_chat, lounge_teaser_pct }
  }
  const legacy = legacyStringToRoute(String(raw || '').trim())
  return legacy
}

export function normalizeAlertRouteForKey(
  key: OddsAlertAudienceKey,
  raw: unknown,
): AlertRouteConfig {
  return parseAlertRouteConfig(raw) ?? { ...DEFAULT_ALERT_ROUTES[key] }
}

export function normalizeAlertRoutes(
  raw: Record<string, unknown> | null | undefined,
): Record<OddsAlertAudienceKey, AlertRouteConfig> {
  const out = { ...DEFAULT_ALERT_ROUTES }
  if (!raw || typeof raw !== 'object') return out
  for (const key of ODDS_ALERT_AUDIENCE_KEYS) {
    const parsed = parseAlertRouteConfig(raw[key])
    if (parsed) out[key] = parsed
  }
  return out
}

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

export function resolveAlertRouteForKey(
  key: OddsAlertAudienceKey,
  alertAudience?: Record<string, unknown> | null,
): AlertRouteConfig {
  const normalized = normalizeAlertRoutes(alertAudience)
  return normalized[key]
}

export function resolveAlertRoute(
  postKind: string,
  alertAudience?: Record<string, unknown> | null,
): AlertRouteConfig {
  return resolveAlertRouteForKey(audienceKeyForPostKind(postKind), alertAudience)
}

export type AlertPublishTargets = {
  subChat: boolean
  loungeFeed: boolean
}

/** Resolve whether this alert posts to sub chat and/or the public lounge feed. */
export function resolvePublishTargetsFromRoute(
  route: AlertRouteConfig,
  roll = Math.random(),
): AlertPublishTargets {
  const subChat = route.sub_chat === true
  let loungeFeed = route.lounge === true
  if (!loungeFeed && subChat && route.lounge_teaser_pct > 0) {
    loungeFeed = roll < route.lounge_teaser_pct / 100
  }
  return { subChat, loungeFeed }
}

export function resolvePublishTargetsForPostKind(
  postKind: string,
  alertAudience?: Record<string, unknown> | null,
  roll = Math.random(),
): AlertPublishTargets {
  return resolvePublishTargetsFromRoute(resolveAlertRoute(postKind, alertAudience), roll)
}

/** @deprecated Use resolveAlertRoute + resolvePublishTargetsFromRoute. */
export function resolveAlertDestination(
  postKind: string,
  alertAudience?: Record<string, unknown> | null,
): AlertDestination {
  const route = resolveAlertRoute(postKind, alertAudience)
  if (route.lounge && route.sub_chat) return 'lounge'
  if (route.lounge) return 'lounge'
  if (route.sub_chat && route.lounge_teaser_pct === 10) return 'sub_chat_10'
  if (route.sub_chat && route.lounge_teaser_pct === 30) return 'sub_chat_30'
  if (route.sub_chat) return 'sub_chat'
  return 'lounge'
}

/** @deprecated Use resolvePublishTargetsFromRoute. */
export function resolvePublishTargets(
  destination: AlertDestination,
  roll = Math.random(),
): AlertPublishTargets {
  return resolvePublishTargetsFromRoute(parseAlertRouteConfig(destination) ?? {
    lounge: true,
    sub_chat: false,
    lounge_teaser_pct: 0,
  }, roll)
}

/** Lounge feed posts from Scott routing are always public (fan gating is sub chat). */
export function resolveAlertSubscriberOnly(
  _postKind: string,
  _alertAudience?: Record<string, unknown> | null,
): boolean {
  return false
}
