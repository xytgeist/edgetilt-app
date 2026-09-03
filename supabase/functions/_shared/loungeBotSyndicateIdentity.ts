/**
 * Sharpe Signal vs Sharpe Syndicate bot identity.
 * Signal = edges / coffee / line alerts. Syndicate = desk cards / today picks / ledger slate.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Scott Share / Sharpe Signal … edges, coffee, line moves. */
export const SHARPE_SIGNAL_BOT_SLUG = 'sports-odds'

/** Desk / slate product bot (Lounge + own fan sub). Keep run_state stopped so cron does not duplicate Signal polls. */
export const SHARPE_SYNDICATE_BOT_SLUG = 'sharpe-syndicate'
export const SHARPE_SYNDICATE_HANDLE = 'sharpesyndicate'
export const SHARPE_SYNDICATE_DISPLAY_NAME = 'Sharpe Syndicate'

export type SlatePublisherMode = 'syndicate' | 'legacy_signal'

export type SlatePublisher = {
  botUserId: string
  mode: SlatePublisherMode
  slug: string
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
