/**
 * Map sport + PT calendar day → lounge-odds-poll action for manual "Run picks for today".
 */
const PT = 'America/Los_Angeles'

function ptWeekdayShort(now = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: PT, weekday: 'short' }).format(now)
}

const SPORT_LABEL = {
  americanfootball_ncaaf: 'CFB',
  americanfootball_nfl: 'NFL',
  mma_mixed_martial_arts: 'UFC',
}

/**
 * @param {string} sportKey
 * @param {Date} [now]
 * @returns {{ action: string, sportKey: string, sportLabel: string, summary: string, audience: 'public' | 'vip' | 'both' }}
 */
export function resolveTodayPicksPlan(sportKey, now = new Date()) {
  const sportLabel = SPORT_LABEL[sportKey] || sportKey
  const dow = ptWeekdayShort(now)

  if (sportKey === 'americanfootball_ncaaf') {
    if (dow === 'Thu') {
      return {
        action: 'cfb_thu_night_spotlight',
        sportKey,
        sportLabel,
        summary: 'Thursday night public tease (1 lean) + VIP deep dive',
        audience: 'both',
      }
    }
    if (dow === 'Wed') {
      return {
        action: 'cfb_wed_midweek_vip',
        sportKey,
        sportLabel,
        summary: 'Wed midweek Thu/Fri night leans (VIP sub chat only)',
        audience: 'vip',
      }
    }
    if (dow === 'Fri') {
      return {
        action: 'cfb_slate_card',
        sportKey,
        sportLabel,
        summary: 'Saturday lock house card (public teaser + VIP full)',
        audience: 'both',
      }
    }
    if (dow === 'Sat') {
      return {
        action: 'cfb_sat_vip_adds_kills',
        sportKey,
        sportLabel,
        summary: 'Saturday VIP adds/kills (only if lock flipped or starter shock)',
        audience: 'vip',
      }
    }
    return {
      action: 'cfb_slate_card',
      sportKey,
      sportLabel,
      summary: 'Next CFB slate window (full card for upcoming cluster)',
      audience: 'both',
    }
  }

  if (sportKey === 'americanfootball_nfl') {
    if (dow === 'Wed') {
      return {
        action: 'nfl_wed_tnf_vip',
        sportKey,
        sportLabel,
        summary: 'Wednesday TNF VIP watch package',
        audience: 'vip',
      }
    }
    if (dow === 'Fri') {
      return {
        action: 'nfl_slate_card',
        sportKey,
        sportLabel,
        summary: 'Sunday lock house card (public teaser + VIP full)',
        audience: 'both',
      }
    }
    if (dow === 'Sat') {
      return {
        action: 'nfl_sat_vip_adds_kills',
        sportKey,
        sportLabel,
        summary: 'Saturday VIP adds/kills',
        audience: 'vip',
      }
    }
    return {
      action: 'nfl_slate_card',
      sportKey,
      sportLabel,
      summary: 'Next NFL slate window (full card for upcoming cluster)',
      audience: 'both',
    }
  }

  if (sportKey === 'mma_mixed_martial_arts') {
    return {
      action: 'ufc_slate_card',
      sportKey,
      sportLabel,
      summary: 'UFC fight card syndicate slate',
      audience: 'both',
    }
  }

  return {
    action: 'nfl_slate_card',
    sportKey: sportKey || 'americanfootball_nfl',
    sportLabel,
    summary: 'Slate card drop',
    audience: 'both',
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, sportKey: string, dryRun?: boolean, now?: Date }} opts
 */
export async function runTodayPicksForSport(supabaseClient, opts) {
  const plan = resolveTodayPicksPlan(opts.sportKey, opts.now)
  const slug = opts.slug || 'sports-odds'
  const body = {
    slug,
    action: plan.action,
    dryRun: opts.dryRun === true,
  }
  if (plan.action === 'nfl_slate_card' || plan.action === 'cfb_slate_card') {
    body.sportKey = plan.sportKey
  }

  const { data, error } = await supabaseClient.functions.invoke('lounge-odds-poll', { body })
  if (error) return { plan, data: null, error: new Error(error.message || 'Run picks failed') }
  if (data?.error) return { plan, data: null, error: new Error(String(data.error)) }
  return { plan, data, error: null }
}

/**
 * @param {Record<string, unknown> | null | undefined} data
 * @param {{ action: string, dryRun?: boolean }} plan
 */
export function formatTodayPicksResult(data, plan, dryRun = false) {
  if (!data) return 'No response from Edge.'
  if (data.skipped) return `Skipped: ${data.skipped}`
  if (dryRun || data.dryRun) {
    const preview = data.captionPreview || data.message
    if (preview) return `[Dry run] ${String(preview).slice(0, 220)}`
    const parts = []
    if (data.totalGames != null) parts.push(`${data.totalGames} games`)
    if (data.hammersCount != null) parts.push(`${data.hammersCount} hammers`)
    if (data.consensusCount != null) parts.push(`${data.consensusCount} consensus`)
    if (data.gameCount != null) parts.push(`${data.gameCount} games`)
    return `[Dry run] ${parts.join(' · ') || 'Ready.'}`
  }
  if (data.ok === false) return data.message || data.error || 'Run failed.'
  if (data.postId) return `Published (post ${String(data.postId).slice(0, 8)}…).`
  if (data.ok) return 'Published.'
  return data.message || 'Done.'
}
