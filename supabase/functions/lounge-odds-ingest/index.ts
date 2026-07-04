/**
 * Sports odds bot — fetch The Odds API, pick, auto-publish.
 * Body: { "slug": "sports-odds", "dryRun": false }
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, requireAdminUser } from '../_shared/adminAuth.ts'
import {
  buildOddsPickCaption,
  oddsExternalKey,
  pickBestOddsCandidate,
  type OddsPick,
} from '../_shared/loungeBotOddsCaption.ts'
import { publishLoungeBotPost } from '../_shared/loungeBotPublish.ts'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'

async function authorize(req: Request): Promise<SupabaseClient> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) throw adminOpsJson(503, { error: 'Missing env.' })

  const authHeader = req.headers.get('Authorization') || ''
  if (authHeader.replace(/^Bearer\s+/i, '').trim() === serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey)
  }
  await requireAdminUser(req)
  return createClient(supabaseUrl, serviceRoleKey)
}

function oddsKey(): string {
  return String(Deno.env.get('THE_ODDS_API_KEY') || '').trim()
}

async function fetchSportOdds(sport: string, regions: string[], markets: string[]) {
  const key = oddsKey()
  if (!key) throw new Error('THE_ODDS_API_KEY not set on Edge.')
  const qs = new URLSearchParams({
    apiKey: key,
    regions: regions.join(','),
    markets: markets.join(','),
    oddsFormat: 'american',
  })
  const res = await fetch(`${ODDS_BASE}/sports/${sport}/odds?${qs}`)
  if (!res.ok) throw new Error(`Odds API ${sport} ${res.status}`)
  return { events: await res.json(), remaining: res.headers.get('x-requests-remaining') }
}

function ptDayStartIso(): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return new Date(`${y}-${m}-${d}T00:00:00-07:00`).toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'POST required.' })

  try {
    const admin = await authorize(req)
    const body = await req.json().catch(() => ({}))
    const slug = String(body?.slug || 'sports-odds').trim()
    const dryRun = body?.dryRun === true

    const { data: bot, error: botErr } = await admin
      .from('lounge_bot_accounts')
      .select('user_id, slug, run_state, pipeline, category_pills_default, max_posts_per_day, config')
      .eq('slug', slug)
      .maybeSingle()

    if (botErr) return adminOpsJson(500, { error: botErr.message })
    if (!bot?.user_id) return adminOpsJson(404, { error: 'Odds bot not configured.' })
    if (bot.pipeline !== 'odds_api') return adminOpsJson(400, { error: 'Not an odds_api bot.' })
    if (!dryRun && bot.run_state !== 'running') {
      return adminOpsJson(200, { ok: true, skipped: bot.run_state, slug })
    }

    const { data: oddsCfg } = await admin
      .from('lounge_bot_odds_config')
      .select('*')
      .eq('bot_user_id', bot.user_id)
      .maybeSingle()

    const sports = (oddsCfg?.sports_keys as string[]) || ['americanfootball_nfl', 'basketball_nba']
    const regions = (oddsCfg?.regions as string[]) || ['us']
    const markets = (oddsCfg?.markets as string[]) || ['h2h', 'spreads']
    const minEdge = Number(oddsCfg?.min_edge_pct) || 4
    const maxPicks = Number(oddsCfg?.max_picks_per_run) || 1

    const dayStart = ptDayStartIso()
    const { count: publishedToday } = await admin
      .from('lounge_bot_publish_log')
      .select('id', { count: 'exact', head: true })
      .eq('bot_user_id', bot.user_id)
      .eq('status', 'published')
      .gte('created_at', dayStart)

    const cap = Number(bot.max_posts_per_day) || 2
    const room = Math.max(0, cap - (publishedToday || 0))
    if (!dryRun && room <= 0) {
      return adminOpsJson(200, { ok: true, skipped: 'daily_cap', slug, publishedToday })
    }

    const candidates: OddsPick[] = []
    let requestsRemaining: string | null = null

    for (const sport of sports) {
      const { events, remaining } = await fetchSportOdds(sport, regions, markets)
      requestsRemaining = remaining
      if (!dryRun) {
        await admin.from('lounge_odds_snapshots').insert({
          bot_user_id: bot.user_id,
          sport,
          payload: events,
        })
      }
      const pick = pickBestOddsCandidate(Array.isArray(events) ? events : [], sport)
      if (pick && pick.edgePct >= minEdge) candidates.push(pick)
    }

    candidates.sort((a, b) => b.edgePct - a.edgePct)
    const toPublish = candidates.slice(0, dryRun ? 3 : Math.min(maxPicks, room))

    let published = 0
    for (const pick of toPublish) {
      const caption = buildOddsPickCaption(pick)
      if (dryRun) continue

      const ext = oddsExternalKey(pick)
      const { data: dupe } = await admin
        .from('lounge_bot_publish_log')
        .select('id')
        .eq('bot_user_id', bot.user_id)
        .eq('caption', caption)
        .gte('created_at', dayStart)
        .maybeSingle()
      if (dupe?.id) continue

      const pills = bot.category_pills_default?.length ? bot.category_pills_default : ['sports']
      const result = await publishLoungeBotPost(admin, {
        botUserId: bot.user_id,
        caption,
        categoryPills: pills,
      })

      if (result.postId) {
        published += 1
        await admin.from('lounge_bot_publish_log').insert({
          bot_user_id: bot.user_id,
          post_id: result.postId,
          caption,
          score: pick.edgePct,
          status: 'published',
        })
      } else {
        await admin.from('lounge_bot_publish_log').insert({
          bot_user_id: bot.user_id,
          caption,
          score: pick.edgePct,
          status: 'failed',
          error_message: result.error?.slice(0, 400),
        })
      }
    }

    if (!dryRun) {
      await admin.from('lounge_bot_accounts').update({
        last_poll_at: new Date().toISOString(),
        last_publish_at: published > 0 ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      }).eq('user_id', bot.user_id)
    }

    return adminOpsJson(200, {
      ok: true,
      slug,
      dryRun,
      candidateCount: candidates.length,
      published,
      requestsRemaining,
      topCandidates: toPublish.map((p) => ({
        edge: p.edgePct,
        caption: buildOddsPickCaption(p).slice(0, 120),
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return adminOpsJson(500, { error: err instanceof Error ? err.message : 'Unexpected error' })
  }
})
