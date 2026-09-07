/**
 * Farm door: external worker publishes as a pipeline=farm lounge persona.
 *
 * Auth: LOUNGE_BOT_FARM_INGEST_SECRET (Bearer or x-lounge-bot-farm-secret).
 * Does not accept admin JWT (portal uses Post as). Does not require service_role on the caller.
 *
 * POST JSON:
 *   slug, caption, source_url?, category_pills?, image_urls?, dedupe_key?, dry_run?
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  hasActiveDedupePublished,
  recordAlertDelivery,
} from '../_shared/loungeBotPublishDedupe.ts'
import { publishLoungeBotPost } from '../_shared/loungeBotPublish.ts'

const FARM_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lounge-bot-farm-secret',
}

function farmJson(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...FARM_CORS, 'Content-Type': 'application/json' },
  })
}

function timingEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  try {
    return crypto.subtle.timingSafeEqual(ea, eb)
  } catch {
    let out = 0
    for (let i = 0; i < ea.length; i += 1) out |= ea[i]! ^ eb[i]!
    return out === 0
  }
}

function isFarmAuthorized(req: Request): boolean {
  const expected = Deno.env.get('LOUNGE_BOT_FARM_INGEST_SECRET')?.trim() || ''
  if (!expected) return false
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const header = req.headers.get('x-lounge-bot-farm-secret')?.trim() || ''
  return timingEqual(bearer, expected) || timingEqual(header, expected)
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

async function countPublished(
  admin: SupabaseClient,
  botUserId: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await admin
    .from('lounge_bot_publish_log')
    .select('id', { count: 'exact', head: true })
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .gte('created_at', sinceIso)
  if (error) throw error
  return count || 0
}

type FarmBody = {
  slug?: string
  caption?: string
  source_url?: string
  category_pills?: string[]
  image_urls?: string[]
  dedupe_key?: string
  dry_run?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: FARM_CORS })
  if (req.method !== 'POST') return farmJson(405, { error: 'POST required.' })

  const expected = Deno.env.get('LOUNGE_BOT_FARM_INGEST_SECRET')?.trim() || ''
  if (!expected) {
    return farmJson(503, { error: 'LOUNGE_BOT_FARM_INGEST_SECRET is not set.' })
  }
  if (!isFarmAuthorized(req)) return farmJson(401, { error: 'Unauthorized.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return farmJson(503, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as FarmBody
    const slug = String(body.slug || '').trim().toLowerCase()
    if (!slug) return farmJson(400, { error: 'slug required.' })

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: bot, error: botErr } = await admin
      .from('lounge_bot_accounts')
      .select(
        'user_id, slug, pipeline, run_state, category_pills_default, max_posts_per_day, max_posts_per_hour',
      )
      .eq('slug', slug)
      .maybeSingle()

    if (botErr) return farmJson(500, { error: botErr.message })
    if (!bot?.user_id) return farmJson(404, { error: 'Bot not found.' })
    if (bot.pipeline !== 'farm') {
      return farmJson(400, { error: 'This door only publishes pipeline=farm personas.' })
    }
    if (bot.run_state !== 'running') {
      return farmJson(409, { error: `Bot is ${bot.run_state}.`, skipped: bot.run_state })
    }

    const caption = String(body.caption || '').trim()
    const imageUrls = Array.isArray(body.image_urls)
      ? body.image_urls.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 6)
      : []
    const sourceUrl = String(body.source_url || '').trim() || null
    const dedupeKey = String(body.dedupe_key || '').trim() || null
    const pills = Array.isArray(body.category_pills) && body.category_pills.length
      ? body.category_pills.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 3)
      : (bot.category_pills_default || [])

    if (!caption && !imageUrls.length) {
      return farmJson(400, { error: 'caption or image_urls required.' })
    }

    if (dedupeKey) {
      const dup = await hasActiveDedupePublished(
        admin,
        bot.user_id,
        dedupeKey,
        '1970-01-01T00:00:00.000Z',
      )
      if (dup) {
        return farmJson(200, { ok: true, skipped: 'already_published', dedupe_key: dedupeKey })
      }
    }

    const hourStart = new Date(Date.now() - 3600_000).toISOString()
    const publishedHour = await countPublished(admin, bot.user_id, hourStart)
    const publishedDay = await countPublished(admin, bot.user_id, ptDayStartIso())
    const hourCap = bot.max_posts_per_hour == null ? null : Number(bot.max_posts_per_hour)
    const dayCap = bot.max_posts_per_day == null ? null : Number(bot.max_posts_per_day)
    if (hourCap != null && publishedHour >= hourCap) {
      return farmJson(429, { error: 'Hourly cap reached.', skipped: 'hour_cap' })
    }
    if (dayCap != null && publishedDay >= dayCap) {
      return farmJson(429, { error: 'Daily cap reached.', skipped: 'day_cap' })
    }

    if (body.dry_run === true) {
      return farmJson(200, {
        ok: true,
        dry_run: true,
        slug,
        would_publish: true,
        posts_last_hour: publishedHour,
        posts_today: publishedDay,
      })
    }

    const published = await publishLoungeBotPost(admin, {
      botUserId: bot.user_id,
      caption,
      categoryPills: pills,
      sourceUrl,
      imageUrls,
    })
    if (!published.postId) {
      return farmJson(500, { error: published.error || 'Publish failed.' })
    }

    await recordAlertDelivery(
      admin,
      {
        botUserId: bot.user_id,
        caption,
        postKind: 'other',
        dedupeKey,
        score: null,
      },
      { postId: published.postId },
    )

    return farmJson(200, {
      ok: true,
      post_id: published.postId,
      slug,
      dedupe_key: dedupeKey,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return farmJson(500, { error: message })
  }
})
