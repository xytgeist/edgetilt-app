/**
 * Financial wire bot — poll allowlisted sources, score, auto-publish.
 *
 * Auth:
 *   - Service role bearer (cron / internal)
 *   - Admin user JWT (manual "Poll now" from Edge Monitor)
 *
 * Body (optional JSON):
 *   { "slug": "market-edge", "dryRun": false, "force": false }
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, authorizeServiceRoleOrAdmin } from '../_shared/adminAuth.ts'
import { decodeHtmlEntities } from '../_shared/decodeHtmlEntities.ts'
import { buildFinancialWireCaption } from '../_shared/loungeBotNewsCaption.ts'
import {
  extractTickers,
  isBlockedNewsItem,
  normalizeTitleHash,
  scoreNewsCandidate,
} from '../_shared/loungeBotNewsScore.ts'
import { DEFAULT_MARKET_EDGE_SLUG } from '../_shared/loungeBotMarketNewsDefaults.ts'
import {
  defaultNewsSourcesForProfile,
  newsProfileFromAccount,
} from '../_shared/loungeBotNewsProfile.ts'
import { fetchEdgarCurrentFilings, secEdgarUserAgent } from '../_shared/loungeBotEdgarFetch.ts'
import { fetchAllowlistedFeed, type NormalizedNewsItem } from '../_shared/loungeBotRssFetch.ts'
import { publishLoungeBotPost } from '../_shared/loungeBotPublish.ts'

type BotAccount = {
  user_id: string
  slug: string
  run_state: string
  category_pills_default: string[] | null
  max_posts_per_day: number
  max_posts_per_hour: number
  publish_score_threshold: number
  config: Record<string, unknown> | null
}

type NewsSource = {
  id: string
  bot_user_id: string
  name: string
  kind: string
  poll_url: string | null
  api_config: Record<string, unknown> | null
  poll_interval_sec: number
  enabled: boolean
  last_polled_at: string | null
}

type NormalizedItem = NormalizedNewsItem

const FINNHUB_BASE = 'https://finnhub.io/api/v1'

function finnhubToken(): string {
  return String(Deno.env.get('FINNHUB_API_KEY') || '').trim()
}

async function authorize(req: Request): Promise<SupabaseClient> {
  return authorizeServiceRoleOrAdmin(req)
}

function watchlistFromConfig(config: Record<string, unknown> | null): string[] {
  const raw = config?.watchlist_tickers
  if (!Array.isArray(raw)) return []
  return raw.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean)
}

async function ensureDefaultNewsSources(
  admin: SupabaseClient,
  botUserId: string,
  profile: ReturnType<typeof newsProfileFromAccount>,
  existingSources: NewsSource[],
): Promise<void> {
  const existingNames = new Set(existingSources.map((s) => s.name))
  for (const seed of defaultNewsSourcesForProfile(profile)) {
    if (existingNames.has(seed.name)) continue
    await admin.from('lounge_news_sources').insert({
      bot_user_id: botUserId,
      name: seed.name,
      kind: seed.kind,
      poll_url: seed.poll_url ?? null,
      api_config: seed.api_config ?? {},
      poll_interval_sec: seed.poll_interval_sec,
      enabled: true,
    })
    existingNames.add(seed.name)
  }
}

async function ensureWatchlistCompanySources(
  admin: SupabaseClient,
  botUserId: string,
  watchlist: string[],
  existingSources: NewsSource[],
): Promise<void> {
  const existingSymbols = new Set(
    existingSources
      .filter((s) => s.kind === 'finnhub_company')
      .map((s) => String(s.api_config?.symbol || '').trim().toUpperCase())
      .filter(Boolean),
  )

  for (const symbol of watchlist) {
    if (existingSymbols.has(symbol)) continue
    await admin.from('lounge_news_sources').insert({
      bot_user_id: botUserId,
      name: `Finnhub ${symbol}`,
      kind: 'finnhub_company',
      api_config: { symbol },
      poll_interval_sec: 600,
      enabled: true,
    })
    existingSymbols.add(symbol)
  }
}

async function finnhubFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const token = finnhubToken()
  if (!token) throw new Error('FINNHUB_API_KEY not set on Edge.')
  const qs = new URLSearchParams({ ...params, token })
  const res = await fetch(`${FINNHUB_BASE}${path}?${qs}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Finnhub ${path} ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

function parseFinnhubNewsRow(row: unknown): NormalizedItem | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const title = decodeHtmlEntities(String(r.headline || '')).trim()
  if (!title) return null
  const dtSec = Number(r.datetime) || 0
  const publishedAtIso = dtSec > 0 ? new Date(dtSec * 1000).toISOString() : null
  const related = String(r.related || '').trim()
  const summaryRaw = r.summary ? decodeHtmlEntities(String(r.summary)).trim() : ''
  const tickers = related
    ? related.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
    : extractTickers(`${title} ${summaryRaw}`)
  const externalId = String(r.id || r.url || title).trim()
  return {
    title,
    summary: summaryRaw || undefined,
    url: String(r.url || '').trim() || undefined,
    publishedAt: publishedAtIso,
    tickers,
    sourceName: String(r.source || 'Finnhub').trim() || 'Finnhub',
    externalId,
    contentHash: normalizeTitleHash(title),
    publishedAtIso,
    raw: r,
  }
}

async function fetchFinnhubCategory(category: string): Promise<NormalizedItem[]> {
  const data = await finnhubFetch('/news', { category })
  const rows = Array.isArray(data) ? data : []
  return rows.map(parseFinnhubNewsRow).filter(Boolean) as NormalizedItem[]
}

async function fetchFinnhubCompany(symbol: string): Promise<NormalizedItem[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 7 * 86400000)
  const data = await finnhubFetch('/company-news', {
    symbol: symbol.toUpperCase(),
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  })
  const rows = Array.isArray(data) ? data : []
  return rows.map(parseFinnhubNewsRow).filter(Boolean) as NormalizedItem[]
}

async function fetchSourceItems(source: NewsSource): Promise<NormalizedItem[]> {
  const cfg = source.api_config || {}
  switch (source.kind) {
    case 'finnhub_general':
      return fetchFinnhubCategory(String(cfg.category || 'general'))
    case 'finnhub_category':
      return fetchFinnhubCategory(String(cfg.category || 'merger'))
    case 'finnhub_company': {
      const sym = String(cfg.symbol || '').trim()
      if (!sym) return []
      return fetchFinnhubCompany(sym)
    }
    case 'edgar':
      return fetchEdgarCurrentFilings({
        filingType: String(cfg.filing_type || ''),
        count: Number(cfg.count) || 40,
        sourceLabel: source.name,
      })
    case 'rss': {
      const url = String(source.poll_url || cfg.url || '').trim()
      if (!url) return []
      const label = String(cfg.source_label || source.name || 'RSS').trim()
      const headers: Record<string, string> = {}
      if (url.includes('sec.gov')) {
        headers['User-Agent'] = secEdgarUserAgent()
      }
      const items = await fetchAllowlistedFeed(url, label, headers)
      return items
    }
    default:
      return []
  }
}

function sourceDue(source: NewsSource, force: boolean): boolean {
  if (force) return true
  if (!source.last_polled_at) return true
  const last = new Date(source.last_polled_at).getTime()
  if (!Number.isFinite(last)) return true
  return Date.now() - last >= source.poll_interval_sec * 1000
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

async function hashRecentlyUsed(
  admin: SupabaseClient,
  botUserId: string,
  contentHash: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data, error } = await admin
    .from('lounge_news_raw_items')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('content_hash', contentHash)
    .gte('created_at', since)
    .limit(1)
  if (error) throw error
  return (data || []).length > 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: adminOpsCorsHeaders })
  }
  if (req.method !== 'POST') {
    return adminOpsJson(405, { error: 'POST required.' })
  }

  try {
    const admin = await authorize(req)
    const body = await req.json().catch(() => ({}))
    const slug = String(body?.slug || DEFAULT_MARKET_EDGE_SLUG).trim()
    const dryRun = body?.dryRun === true
    const force = body?.force === true

    const { data: bot, error: botErr } = await admin
      .from('lounge_bot_accounts')
      .select(
        'user_id, slug, run_state, category_pills_default, max_posts_per_day, max_posts_per_hour, publish_score_threshold, config',
      )
      .eq('slug', slug)
      .maybeSingle()

    if (botErr) return adminOpsJson(500, { error: botErr.message })
    if (!bot?.user_id) {
      return adminOpsJson(404, {
        error: `Bot slug "${slug}" not configured. Insert lounge_bot_accounts row first.`,
      })
    }
    if (bot.run_state !== 'running') {
      return adminOpsJson(200, { ok: true, skipped: bot.run_state || 'stopped', slug })
    }

    const account = bot as BotAccount
    const newsProfile = newsProfileFromAccount(account.config, account.slug)
    const watchlist = watchlistFromConfig(account.config)
    const threshold = Number(account.publish_score_threshold) || 55

    const hourStart = new Date(Date.now() - 3600_000).toISOString()
    const dayStart = ptDayStartIso()
    const publishedHour = await countPublished(admin, account.user_id, hourStart)
    const publishedDay = await countPublished(admin, account.user_id, dayStart)

    const hourCap = Number(account.max_posts_per_hour) || 4
    const dayCap = Number(account.max_posts_per_day) || 12
    const roomHour = Math.max(0, hourCap - publishedHour)
    const roomDay = Math.max(0, dayCap - publishedDay)
    const publishBudget = Math.min(roomHour, roomDay)

    const { data: allSources, error: allSrcErr } = await admin
      .from('lounge_news_sources')
      .select('*')
      .eq('bot_user_id', account.user_id)
      .order('last_polled_at', { ascending: true, nullsFirst: true })

    if (allSrcErr) return adminOpsJson(500, { error: allSrcErr.message })

    const sourceRows = (allSources || []) as NewsSource[]

    await ensureDefaultNewsSources(admin, account.user_id, newsProfile, sourceRows)

    await ensureWatchlistCompanySources(
      admin,
      account.user_id,
      watchlist,
      sourceRows,
    )

    const { data: sources, error: srcErr } = await admin
      .from('lounge_news_sources')
      .select('*')
      .eq('bot_user_id', account.user_id)
      .eq('enabled', true)
      .order('last_polled_at', { ascending: true, nullsFirst: true })

    if (srcErr) return adminOpsJson(500, { error: srcErr.message })

    let polled = 0
    let ingested = 0
    let published = 0
    let skipped = 0
    const candidates: Array<{ item: NormalizedItem; score: number; sourceId: string }> = []

    for (const source of (sources || []) as NewsSource[]) {
      if (!sourceDue(source, force)) continue
      polled += 1
      try {
        const items = await fetchSourceItems(source)
        for (const item of items) {
          if (isBlockedNewsItem(item)) {
            skipped += 1
            continue
          }

          if (await hashRecentlyUsed(admin, account.user_id, item.contentHash)) {
            skipped += 1
            continue
          }

          const { data: existing } = await admin
            .from('lounge_news_raw_items')
            .select('id')
            .eq('source_id', source.id)
            .eq('external_id', item.externalId)
            .maybeSingle()
          if (existing?.id) continue

          const score = scoreNewsCandidate(item, { watchlistTickers: watchlist, newsProfile })
          if (dryRun) {
            if (score >= threshold) candidates.push({ item, score, sourceId: source.id })
            continue
          }

          const { data: rawRow, error: rawErr } = await admin
            .from('lounge_news_raw_items')
            .insert({
              source_id: source.id,
              bot_user_id: account.user_id,
              external_id: item.externalId,
              content_hash: item.contentHash,
              published_at: item.publishedAtIso,
              title: item.title,
              summary: item.summary || null,
              url: item.url || null,
              tickers: item.tickers || [],
              score,
              raw: item.raw,
            })
            .select('id')
            .single()

          if (rawErr) {
            skipped += 1
            continue
          }
          ingested += 1
          if (score >= threshold) {
            candidates.push({ item, score, sourceId: source.id })
          } else {
            await admin.from('lounge_bot_publish_log').insert({
              bot_user_id: account.user_id,
              raw_item_id: rawRow.id,
              caption: buildFinancialWireCaption(item),
              score,
              status: 'skipped',
              error_message: `Below threshold (${threshold}).`,
            })
          }
        }

        await admin
          .from('lounge_news_sources')
          .update({ last_polled_at: new Date().toISOString(), last_error: null })
          .eq('id', source.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Source poll failed'
        await admin
          .from('lounge_news_sources')
          .update({ last_polled_at: new Date().toISOString(), last_error: msg.slice(0, 400) })
          .eq('id', source.id)
      }
    }

    candidates.sort((a, b) => b.score - a.score)

    if (!dryRun && publishBudget > 0) {
      for (const cand of candidates.slice(0, publishBudget)) {
        const caption = buildFinancialWireCaption(cand.item)
        const pills = account.category_pills_default?.length
          ? account.category_pills_default
          : newsProfile === 'crypto'
            ? ['crypto', 'trading']
            : ['stocks', 'trading']

        const { data: rawMatch } = await admin
          .from('lounge_news_raw_items')
          .select('id')
          .eq('source_id', cand.sourceId)
          .eq('external_id', cand.item.externalId)
          .maybeSingle()

        const result = await publishLoungeBotPost(admin, {
          botUserId: account.user_id,
          caption,
          categoryPills: pills,
          sourceUrl: cand.item.url,
        })

        if (result.postId) {
          published += 1
          await admin.from('lounge_bot_publish_log').insert({
            bot_user_id: account.user_id,
            raw_item_id: rawMatch?.id || null,
            post_id: result.postId,
            caption,
            score: cand.score,
            status: 'published',
          })
        } else {
          await admin.from('lounge_bot_publish_log').insert({
            bot_user_id: account.user_id,
            raw_item_id: rawMatch?.id || null,
            caption,
            score: cand.score,
            status: 'failed',
            error_message: result.error?.slice(0, 400) || 'Publish failed',
          })
        }
      }
    }

    if (!dryRun) {
      const accountUpdate: Record<string, string> = {
        last_poll_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (published > 0) accountUpdate.last_publish_at = new Date().toISOString()
      await admin.from('lounge_bot_accounts').update(accountUpdate).eq('user_id', account.user_id)
    }

    return adminOpsJson(200, {
      ok: true,
      slug,
      dryRun,
      polled,
      ingested,
      published,
      skipped,
      publishBudget,
      publishedHour,
      publishedDay,
      candidateCount: candidates.length,
      topCandidates: candidates.slice(0, 5).map((c) => ({
        score: c.score,
        title: c.item.title.slice(0, 120),
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return adminOpsJson(500, { error: message })
  }
})
