/**
 * Scott alert publishing — short gap between feed posts, no deep queue backlog.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  type AlertRouteConfig,
  resolvePublishTargetsFromRoute,
} from './loungeBotAlertAudience.ts'
import { publishLoungeBotPost, publishLoungeBotPostWithThread, type BotPublishInput, type BotThreadPart } from './loungeBotPublish.ts'
import { validateLiveScheduledPost } from './loungeBotLiveGuards.ts'
import { DEFAULT_MIN_POST_GAP_MINUTES } from './loungeBotPublishConstants.ts'
import { recordAlertDelivery, type AlertDeliveryMeta } from './loungeBotPublishDedupe.ts'

export type BotPostPriority = 'urgent' | 'normal' | 'low'

export { DEFAULT_MIN_POST_GAP_MINUTES } from './loungeBotPublishConstants.ts'

export type SubmitBotAlertPostInput = BotPublishInput & {
  postKind: string
  dedupeKey: string
  score?: number
  priority?: BotPostPriority
  minGapMinutes?: number
  dryRun?: boolean
  /** Lounge vs sub chat routing (checkbox model). */
  alertRoute?: AlertRouteConfig
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
  if (postKind === 'period_report' || postKind === 'in_game_edge') return 'urgent'
  if (['edge', 'best_bet_hour', 'value_bet_radar', 'injury_impact', 'starter_spotlight'].includes(postKind)) {
    return 'normal'
  }
  return 'low'
}

function randomBetween(minMs: number, maxMs: number): number {
  const lo = Math.min(minMs, maxMs)
  const hi = Math.max(minMs, maxMs)
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

function jitterMsForPriority(priority: BotPostPriority): number {
  if (priority === 'urgent') return randomBetween(0, 30_000)
  if (priority === 'normal') return randomBetween(15_000, 60_000)
  return randomBetween(30_000, 90_000)
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

/** Next publish time — gap from last *published* post only (never stack on queue tail). */
export async function computeScheduledPublishAt(
  admin: SupabaseClient,
  botUserId: string,
  priority: BotPostPriority,
  minGapMinutes = DEFAULT_MIN_POST_GAP_MINUTES,
): Promise<Date> {
  const now = Date.now()
  const minGapMs = Math.max(1, minGapMinutes) * 60 * 1000
  const lastPublish = await getLastPublishAt(admin, botUserId)
  const base = lastPublish ? Math.max(now, lastPublish.getTime() + minGapMs) : now
  return new Date(base + jitterMsForPriority(priority))
}

type PublishMeta = AlertDeliveryMeta & {
  categoryPills: string[]
  subscriberOnly: boolean
}

async function recordSuccessfulPublish(
  admin: SupabaseClient,
  meta: PublishMeta,
  postId: string,
  subChatMessageId?: string | null,
): Promise<void> {
  await recordAlertDelivery(admin, meta, { postId, subChatMessageId })
}

function resolveInputAlertRoute(input: SubmitBotAlertPostInput): AlertRouteConfig {
  if (input.alertRoute) return input.alertRoute
  if (input.subscriberOnly === true) {
    return { lounge: false, sub_chat: true, lounge_teaser_pct: 0 }
  }
  return { lounge: true, sub_chat: false, lounge_teaser_pct: 0 }
}

async function publishSubChatIfNeeded(
  admin: SupabaseClient,
  input: SubmitBotAlertPostInput,
): Promise<{ ok: boolean; messageId: string | null; error: string | null }> {
  const { publishBotSubChatMessage } = await import('./loungeBotSubChatPublish.ts')
  const result = await publishBotSubChatMessage(admin, {
    botUserId: input.botUserId,
    caption: input.caption,
    imageUrls: input.imageUrls,
  })
  if (!result.messageId) {
    return { ok: false, messageId: null, error: result.error || 'sub chat publish failed' }
  }
  return { ok: true, messageId: result.messageId, error: null }
}

function buildPublishMeta(input: SubmitBotAlertPostInput, caption: string): PublishMeta {
  const pills = Array.isArray(input.categoryPills)
    ? input.categoryPills.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 3)
    : []
  return {
    botUserId: input.botUserId,
    caption,
    categoryPills: pills,
    subscriberOnly: false,
    postKind: input.postKind,
    dedupeKey: input.dedupeKey,
    score: input.score ?? null,
  }
}

async function tryPublishAlertNow(
  admin: SupabaseClient,
  input: SubmitBotAlertPostInput,
  meta: PublishMeta,
  subChatMessageId?: string | null,
  scoreCache?: Map<string, import('./loungeBotLiveGuards.ts').LiveScoreRow[]>,
): Promise<{ postId: string | null; error: string | null; skipped?: string; subChatPublished?: boolean }> {
  const liveCheck = await validateLiveScheduledPost(
    meta.postKind,
    meta.dedupeKey,
    new Date().toISOString(),
    scoreCache,
  )
  if (!liveCheck.valid) {
    return { postId: null, error: null, skipped: liveCheck.reason || 'live_game_over' }
  }

  const result = await publishLoungeBotPost(admin, {
    botUserId: input.botUserId,
    caption: input.caption,
    categoryPills: input.categoryPills,
    subscriberOnly: false,
    sourceUrl: input.sourceUrl,
    imageUrls: input.imageUrls,
    requirePreviewToAttachLink: input.requirePreviewToAttachLink,
  })

  if (!result.postId) {
    return { postId: null, error: result.error || 'publish failed' }
  }

  await recordSuccessfulPublish(admin, meta, result.postId, subChatMessageId)
  return { postId: result.postId, error: null }
}

/** Publish now when gap allows; otherwise queue for the next gap window (minutes, not hours). */
export async function submitLoungeBotAlertPost(
  admin: SupabaseClient,
  input: SubmitBotAlertPostInput,
): Promise<SubmitBotAlertPostResult> {
  const caption = String(input.caption || '').trim()
  if (!caption) return { accepted: false, published: false, scheduled: false, postId: null, error: 'Empty caption.' }
  if (input.dryRun) {
    return { accepted: false, published: false, scheduled: false, postId: null, error: null }
  }

  const alertRoute = resolveInputAlertRoute(input)
  const targets = resolvePublishTargetsFromRoute(alertRoute)
  const meta = buildPublishMeta(input, caption)

  let subChatMessageId: string | null = null
  if (targets.subChat) {
    const subChat = await publishSubChatIfNeeded(admin, input)
    if (!subChat.ok) {
      return {
        accepted: false,
        published: false,
        scheduled: false,
        postId: null,
        error: subChat.error,
      }
    }
    subChatMessageId = subChat.messageId
  }

  if (!targets.loungeFeed) {
    if (subChatMessageId) {
      await recordAlertDelivery(admin, meta, { subChatMessageId })
    }
    return {
      accepted: true,
      published: Boolean(subChatMessageId),
      scheduled: false,
      postId: null,
      error: null,
    }
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
  const minGapMs = Math.max(1, minGap) * 60 * 1000

  const lastPublish = await getLastPublishAt(admin, input.botUserId)
  const canPublishNow = !lastPublish || Date.now() >= lastPublish.getTime() + minGapMs

  if (canPublishNow) {
    const immediate = await tryPublishAlertNow(admin, input, meta, subChatMessageId)
    if (immediate.skipped) {
      return {
        accepted: false,
        published: false,
        scheduled: false,
        postId: null,
        error: null,
        skipped: immediate.skipped,
      }
    }
    if (immediate.postId) {
      return {
        accepted: true,
        published: true,
        scheduled: false,
        postId: immediate.postId,
        error: null,
      }
    }
    if (subChatMessageId && immediate.error) {
      await recordAlertDelivery(admin, meta, { subChatMessageId })
      return {
        accepted: true,
        published: true,
        scheduled: false,
        postId: null,
        error: immediate.error,
      }
    }
    if (immediate.error) {
      return {
        accepted: false,
        published: false,
        scheduled: false,
        postId: null,
        error: immediate.error,
      }
    }
  }

  const publishAt = await computeScheduledPublishAt(admin, input.botUserId, priority, minGap)

  if (subChatMessageId) {
    await recordAlertDelivery(admin, meta, { subChatMessageId })
  }

  const { data, error } = await admin
    .from('lounge_bot_scheduled_posts')
    .insert({
      bot_user_id: input.botUserId,
      caption,
      category_pills: meta.categoryPills,
      subscriber_only: false,
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

/** Publish all due queued rows (up to limit). */
export async function drainDueScheduledBotPosts(
  admin: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<{ published: number; failed: number; cancelled: number }> {
  const nowIso = new Date().toISOString()
  const limit = Math.max(1, opts.limit ?? 25)

  const { data: dueRows, error } = await admin
    .from('lounge_bot_scheduled_posts')
    .select('id, bot_user_id, caption, category_pills, subscriber_only, post_kind, dedupe_key, score, publish_at, created_at')
    .eq('status', 'pending')
    .lte('publish_at', nowIso)
    .order('publish_at', { ascending: true })
    .limit(limit)

  if (error || !dueRows?.length) return { published: 0, failed: 0, cancelled: 0 }

  let published = 0
  let failed = 0
  let cancelled = 0
  const scoreCache = new Map<string, import('./loungeBotLiveGuards.ts').LiveScoreRow[]>()

  for (const row of dueRows as ScheduledRow[]) {
    const liveCheck = await validateLiveScheduledPost(
      row.post_kind,
      row.dedupe_key,
      row.created_at,
      scoreCache,
    )
    if (!liveCheck.valid) {
      await admin
        .from('lounge_bot_scheduled_posts')
        .update({
          status: 'cancelled',
          error_message: liveCheck.reason || 'live_game_over',
        })
        .eq('id', row.id)
      cancelled += 1
      continue
    }

    const meta: PublishMeta = {
      botUserId: row.bot_user_id,
      caption: row.caption,
      categoryPills: row.category_pills || [],
      subscriberOnly: row.subscriber_only,
      postKind: row.post_kind,
      dedupeKey: row.dedupe_key,
      score: row.score,
    }

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

      await recordSuccessfulPublish(admin, meta, result.postId)
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

export type RoutedThreadPublishInput = BotPublishInput & {
  alertRoute: AlertRouteConfig
  threadParts?: BotThreadPart[]
}

export type RoutedThreadPublishResult = {
  postId: string | null
  error: string | null
  subChatPublished: boolean
  subChatMessageId?: string | null
  threadPartCount?: number
}

/** Coffee & Covers and other threaded alerts — route sub chat vs lounge feed. */
export async function publishRoutedBotThreadPost(
  admin: SupabaseClient,
  input: RoutedThreadPublishInput,
): Promise<RoutedThreadPublishResult> {
  const targets = resolvePublishTargetsFromRoute(input.alertRoute)
  const threadBodies = (input.threadParts || []).map((part) => String(part?.body || '').trim()).filter(Boolean)

  let subChatPublished = false
  let subChatMessageId: string | null = null
  if (targets.subChat) {
    const { publishBotSubChatMessage } = await import('./loungeBotSubChatPublish.ts')
    const subChat = await publishBotSubChatMessage(admin, {
      botUserId: input.botUserId,
      caption: input.caption,
      threadParts: threadBodies,
      imageUrls: input.imageUrls,
    })
    if (!subChat.messageId) {
      return { postId: null, error: subChat.error || 'sub chat publish failed', subChatPublished: false }
    }
    subChatPublished = true
    subChatMessageId = subChat.messageId
  }

  if (!targets.loungeFeed) {
    return {
      postId: null,
      error: null,
      subChatPublished,
      subChatMessageId,
      threadPartCount: 1 + threadBodies.length,
    }
  }

  const result = await publishLoungeBotPostWithThread(admin, {
    ...input,
    subscriberOnly: false,
    threadParts: input.threadParts,
  })

  return {
    postId: result.postId,
    error: result.error,
    subChatPublished,
    subChatMessageId,
    threadPartCount: result.threadPartCount,
  }
}
