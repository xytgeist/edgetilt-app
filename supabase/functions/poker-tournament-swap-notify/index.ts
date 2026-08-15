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
 *   TWILIO_ACCOUNT_SID, TWILIO_FROM_NUMBER
 *   TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (preferred)
 *   TWILIO_AUTH_TOKEN (legacy fallback if API key not set)
 *   PUBLIC_APP_URL / APP_ORIGIN (claim link host)
 */
import { billingCorsHeaders, jsonResponse } from '../_shared/billingCors.ts'
import { createBillingAdmin, getUserFromJwt } from '../_shared/billingDb.ts'
import { resolvePublicAppOrigin } from '../_shared/publicAppOrigin.ts'
import {
  escapeHtml,
  transactionalEmailFallbackLink,
  transactionalEmailParagraph,
  wrapTransactionalEmailHtml,
} from '../_shared/transactionalEmail.ts'

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

/** Guest SMS/email: prefer display name only (shorter, matches product copy). */
function formatGuestActorName(profile: { display_name?: string | null; handle?: string | null } | null) {
  const name = String(profile?.display_name || '').trim()
  if (name) return name
  const handleRaw = String(profile?.handle || '')
    .trim()
    .replace(/^@/, '')
  if (handleRaw) return `@${handleRaw}`
  return 'Someone'
}

/**
 * Offer copy for guest SMS/email.
 * e.g. "Edge Lord swapping 5% - 5% with you in event: Summer Series Event 7 from EdgeTilt.com"
 */
function formatGuestOfferLine(
  actorName: string,
  pctCreator: number,
  pctCounterparty: number,
  eventLabel: string,
) {
  const pct = `${pctCreator}% - ${pctCounterparty}%`
  const eventBit = eventLabel ? ` in event: ${eventLabel}` : ''
  return `${actorName} swapping ${pct} with you${eventBit} from EdgeTilt.com`
}

function formatGuestOfferTerms(swap: SwapRow): string {
  const terms: string[] = []
  if (swap.both_must_cash) terms.push('Both must cash')
  const minCash = Number(swap.min_cash_threshold)
  if (Number.isFinite(minCash) && minCash > 0) {
    terms.push(`Minimum cash threshold ${fmtMoney(minCash)}`)
  }
  if (swap.final_bullet_only) terms.push('Final bullet only')
  if (swap.final_table_only) terms.push('Final table only')
  return terms.length ? terms.join(', ') : 'Standard swap terms'
}

function formatGuestOfferEmail(args: {
  actorName: string
  guestName: string
  eventLabel: string
  swap: SwapRow
  claimUrl: string
}): { subject: string; text: string; html: string } {
  const guestName = args.guestName.trim() || 'there'
  const tournamentLine = `Tournament: ${args.eventLabel || 'Tournament event'}`
  const receiveLine = `Your share of ${args.actorName}'s result: ${args.swap.pct_creator_gives}%`
  const giveLine = `${args.actorName}'s share of your result: ${args.swap.pct_counterparty_gives}%`
  const termsLine = `Terms: ${formatGuestOfferTerms(args.swap)}`
  const detailLines = [tournamentLine, receiveLine, giveLine, termsLine]
  const signupLine =
    'Create a free account to manage future swaps, sessions, and tournament results in Poker Bankroll.'
  const subject = `${args.actorName} invited you to a tournament swap`
  const text = `Hi ${guestName},\n\n${args.actorName} invited you to a tournament swap on EdgeTilt.com.\n\n${detailLines.join('\n')}\n\nOpen your invitation to review the swap and enter your result:\n${args.claimUrl}\n\n${signupLine}`

  const safeActor = escapeHtml(args.actorName)
  const safeGuest = escapeHtml(guestName)
  const safeUrl = escapeHtml(args.claimUrl)
  const detailsHtml = detailLines.map((line) => escapeHtml(line)).join('<br>')
  const bodyHtml = [
    transactionalEmailParagraph(`Hi ${safeGuest},`),
    transactionalEmailParagraph(
      `${safeActor} invited you to a tournament swap on <a href="${safeUrl}" style="color:#0891b2;">EdgeTilt.com</a>.`,
    ),
    transactionalEmailParagraph(detailsHtml, { marginBottom: '0' }),
  ].join('')
  const html = wrapTransactionalEmailHtml({
    title: subject,
    headline: 'Tournament swap invitation',
    bodyHtml,
    appUrl: args.claimUrl,
    cta: { label: 'Review tournament swap', href: args.claimUrl },
    footerNoteHtml: `<em>${escapeHtml(signupLine)}</em>`,
    ctaAfterFooterNote: true,
    footerNoteMarginTop: '24px',
  })
  return { subject, text, html }
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

async function sendTwilioSms(_to: string, _body: string) {
  // Guest swap SMS retired (carrier TFV / gambling-adjacent). Email + in-app only.
  return { skipped: true as const, reason: 'guest SMS disabled' }
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
  both_must_cash: boolean
  final_bullet_only: boolean
  final_table_only: boolean
  min_cash_threshold: number | null
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
  return `${resolvePublicAppOrigin()}/poker-swap-claim?token=${raw}`
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
    const guestActorName = formatGuestActorName(actorProfile)

    let eventLabel = ''
    if (swap.tournament_event_id) {
      const { data: ev } = await admin
        .from('poker_tournament_events')
        .select('display_name, venue_name')
        .eq('id', swap.tournament_event_id)
        .maybeSingle()
      eventLabel = String(ev?.display_name || ev?.venue_name || '').trim()
    }

    const pctLine = `${swap.pct_creator_gives}% - ${swap.pct_counterparty_gives}%`
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
          const email = String(swap.counterparty_guest_email || '')
            .trim()
            .toLowerCase()
          const phone = normalizePhone(String(swap.counterparty_guest_phone || ''))
          const hasEmail = Boolean(email && isValidEmail(email))
          const hasPhone = Boolean(phone)
          if (!hasEmail && !hasPhone) {
            channels.email = { skipped: true, reason: 'no guest email' }
            channels.sms = { skipped: true, reason: 'no guest phone' }
            return jsonResponse({ ok: true, kind, channels, notified: false })
          }

          const claimUrl = await createGuestClaimUrl(admin, swapId)
          const cta = swap.counterparty_result_ready
            ? 'View swap details'
            : 'Enter your cash result'
          const text = `${subject}. ${cta}: ${claimUrl}`
          const appUrl = resolvePublicAppOrigin()
          const bodyHtml = [
            transactionalEmailParagraph(`${escapeHtml(subject)}.`),
            transactionalEmailFallbackLink(claimUrl),
          ].join('')
          const html = wrapTransactionalEmailHtml({
            title: `Tournament swap result · ${pctLine}`,
            headline: 'Tournament swap result',
            bodyHtml,
            appUrl,
            cta: { label: cta, href: claimUrl },
          })

          if (hasEmail) {
            channels.email = await sendResendEmail(
              email,
              `Tournament swap result · ${pctLine}`,
              html,
              text,
            )
          } else {
            channels.email = { skipped: true, reason: 'no guest email' }
          }

          if (hasPhone && phone) {
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

    // ── Offer notify ─────────────────────────────────────────────────────────
    const offerLine = formatGuestOfferLine(
      guestActorName,
      Number(swap.pct_creator_gives),
      Number(swap.pct_counterparty_gives),
      eventLabel,
    )

    if (swap.counterparty_kind === 'guest') {
      const email = String(swap.counterparty_guest_email || '')
        .trim()
        .toLowerCase()
      const phone = normalizePhone(String(swap.counterparty_guest_phone || ''))
      const hasEmail = Boolean(email && isValidEmail(email))
      const hasPhone = Boolean(phone)
      if (!hasEmail && !hasPhone) {
        channels.email = { skipped: true, reason: 'no guest email' }
        channels.sms = { skipped: true, reason: 'no guest phone' }
        return jsonResponse({ ok: true, kind, channels, notified: false })
      }

      const claimUrl = await createGuestClaimUrl(admin, swapId)
      const offerEmail = formatGuestOfferEmail({
        actorName: guestActorName,
        guestName: String(swap.counterparty_guest_label || ''),
        eventLabel,
        swap,
        claimUrl,
      })

      if (hasEmail) {
        channels.email = await sendResendEmail(
          email,
          offerEmail.subject,
          offerEmail.html,
          offerEmail.text,
        )
      } else {
        channels.email = { skipped: true, reason: 'no guest email' }
      }

      if (hasPhone && phone) {
        channels.sms = await sendTwilioSms(phone, `${offerLine}\nReview your swap: ${claimUrl}`)
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
