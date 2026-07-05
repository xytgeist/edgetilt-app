/**
 * Human-paced bot publishing — stagger alerts instead of burst-posting on poll_edges.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { publishLoungeBotPost, type BotPublishInput } from './loungeBotPublish.ts'

export type BotPostPriority = 'urgent' | 'normal' | 'low'

export const DEFAULT_MIN_POST_GAP_MINUTES = 8
const MAX_PENDING_AGE_MS = 3 * 60 * 60 * 1000

export type SubmitBotAlertPostInput = BotPublishInput & {
  postKind: string
  dedupeKey: string
  score?: number
  priority?: BotPostPriority
  minGapMinutes?: number
  dryRun?: boolean
}

export type SubmitBotAlertPostResult = {
  accepted: boolean
  published: boolean
  scheduled: boolean
  postId: string | null
  scheduledAt?: string
  error: string | null
  skipped?: string
}

export function priorityForPostKind(postKind: string): BotPostPriority {
  if (postKind === 'arb_watch') return 'urgent'
  if (['edge', 'in_game_edge', 'best_bet_hour', 'value_bet_radar'].includes(postKind)) return 'normal'
  return 'low'
}

function randomBetween(minMs: number, maxMs: number): number {
  const lo = Math.min(minMs, maxMs)
  const hi = Math.max(minMs, maxMs)
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

export async function hasPendingScheduleDedupe(
  admin: SupabaseClient,
  botUserId: string,
  dedupeKey: string,
): Promise<boolean> {
  if (!dedupeKey) return false
  const { data } = await admin
    .from('lounge_bot_scheduled_posts')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('dedupe_key', dedupeKey)
    .eq('status', 'pending')
    .maybeSingle()
  return Boolean(data?.id)
}

export async function countScheduledKindToday(
  admin: SupabaseClient,
  botUserId: string,
  postKind: string,
  dayStart: string,
): Promise<number> {
  const { count } = await admin
    .from('lounge_bot_scheduled_posts')
    .select('id', { count: 'exact', head: true })
    .eq('bot_user_id', botUserId)
    .eq('post_kind', postKind)
    .eq('status', 'pending')
    .gte('created_at', dayStart)
  return count ?? 0
}

export async function countAcceptedKindToday(
  admin: SupabaseClient,
  botUserId: string,
  postKind: string,
  dayStart: string,
  publishedToday: number,
): Promise<number> {
  const pending = await countScheduledKindToday(admin, botUserId, postKind, dayStart)
  return publishedToday + pending
}

async function getLastPublishAt(admin: SupabaseClient, botUserId: string): Promise<Date | null> {
  const { data } = await admin
    .from('lounge_bot_accounts')
    .select('last_publish_at')
    .eq('user_id', botUserId)
    .maybeSingle()
  const raw = data?.last_publish_at
  if (!raw) return null
  const dt = new Date(String(raw))
  return Number.isNaN(dt.getTime()) ? null : dt
}

async function getLatestPendingPublishAt(
  admin: SupabaseClient,
  botUserId: string,
): Promise<Date | null> {
  const { data } = await admin
    .from('lounge_bot_scheduled_posts')
    .select('publish_at')
    .eq('bot_user_id', botUserId)
    .eq('status', 'pending')
    .order('publish_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.publish_at) return null
  const dt = new Date(String(data.publish_at))
  return Number.isNaN(dt.getTime()) ? null : dt
}

export async function computeScheduledPublishAt(
  admin: SupabaseClient,
  botUserId: string,
  priority: BotPostPriority,
  minGapMinutes = DEFAULT_MIN_POST_GAP_MINUTES,
): Promise<Date> {
  const now = Date.now()
  const minGapMs = Math.max(1, minGapMinutes) * 60 * 1000

  const lastPublish = await getLastPublishAt(admin, botUserId)
  const lastQueued = await getLatestPendingPublishAt(admin, botUserId)

  const gapFromPublish = lastPublish ? lastPublish.getTime() + minGapMs : now
  const gapFromQueue = lastQueued ? lastQueued.getTime() + minGapMs : now
  const base = Math.max(now, gapFromPublish, gapFromQueue)

  let jitterMs = 0
  if (priority === 'urgent') jitterMs = randomBetween(15_000, 120_000)
  else if (priority === 'normal') jitterMs = randomBetween(2 * 60_000, 10 * 60_000)
  else jitterMs = randomBetween(6 * 60_000, 20 * 60_000)

  return new Date(base + jitterMs)
}

/** Queue an alert for natural-paced publishing (never posts inline). */
export async function submitLoungeBotAlertPost(
  admin: SupabaseClient,
  input: SubmitBotAlertPostInput,
): Promise<SubmitBotAlertPostResult> {
  const caption = String(input.caption || '').trim()
  if (!caption) return { accepted: false, published: false, scheduled: false, postId: null, error: 'Empty caption.' }
  if (input.dryRun) {
    return { accepted: false, published: false, scheduled: false, postId: null, error: null }
  }

  if (await hasPendingScheduleDedupe(admin, input.botUserId, input.dedupeKey)) {
    return {
      accepted: false,
      published: false,
      scheduled: false,
      postId: null,
      error: null,
      skipped: 'already_scheduled',
    }
  }

  const priority = input.priority ?? priorityForPostKind(input.postKind)
  const minGap = input.minGapMinutes ?? DEFAULT_MIN_POST_GAP_MINUTES
  const publishAt = await computeScheduledPublishAt(admin, input.botUserId, priority, minGap)

  const pills = Array.isArray(input.categoryPills)
    ? input.categoryPills.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 3)
    : []

  const { data, error } = await admin
    .from('lounge_bot_scheduled_posts')
    .insert({
      bot_user_id: input.botUserId,
      caption,
      category_pills: pills,
      subscriber_only: input.subscriberOnly === true,
      post_kind: input.postKind,
      dedupe_key: input.dedupeKey,
      score: input.score ?? null,
      publish_at: publishAt.toISOString(),
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    const msg = error?.message || 'Schedule insert failed.'
    if (msg.includes('lounge_bot_scheduled_posts_pending_dedupe')) {
      return {
        accepted: false,
        published: false,
        scheduled: false,
        postId: null,
        error: null,
        skipped: 'already_scheduled',
      }
    }
    return { accepted: false, published: false, scheduled: false, postId: null, error: msg }
  }

  return {
    accepted: true,
    published: false,
    scheduled: true,
    postId: null,
    scheduledAt: publishAt.toISOString(),
    error: null,
  }
}

type ScheduledRow = {
  id: string
  bot_user_id: string
  caption: string
  category_pills: string[] | null
  subscriber_only: boolean
  post_kind: string
  dedupe_key: string | null
  score: number | null
  publish_at: string
  created_at: string
}

async function cancelStalePending(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - MAX_PENDING_AGE_MS).toISOString()
  const { data } = await admin
    .from('lounge_bot_scheduled_posts')
    .update({ status: 'cancelled', error_message: 'stale_odds_caption' })
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('id')
  return data?.length ?? 0
}

/** Publish due queued rows — at most one post per bot per drain tick. */
export async function drainDueScheduledBotPosts(
  admin: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<{ published: number; failed: number; cancelled: number }> {
  const cancelled = await cancelStalePending(admin)
  const nowIso = new Date().toISOString()
  const limit = Math.max(1, opts.limit ?? 10)

  const { data: dueRows, error } = await admin
    .from('lounge_bot_scheduled_posts')
    .select('id, bot_user_id, caption, category_pills, subscriber_only, post_kind, dedupe_key, score, publish_at, created_at')
    .eq('status', 'pending')
    .lte('publish_at', nowIso)
    .order('publish_at', { ascending: true })
    .limit(limit * 3)

  if (error || !dueRows?.length) return { published: 0, failed: 0, cancelled }

  const seenBots = new Set<string>()
  const toPublish: ScheduledRow[] = []
  for (const row of dueRows as ScheduledRow[]) {
    if (seenBots.has(row.bot_user_id)) continue
    seenBots.add(row.bot_user_id)
    toPublish.push(row)
    if (toPublish.length >= limit) break
  }

  let published = 0
  let failed = 0

  for (const row of toPublish) {
    const result = await publishLoungeBotPost(admin, {
      botUserId: row.bot_user_id,
      caption: row.caption,
      categoryPills: row.category_pills || [],
      subscriberOnly: row.subscriber_only,
    })

    if (result.postId) {
      await admin
        .from('lounge_bot_scheduled_posts')
        .update({
          status: 'published',
          post_id: result.postId,
          published_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      await admin.from('lounge_bot_publish_log').insert({
        bot_user_id: row.bot_user_id,
        post_id: result.postId,
        caption: row.caption,
        score: row.score,
        status: 'published',
        post_kind: row.post_kind,
        dedupe_key: row.dedupe_key,
      })

      await admin.from('lounge_bot_accounts').update({
        last_publish_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', row.bot_user_id)

      published += 1
    } else {
      await admin
        .from('lounge_bot_scheduled_posts')
        .update({
          status: 'failed',
          error_message: result.error?.slice(0, 400) ?? 'publish failed',
        })
        .eq('id', row.id)

      await admin.from('lounge_bot_publish_log').insert({
        bot_user_id: row.bot_user_id,
        caption: row.caption,
        score: row.score,
        status: 'failed',
        post_kind: row.post_kind,
        dedupe_key: row.dedupe_key,
        error_message: result.error?.slice(0, 400),
      })
      failed += 1
    }
  }

  return { published, failed, cancelled }
}
