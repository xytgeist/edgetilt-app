/**
 * Notify guest backers on a Poker Stable cash stake offer.
 *
 * Player-created deals: stakee invokes after create/edit when guest slices have contact info.
 *
 * Channels:
 *   - guest → Twilio SMS and/or Resend email (informational; no guest claim UI yet)
 *
 * Secrets (same as poker-tournament-swap-notify):
 *   RESEND_API_KEY, RESEND_FROM / POKER_SWAP_EMAIL_FROM
 *   TWILIO_ACCOUNT_SID, TWILIO_FROM_NUMBER
 *   TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (preferred)
 *   TWILIO_AUTH_TOKEN (legacy fallback)
 *   PUBLIC_APP_URL / APP_ORIGIN (link host)
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

function formatGuestActorName(profile: { display_name?: string | null; handle?: string | null } | null) {
  const name = String(profile?.display_name || '').trim()
  if (name) return name
  const handleRaw = String(profile?.handle || '')
    .trim()
    .replace(/^@/, '')
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

function formatPct(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function formatSliceTerms(slice: SliceRow): string {
  if (slice.pricing_mode === 'markup') {
    const rate = Number(slice.markup_rate)
    return Number.isFinite(rate) ? `Markup ${rate}x` : 'Markup'
  }
  const pct = Number(slice.player_profit_pct)
  if (Number.isFinite(pct)) return `Profit split · player ${formatPct(pct)}%`
  return 'Profit split'
}

function formatGuestOfferLine(
  actorName: string,
  actionPct: number,
  baselineLabel: string,
  dealLabel: string,
) {
  const stakeBit = dealLabel ? ` stake: ${dealLabel}` : ''
  return `${actorName} has you on a ${formatPct(actionPct)}% cash stake (${baselineLabel} baseline${stakeBit}) from EdgeTilt.com`
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
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim()
  const from = Deno.env.get('TWILIO_FROM_NUMBER')?.trim()
  const apiKeySid = Deno.env.get('TWILIO_API_KEY_SID')?.trim()
  const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET')?.trim()
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim()
  if (!accountSid || !from) {
    return { skipped: true as const, reason: 'Twilio secrets not set' }
  }
  const basicUser = apiKeySid && apiKeySecret ? apiKeySid : authToken ? accountSid : ''
  const basicPass = apiKeySid && apiKeySecret ? apiKeySecret : authToken || ''
  if (!basicUser || !basicPass) {
    return { skipped: true as const, reason: 'Twilio API key or auth token not set' }
  }
  const auth = btoa(`${basicUser}:${basicPass}`)
  const params = new URLSearchParams({ To: to, From: from, Body: body })
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio failed (${res.status}): ${text}`)
  }
  return { skipped: false as const }
}

type SliceRow = {
  id: string
  counterparty_kind: string
  guest_email: string | null
  guest_phone: string | null
  guest_label: string | null
  action_pct: number
  pricing_mode: string
  player_profit_pct: number | null
  markup_rate: number | null
  status: string
}

type DealRow = {
  id: string
  stakee_user_id: string
  status: string
  label: string | null
  baseline_bankroll: number
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

    let body: { deal_id?: string; slice_ids?: string[] } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const dealId = String(body.deal_id || '').trim()
    if (!dealId) return jsonResponse({ error: 'deal_id is required.' }, 400)

    const sliceIdFilter = Array.isArray(body.slice_ids)
      ? body.slice_ids.map((id) => String(id || '').trim()).filter(Boolean)
      : []

    const { data: dealRaw, error: dealErr } = await admin
      .from('poker_stable_deals')
      .select('id, stakee_user_id, status, label, baseline_bankroll')
      .eq('id', dealId)
      .maybeSingle()
    if (dealErr) throw new Error(dealErr.message)
    if (!dealRaw) return jsonResponse({ error: 'Deal not found.' }, 404)
    const deal = dealRaw as DealRow

    if (deal.status === 'cancelled') {
      return jsonResponse({ error: 'Deal is cancelled.' }, 400)
    }

    const uid = auth.user.id
    if (deal.stakee_user_id !== uid) {
      return jsonResponse({ error: 'Only the player can notify guest backers on this stake.' }, 403)
    }

    let sliceQuery = admin
      .from('poker_stable_deal_slices')
      .select(
        'id, counterparty_kind, guest_email, guest_phone, guest_label, action_pct, pricing_mode, player_profit_pct, markup_rate, status',
      )
      .eq('deal_id', dealId)
      .eq('counterparty_kind', 'guest')

    if (sliceIdFilter.length) {
      sliceQuery = sliceQuery.in('id', sliceIdFilter)
    }

    const { data: slicesRaw, error: sliceErr } = await sliceQuery
    if (sliceErr) throw new Error(sliceErr.message)
    const slices = (slicesRaw || []) as SliceRow[]

    const { data: actorProfile } = await admin
      .from('profiles')
      .select('display_name, handle')
      .eq('user_id', uid)
      .maybeSingle()
    const guestActorName = formatGuestActorName(actorProfile)

    const baselineLabel = fmtMoney(Number(deal.baseline_bankroll))
    const dealLabel = String(deal.label || '').trim()
    const appUrl = appOrigin()

    const results: Record<string, unknown>[] = []
    let notifiedCount = 0

    for (const slice of slices) {
      const email = String(slice.guest_email || '')
        .trim()
        .toLowerCase()
      const phone = normalizePhone(String(slice.guest_phone || ''))
      const hasEmail = Boolean(email && isValidEmail(email))
      const hasPhone = Boolean(phone)

      if (!hasEmail && !hasPhone) {
        results.push({
          slice_id: slice.id,
          notified: false,
          email: { skipped: true, reason: 'no guest email' },
          sms: { skipped: true, reason: 'no guest phone' },
        })
        continue
      }

      const offerLine = formatGuestOfferLine(
        guestActorName,
        Number(slice.action_pct),
        baselineLabel,
        dealLabel,
      )
      const termsLine = formatSliceTerms(slice)
      const subject = `${guestActorName} has you on a ${formatPct(slice.action_pct)}% cash stake`
      const text = `${offerLine}\n${termsLine}\n${appUrl}`
      const html = `<p>${offerLine}</p><p>${termsLine}</p><p><a href="${appUrl}">${appUrl}</a></p>`

      const channels: Record<string, unknown> = { slice_id: slice.id }

      if (hasEmail) {
        channels.email = await sendResendEmail(email, subject, html, text)
      } else {
        channels.email = { skipped: true, reason: 'no guest email' }
      }

      if (hasPhone && phone) {
        channels.sms = await sendTwilioSms(phone, text)
      } else {
        channels.sms = { skipped: true, reason: 'no guest phone' }
      }

      const sent =
        (channels.email && !(channels.email as { skipped?: boolean }).skipped) ||
        (channels.sms && !(channels.sms as { skipped?: boolean }).skipped)
      if (sent) notifiedCount += 1
      channels.notified = sent
      results.push(channels)
    }

    return jsonResponse({
      ok: true,
      deal_id: dealId,
      notified_count: notifiedCount,
      slices: results,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Notify failed.'
    console.error('poker-stable-notify', msg)
    return jsonResponse({ error: msg }, 500)
  }
})
