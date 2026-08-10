import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lounge-activity-push-secret',
}

function toBase64Url(value: string | null | undefined): string | null {
  if (!value) return null
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

type ActivityEventRow = {
  id: string
  recipient_user_id: string
  actor_user_id: string
  event_type: string
  post_id: string | null
  comment_id: string | null
  play_log_entry_id: string | null
  chat_room_id: string | null
  chat_call_id?: string | null
  starter_weekly_unlock_id?: string | null
  guide_slug?: string | null
  detail_text?: string | null
  poker_tournament_swap_id?: string | null
  poker_stable_deal_id?: string | null
  poker_stable_settlement_request_id?: string | null
  poker_stable_commit_id?: string | null
  created_at: string
}

type ActorProfile = {
  user_id: string
  handle: string | null
  display_name: string | null
}

type NotificationPrefs = {
  push_replies: boolean
  push_mentions: boolean
  push_follows: boolean
  push_reposts: boolean
  push_likes: boolean
  push_bookmarks: boolean
  push_messages: boolean
}

type PushBatchRow = {
  id: string
  recipient_user_id: string
  event_type: string
  post_id: string | null
  comment_id: string | null
  chat_room_id: string | null
  scheduled_send_at: string | null
  sent_at: string | null
}

const CHAT_DM_DEBOUNCE_MAX_WAIT_MS = 90_000
const CHAT_DM_DEBOUNCE_POLL_MS = 2_000
const PUSH_TITLE_LOUNGE = 'Edge Lounge'
const PUSH_TITLE_CHAT = 'Edge Chat'

function pushTitleForEventType(eventType: string): string {
  if (
    eventType === 'chat_dm' ||
    eventType === 'chat_group_invite' ||
    eventType === 'chat_call_invite' ||
    eventType === 'chat_call_missed' ||
    eventType === 'chat_mention'
  ) {
    return PUSH_TITLE_CHAT
  }
  return PUSH_TITLE_LOUNGE
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForChatDmDebounce(
  admin: ReturnType<typeof createClient>,
  batchId: string,
): Promise<'ready' | 'already_sent' | 'missing'> {
  const deadline = Date.now() + CHAT_DM_DEBOUNCE_MAX_WAIT_MS
  while (Date.now() < deadline) {
    const { data: batch, error } = await admin
      .from('activity_push_batches')
      .select('scheduled_send_at, sent_at, event_type')
      .eq('id', batchId)
      .maybeSingle()

    if (error) throw error
    if (!batch) return 'missing'
    if (batch.sent_at) return 'already_sent'
    if (batch.event_type !== 'chat_dm') return 'ready'

    const sendAtMs = batch.scheduled_send_at
      ? new Date(batch.scheduled_send_at).getTime()
      : Date.now()
    if (sendAtMs <= Date.now()) return 'ready'

    const waitMs = Math.min(sendAtMs - Date.now(), CHAT_DM_DEBOUNCE_POLL_MS)
    await sleep(waitMs)
  }
  return 'ready'
}

function parsePokerStableActivityDetail(detail: string | null | undefined): {
  backerName: string
  dealLabel: string
} {
  const raw = String(detail || '').trim()
  if (!raw) return { backerName: '', dealLabel: '' }
  const sep = raw.indexOf(' · ')
  if (sep === -1) return { backerName: '', dealLabel: raw }
  return {
    backerName: raw.slice(0, sep).trim(),
    dealLabel: raw.slice(sep + 3).trim(),
  }
}

const POKER_STABLE_SESSION_LOSS_EMOJI = '🐡'
const POKER_STABLE_SESSION_WIN_EMOJI = '🦈'
const SESSION_COMPLETE_TABLE_MARKER = ' · table '
const SESSION_COMPLETE_AMOUNT_RE = /^(?:table\s+)?([+-])?\$?([\d,]+)(?:\.(\d+))?$/i

function pokerStableSessionCompleteEmojiPrefix(detailText?: string | null): string {
  const raw = String(detailText || '').trim()
  if (!raw) return ''

  const tableIdx = raw.indexOf(SESSION_COMPLETE_TABLE_MARKER)
  if (tableIdx !== -1) {
    const amountRaw = raw.slice(tableIdx + SESSION_COMPLETE_TABLE_MARKER.length).trim()
    const grossPl = Number(amountRaw.replace(/,/g, '').replace(/^\$/, ''))
    if (!Number.isFinite(grossPl) || grossPl === 0) return ''
    return grossPl < 0 ? `${POKER_STABLE_SESSION_LOSS_EMOJI} ` : `${POKER_STABLE_SESSION_WIN_EMOJI} `
  }

  const parts = raw
    .split(' · ')
    .map((p) => p.trim())
    .filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const m = parts[i].match(SESSION_COMPLETE_AMOUNT_RE)
    if (!m) continue
    const sign = m[1] === '-' ? -1 : 1
    const abs = Number(String(m[2] || '').replace(/,/g, ''))
    if (!Number.isFinite(abs) || abs === 0) return ''
    const grossPl = sign * abs
    return grossPl < 0 ? `${POKER_STABLE_SESSION_LOSS_EMOJI} ` : `${POKER_STABLE_SESSION_WIN_EMOJI} `
  }
  return ''
}

function actorDisplayName(
  profile: ActorProfile | null | undefined,
  detailText?: string | null,
): string {
  const name = String(profile?.display_name || '').trim()
  if (name) return name
  const handle = String(profile?.handle || '').trim()
  if (handle) return handle.startsWith('@') ? handle : `@${handle}`
  const { backerName } = parsePokerStableActivityDetail(detailText)
  if (backerName) return backerName
  return 'Member'
}

function prefAllows(prefs: NotificationPrefs | null, eventType: string): boolean {
  if (!prefs) return true
  switch (eventType) {
    case 'comment_on_post':
    case 'reply_to_comment':
      return prefs.push_replies
    case 'mention_in_post':
    case 'mention_in_comment':
    case 'chat_mention':
      return prefs.push_mentions
    case 'follow':
    case 'creator_fan_sub':
      return prefs.push_follows
    case 'repost':
    case 'quote_repost':
      return prefs.push_reposts
    case 'like':
      return prefs.push_likes
    case 'bookmark':
      return prefs.push_bookmarks
    case 'chat_dm':
    case 'chat_group_invite':
    case 'chat_call_invite':
    case 'chat_call_missed':
      return prefs.push_messages
    default:
      return true
  }
}

function groupedTargetPhrase(commentId: string | null, isReply: boolean): string {
  if (commentId) return isReply ? 'your reply' : 'your comment'
  return 'your post'
}

function groupedVerb(eventType: string): string {
  return eventType === 'bookmark' ? 'bookmarked' : 'liked'
}

function actionPhrase(eventType: string, commentId: string | null, isReply = false): string {
  switch (eventType) {
    case 'comment_on_post':
      return 'commented on your post'
    case 'reply_to_comment':
      return 'replied to your comment'
    case 'mention_in_post':
      return 'mentioned you in a post'
    case 'mention_in_comment':
      return 'mentioned you in a comment'
    case 'chat_mention':
      return 'tagged you in a chat'
    case 'follow':
      return 'followed you'
    case 'creator_fan_sub':
      return 'subscribed to your fan tier'
    case 'repost':
      return commentId ? 'reposted your comment' : 'reposted your post'
    case 'quote_repost':
      return 'quote reposted your post'
    case 'bookmark':
      return commentId ? (isReply ? 'bookmarked your reply' : 'bookmarked your comment') : 'bookmarked your post'
    case 'like':
      return commentId ? (isReply ? 'liked your reply' : 'liked your comment') : 'liked your post'
    case 'play_log_shared':
      return 'added you to a play log'
    case 'play_log_partner_paid':
      return 'marked your play log share as paid'
    case 'play_log_partner_unpaid':
      return 'marked your play log share as unpaid'
    case 'chat_dm':
      return 'sent you a message'
    case 'chat_group_invite':
      return 'added you to a group'
    case 'chat_call_invite':
      return 'is calling you'
    case 'chat_call_missed':
      return 'Missed call'
    case 'starter_weekly_guide_drop':
      return 'Weekly guide drop ready — scratch to reveal'
    case 'ap_guide_released':
      return 'released a new AP Slot Guide'
    case 'poker_tournament_swap':
      return 'offered you a tournament swap'
    case 'poker_tournament_swap_result':
      return 'finished a tournament swap with you'
    case 'poker_stable_slice_invite':
      return 'invited you to back a stake'
    case 'poker_stable_slice_nudge':
      return 'reminded you to accept your backing slice'
    case 'poker_stable_terms_edited':
      return 'updated the stake terms'
    case 'poker_stable_session_complete':
      return 'completed a stake session'
    case 'poker_stable_settlement_proposed':
      return 'proposed a settlement for you to review'
    case 'poker_stable_settlement_resolved':
      return 'responded to your settlement proposal'
    case 'poker_stable_commit_recorded':
      return 'recorded a stake update — sync your books'
    case 'poker_stable_backer_offer':
      return 'offered you a backing stake'
    case 'poker_stable_stakee_accepted':
      return 'accepted your backing offer'
    case 'poker_stable_stakee_declined':
      return 'declined your backing offer'
    case 'poker_stable_stakee_counter_proposed':
      return 'proposed new stake terms'
    case 'poker_stable_staker_counter_accepted':
      return 'accepted your counter-proposal'
    case 'poker_stable_staker_counter_declined':
      return 'declined your counter-proposal'
    case 'poker_stable_slice_accepted':
      return 'accepted your backing slice'
    case 'poker_stable_slice_declined':
      return 'declined your backing slice'
    case 'poker_stable_offer_withdrawn':
      return 'withdrew the stake offer'
    default:
      return 'interacted with you'
  }
}

type PushMarkReadIds = {
  activityEventId?: string
  activityBatchId?: string
}

type PushRoutingContext = {
  recipientUserId?: string | null
  dealStakeeUserId?: string | null
}

type PushNotificationPayload = {
  title: string
  body: string
  url: string
  activityEventId?: string
  activityBatchId?: string
  /** Lets the service worker treat call rings differently from Lounge toasts. */
  eventType?: string
  chatCallId?: string
}

function pokerStableTabForRecipient(
  event: Pick<
    ActivityEventRow,
    'event_type' | 'poker_stable_commit_id' | 'poker_stable_settlement_request_id'
  >,
  recipientUserId: string | null | undefined,
  dealStakeeUserId: string | null | undefined,
): 'poker-bankroll' | 'poker-stable' {
  const bankrollTab =
    event.event_type === 'poker_stable_backer_offer' ||
    event.event_type === 'poker_stable_staker_counter_accepted' ||
    event.event_type === 'poker_stable_staker_counter_declined' ||
    event.event_type === 'poker_stable_slice_accepted' ||
    event.event_type === 'poker_stable_slice_declined'
  if (bankrollTab) return 'poker-bankroll'

  const roleRouted =
    event.event_type === 'poker_stable_commit_recorded' ||
    event.event_type === 'poker_stable_settlement_proposed' ||
    event.event_type === 'poker_stable_settlement_resolved' ||
    Boolean(event.poker_stable_commit_id) ||
    Boolean(event.poker_stable_settlement_request_id)

  if (
    roleRouted &&
    recipientUserId &&
    dealStakeeUserId &&
    recipientUserId === dealStakeeUserId
  ) {
    return 'poker-bankroll'
  }
  return 'poker-stable'
}

function buildTargetUrl(
  event: Pick<
    ActivityEventRow,
    | 'event_type'
    | 'post_id'
    | 'comment_id'
    | 'play_log_entry_id'
    | 'chat_room_id'
    | 'chat_call_id'
    | 'starter_weekly_unlock_id'
    | 'guide_slug'
    | 'poker_stable_deal_id'
    | 'poker_stable_settlement_request_id'
    | 'poker_stable_commit_id'
  >,
  actor: ActorProfile | null | undefined,
  markRead?: PushMarkReadIds,
  routing?: PushRoutingContext,
): string {
  const params = new URLSearchParams()
  params.set('tab', 'home')

  if (
    (event.event_type === 'chat_dm' ||
      event.event_type === 'chat_group_invite' ||
      event.event_type === 'chat_call_invite' ||
      event.event_type === 'chat_call_missed' ||
      event.event_type === 'chat_mention') &&
    event.chat_room_id
  ) {
    params.set('tab', 'chat')
    params.set('room', event.chat_room_id)
    // Invite: call= accept UI. Missed: missedCall= opens DM + call-back prompt (same tag).
    if (event.event_type === 'chat_call_invite' && event.chat_call_id) {
      params.set('call', event.chat_call_id)
    }
    if (event.event_type === 'chat_call_missed' && event.chat_call_id) {
      params.set('missedCall', event.chat_call_id)
    }
  } else if (
    (event.event_type === 'play_log_shared' ||
      event.event_type === 'play_log_partner_paid' ||
      event.event_type === 'play_log_partner_unpaid') &&
    event.play_log_entry_id
  ) {
    params.set('tab', 'logbook')
    params.set('playLogEntry', event.play_log_entry_id)
  } else if (event.event_type === 'follow' || event.event_type === 'creator_fan_sub') {
    const handle = String(actor?.handle || '').trim().replace(/^@/, '').toLowerCase()
    if (handle) {
      params.set('u', handle)
    } else {
      params.set('lounge', 'notifications')
    }
  } else if (event.event_type === 'starter_weekly_guide_drop' && event.starter_weekly_unlock_id) {
    params.set('tab', 'home')
    params.set('lounge', 'notifications')
    params.set('starterDrop', String(event.starter_weekly_unlock_id))
  } else if (event.event_type === 'ap_guide_released' && event.guide_slug) {
    params.set('tab', 'guides')
    params.set('guide', String(event.guide_slug).trim())
  } else if (
    event.event_type === 'poker_tournament_swap' ||
    event.event_type === 'poker_tournament_swap_result'
  ) {
    params.set('tab', 'poker-bankroll')
  } else if (
    event.event_type === 'poker_stable_slice_invite' ||
    event.event_type === 'poker_stable_slice_nudge' ||
    event.event_type === 'poker_stable_session_complete' ||
    event.event_type === 'poker_stable_settlement_proposed' ||
    event.event_type === 'poker_stable_settlement_resolved' ||
    event.event_type === 'poker_stable_commit_recorded' ||
    event.event_type === 'poker_stable_stakee_accepted' ||
    event.event_type === 'poker_stable_stakee_declined' ||
    event.event_type === 'poker_stable_stakee_counter_proposed' ||
    event.event_type === 'poker_stable_backer_offer' ||
    event.event_type === 'poker_stable_staker_counter_accepted' ||
    event.event_type === 'poker_stable_staker_counter_declined' ||
    event.event_type === 'poker_stable_slice_accepted' ||
    event.event_type === 'poker_stable_slice_declined' ||
    event.event_type === 'poker_stable_offer_withdrawn' ||
    event.event_type === 'poker_stable_terms_edited'
  ) {
    const tab = pokerStableTabForRecipient(
      event,
      routing?.recipientUserId,
      routing?.dealStakeeUserId,
    )
    params.set('tab', tab)
    // Session complete / horse accepted: include stableDeal so Stable can focus + refresh the card
    // (client does not auto-open deal detail unless stableCommit/stableSettlement is present).
    if (event.poker_stable_deal_id) {
      params.set('stableDeal', event.poker_stable_deal_id)
    }
    if (event.event_type === 'poker_stable_offer_withdrawn') {
      params.set('stableWithdrawn', '1')
    }
    // Edge push: Bankroll + stableDeal focuses the stake card. Guest claim URLs still pass stakeOnboarding=1.
    if (event.poker_stable_commit_id) {
      params.set('stableCommit', event.poker_stable_commit_id)
    } else if (event.poker_stable_settlement_request_id) {
      params.set('stableSettlement', event.poker_stable_settlement_request_id)
    }
  } else if (event.event_type === 'repost' && !event.comment_id) {
    params.set('lounge', 'notifications')
  } else if (event.post_id) {
    params.set('post', event.post_id)
  } else {
    params.set('lounge', 'notifications')
  }

  if (markRead?.activityEventId) {
    params.set('activityEvent', markRead.activityEventId)
  }
  if (markRead?.activityBatchId) {
    params.set('activityBatch', markRead.activityBatchId)
  }

  return `/?${params.toString()}`
}

function buildGroupedBody(
  eventType: string,
  actors: ActorProfile[],
  commentId: string | null,
  isReply: boolean,
): string {
  const targetPhrase = groupedTargetPhrase(commentId, isReply)
  const verb = groupedVerb(eventType)
  const leadName = actorDisplayName(actors[0])
  const othersCount = Math.max(0, actors.length - 1)
  if (othersCount <= 0) {
    return `${leadName} ${verb} ${targetPhrase}`
  }
  const otherLabel = othersCount === 1 ? '1 other' : `${othersCount} others`
  return `${leadName} and ${otherLabel} ${verb} ${targetPhrase}`
}

/** Batched DM push after debounce window (one notification per burst in a room). */
function buildChatDmGroupedBody(actors: ActorProfile[], messageCount: number): string {
  const leadName = actorDisplayName(actors[0])
  const n = Math.max(1, messageCount)
  if (n === 1) {
    return `${leadName} sent you a message`
  }
  if (actors.length <= 1) {
    return `${leadName} sent you ${n} messages`
  }
  const otherLabel = actors.length === 2 ? '1 other' : `${actors.length - 1} others`
  return `${leadName} and ${otherLabel} sent you ${n} messages`
}

function buildSingleNotification(
  event: ActivityEventRow,
  actor: ActorProfile | null | undefined,
  isReply = false,
  routing?: PushRoutingContext,
): PushNotificationPayload {
  if (event.event_type === 'starter_weekly_guide_drop') {
    return {
      title: 'Edge',
      body: 'Weekly guide drop ready — scratch to reveal',
      url: buildTargetUrl(event, actor, { activityEventId: event.id }, routing),
      activityEventId: event.id,
    }
  }
  if (event.event_type === 'ap_guide_released') {
    const guideTitle = String(event.detail_text || '').trim() || 'New AP Slot Guide'
    return {
      title: 'AP Guides',
      body: `New AP Slot Guide released: ${guideTitle}`,
      url: buildTargetUrl(event, actor, { activityEventId: event.id }, routing),
      activityEventId: event.id,
    }
  }
  const who = actorDisplayName(actor, event.detail_text)
  if (event.event_type === 'chat_call_missed') {
    return {
      title: pushTitleForEventType(event.event_type),
      body: `Missed call from ${who}`,
      url: buildTargetUrl(event, actor, { activityEventId: event.id }, routing),
      activityEventId: event.id,
      eventType: event.event_type,
      ...(event.chat_call_id ? { chatCallId: event.chat_call_id } : {}),
    }
  }
  if (event.event_type === 'chat_mention') {
    const roomName = String(event.detail_text || '').trim() || 'a chat'
    return {
      title: pushTitleForEventType(event.event_type),
      body: `${who} tagged you in ${roomName}`,
      url: buildTargetUrl(event, actor, { activityEventId: event.id }, routing),
      activityEventId: event.id,
      eventType: event.event_type,
    }
  }
  if (
    event.event_type === 'poker_stable_slice_invite' ||
    event.event_type === 'poker_stable_slice_nudge' ||
    event.event_type === 'poker_stable_session_complete' ||
    event.event_type === 'poker_stable_settlement_proposed' ||
    event.event_type === 'poker_stable_settlement_resolved' ||
    event.event_type === 'poker_stable_commit_recorded' ||
    event.event_type === 'poker_stable_stakee_accepted' ||
    event.event_type === 'poker_stable_stakee_declined' ||
    event.event_type === 'poker_stable_stakee_counter_proposed' ||
    event.event_type === 'poker_stable_backer_offer' ||
    event.event_type === 'poker_stable_staker_counter_accepted' ||
    event.event_type === 'poker_stable_staker_counter_declined' ||
    event.event_type === 'poker_stable_slice_accepted' ||
    event.event_type === 'poker_stable_slice_declined' ||
    event.event_type === 'poker_stable_offer_withdrawn' ||
    event.event_type === 'poker_stable_terms_edited'
  ) {
    const phrase = actionPhrase(event.event_type, event.comment_id, isReply)
    const fishPrefix =
      event.event_type === 'poker_stable_session_complete'
        ? pokerStableSessionCompleteEmojiPrefix(event.detail_text)
        : ''
    return {
      title: 'Poker Stable',
      body: `${fishPrefix}${who} ${phrase}`,
      url: buildTargetUrl(event, actor, { activityEventId: event.id }, routing),
      activityEventId: event.id,
      eventType: event.event_type,
    }
  }
  const phrase = actionPhrase(event.event_type, event.comment_id, isReply)
  return {
    title: pushTitleForEventType(event.event_type),
    body: `${who} ${phrase}`,
    url: buildTargetUrl(event, actor, { activityEventId: event.id }, routing),
    activityEventId: event.id,
    eventType: event.event_type,
    ...((event.event_type === 'chat_call_invite' || event.event_type === 'chat_call_missed') &&
    event.chat_call_id
      ? { chatCallId: event.chat_call_id }
      : {}),
  }
}

async function loadPrefs(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<NotificationPrefs | null> {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('push_replies, push_mentions, push_follows, push_reposts, push_likes, push_bookmarks, push_messages')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as NotificationPrefs | null) || null
}

async function markBatchSent(admin: ReturnType<typeof createClient>, batchId: string) {
  await admin
    .from('activity_push_batches')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', batchId)
    .is('sent_at', null)
}

async function sendPushToUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  notification: PushNotificationPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
) {
  const { data: subscriptions, error: subError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (subError) throw subError
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0, removed: 0, message: 'No push subscriptions for recipient.' }
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  let sent = 0
  let failed = 0
  let removed = 0

  for (const sub of subscriptions) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: toBase64Url(sub.p256dh),
        auth: toBase64Url(sub.auth),
      },
    }
    try {
      await webpush.sendNotification(
        subscription as { endpoint: string; keys: { p256dh: string; auth: string } },
        JSON.stringify(notification),
      )
      sent += 1
    } catch (error) {
      failed += 1
      const statusCode = (error as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await admin
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id)
          .eq('user_id', userId)
        if (!deleteError) removed += 1
      }
    }
  }

  return { sent, failed, removed }
}

async function handleImmediatePush(
  admin: ReturnType<typeof createClient>,
  activityEventId: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
) {
  const { data: eventRow, error: eventError } = await admin
    .from('activity_events')
    .select(
      'id, recipient_user_id, actor_user_id, event_type, post_id, comment_id, play_log_entry_id, chat_room_id, chat_call_id, starter_weekly_unlock_id, guide_slug, detail_text, poker_tournament_swap_id, poker_stable_deal_id, poker_stable_settlement_request_id, poker_stable_commit_id, created_at',
    )
    .eq('id', activityEventId)
    .maybeSingle()

  if (eventError) throw eventError
  if (!eventRow) {
    return new Response(JSON.stringify({ error: 'Activity event not found.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const event = eventRow as ActivityEventRow
  const prefs = await loadPrefs(admin, event.recipient_user_id)

  if (!prefAllows(prefs, event.event_type)) {
    return new Response(
      JSON.stringify({ sent: 0, failed: 0, removed: 0, skipped: true, reason: 'preference_disabled' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { data: actorProfile, error: actorError } = await admin
    .from('profiles')
    .select('user_id, handle, display_name')
    .eq('user_id', event.actor_user_id)
    .maybeSingle()

  if (actorError) throw actorError

  let isReply = false
  if (event.comment_id) {
    const { data: commentRow } = await admin
      .from('feed_comments')
      .select('parent_id')
      .eq('id', event.comment_id)
      .maybeSingle()
    isReply = Boolean(commentRow?.parent_id)
  }

  let dealStakeeUserId: string | null = null
  if (event.poker_stable_deal_id) {
    const roleRouted =
      event.event_type === 'poker_stable_commit_recorded' ||
      event.event_type === 'poker_stable_settlement_proposed' ||
      event.event_type === 'poker_stable_settlement_resolved' ||
      Boolean(event.poker_stable_commit_id) ||
      Boolean(event.poker_stable_settlement_request_id)
    if (roleRouted) {
      const { data: dealRow } = await admin
        .from('poker_stable_deals')
        .select('stakee_user_id')
        .eq('id', event.poker_stable_deal_id)
        .maybeSingle()
      dealStakeeUserId = dealRow?.stakee_user_id ? String(dealRow.stakee_user_id) : null
    }
  }

  let notification = buildSingleNotification(
    event,
    (actorProfile as ActorProfile | null) || null,
    isReply,
    {
      recipientUserId: event.recipient_user_id,
      dealStakeeUserId,
    },
  )

  if (event.event_type === 'poker_tournament_swap_result') {
    const who = actorDisplayName((actorProfile as ActorProfile | null) || null)
    const detail = String(event.detail_text || '').trim() || 'finished a tournament swap with you'
    const params = new URLSearchParams()
    params.set('tab', 'poker-bankroll')
    params.set('activityEvent', event.id)
    if (event.poker_tournament_swap_id) {
      const { data: swapRow } = await admin
        .from('poker_tournament_swaps')
        .select('creator_user_id, creator_session_id, counterparty_user_id, counterparty_session_id')
        .eq('id', event.poker_tournament_swap_id)
        .maybeSingle()
      const recipientId = String(event.recipient_user_id || '')
      let sessionId: string | null = null
      if (swapRow && recipientId) {
        if (String(swapRow.creator_user_id || '') === recipientId) {
          sessionId = swapRow.creator_session_id ? String(swapRow.creator_session_id) : null
        } else if (String(swapRow.counterparty_user_id || '') === recipientId) {
          sessionId = swapRow.counterparty_session_id
            ? String(swapRow.counterparty_session_id)
            : null
        }
      }
      if (sessionId) params.set('pokerSession', sessionId)
    }
    notification = {
      title: pushTitleForEventType(event.event_type),
      body: `${who} ${detail}`,
      url: `/?${params.toString()}`,
      activityEventId: event.id,
    }
  }

  if (
    (event.event_type === 'play_log_shared' ||
      event.event_type === 'play_log_partner_paid' ||
      event.event_type === 'play_log_partner_unpaid') &&
    event.play_log_entry_id
  ) {
    const who = actorDisplayName((actorProfile as ActorProfile | null) || null)
    let gameName = 'a play log'
    let sharePct: number | null = null
    const { data: entryRow } = await admin
      .from('play_log_entries')
      .select('session_id, template_id, play_log_game_templates ( display_name )')
      .eq('id', event.play_log_entry_id)
      .maybeSingle()
    const tpl = (entryRow as { play_log_game_templates?: { display_name?: string } | null })?.play_log_game_templates
    if (tpl?.display_name) gameName = String(tpl.display_name).trim()
    const sessionId = (entryRow as { session_id?: string | null })?.session_id
    if (sessionId) {
      const { data: partnerRow } = await admin
        .from('play_log_session_partners')
        .select('share_percent')
        .eq('session_id', sessionId)
        .eq('user_id', event.recipient_user_id)
        .eq('participant_kind', 'user')
        .maybeSingle()
      if (partnerRow?.share_percent != null) sharePct = Number(partnerRow.share_percent)
    }
    const pctStr =
      sharePct != null && Number.isFinite(sharePct) ? ` (${sharePct}%)` : ''
    const playLogVerb =
      event.event_type === 'play_log_partner_paid'
        ? `marked your share as paid on ${gameName}`
        : event.event_type === 'play_log_partner_unpaid'
          ? `marked your share as unpaid on ${gameName}`
          : `added you to ${gameName}`
    notification = {
      title: pushTitleForEventType(event.event_type),
      body: `${who} ${playLogVerb}${event.event_type === 'play_log_shared' ? pctStr : ''}`,
      url: buildTargetUrl(event, (actorProfile as ActorProfile | null) || null, {
        activityEventId: event.id,
      }),
      activityEventId: event.id,
    }
  }

  const result = await sendPushToUser(
    admin,
    event.recipient_user_id,
    notification,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  )

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function handleBatchPush(
  admin: ReturnType<typeof createClient>,
  batchId: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
) {
  let batchRow: PushBatchRow | null = null
  const { data: initialBatch, error: batchError } = await admin
    .from('activity_push_batches')
    .select('id, recipient_user_id, event_type, post_id, comment_id, chat_room_id, scheduled_send_at, sent_at')
    .eq('id', batchId)
    .maybeSingle()

  if (batchError) throw batchError
  if (!initialBatch) {
    return new Response(JSON.stringify({ error: 'Push batch not found.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  batchRow = initialBatch as PushBatchRow
  if (batchRow.sent_at) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, removed: 0, skipped: true, reason: 'already_sent' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (batchRow.event_type === 'chat_dm') {
    const waitResult = await waitForChatDmDebounce(admin, batchId)
    if (waitResult === 'already_sent') {
      return new Response(JSON.stringify({ sent: 0, failed: 0, removed: 0, skipped: true, reason: 'already_sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (waitResult === 'missing') {
      return new Response(JSON.stringify({ error: 'Push batch not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: reloaded, error: reloadError } = await admin
      .from('activity_push_batches')
      .select('id, recipient_user_id, event_type, post_id, comment_id, chat_room_id, scheduled_send_at, sent_at')
      .eq('id', batchId)
      .maybeSingle()
    if (reloadError) throw reloadError
    if (!reloaded) {
      return new Response(JSON.stringify({ error: 'Push batch not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    batchRow = reloaded as PushBatchRow
    if (batchRow.sent_at) {
      return new Response(JSON.stringify({ sent: 0, failed: 0, removed: 0, skipped: true, reason: 'already_sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const batch = batchRow

  const prefs = await loadPrefs(admin, batch.recipient_user_id)
  if (!prefAllows(prefs, batch.event_type)) {
    await markBatchSent(admin, batchId)
    return new Response(
      JSON.stringify({ sent: 0, failed: 0, removed: 0, skipped: true, reason: 'preference_disabled' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { data: links, error: linksError } = await admin
    .from('activity_push_batch_events')
    .select('activity_event_id')
    .eq('batch_id', batchId)

  if (linksError) throw linksError

  const eventIds = (links || []).map((row) => row.activity_event_id).filter(Boolean)
  if (eventIds.length === 0) {
    await markBatchSent(admin, batchId)
    return new Response(JSON.stringify({ sent: 0, failed: 0, removed: 0, skipped: true, reason: 'empty_batch' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: events, error: eventsError } = await admin
    .from('activity_events')
    .select(
      'id, recipient_user_id, actor_user_id, event_type, post_id, comment_id, chat_room_id, created_at',
    )
    .in('id', eventIds)
    .order('created_at', { ascending: true })

  if (eventsError) throw eventsError

  const eventList = (events || []) as ActivityEventRow[]
  const actorIds = [...new Set(eventList.map((row) => row.actor_user_id).filter(Boolean))]

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('user_id, handle, display_name')
    .in('user_id', actorIds)

  if (profilesError) throw profilesError

  const profileByUser = new Map<string, ActorProfile>()
  for (const profile of (profiles || []) as ActorProfile[]) {
    profileByUser.set(profile.user_id, profile)
  }

  const uniqueActors: ActorProfile[] = []
  const seenActors = new Set<string>()
  for (const row of eventList) {
    const uid = row.actor_user_id
    if (!uid || seenActors.has(uid)) continue
    seenActors.add(uid)
    uniqueActors.push(profileByUser.get(uid) || { user_id: uid, handle: null, display_name: null })
  }

  let notification: PushNotificationPayload
  if (batch.event_type === 'chat_dm') {
    const roomId = batch.chat_room_id || eventList[0]?.chat_room_id || null
    const body = buildChatDmGroupedBody(uniqueActors, eventList.length)
    const urlEvent = {
      event_type: 'chat_dm' as const,
      post_id: null,
      comment_id: null,
      play_log_entry_id: null,
      chat_room_id: roomId,
    }
    notification = {
      title: PUSH_TITLE_CHAT,
      body,
      url: buildTargetUrl(urlEvent, uniqueActors[0] || null, { activityBatchId: batchId }),
      activityBatchId: batchId,
    }
  } else {
    let isReply = false
    if (batch.comment_id) {
      const { data: commentRow } = await admin
        .from('feed_comments')
        .select('parent_id')
        .eq('id', batch.comment_id)
        .maybeSingle()
      isReply = Boolean(commentRow?.parent_id)
    }

    const body = buildGroupedBody(batch.event_type, uniqueActors, batch.comment_id, isReply)
    notification = {
      title: 'Edge Lounge',
      body,
      url: buildTargetUrl(batch, uniqueActors[0] || null, { activityBatchId: batchId }),
      activityBatchId: batchId,
    }
  }

  const { data: claimed, error: claimError } = await admin
    .from('activity_push_batches')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', batchId)
    .is('sent_at', null)
    .select('id')
    .maybeSingle()

  if (claimError) throw claimError
  if (!claimed) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, removed: 0, skipped: true, reason: 'already_sent' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const result = await sendPushToUser(
    admin,
    batch.recipient_user_id,
    notification,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  )

  return new Response(JSON.stringify({ ...result, batched: true, actorCount: uniqueActors.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const vapidPublicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('WEB_PUSH_SUBJECT') || 'mailto:support@edgetilt.com'
    const pushSecret = Deno.env.get('LOUNGE_ACTIVITY_PUSH_SECRET')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    }
    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('Missing WEB_PUSH_PUBLIC_KEY or WEB_PUSH_PRIVATE_KEY.')
    }
    if (!pushSecret) {
      throw new Error('Missing LOUNGE_ACTIVITY_PUSH_SECRET.')
    }

    const headerSecret = req.headers.get('x-lounge-activity-push-secret') || ''
    if (headerSecret !== pushSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const activityEventId =
      typeof body?.activityEventId === 'string'
        ? body.activityEventId.trim()
        : typeof body?.activity_event_id === 'string'
          ? body.activity_event_id.trim()
          : ''
    const batchId =
      typeof body?.batchId === 'string'
        ? body.batchId.trim()
        : typeof body?.batch_id === 'string'
          ? body.batch_id.trim()
          : ''

    if (!activityEventId && !batchId) {
      return new Response(JSON.stringify({ error: 'Missing activityEventId or batchId.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)

    if (batchId) {
      return await handleBatchPush(admin, batchId, vapidPublicKey, vapidPrivateKey, vapidSubject)
    }

    return await handleImmediatePush(admin, activityEventId, vapidPublicKey, vapidPrivateKey, vapidSubject)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
