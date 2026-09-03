/** Keep in sync with supabase/functions/_shared/loungeBotSyndicateIdentity.ts */

export const SHARPE_SIGNAL_BOT_SLUG = 'sports-odds'
export const SHARPE_SYNDICATE_BOT_SLUG = 'sharpe-syndicate'
export const SHARPE_SYNDICATE_HANDLE = 'sharpesyndicate'

/** Signal-only lounge-odds-poll actions (alerts / coffee / radar). */
export const SIGNAL_ALERT_POLL_ACTIONS = new Set([
  'poll_edges',
  'poll_live',
  'daily_slates',
  'best_bet_hour',
  'value_bet_radar',
])

/** Syndicate-only desk / slate / VIP shop actions. */
export const SYNDICATE_DESK_POLL_ACTIONS = new Set([
  'predictive_pick',
  'nfl_slate_card',
  'cfb_slate_card',
  'nfl_wong_teaser',
  'nfl_primetime_spotlight',
  'nfl_halftime_pivot',
  'nfl_anytime_td',
  'nfl_live_middle_arb',
  'weekly_syndicate_recap',
  'syndicate_monthly_scoreboard',
  'ufc_slate_card',
  'nfl_wed_tnf_vip',
  'nfl_sat_vip_adds_kills',
  'cfb_wed_midweek_vip',
  'cfb_thu_night_spotlight',
  'cfb_sat_vip_adds_kills',
  'picks_for_today',
])

/**
 * Prefer Sharpe Syndicate for desk / today-picks Ops. Fall back to Signal odds bot.
 * @param {{ bots?: Array<{ slug?: string, pipeline?: string }> } | null} snapshot
 */
export function resolveSyndicateDeskBot(snapshot) {
  const bots = Array.isArray(snapshot?.bots) ? snapshot.bots : []
  const syndicate = bots.find(
    (b) => String(b.slug || '').toLowerCase() === SHARPE_SYNDICATE_BOT_SLUG,
  )
  if (syndicate) return syndicate
  const signal = bots.find(
    (b) => String(b.slug || '').toLowerCase() === SHARPE_SIGNAL_BOT_SLUG,
  )
  if (signal) return signal
  return bots.find((b) => b.pipeline === 'odds_api') || null
}
