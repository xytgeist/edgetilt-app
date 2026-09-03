/** Keep in sync with supabase/functions/_shared/loungeBotSyndicateIdentity.ts */

export const SHARPE_SIGNAL_BOT_SLUG = 'sports-odds'
export const SHARPE_SYNDICATE_BOT_SLUG = 'sharpe-syndicate'
export const SHARPE_SYNDICATE_HANDLE = 'sharpesyndicate'

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
