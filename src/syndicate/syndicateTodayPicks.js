/**
 * Manual "Run picks for today" ... gap-fill for games kicking today (PT),
 * not a replay of scheduled cron packages.
 */
const SPORT_LABEL = {
  americanfootball_ncaaf: 'CFB',
  americanfootball_nfl: 'NFL',
  mma_mixed_martial_arts: 'UFC',
}

/**
 * @param {string} sportKey
 * @returns {{ action: string, sportKey: string, sportLabel: string, summary: string }}
 */
export function todayPicksPlan(sportKey) {
  const sportLabel = SPORT_LABEL[sportKey] || sportKey
  return {
    action: 'picks_for_today',
    sportKey,
    sportLabel,
    summary: `Full syndicate card for every ${sportLabel} game kicking today (PT). Fills gaps the scheduled posts do not cover.`,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, sportKey: string, dryRun?: boolean }} opts
 */
export async function runTodayPicksForSport(supabaseClient, opts) {
  const plan = todayPicksPlan(opts.sportKey)
  const slug = opts.slug || 'sports-odds'
  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'picks_for_today',
      sportKey: opts.sportKey,
      dryRun: opts.dryRun === true,
    },
  })
  if (error) return { plan, data: null, error: new Error(error.message || 'Run picks failed') }
  if (data?.error) return { plan, data: null, error: new Error(String(data.error)) }
  return { plan, data, error: null }
}

/**
 * @param {Record<string, unknown> | null | undefined} data
 * @param {boolean} dryRun
 */
export function formatTodayPicksResult(data, dryRun = false) {
  if (!data) return 'No response from Edge.'
  if (data.message && data.ok === false) return String(data.message)
  if (data.skipped) return `Skipped: ${data.skipped}`

  const gamesToday = data.gamesToday != null ? `${data.gamesToday} games today` : null
  const voted = data.totalGames != null ? `${data.totalGames} with desk votes` : null
  const h = data.hammersCount != null ? `${data.hammersCount} hammers` : null
  const c = data.consensusCount != null ? `${data.consensusCount} consensus` : null
  const stats = [gamesToday, voted, h, c].filter(Boolean).join(' · ')

  if (dryRun || data.dryRun) {
    if (data.previewCaption || data.captionPreview) {
      return `[Dry run] ${stats || 'Preview ready.'}`
    }
    return `[Dry run] ${stats || 'Ready.'}`
  }

  if (data.ok === false) return data.message || data.error || 'Run failed.'
  if (data.postId) return `Published ${stats || ''} (post ${String(data.postId).slice(0, 8)}…).`.trim()
  if (data.ok) return `Published.${stats ? ` ${stats}` : ''}`
  return data.message || 'Done.'
}
