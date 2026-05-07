import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Distinct from legacy rule-based sends (15, 30, …). One row per event for schedule-driven push. */
const ALERT_SCHEDULE_LEAD_KEY = 0

function toBase64Url(value: string | null | undefined): string | null {
  if (!value) return null
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function formatEventDate(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return 'soon'
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function notificationPayload(ev: {
  casino_name: string | null
  title: string | null
  start_at: string
  alert_preset: string | null
}): { title: string; body: string } {
  const casino = ev.casino_name || 'Offer'
  const title = ev.title || 'Your event'
  if (ev.alert_preset === 'day_9am') {
    return {
      title: `${casino} · Today`,
      body: title,
    }
  }
  return {
    title: `${casino} · Starting soon`,
    body: title,
  }
}

function batchedNotificationPayload(
  events: Array<{
    casino_name: string | null
    title: string | null
    start_at: string
    alert_preset: string | null
  }>
): { title: string; body: string } {
  if (!events.length) return { title: 'Offer reminder', body: 'You have offers due soon.' }
  if (events.length === 1) return notificationPayload(events[0])

  const allDayOnly = events.every((ev) => ev.alert_preset === 'day_9am')
  const first = events[0]
  const firstDate = formatEventDate(first.start_at)
  const titles = events
    .map((ev) => ev.title?.trim() || 'Untitled event')
    .filter(Boolean)
  const preview = titles.slice(0, 3).join(' • ')
  const remaining = Math.max(0, titles.length - 3)
  const tail = remaining > 0 ? ` +${remaining} more` : ''

  if (allDayOnly) {
    return {
      title: `${events.length} offers today`,
      body: `${preview}${tail} (${firstDate})`,
    }
  }

  return {
    title: `${events.length} offers starting soon`,
    body: `${preview}${tail}`,
  }
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
    const vapidSubject = Deno.env.get('WEB_PUSH_SUBJECT') || 'mailto:support@lvslotpro.com'
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    if (!vapidPublicKey || !vapidPrivateKey) throw new Error('Missing WEB_PUSH_PUBLIC_KEY or WEB_PUSH_PRIVATE_KEY.')

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json().catch(() => ({}))
    const dryRun = body?.dryRun === true
    const lookaheadMinutes = Number(body?.lookaheadMinutes) > 0 ? Number(body.lookaheadMinutes) : 1
    const graceLookbackSeconds = Number(body?.graceLookbackSeconds) > 0 ? Number(body.graceLookbackSeconds) : 120
    const now = new Date()
    const lower = new Date(now.getTime() - graceLookbackSeconds * 1000)
    const upper = new Date(now.getTime() + lookaheadMinutes * 60_000)

    const { data: rules, error: rulesError } = await admin.from('offer_notification_rules').select('user_id').eq('enabled', true)

    if (rulesError) throw rulesError
    const allowedUsers = [...new Set((rules || []).map((r) => r.user_id).filter(Boolean))] as string[]
    if (allowedUsers.length === 0) {
      return new Response(JSON.stringify({ checked: 0, queued: 0, sent: 0, failed: 0, removed: 0, dryRun }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const { data: candidates, error: candErr } = await admin
      .from('offer_events')
      .select('id, user_id, casino_name, title, start_at, alert_fire_at, alert_preset')
      .in('user_id', allowedUsers)
      .not('alert_fire_at', 'is', null)
      .gte('alert_fire_at', lower.toISOString())
      .lt('alert_fire_at', upper.toISOString())
      .order('alert_fire_at', { ascending: true })
      .limit(400)

    if (candErr) throw candErr

    const list = candidates || []
    const candidateIds = list.map((ev) => ev.id)

    const { data: alreadySentRows, error: sentErr } = candidateIds.length
      ? await admin
        .from('offer_notification_sends')
        .select('event_id,created_at')
        .in('event_id', candidateIds)
        .eq('lead_minutes', ALERT_SCHEDULE_LEAD_KEY)
      : { data: [], error: null }
    if (sentErr) throw sentErr
    const lastSentAtByEventId = new Map(
      (alreadySentRows || []).map((r) => [r.event_id, r.created_at || null])
    )
    // Re-send when an event was edited after the prior send (alert_fire_at moved later).
    const unsentEvents = list.filter((ev) => {
      const sentAt = lastSentAtByEventId.get(ev.id)
      if (!sentAt) return true
      const sentMs = new Date(sentAt).getTime()
      const fireMs = new Date(ev.alert_fire_at || '').getTime()
      if (!Number.isFinite(sentMs) || !Number.isFinite(fireMs)) return false
      return sentMs < fireMs
    })

    const grouped = new Map<string, typeof unsentEvents>()
    for (const ev of unsentEvents) {
      const key = `${ev.user_id}::${ev.alert_fire_at || ''}`
      const cur = grouped.get(key)
      if (cur) cur.push(ev)
      else grouped.set(key, [ev])
    }

    let checked = list.length
    let queued = 0
    let sent = 0
    let failed = 0
    let removed = 0

    const subscriptionCache = new Map<string, Array<{ id: string; endpoint: string; p256dh: string | null; auth: string | null }>>()
    for (const eventsAtSameTime of grouped.values()) {
      const ev = eventsAtSameTime[0]
      queued += eventsAtSameTime.length
      if (dryRun) continue

      let subscriptions = subscriptionCache.get(ev.user_id)
      if (!subscriptions) {
        const { data: fetchedSubscriptions, error: subError } = await admin
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', ev.user_id)
        if (subError) throw subError
        subscriptions = fetchedSubscriptions || []
        subscriptionCache.set(ev.user_id, subscriptions)
      }

      if (!subscriptions || subscriptions.length === 0) {
        await admin.from('offer_notification_sends').insert(
          eventsAtSameTime.map((item) => ({
            user_id: item.user_id,
            event_id: item.id,
            lead_minutes: ALERT_SCHEDULE_LEAD_KEY,
            send_status: 'no_subscription',
            error_message: 'No push subscriptions found for user.',
          }))
        )
        continue
      }

      const sortedEvents = [...eventsAtSameTime].sort((a, b) => a.start_at.localeCompare(b.start_at))
      const { title, body: nBody } = batchedNotificationPayload(sortedEvents)
      let hadSuccess = false
      let errorSummary = ''
      for (const sub of subscriptions) {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: toBase64Url(sub.p256dh), auth: toBase64Url(sub.auth) },
        }
        try {
          const firstEvent = sortedEvents[0]
          const isSingleEvent = sortedEvents.length === 1
          await webpush.sendNotification(
            subscription as { endpoint: string; keys: { p256dh: string; auth: string } },
            JSON.stringify({
              title,
              body: nBody,
              url: '/?tab=offers',
              eventStartAt: isSingleEvent ? firstEvent?.start_at || null : null,
              eventAlertPreset: isSingleEvent ? firstEvent?.alert_preset || null : null,
            })
          )
          hadSuccess = true
          sent += 1
        } catch (error) {
          failed += 1
          const statusCode = (error as { statusCode?: number })?.statusCode
          const message = (error as { message?: string })?.message || 'Push send failed.'
          errorSummary = message
          if (statusCode === 404 || statusCode === 410) {
            const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('id', sub.id).eq('user_id', ev.user_id)
            if (!deleteError) removed += 1
          }
        }
      }

      await admin.from('offer_notification_sends').insert(
        eventsAtSameTime.map((item) => ({
          user_id: item.user_id,
          event_id: item.id,
          lead_minutes: ALERT_SCHEDULE_LEAD_KEY,
          send_status: hadSuccess ? 'sent' : 'failed',
          error_message: hadSuccess ? null : errorSummary.slice(0, 400),
        }))
      )
    }

    return new Response(JSON.stringify({ checked, queued, sent, failed, removed, dryRun }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
