/**
 * Create a guest claim token and notify via Twilio SMS and/or Resend email.
 * Also emails Edge counterparties when we can resolve auth.users.email.
 *
 * Secrets (optional per channel):
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
  // US default when 10 digits
  if (/^\d{10}$/.test(digits)) return `+1${digits}`
  if (/^\d{11}$/.test(digits) && digits.startsWith('1')) return `+${digits}`
  return digits.startsWith('+') ? digits : `+${digits}`
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

    let body: { swap_id?: string } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }
    const swapId = String(body.swap_id || '').trim()
    if (!swapId) return jsonResponse({ error: 'swap_id is required.' }, 400)

    const { data: swap, error: swapErr } = await admin
      .from('poker_tournament_swaps')
      .select('*')
      .eq('id', swapId)
      .maybeSingle()
    if (swapErr) throw new Error(swapErr.message)
    if (!swap) return jsonResponse({ error: 'Swap not found.' }, 404)
    if (swap.creator_user_id !== auth.user.id) {
      return jsonResponse({ error: 'Only the swap creator can send notify.' }, 403)
    }
    if (swap.status === 'cancelled') {
      return jsonResponse({ error: 'Swap is cancelled.' }, 400)
    }

    const { data: creator } = await admin
      .from('profiles')
      .select('display_name, handle')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    const creatorLabel = formatProfileLabel(creator)

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
    const subjectBits = [creatorLabel, 'swapped', pctLine, 'with you']
    if (eventLabel) subjectBits.push(`· ${eventLabel}`)
    const subject = subjectBits.join(' ')

    const channels: Record<string, unknown> = {}

    if (swap.counterparty_kind === 'guest') {
      const raw = randomToken()
      const tokenHash = await sha256Hex(raw)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const { error: tokErr } = await admin.from('poker_tournament_swap_claim_tokens').insert({
        swap_id: swapId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      if (tokErr) throw new Error(tokErr.message)

      const claimUrl = `${appOrigin()}/poker-swap-claim?token=${raw}`
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

      return jsonResponse({ ok: true, claim_url: claimUrl, channels })
    }

    // Edge counterparty: email via auth.users when available
    const { data: authUser, error: auErr } = await admin.auth.admin.getUserById(
      swap.counterparty_user_id,
    )
    if (auErr) throw new Error(auErr.message)
    const email = String(authUser?.user?.email || '')
      .trim()
      .toLowerCase()
    const bankrollUrl = `${appOrigin()}/?tab=poker-bankroll`
    const text = `${subject}. Open Poker Bankroll to attach your session: ${bankrollUrl}`
    const html = `<p>${subject}.</p><p><a href="${bankrollUrl}">Open Poker Bankroll</a></p>`
    if (email && isValidEmail(email)) {
      channels.email = await sendResendEmail(email, `Tournament swap · ${pctLine}`, html, text)
    } else {
      channels.email = { skipped: true, reason: 'no counterparty email' }
    }

    const { data: cpProfile } = await admin
      .from('profiles')
      .select('phone_number')
      .eq('user_id', swap.counterparty_user_id)
      .maybeSingle()
    const phone = normalizePhone(String(cpProfile?.phone_number || ''))
    if (phone) {
      channels.sms = await sendTwilioSms(phone, text)
    } else {
      channels.sms = { skipped: true, reason: 'no counterparty phone' }
    }

    return jsonResponse({ ok: true, channels })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Notify failed.'
    console.error('poker-tournament-swap-notify', msg)
    return jsonResponse({ error: msg }, 500)
  }
})
