/**
 * Admin bot lifecycle: create bot account (+ auth user + profile).
 *
 * POST { "action": "create_bot", ...fields }
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, requireAdminUser } from '../_shared/adminAuth.ts'

type CreateBotBody = {
  action: 'create_bot'
  slug: string
  pipeline: 'market_news' | 'odds_api' | 'x' | 'manual'
  handle: string
  display_name: string
  bio?: string
  category_pills_default?: string[]
  max_posts_per_day?: number
  max_posts_per_hour?: number
  publish_score_threshold?: number
  config?: Record<string, unknown>
  x_handles?: string[]
  run_state?: 'running' | 'paused' | 'stopped'
}

async function authorize(req: Request): Promise<{ admin: SupabaseClient; userId: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw adminOpsJson(503, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' })
  }
  const { user } = await requireAdminUser(req)
  return { admin: createClient(supabaseUrl, serviceRoleKey), userId: user.id }
}

function normalizeHandle(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/^@/, '')
}

function normalizeSlug(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
}

function reviewModeForPipeline(pipeline: string): 'automatic' | 'editorial' {
  if (pipeline === 'x') return 'editorial'
  if (pipeline === 'manual') return 'editorial'
  return 'automatic'
}

async function seedPipelineExtras(
  admin: SupabaseClient,
  botUserId: string,
  pipeline: string,
  slug: string,
  xHandles: string[],
) {
  if (pipeline === 'market_news') {
    const sources = [
      { name: 'Finnhub general market', kind: 'finnhub_general', api_config: { category: 'general' }, poll_interval_sec: 180 },
      { name: 'Finnhub M&A', kind: 'finnhub_category', api_config: { category: 'merger' }, poll_interval_sec: 300 },
    ]
    for (const s of sources) {
      const { data: exists } = await admin
        .from('lounge_news_sources')
        .select('id')
        .eq('bot_user_id', botUserId)
        .eq('name', s.name)
        .maybeSingle()
      if (!exists?.id) {
        await admin.from('lounge_news_sources').insert({ bot_user_id: botUserId, ...s, enabled: true })
      }
    }
  }
  if (pipeline === 'odds_api') {
    await admin.from('lounge_bot_odds_config').upsert({
      bot_user_id: botUserId,
      sports_keys: ['baseball_mlb', 'basketball_wnba', 'americanfootball_nfl', 'basketball_nba'],
      regions: ['us'],
      markets: ['h2h', 'spreads'],
      min_edge_pct: 2,
      max_picks_per_run: 1,
      max_edge_alerts_per_day: 6,
      max_slate_posts_per_day: 10,
      daily_slate_enabled: true,
      enabled: true,
    })
  }
  if (pipeline === 'x' && xHandles.length) {
    for (const h of xHandles) {
      await admin.rpc('admin_lounge_bot_add_x_source', {
        p_bot_user_id: botUserId,
        p_handle: h,
      })
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'POST required.' })

  try {
    const { admin } = await authorize(req)
    const body = (await req.json().catch(() => ({}))) as Partial<CreateBotBody>

    if (body.action !== 'create_bot') {
      return adminOpsJson(400, { error: 'Unknown action. Use create_bot.' })
    }

    const slug = normalizeSlug(body.slug || '')
    const handle = normalizeHandle(body.handle || '')
    const displayName = String(body.display_name || '').trim()
    const pipeline = body.pipeline

    if (!slug || slug.length < 2) return adminOpsJson(400, { error: 'Invalid slug.' })
    if (!handle.match(/^[a-z0-9_]{2,30}$/)) return adminOpsJson(400, { error: 'Invalid handle.' })
    if (!displayName) return adminOpsJson(400, { error: 'display_name required.' })
    if (!pipeline || !['market_news', 'odds_api', 'x', 'manual'].includes(pipeline)) {
      return adminOpsJson(400, { error: 'Invalid pipeline.' })
    }

    const { data: existingSlug } = await admin.from('lounge_bot_accounts').select('user_id').eq('slug', slug).maybeSingle()
    if (existingSlug?.user_id) return adminOpsJson(409, { error: 'Slug already exists.' })

    const email = `bot.${slug}.${crypto.randomUUID().slice(0, 8)}@bots.edgetilt.local`
    const password = crypto.randomUUID() + crypto.randomUUID()

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { is_bot: true, bot_slug: slug },
    })
    if (authErr || !authData.user?.id) {
      return adminOpsJson(500, { error: authErr?.message || 'Auth user create failed.' })
    }

    const userId = authData.user.id

    const { error: profileErr } = await admin.from('profiles').insert({
      user_id: userId,
      handle,
      display_name: displayName,
      bio: String(body.bio || '').trim().slice(0, 160) || null,
      role: 'user',
      is_bot: true,
    })
    if (profileErr) {
      await admin.auth.admin.deleteUser(userId)
      return adminOpsJson(500, { error: profileErr.message })
    }

    const reviewMode = reviewModeForPipeline(pipeline)
    const runState = body.run_state || 'stopped'

    const { error: botErr } = await admin.from('lounge_bot_accounts').insert({
      user_id: userId,
      slug,
      pipeline,
      review_mode: reviewMode,
      display_name: displayName,
      run_state: runState,
      category_pills_default: body.category_pills_default || [],
      max_posts_per_day: body.max_posts_per_day ?? (pipeline === 'odds_api' ? 2 : 12),
      max_posts_per_hour: body.max_posts_per_hour ?? (pipeline === 'odds_api' ? 1 : 4),
      publish_score_threshold: body.publish_score_threshold ?? 55,
      config: body.config || {},
    })
    if (botErr) {
      await admin.auth.admin.deleteUser(userId)
      return adminOpsJson(500, { error: botErr.message })
    }

    await seedPipelineExtras(admin, userId, pipeline, slug, body.x_handles || [])

    return adminOpsJson(200, {
      ok: true,
      user_id: userId,
      slug,
      handle,
      pipeline,
      review_mode: reviewMode,
      run_state: runState,
    })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return adminOpsJson(500, { error: message })
  }
})
