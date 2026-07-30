/**
 * Notify tournament swap counterparties.
 *
 * body.kind:
 *   - offer (default): creator invites counterparty (guest claim link / Edge in-app)
 *   - result: either party logged a session result → payout expected
 *
 * Channels:
 *   - guest → Twilio SMS and/or Resend email
 *   - Edge user → activity_events (in-app + push via lounge-send-activity-push)
 *     Deep link: /?tab=poker-bankroll
 *
 * Secrets (optional per guest channel):
 *   RESEND_API_KEY, RESEND_FROM / POKER_SWAP_EMAIL_FROM
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *   PUBLIC_APP_URL / APP_ORIGIN (claim link host)
 */
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'

function appOrigin(): string {
  const fromEnv = Deno.env.get('PUBLIC_APP_URL')?.trim() || Deno.env.get('APP_ORIGIN')?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return 'https://edgetilt.com'
}

function fromAddress(): string {
  return (
    Deno.env.get('POKER_SWAP_EMAIL_FROM')?.trim() ||
    Deno.env.get('RESEND_FROM')?.trim() ||
    'EdgeTilt <noreply@auth.edgetilt.com>'
  )
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Prefer "Display Name (@handle)", then @handle, then a safe fallback. */
function formatProfileLabel(profile: { display_name?: string | null; handle?: string | null } | null) {
  const name = String(profile?.display_name || '').trim()
  const handleRaw = String(profile?.handle || '')
    .trim()
    .replace(/^@/, '')
  if (name && handleRaw) return `${name} (@${handleRaw})`
  if (name) return name
  if (handleRaw) return `@${handleRaw}`
  return 'Someone'
}

function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/[^\d+]/g, '')
  if (digits.length < 8) return null
  if (digits.startsWith('+')) return digits
  if (/^\d{10}$/.test(digits)) return `+1${digits}`
  if (/^\d{11}$/.test(digits) && digits.startsWith('1')) return `+${digits}`
  return digits.startsWith('+') ? digits : `+${digits}`
}

function fmtMoney(n: number): string {
  const num = Number(n)
  if (!Number.isFinite(num)) return '$0'
  const abs = Math.abs(num)
  const str =
    abs >= 10000
      ? `$${Math.round(abs).toLocaleString('en-US')}`
      : abs >= 100
        ? `$${abs.toFixed(0)}`
        : `$${abs.toFixed(2)}`
  return num < 0 ? `-${str}` : str
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sendResendEmail(to: string, subject: string, html: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!key) return { skipped: true as const, reason: 'RESEND_API_KEY not set' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      html,
      text,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend failed (${res.status}): ${body}`)
  }
  return { skipped: false as const }
}

async function sendTwilioSms(to: string, body: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim()
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  const from = Deno.env.get('TWILIO_FROM_NUMBER')?.trim()
  if (!sid || !token || !from) {
    return { skipped: true as const, reason: 'Twilio secrets not set' }
  }
  const auth = btoa(`${sid}:${token}`)
  const params = new URLSearchParams({ To: to, From: from, Body: body })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio failed (${res.status}): ${text}`)
  }
  return { skipped: false as const }
}

type SwapRow = {
  id: string
  status: string
  creator_user_id: string
  counterparty_kind: string
  counterparty_user_id: string | null
  counterparty_guest_label: string | null
  counterparty_guest_email: string | null
  counterparty_guest_phone: string | null
  tournament_event_id: string | null
  pct_creator_gives: number
  pct_counterparty_gives: number
  creator_buy_in: number | null
  creator_prize: number | null
  creator_result_ready: boolean
  counterparty_buy_in: number | null
  counterparty_prize: number | null
  counterparty_result_ready: boolean
  settlement_amount: number | null
  counterparty_session_accepted_at: string | null
}

/** Detail line without actor name (recipient POV). */
function formatResultDetail(swap: SwapRow, actorRole: 'creator' | 'counterparty'): string {
  const settled = swap.status === 'settled' && swap.settlement_amount != null
  const amt = Number(swap.settlement_amount)
  if (settled && Number.isFinite(amt)) {
    if (Math.abs(amt) < 0.005) return 'finished your swap · even, nothing owed'
    // settlement_amount > 0 ⇒ counterparty owes creator
    if (actorRole === 'creator') {
      // recipient is counterparty
      if (amt > 0) return `finished your swap · you owe them ${fmtMoney(amt)}`
      return `finished your swap · they owe you ${fmtMoney(Math.abs(amt))}`
    }
    // actor is counterparty; recipient is creator
    if (amt > 0) return `finished your swap · they owe you ${fmtMoney(amt)}`
    return `finished your swap · you owe them ${fmtMoney(Math.abs(amt))}`
  }

  const buyIn =
    actorRole === 'creator' ? Number(swap.creator_buy_in) : Number(swap.counterparty_buy_in)
  const prize =
    actorRole === 'creator' ? Number(swap.creator_prize) : Number(swap.counterparty_prize)
  const pct =
    actorRole === 'creator' ? Number(swap.pct_creator_gives) : Number(swap.pct_counterparty_gives)
  const net = (Number.isFinite(prize) ? prize : 0) - (Number.isFinite(buyIn) ? buyIn : 0)
  const share =
    Math.round((Math.max(0, net) * (Number.isFinite(pct) ? pct : 0)) / 100 * 100) / 100
  return `finished · net ${fmtMoney(net)} · you get ${fmtMoney(share)} toward the swap`
}

async function createGuestClaimUrl(
  admin: ReturnType<typeof createBillingAdmin>,
  swapId: string,
): Promise<string> {
  const raw = randomToken()
  const tokenHash = await sha256Hex(raw)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error: tokErr } = await admin.from('poker_tournament_swap_claim_tokens').insert({
    swap_id: swapId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })
  if (tokErr) throw new Error(tokErr.message)
  return `${appOrigin()}/poker-swap-claim?token=${raw}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: billingCorsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const admin = createBillingAdmin()
    const auth = await getUserFromJwt(admin, req)
    if ('error' in auth) return jsonResponse({ error: auth.error }, auth.status)

    let body: { swap_id?: string; kind?: string } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }
    const swapId = String(body.swap_id || '').trim()
    if (!swapId) return jsonResponse({ error: 'swap_id is required.' }, 400)
    const kind = String(body.kind || 'offer').trim().toLowerCase() === 'result' ? 'result' : 'offer'

    const { data: swapRaw, error: swapErr } = await admin
      .from('poker_tournament_swaps')
      .select('*')
      .eq('id', swapId)
      .maybeSingle()
    if (swapErr) throw new Error(swapErr.message)
    if (!swapRaw) return jsonResponse({ error: 'Swap not found.' }, 404)
    const swap = swapRaw as SwapRow

    if (swap.status === 'cancelled') {
      return jsonResponse({ error: 'Swap is cancelled.' }, 400)
    }

    const uid = auth.user.id
    const isCreator = swap.creator_user_id === uid
    const isCounterparty = swap.counterparty_user_id === uid
    if (kind === 'offer') {
      if (!isCreator) {
        return jsonResponse({ error: 'Only the swap creator can send offer notify.' }, 403)
      }
    } else if (!isCreator && !isCounterparty) {
      return jsonResponse({ error: 'Only a swap party can send result notify.' }, 403)
    }

    const { data: actorProfile } = await admin
      .from('profiles')
      .select('display_name, handle')
      .eq('user_id', uid)
      .maybeSingle()
    const actorLabel = formatProfileLabel(actorProfile)

    let eventLabel = ''
    if (swap.tournament_event_id) {
      const { data: ev } = await admin
        .from('poker_tournament_events')
        .select('display_name, venue_name')
        .eq('id', swap.tournament_event_id)
        .maybeSingle()
      eventLabel = String(ev?.display_name || ev?.venue_name || '').trim()
    }

    const pctLine = `${swap.pct_creator_gives}%↔${swap.pct_counterparty_gives}%`
    const channels: Record<string, unknown> = {}

    // ── Result notify (session end) ──────────────────────────────────────────
    if (kind === 'result') {
      const actorRole: 'creator' | 'counterparty' = isCreator ? 'creator' : 'counterparty'
      const detail = formatResultDetail(swap, actorRole)
      const subjectBits = [actorLabel, detail]
      if (eventLabel) subjectBits.push(`· ${eventLabel}`)
      const subject = subjectBits.join(' ')

      // Notify the other side (never self).
      if (actorRole === 'creator') {
        if (swap.counterparty_kind === 'guest') {
          const claimUrl = await createGuestClaimUrl(admin, swapId)
          const cta = swap.counterparty_result_ready
            ? 'View swap details'
            : 'Enter your cash result'
          const text = `${subject}. ${cta}: ${claimUrl}`
          const html = `<p>${subject}.</p><p><a href="${claimUrl}">${cta}</a></p><p style="color:#888;font-size:12px">${claimUrl}</p>`

          const email = String(swap.counterparty_guest_email || '')
            .trim()
            .toLowerCase()
          if (email && isValidEmail(email)) {
            channels.email = await sendResendEmail(
              email,
              `Tournament swap result · ${pctLine}`,
              html,
              text,
            )
          } else {
            channels.email = { skipped: true, reason: 'no guest email' }
          }

          const phone = normalizePhone(String(swap.counterparty_guest_phone || ''))
          if (phone) {
            channels.sms = await sendTwilioSms(phone, text)
          } else {
            channels.sms = { skipped: true, reason: 'no guest phone' }
          }

          return jsonResponse({ ok: true, kind, claim_url: claimUrl, channels })
        }

        const recipientId = String(swap.counterparty_user_id || '').trim()
        if (!recipientId || recipientId === uid) {
          return jsonResponse({ error: 'No Edge counterparty to notify.' }, 400)
        }
        const { data: activityRow, error: actErr } = await admin
          .from('activity_events')
          .insert({
            recipient_user_id: recipientId,
            actor_user_id: uid,
            event_type: 'poker_tournament_swap_result',
            detail_text: detail,
            poker_tournament_swap_id: swapId,
          })
          .select('id')
          .maybeSingle()
        if (actErr) throw new Error(actErr.message)
        channels.in_app = { ok: true, activity_event_id: activityRow?.id || null }
        return jsonResponse({ ok: true, kind, channels })
      }

      // Actor is Edge counterparty → notify creator (always Edge user).
      const recipientId = String(swap.creator_user_id || '').trim()
      if (!recipientId || recipientId === uid) {
        return jsonResponse({ error: 'No creator to notify.' }, 400)
      }
      const { data: activityRow, error: actErr } = await admin
        .from('activity_events')
        .insert({
          recipient_user_id: recipientId,
          actor_user_id: uid,
          event_type: 'poker_tournament_swap_result',
          detail_text: detail,
          poker_tournament_swap_id: swapId,
        })
        .select('id')
        .maybeSingle()
      if (actErr) throw new Error(actErr.message)
      channels.in_app = { ok: true, activity_event_id: activityRow?.id || null }
      return jsonResponse({ ok: true, kind, channels })
    }

    // ── Offer notify (existing) ──────────────────────────────────────────────
    const subjectBits = [actorLabel, 'swapped', pctLine, 'with you']
    if (eventLabel) subjectBits.push(`· ${eventLabel}`)
    const subject = subjectBits.join(' ')

    if (swap.counterparty_kind === 'guest') {
      const claimUrl = await createGuestClaimUrl(admin, swapId)
      const text = `${subject}. Tap to enter your cash result: ${claimUrl}`
      const html = `<p>${subject}.</p><p><a href="${claimUrl}">Enter your result</a></p><p style="color:#888;font-size:12px">${claimUrl}</p>`

      const email = String(swap.counterparty_guest_email || '')
        .trim()
        .toLowerCase()
      if (email && isValidEmail(email)) {
        channels.email = await sendResendEmail(email, `Tournament swap · ${pctLine}`, html, text)
      } else {
        channels.email = { skipped: true, reason: 'no guest email' }
      }

      const phone = normalizePhone(String(swap.counterparty_guest_phone || ''))
      if (phone) {
        channels.sms = await sendTwilioSms(phone, text)
      } else {
        channels.sms = { skipped: true, reason: 'no guest phone' }
      }

      return jsonResponse({ ok: true, kind, claim_url: claimUrl, channels })
    }

    const recipientId = String(swap.counterparty_user_id || '').trim()
    if (!recipientId) {
      return jsonResponse({ error: 'Swap has no counterparty user.' }, 400)
    }
    if (recipientId === uid) {
      return jsonResponse({ error: 'Cannot notify yourself.' }, 400)
    }

    const { data: activityRow, error: actErr } = await admin
      .from('activity_events')
      .insert({
        recipient_user_id: recipientId,
        actor_user_id: uid,
        event_type: 'poker_tournament_swap',
        poker_tournament_swap_id: swapId,
      })
      .select('id')
      .maybeSingle()
    if (actErr) throw new Error(actErr.message)

    channels.in_app = { ok: true, activity_event_id: activityRow?.id || null }
    channels.email = { skipped: true, reason: 'edge users use in-app/push' }
    channels.sms = { skipped: true, reason: 'edge users use in-app/push' }

    return jsonResponse({ ok: true, kind, channels })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Notify failed.'
    console.error('poker-tournament-swap-notify', msg)
    return jsonResponse({ error: msg }, 500)
  }
})
