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
async function messageFromFunctionsInvokeError(error, invokeResponse) {
  const fallback = String(error?.message || 'Run picks failed.').trim()
  const res =
    error?.context && typeof error.context.status === 'number'
      ? error.context
      : invokeResponse && typeof invokeResponse.status === 'number'
        ? invokeResponse
        : null
  if (!res || typeof res.clone !== 'function') return fallback
  try {
    const raw = (await res.clone().text()).trim()
    if (!raw) return fallback
    if (raw.startsWith('{')) {
      const body = JSON.parse(raw)
      if (body?.error) return String(body.error)
      if (body?.message) return String(body.message)
    }
    return raw.slice(0, 400)
  } catch {
    return fallback
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, sportKey: string, dryRun?: boolean }} opts
 */
export async function runTodayPicksForSport(supabaseClient, opts) {
  const plan = todayPicksPlan(opts.sportKey)
  const slug = opts.slug || 'sports-odds'
  const { data, error, response } = await supabaseClient.functions.invoke('lounge-odds-poll', {
    body: {
      slug,
      action: 'picks_for_today',
      sportKey: opts.sportKey,
      dryRun: opts.dryRun === true,
    },
  })
  if (error) {
    const msg = await messageFromFunctionsInvokeError(error, response)
    return { plan, data: null, error: new Error(msg) }
  }
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
  const s = data.splitsCount != null ? `${data.splitsCount} split` : null
  const ms = data.majoritySplitsCount != null ? `${data.majoritySplitsCount} house divided` : null
  const solo = data.solosCount != null ? `${data.solosCount} solos` : null
  const ap = data.passOnlyCount != null ? `${data.passOnlyCount} all pass` : null
  const stats = [gamesToday, voted, h, c, ms, solo, s, ap].filter(Boolean).join(' · ')

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
