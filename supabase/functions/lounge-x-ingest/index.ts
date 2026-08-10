/**
 * X-tracker ingest → editorial queue (pending_review).
 * Body: { "slug": "x-crypto", "dryRun": false }
 * Body (single post): { "slug": "x-crypto", "tweetUrl": "https://x.com/handle/status/123", "sourceText"?: "..." }
 */
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { rewriteTweetForBot } from '../_shared/loungeBotXRewrite.ts'
import { resolveXBotVoicePrompt } from '../_shared/loungeBotXVoice.ts'
import { canonicalXTweetUrl, parseXTweetUrl } from '../_shared/loungeBotXTweetUrl.ts'
import { readXApiError } from '../_shared/loungeBotXApi.ts'
import { resolveTweetForManualIngest, expandTweetTextUrls } from '../_shared/loungeBotXTweetFetch.ts'

const X_API = 'https://api.x.com/2'

async function authorize(req: Request): Promise<SupabaseClient> {
  return authorizeServiceRoleOrAdmin(req)
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

type XTimelineFetch = {
  tweets: Array<Record<string, unknown>>
  newestId: string | null
  resultCount: number | null
  meta: Record<string, unknown> | null
  errors: unknown
  rawKeys: string[]
}

async function fetchTweets(
  userId: string,
  sinceId: string | null,
  token: string,
  src: { exclude_replies?: boolean | null; exclude_retweets?: boolean | null },
): Promise<XTimelineFetch> {
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
    throw new Error(await readXApiError(res))
  }
  const json = await res.json()
  const tweets = Array.isArray(json?.data) ? json.data : []
  const meta = json?.meta && typeof json.meta === 'object' ? (json.meta as Record<string, unknown>) : null
  const newestId = meta?.newest_id != null ? String(meta.newest_id) : null
  const resultCount =
    meta?.result_count != null && Number.isFinite(Number(meta.result_count))
      ? Number(meta.result_count)
      : tweets.length
  return {
    tweets,
    newestId,
    resultCount,
    meta,
    errors: json?.errors ?? null,
    rawKeys: json && typeof json === 'object' ? Object.keys(json) : [],
  }
}

async function ingestTweetUrl(
  admin: SupabaseClient,
  opts: { slug: string; tweetUrl: string; dryRun: boolean; token: string; sourceText?: string },
) {
  const parsed = parseXTweetUrl(opts.tweetUrl)
  if (!parsed?.tweetId) {
    return adminOpsJson(400, { error: 'Invalid X post URL. Paste a link like https://x.com/handle/status/123' })
  }

  const { data: bot, error: botErr } = await admin
    .from('lounge_bot_accounts')
    .select('user_id, slug, pipeline, display_name, category_pills_default, config')
    .eq('pipeline', 'x')
    .eq('slug', opts.slug)
    .maybeSingle()

  if (botErr) return adminOpsJson(500, { error: botErr.message })
  if (!bot?.user_id) return adminOpsJson(404, { error: `X bot not found: ${opts.slug}` })

  let fetched
  try {
    fetched = await resolveTweetForManualIngest({
      tweetUrl: opts.tweetUrl,
      tweetId: parsed.tweetId,
      handleHint: parsed.handle,
      sourceText: opts.sourceText,
      xBearerToken: opts.token || undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not resolve tweet text'
    console.error('lounge-x-ingest tweet resolve failed', { slug: opts.slug, tweetId: parsed.tweetId, msg })
    return adminOpsJson(400, { error: msg })
  }

  if (!fetched?.text) {
    return adminOpsJson(404, { error: 'Tweet not found or text could not be resolved.' })
  }

  const xHandle = parsed.handle || fetched.authorHandle || 'unknown'
  const sourceUrl = canonicalXTweetUrl(xHandle, fetched.id, opts.tweetUrl)

  const { data: existing } = await admin
    .from('lounge_bot_queue')
    .select('id, status')
    .eq('bot_user_id', bot.user_id)
    .eq('external_key', fetched.id)
    .maybeSingle()

  if (existing?.id && !opts.dryRun) {
    return adminOpsJson(200, {
      ok: true,
      mode: 'tweet_url',
      slug: opts.slug,
      alreadyQueued: true,
      queueId: existing.id,
      status: existing.status,
    })
  }

  const botConfig = (bot.config && typeof bot.config === 'object' ? bot.config : {}) as Record<string, unknown>
  const voicePrompt = resolveXBotVoicePrompt({
    config: botConfig,
    displayName: String(bot.display_name || ''),
  })

  const draft = await rewriteTweetForBot({
    sourceText: fetched.text,
    xHandle,
    voicePrompt,
  })

  if (opts.dryRun) {
    return adminOpsJson(200, {
      ok: true,
      mode: 'tweet_url',
      slug: opts.slug,
      dryRun: true,
      tweetId: fetched.id,
      xHandle,
      sourceText: fetched.text,
      draftCaption: draft,
    })
  }

  const { data: sources } = await admin
    .from('lounge_bot_x_sources')
    .select('id, x_handle')
    .eq('bot_user_id', bot.user_id)

  const matchedSource = (sources || []).find(
    (s) => String(s.x_handle || '').toLowerCase() === xHandle.toLowerCase(),
  )

  const { data: inserted, error: insErr } = await admin
    .from('lounge_bot_queue')
    .insert({
      source_type: 'x',
      source_id: matchedSource?.id ?? null,
      external_key: fetched.id,
      bot_user_id: bot.user_id,
      source_text: fetched.text,
      source_url: sourceUrl,
      source_posted_at: fetched.created_at || null,
      draft_caption: draft,
      category_pills: bot.category_pills_default || [],
      attach_source_link: false,
      status: 'pending_review',
      source_payload: fetched.payload ?? { source: fetched.source },
    })
    .select('id')
    .single()

  if (insErr) return adminOpsJson(500, { error: insErr.message })

  return adminOpsJson(200, {
    ok: true,
    mode: 'tweet_url',
    slug: opts.slug,
    ingested: 1,
    queueId: inserted?.id,
    tweetId: fetched.id,
    xHandle,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'POST required.' })

  try {
    const admin = await authorize(req)
    const body = await req.json().catch(() => ({}))
    const slug = String(body?.slug || '').trim()
    const dryRun = body?.dryRun === true
    const tweetUrl = String(body?.tweetUrl || body?.tweet_url || '').trim()
    const sourceText = String(body?.sourceText || body?.source_text || '').trim()

    if (tweetUrl) {
      if (!slug) {
        return adminOpsJson(400, { error: 'slug required when ingesting a specific X post URL.' })
      }
      return await ingestTweetUrl(admin, {
        slug,
        tweetUrl,
        dryRun,
        token: xToken(),
        sourceText: sourceText || undefined,
      })
    }

    const token = xToken()
    if (!token) return adminOpsJson(503, { error: 'X_API_BEARER_TOKEN not set on Edge (required for timeline polling).' })

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
    const sourcesDiag: Array<Record<string, unknown>> = []

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
        const diag: Record<string, unknown> = {
          bot: bot.slug,
          handle: src.x_handle,
          sinceId: src.since_id || null,
          xUserId: src.x_user_id || null,
        }
        try {
          let xUserId = src.x_user_id
          if (!xUserId) {
            xUserId = await resolveXUserId(src.x_handle, token)
            diag.xUserId = xUserId
            if (xUserId && !dryRun) {
              await admin.from('lounge_bot_x_sources').update({ x_user_id: xUserId }).eq('id', src.id)
            }
          }
          if (!xUserId) {
            diag.error = `Could not resolve X user id for @${src.x_handle}`
            if (!dryRun) {
              await admin.from('lounge_bot_x_sources').update({
                last_polled_at: new Date().toISOString(),
                last_error: String(diag.error).slice(0, 400),
              }).eq('id', src.id)
            }
            sourcesDiag.push(diag)
            continue
          }

          const fetched = await fetchTweets(xUserId, src.since_id, token, src)
          const tweets = fetched.tweets
          const newestId = fetched.newestId
          diag.resultCount = fetched.resultCount
          diag.tweetRows = tweets.length
          diag.newestId = newestId
          diag.meta = fetched.meta
          diag.rawKeys = fetched.rawKeys
          if (fetched.errors) diag.xErrors = fetched.errors

          // First poll on a source: seed since_id only (forward from next run, no history backfill).
          if (!src.since_id && newestId) {
            diag.action = 'seed_since_id'
            if (!dryRun) {
              await admin.from('lounge_bot_x_sources').update({
                since_id: newestId,
                x_user_id: xUserId,
                last_polled_at: new Date().toISOString(),
                last_error: null,
              }).eq('id', src.id)
            }
            sourcesDiag.push(diag)
            continue
          }

          let kept = 0
          let skippedNotTopLevel = 0
          let skippedDup = 0
          for (const twRaw of tweets) {
            const tw = twRaw as {
              id?: string
              text?: string
              created_at?: string
              entities?: unknown
              referenced_tweets?: Array<{ type?: string }>
            }
            if (!isTopLevelTweet(tw)) {
              skippedNotTopLevel += 1
              continue
            }
            const tweetId = String(tw.id || '')
            const text = expandTweetTextUrls(String(tw.text || '').trim(), tw.entities)
            if (!text || !tweetId) continue

            const { data: existing } = await admin
              .from('lounge_bot_queue')
              .select('id')
              .eq('bot_user_id', bot.user_id)
              .eq('external_key', tweetId)
              .maybeSingle()
            if (existing?.id) {
              skippedDup += 1
              continue
            }

            const draft = await rewriteTweetForBot({
              sourceText: text,
              xHandle: src.x_handle,
              voicePrompt,
            })

            if (dryRun) {
              kept += 1
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
              attach_source_link: false,
              status: 'pending_review',
              source_payload: twRaw,
            })
            kept += 1
            ingested += 1
          }

          diag.kept = kept
          diag.skippedNotTopLevel = skippedNotTopLevel
          diag.skippedDup = skippedDup

          // Always stamp last_polled_at. Empty timelines used to leave it stale.
          const emptyNote =
            tweets.length === 0
              ? `X empty timeline (result_count=${fetched.resultCount ?? 0}, newest_id=${newestId || 'none'}, keys=${fetched.rawKeys.join(',') || 'none'})`
              : null
          diag.action = newestId ? 'advance_since_id' : tweets.length ? 'polled_no_newest_id' : 'empty'
          if (!dryRun) {
            await admin.from('lounge_bot_x_sources').update({
              ...(newestId ? { since_id: newestId } : {}),
              last_polled_at: new Date().toISOString(),
              last_error: emptyNote,
            }).eq('id', src.id)
          }
          if (emptyNote) {
            console.warn('[lounge-x-ingest] empty timeline', {
              bot: bot.slug,
              handle: src.x_handle,
              sinceId: src.since_id,
              resultCount: fetched.resultCount,
              newestId,
              rawKeys: fetched.rawKeys,
              xErrors: fetched.errors,
            })
          }
          sourcesDiag.push(diag)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'X poll failed'
          diag.error = msg
          console.error('[lounge-x-ingest] source poll failed', {
            bot: bot.slug,
            handle: src.x_handle,
            msg,
          })
          if (!dryRun) {
            await admin.from('lounge_bot_x_sources').update({
              last_polled_at: new Date().toISOString(),
              last_error: msg.slice(0, 400),
            }).eq('id', src.id)
          }
          sourcesDiag.push(diag)
        }
      }

      if (!dryRun) {
        await admin.from('lounge_bot_accounts').update({
          last_poll_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', bot.user_id)
      }
    }

    return adminOpsJson(200, {
      ok: true,
      slug: slug || 'all',
      dryRun,
      polled,
      ingested,
      sources: sourcesDiag,
    })
  } catch (err) {
    if (err instanceof Response) return err
    const msg = err instanceof Error ? err.message : 'Unexpected error'
    console.error('lounge-x-ingest unhandled', msg)
    const status = msg.startsWith('X API') ? 502 : 500
    return adminOpsJson(status, { error: msg })
  }
})
