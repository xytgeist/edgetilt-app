/**
 * X-tracker ingest → editorial queue (pending_review).
 * Body: { "slug": "x-crypto", "dryRun": false, "force": false }
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, requireAdminUser } from '../_shared/adminAuth.ts'
import { rewriteTweetForBot } from '../_shared/loungeBotXRewrite.ts'
import { resolveXBotVoicePrompt } from '../_shared/loungeBotXVoice.ts'

const X_API = 'https://api.x.com/2'

async function authorize(req: Request): Promise<SupabaseClient> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) throw adminOpsJson(503, { error: 'Missing env.' })

  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (bearer === serviceRoleKey) return createClient(supabaseUrl, serviceRoleKey)
  await requireAdminUser(req)
  return createClient(supabaseUrl, serviceRoleKey)
}

function xToken(): string {
  return String(Deno.env.get('X_API_BEARER_TOKEN') || '').trim()
}

async function resolveXUserId(handle: string, token: string): Promise<string | null> {
  const res = await fetch(`${X_API}/users/by/username/${encodeURIComponent(handle)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const json = await res.json()
  return String(json?.data?.id || '') || null
}

function buildTweetExclude(src: { exclude_replies?: boolean | null; exclude_retweets?: boolean | null }) {
  const parts: string[] = []
  if (src.exclude_replies !== false) parts.push('replies')
  if (src.exclude_retweets !== false) parts.push('retweets')
  return parts.length ? parts.join(',') : ''
}

function isTopLevelTweet(tw: { referenced_tweets?: Array<{ type?: string }> }) {
  const refs = tw.referenced_tweets
  if (!Array.isArray(refs) || refs.length === 0) return true
  return !refs.some((r) => r?.type === 'replied_to' || r?.type === 'retweeted')
}

async function fetchTweets(
  userId: string,
  sinceId: string | null,
  token: string,
  src: { exclude_replies?: boolean | null; exclude_retweets?: boolean | null },
) {
  const params = new URLSearchParams({
    max_results: '10',
    'tweet.fields': 'created_at,entities,referenced_tweets',
  })
  const exclude = buildTweetExclude(src)
  if (exclude) params.set('exclude', exclude)
  if (sinceId) params.set('since_id', sinceId)
  const res = await fetch(`${X_API}/users/${userId}/tweets?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`X API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'POST required.' })

  try {
    const admin = await authorize(req)
    const body = await req.json().catch(() => ({}))
    const slug = String(body?.slug || '').trim()
    const dryRun = body?.dryRun === true

    const token = xToken()
    if (!token) return adminOpsJson(503, { error: 'X_API_BEARER_TOKEN not set on Edge.' })

    let botQuery = admin
      .from('lounge_bot_accounts')
      .select('user_id, slug, run_state, pipeline, display_name, category_pills_default, config')
      .eq('pipeline', 'x')
    if (slug) botQuery = botQuery.eq('slug', slug)
    else botQuery = botQuery.eq('run_state', 'running')

    const { data: bots, error: botErr } = await botQuery
    if (botErr) return adminOpsJson(500, { error: botErr.message })
    if (!bots?.length) return adminOpsJson(404, { error: 'No X bots found.' })

    let ingested = 0
    let polled = 0

    for (const bot of bots) {
      if (!dryRun && bot.run_state !== 'running') continue

      const { data: sources } = await admin
        .from('lounge_bot_x_sources')
        .select('*')
        .eq('bot_user_id', bot.user_id)
        .eq('enabled', true)

      const botConfig = (bot.config && typeof bot.config === 'object' ? bot.config : {}) as Record<string, unknown>
      const voicePrompt = resolveXBotVoicePrompt({
        config: botConfig,
        displayName: String(bot.display_name || ''),
      })

      for (const src of sources || []) {
        polled += 1
        try {
          let xUserId = src.x_user_id
          if (!xUserId) {
            xUserId = await resolveXUserId(src.x_handle, token)
            if (xUserId && !dryRun) {
              await admin.from('lounge_bot_x_sources').update({ x_user_id: xUserId }).eq('id', src.id)
            }
          }
          if (!xUserId) continue

          const json = await fetchTweets(xUserId, src.since_id, token, src)
          const tweets = Array.isArray(json?.data) ? json.data : []
          const newestId = json?.meta?.newest_id as string | undefined

          for (const tw of tweets) {
            if (!isTopLevelTweet(tw)) continue
            const text = String(tw.text || '').trim()
            const tweetId = String(tw.id || '')
            if (!text || !tweetId) continue

            const { data: existing } = await admin
              .from('lounge_bot_queue')
              .select('id')
              .eq('bot_user_id', bot.user_id)
              .eq('external_key', tweetId)
              .maybeSingle()
            if (existing?.id) continue

            const draft = await rewriteTweetForBot({
              sourceText: text,
              xHandle: src.x_handle,
              voicePrompt,
            })

            if (dryRun) {
              ingested += 1
              continue
            }

            await admin.from('lounge_bot_queue').insert({
              source_type: 'x',
              source_id: src.id,
              external_key: tweetId,
              bot_user_id: bot.user_id,
              source_text: text,
              source_url: `https://x.com/${src.x_handle}/status/${tweetId}`,
              source_posted_at: tw.created_at || null,
              draft_caption: draft,
              category_pills: bot.category_pills_default || [],
              attach_source_link: true,
              status: 'pending_review',
              source_payload: tw,
            })
            ingested += 1
          }

          if (!dryRun && newestId) {
            await admin.from('lounge_bot_x_sources').update({
              since_id: newestId,
              last_polled_at: new Date().toISOString(),
              last_error: null,
            }).eq('id', src.id)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'X poll failed'
          if (!dryRun) {
            await admin.from('lounge_bot_x_sources').update({
              last_polled_at: new Date().toISOString(),
              last_error: msg.slice(0, 400),
            }).eq('id', src.id)
          }
        }
      }

      if (!dryRun) {
        await admin.from('lounge_bot_accounts').update({
          last_poll_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', bot.user_id)
      }
    }

    return adminOpsJson(200, { ok: true, slug: slug || 'all', dryRun, polled, ingested })
  } catch (err) {
    if (err instanceof Response) return err
    return adminOpsJson(500, { error: err instanceof Error ? err.message : 'Unexpected error' })
  }
})
