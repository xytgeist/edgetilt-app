import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const now = new Date()
    const upper = new Date(now.getTime() + lookaheadMinutes * 60_000)

    const { data: rules, error: rulesError } = await admin
      .from('offer_notification_rules')
      .select('user_id, lead_minutes')
      .eq('enabled', true)

    if (rulesError) throw rulesError
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ checked: 0, queued: 0, sent: 0, failed: 0, removed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    let checked = 0
    let queued = 0
    let sent = 0
    let failed = 0
    let removed = 0

    for (const rule of rules) {
      checked += 1
      const targetStart = new Date(now.getTime() + rule.lead_minutes * 60_000)
      const targetEnd = new Date(upper.getTime() + rule.lead_minutes * 60_000)

      const { data: events, error: eventsError } = await admin
        .from('offer_events')
        .select('id, user_id, casino_name, title, start_at')
        .eq('user_id', rule.user_id)
        .gte('start_at', targetStart.toISOString())
        .lt('start_at', targetEnd.toISOString())
        .order('start_at', { ascending: true })
        .limit(50)
      if (eventsError) throw eventsError
      if (!events || events.length === 0) continue

      for (const ev of events) {
        const { data: existing } = await admin
          .from('offer_notification_sends')
          .select('id')
          .eq('user_id', ev.user_id)
          .eq('event_id', ev.id)
          .eq('lead_minutes', rule.lead_minutes)
          .maybeSingle()
        if (existing) continue

        queued += 1
        if (dryRun) continue

        const { data: subscriptions, error: subError } = await admin
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', ev.user_id)
        if (subError) throw subError
        if (!subscriptions || subscriptions.length === 0) {
          await admin.from('offer_notification_sends').insert({
            user_id: ev.user_id,
            event_id: ev.id,
            lead_minutes: rule.lead_minutes,
            send_status: 'no_subscription',
            error_message: 'No push subscriptions found for user.',
          })
          continue
        }

        let hadSuccess = false
        let errorSummary = ''
        for (const sub of subscriptions) {
          const subscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: toBase64Url(sub.p256dh), auth: toBase64Url(sub.auth) },
          }
          try {
            await webpush.sendNotification(
              subscription as { endpoint: string; keys: { p256dh: string; auth: string } },
              JSON.stringify({
                title: `${ev.casino_name || 'Offer'} starts in ${rule.lead_minutes} min`,
                body: `${ev.title || 'Your event'} at ${formatEventDate(ev.start_at)}`,
                url: '/?tab=offers',
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

        await admin.from('offer_notification_sends').insert({
          user_id: ev.user_id,
          event_id: ev.id,
          lead_minutes: rule.lead_minutes,
          send_status: hadSuccess ? 'sent' : 'failed',
          error_message: hadSuccess ? null : errorSummary.slice(0, 400),
        })
      }
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
