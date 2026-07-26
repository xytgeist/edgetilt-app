/**
 * Publish-log dedupe helpers — feed posts, sub chat deliveries, event pick cooldowns.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Rolling window: one pick-style alert family per game (edge, live, best bet). */
export const EVENT_PICK_ALERT_LOOKBACK_MS = 60 * 60 * 1000

export const EVENT_PICK_ALERT_POST_KINDS = ['edge', 'in_game_edge', 'best_bet_hour'] as const

/** Rows with either delivery channel count; cleared when feed post is deleted (post_id null, no sub chat id). */
export const PUBLISH_LOG_ACTIVE_DELIVERY_OR =
  'post_id.not.is.null,sub_chat_message_id.not.is.null'

export type AlertDeliveryMeta = {
  botUserId: string
  caption: string
  postKind: string
  dedupeKey: string | null
  score: number | null
}

export async function hasActiveDedupePublished(
  admin: SupabaseClient,
  botUserId: string,
  dedupeKey: string,
  sinceIso: string,
): Promise<boolean> {
  if (!dedupeKey) return false
  const { data } = await admin
    .from('lounge_bot_publish_log')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .eq('dedupe_key', dedupeKey)
    .gte('created_at', sinceIso)
    .or(PUBLISH_LOG_ACTIVE_DELIVERY_OR)
    .limit(1)
    .maybeSingle()
  return Boolean(data?.id)
}

export async function hasDedupePublishedToday(
  admin: SupabaseClient,
  botUserId: string,
  dedupeKey: string,
  dayStart: string,
): Promise<boolean> {
  return hasActiveDedupePublished(admin, botUserId, dedupeKey, dayStart)
}

/** Block repeat pick alerts on the same game across edge / live / best bet within the lookback window. */
export async function hasRecentEventPickAlert(
  admin: SupabaseClient,
  botUserId: string,
  sportKey: string,
  eventId: string,
  lookbackMs = EVENT_PICK_ALERT_LOOKBACK_MS,
): Promise<boolean> {
  const eid = String(eventId || '').trim()
  const sk = String(sportKey || '').trim()
  if (!eid || !sk) return false

  const since = new Date(Date.now() - lookbackMs).toISOString()
  const edgePrefix = `edge:${sk}:${eid}:`
  const livePrefix = `live_edge:${sk}:${eid}:`

  const { data: published } = await admin
    .from('lounge_bot_publish_log')
    .select('id, post_id, sub_chat_message_id')
    .eq('bot_user_id', botUserId)
    .eq('status', 'published')
    .in('post_kind', [...EVENT_PICK_ALERT_POST_KINDS])
    .gte('created_at', since)
    .or(`dedupe_key.like.${edgePrefix}%,dedupe_key.like.${livePrefix}%,dedupe_key.like.best_bet_hour:%${eid}`)
    .limit(8)

  if ((published ?? []).some((row) => row.post_id || row.sub_chat_message_id)) {
    return true
  }

  const { data: pending } = await admin
    .from('lounge_bot_scheduled_posts')
    .select('id')
    .eq('bot_user_id', botUserId)
    .eq('status', 'pending')
    .in('post_kind', [...EVENT_PICK_ALERT_POST_KINDS])
    .gte('created_at', since)
    .or(`dedupe_key.like.${edgePrefix}%,dedupe_key.like.${livePrefix}%,dedupe_key.like.best_bet_hour:%${eid}`)
    .limit(1)

  return Boolean(pending?.length)
}

export async function recordAlertDelivery(
  admin: SupabaseClient,
  meta: AlertDeliveryMeta,
  delivery: { postId?: string | null; subChatMessageId?: string | null },
): Promise<void> {
  if (!delivery.postId && !delivery.subChatMessageId) return

  await admin.from('lounge_bot_accounts').update({
    last_publish_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', meta.botUserId)

  await admin.from('lounge_bot_publish_log').insert({
    bot_user_id: meta.botUserId,
    post_id: delivery.postId ?? null,
    sub_chat_message_id: delivery.subChatMessageId ?? null,
    caption: meta.caption,
    score: meta.score,
    status: 'published',
    post_kind: meta.postKind,
    dedupe_key: meta.dedupeKey,
  })
}
