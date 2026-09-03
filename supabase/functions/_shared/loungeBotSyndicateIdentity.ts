/**
 * Sharpe Signal vs Sharpe Syndicate bot identity.
 * Signal = edges / coffee / line alerts. Syndicate = desk cards / today picks / ledger slate.
 * Neither product may run the other's poll actions (cron + Edge enforce).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Scott Share / Sharpe Signal … edges, coffee, line moves. */
export const SHARPE_SIGNAL_BOT_SLUG = 'sports-odds'

/** Desk / slate product bot (Lounge + own fan sub). */
export const SHARPE_SYNDICATE_BOT_SLUG = 'sharpe-syndicate'
export const SHARPE_SYNDICATE_HANDLE = 'sharpesyndicate'
export const SHARPE_SYNDICATE_DISPLAY_NAME = 'Sharpe Syndicate'

/** Cron/Edge: only Signal (or non-Syndicate odds bots) may run these. */
export const SIGNAL_ALERT_POLL_ACTIONS = new Set([
  'poll_edges',
  'poll_live',
  'daily_slates',
  'best_bet_hour',
  'value_bet_radar',
])

/** Cron/Edge: only @sharpesyndicate may run these once the desk bot exists. */
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

export type SlatePublisherMode = 'syndicate' | 'legacy_signal'

export type SlatePublisher = {
  botUserId: string
  mode: SlatePublisherMode
  slug: string
}

export function isSharpeSyndicateSlug(slug: string): boolean {
  return String(slug || '').trim().toLowerCase() === SHARPE_SYNDICATE_BOT_SLUG
}

export function isSharpeSignalSlug(slug: string): boolean {
  return String(slug || '').trim().toLowerCase() === SHARPE_SIGNAL_BOT_SLUG
}

export async function resolveSyndicateBotUserId(
  admin: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await admin
    .from('lounge_bot_accounts')
    .select('user_id')
    .eq('slug', SHARPE_SYNDICATE_BOT_SLUG)
    .maybeSingle()
  if (error || !data?.user_id) return null
  return String(data.user_id)
}

/**
 * Prefer @sharpesyndicate for slate / today-picks / ledger publish.
 * Falls back to the invoked bot (usually Signal) until Syndicate exists.
 */
export async function resolveSlatePublisher(
  admin: SupabaseClient,
  fallbackBotUserId: string,
): Promise<SlatePublisher> {
  const syndicateId = await resolveSyndicateBotUserId(admin)
  if (syndicateId) {
    return {
      botUserId: syndicateId,
      mode: 'syndicate',
      slug: SHARPE_SYNDICATE_BOT_SLUG,
    }
  }
  return {
    botUserId: fallbackBotUserId,
    mode: 'legacy_signal',
    slug: SHARPE_SIGNAL_BOT_SLUG,
  }
}

/**
 * Product ownership gate for lounge-odds-poll.
 * Returns null when allowed, or a skip reason string.
 */
export async function oddsPollActionOwnershipSkip(
  admin: SupabaseClient,
  slug: string,
  action: string,
): Promise<string | null> {
  const a = String(action || '').trim().toLowerCase()
  const s = String(slug || '').trim().toLowerCase()

  if (SIGNAL_ALERT_POLL_ACTIONS.has(a) && isSharpeSyndicateSlug(s)) {
    return 'signal_alerts_not_on_syndicate'
  }

  if (SYNDICATE_DESK_POLL_ACTIONS.has(a) && !isSharpeSyndicateSlug(s)) {
    const { data: synd } = await admin
      .from('lounge_bot_accounts')
      .select('run_state, enabled')
      .eq('slug', SHARPE_SYNDICATE_BOT_SLUG)
      .maybeSingle()
    if (synd?.enabled === true && String(synd.run_state || '') === 'running') {
      return 'desk_actions_not_on_signal'
    }
  }

  return null
}
