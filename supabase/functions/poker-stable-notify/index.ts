/**
 * Notify guest backers on a Poker Stable cash stake offer, terms edit, or deletion.
 *
 * body.kind:
 *   - offer (default): player created stake terms
 *   - terms_edited: player edited stake terms (requires terms_edit.before / terms_edit.after)
 *   - deleted: player deleted the stake (call before DB delete)
 *
 * Player-created deals: stakee invokes when guest slices have contact info.
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
import { resolvePublicAppOrigin } from '../_shared/publicAppOrigin.ts'
import {
  escapeHtml,
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

function formatPct(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function formatPricingLine(slice: SliceRow): string {
  if (slice.pricing_mode === 'markup') {
    const rate = Number(slice.markup_rate)
    return Number.isFinite(rate) ? `Markup: ${formatPct(rate)}x` : 'Markup'
  }
  const playerPct = Number(slice.player_profit_pct)
  const backerPct = Number.isFinite(playerPct) ? 100 - playerPct : null
  if (Number.isFinite(backerPct) && Number.isFinite(playerPct)) {
    return `Profit split: Backer ${formatPct(backerPct)}% | Player ${formatPct(playerPct)}%`
  }
  return 'Profit split'
}

type GuestExposureInput = {
  baselineBankroll: number
  actionPct: number
  pricingMode: string
  markupRate?: number | null
}

/** Profit split: baseline × action%. Markup: baseline × action% × markup rate. */
function computeGuestExposure(input: GuestExposureInput): number {
  const baseline = Number(input.baselineBankroll)
  const actionPct = Number(input.actionPct)
  if (!Number.isFinite(baseline) || baseline <= 0 || !Number.isFinite(actionPct) || actionPct <= 0) {
    return 0
  }
  let exposure = baseline * (actionPct / 100)
  if (input.pricingMode === 'markup') {
    const markup = Number(input.markupRate)
    if (Number.isFinite(markup) && markup > 0) exposure *= markup
  }
  return Math.round(exposure * 100) / 100
}

function formatExposureLine(input: GuestExposureInput): string {
  return `Your exposure: ${fmtMoney(computeGuestExposure(input))}`
}

function guestExposureFromSliceRow(slice: SliceRow, baselineBankroll: number): GuestExposureInput {
  return {
    baselineBankroll,
    actionPct: Number(slice.action_pct),
    pricingMode: slice.pricing_mode,
    markupRate: slice.markup_rate,
  }
}

function guestExposureFromEditSlice(slice: TermsEditSlice, baselineBankroll: number): GuestExposureInput {
  return {
    baselineBankroll,
    actionPct: Number(slice.action_pct),
    pricingMode: slice.pricing_mode,
    markupRate: slice.markup_rate,
  }
}

function formatEmailFooter(): { text: string; htmlNote: string } {
  const line =
    'Create a free account to manage your stable and get real-time progress updates.'
  return {
    text: `Create a free account at EdgeTilt.com to manage your stable and get real-time progress updates.`,
    htmlNote: `<em>${escapeHtml(line)}</em>`,
  }
}

function formatStakeMessageCopy(args: {
  kind: 'offer' | 'deleted'
  actorLabel: string
  backerArticle: 'the' | 'a'
  dealLabel: string
  baselineLabel: string
  actionPct: number
  pricingLine: string
  exposureLine: string
  appUrl: string
}): { subject: string; text: string; html: string } {
  const isDeleted = args.kind === 'deleted'
  const introPlain = isDeleted
    ? `${args.actorLabel} has deleted a stake on Edgetilt.com that listed you as ${args.backerArticle} backer.`
    : `${args.actorLabel} has created a stake on Edgetilt.com with you as ${args.backerArticle} backer.`
  const nameLine = `Name of stake: ${args.dealLabel || '—'}`
  const ownVerb = isDeleted ? 'owned' : 'own'
  const stakeLine = `Total stake: ${args.baselineLabel} (you ${ownVerb} ${formatPct(args.actionPct)}%)`
  const detailLines = [nameLine, stakeLine, args.pricingLine, args.exposureLine]
  const footer = formatEmailFooter()
  const text = `${introPlain}\n\n${detailLines.join('\n')}\n\n${footer.text}`

  const safeActor = escapeHtml(args.actorLabel)
  const safeUrl = escapeHtml(args.appUrl)
  const introHtml = isDeleted
    ? `${safeActor} has deleted a stake on <a href="${safeUrl}" style="color:#0891b2;">Edgetilt.com</a> that listed you as ${args.backerArticle} backer.`
    : `${safeActor} has created a stake on <a href="${safeUrl}" style="color:#0891b2;">Edgetilt.com</a> with you as ${args.backerArticle} backer.`
  const detailsHtml = [nameLine, stakeLine, args.pricingLine, args.exposureLine]
    .map((line) => escapeHtml(line))
    .join('<br>')
  const bodyHtml = [
    transactionalEmailParagraph(introHtml),
    transactionalEmailParagraph(detailsHtml, { marginBottom: '0' }),
  ].join('')

  const subject = isDeleted
    ? `${args.actorLabel} deleted a stake: ${args.dealLabel || 'Untitled'}`
    : `${args.actorLabel} created a stake: ${args.dealLabel || 'Untitled'}`
  const html = wrapTransactionalEmailHtml({
    title: subject,
    headline: isDeleted ? 'Stake deleted' : 'New stake created',
    bodyHtml,
    appUrl: args.appUrl,
    cta: { label: 'Create free account', href: args.appUrl },
    footerNoteHtml: footer.htmlNote,
    ctaAfterFooterNote: true,
    footerNoteMarginTop: '24px',
  })
  return { subject, text, html }
}

type TermsEditSlice = {
  slice_id?: string | null
  slice_index?: number
  guest_label?: string
  action_pct: number
  pricing_mode: string
  player_profit_pct?: number | null
  markup_rate?: number | null
}

type TermsEditPayload = {
  deal_label: string
  baseline_bankroll: number
  slices: TermsEditSlice[]
}

function formatPricingLineFromEditSlice(slice: TermsEditSlice): string {
  if (slice.pricing_mode === 'markup') {
    const rate = Number(slice.markup_rate)
    return Number.isFinite(rate) ? `Markup: ${formatPct(rate)}x` : 'Markup'
  }
  const playerPct = Number(slice.player_profit_pct)
  const backerPct = Number.isFinite(playerPct) ? 100 - playerPct : null
  if (Number.isFinite(backerPct) && Number.isFinite(playerPct)) {
    return `Profit split: Backer ${formatPct(backerPct)}% | Player ${formatPct(playerPct)}%`
  }
  return 'Profit split'
}

function formatTermsSectionLines(
  deal: TermsEditPayload,
  slice: TermsEditSlice | null,
  ownVerb: 'own' | 'owned',
): string[] {
  if (!slice) return ['(You were not listed on this stake.)']
  const label = String(deal.deal_label || '').trim() || '—'
  const baselineLabel = fmtMoney(Number(deal.baseline_bankroll))
  return [
    `Name of stake: ${label}`,
    `Total stake: ${baselineLabel} (you ${ownVerb} ${formatPct(slice.action_pct)}%)`,
    formatPricingLineFromEditSlice(slice),
    formatExposureLine(guestExposureFromEditSlice(slice, Number(deal.baseline_bankroll))),
  ]
}

function findEditSlice(
  dbSlice: SliceRow,
  editSlices: TermsEditSlice[] | undefined,
  guestOrdinal: number,
): TermsEditSlice | null {
  if (!editSlices?.length) return null
  const byId = editSlices.find((s) => s.slice_id && s.slice_id === dbSlice.id)
  if (byId) return byId
  const byIndex = editSlices.find((s) => s.slice_index === guestOrdinal)
  if (byIndex) return byIndex
  return editSlices[guestOrdinal] ?? null
}

function formatTermsEditedCopy(args: {
  actorLabel: string
  backerArticle: 'the' | 'a'
  beforeDeal: TermsEditPayload
  afterDeal: TermsEditPayload
  beforeSlice: TermsEditSlice | null
  afterSlice: TermsEditSlice | null
  appUrl: string
}): { subject: string; text: string; html: string } {
  const introPlain = `${args.actorLabel} edited the terms of the stake on Edgetilt.com with you as ${args.backerArticle} backer.`
  const beforeLines = formatTermsSectionLines(args.beforeDeal, args.beforeSlice, 'owned')
  const afterLines = formatTermsSectionLines(args.afterDeal, args.afterSlice, 'own')
  const footer = formatEmailFooter()
  const text = [
    introPlain,
    '',
    'Before:',
    ...beforeLines,
    '',
    'After:',
    ...afterLines,
    '',
    footer.text,
  ].join('\n')

  const safeActor = escapeHtml(args.actorLabel)
  const safeUrl = escapeHtml(args.appUrl)
  const introHtml = `${safeActor} edited the terms of the stake on <a href="${safeUrl}" style="color:#0891b2;">Edgetilt.com</a> with you as ${args.backerArticle} backer.`
  const beforeHtml = ['Before:', ...beforeLines.map((line) => escapeHtml(line))].join('<br>')
  const afterHtml = ['After:', ...afterLines.map((line) => escapeHtml(line))].join('<br>')
  const bodyHtml = [
    transactionalEmailParagraph(introHtml),
    transactionalEmailParagraph(beforeHtml),
    transactionalEmailParagraph(afterHtml, { marginBottom: '0' }),
  ].join('')

  const dealLabel = String(args.afterDeal.deal_label || args.beforeDeal.deal_label || '').trim()
  const subject = `${args.actorLabel} edited stake terms: ${dealLabel || 'Untitled'}`
  const html = wrapTransactionalEmailHtml({
    title: subject,
    headline: 'Stake terms updated',
    bodyHtml,
    appUrl: args.appUrl,
    cta: { label: 'Create free account', href: args.appUrl },
    footerNoteHtml: footer.htmlNote,
    ctaAfterFooterNote: true,
    footerNoteMarginTop: '24px',
  })
  return { subject, text, html }
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
  let resendId = null
  try {
    const parsed = await res.json()
    resendId = parsed?.id ? String(parsed.id) : null
  } catch {
    /* ignore */
  }
  return { skipped: false as const, id: resendId }
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

    let body: {
      deal_id?: string
      slice_ids?: string[]
      kind?: string
      terms_edit?: { before?: TermsEditPayload; after?: TermsEditPayload }
    } = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400)
    }

    const dealId = String(body.deal_id || '').trim()
    if (!dealId) return jsonResponse({ error: 'deal_id is required.' }, 400)

    const kindRaw = String(body.kind || 'offer').trim().toLowerCase()
    let kind: 'offer' | 'deleted' | 'terms_edited' = 'offer'
    if (kindRaw === 'deleted') kind = 'deleted'
    else if (kindRaw === 'terms_edited') kind = 'terms_edited'

    const termsEditBefore = body.terms_edit?.before
    const termsEditAfter = body.terms_edit?.after
    if (kind === 'terms_edited' && (!termsEditBefore || !termsEditAfter)) {
      return jsonResponse(
        { error: 'terms_edit.before and terms_edit.after are required for terms_edited.' },
        400,
      )
    }

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
        'id, slice_index, counterparty_kind, guest_email, guest_phone, guest_label, action_pct, pricing_mode, player_profit_pct, markup_rate, status',
      )
      .eq('deal_id', dealId)
      .eq('counterparty_kind', 'guest')
      .order('slice_index', { ascending: true })

    if (sliceIdFilter.length) {
      sliceQuery = sliceQuery.in('id', sliceIdFilter)
    }

    const { data: slicesRaw, error: sliceErr } = await sliceQuery
    if (sliceErr) throw new Error(sliceErr.message)
    const slices = (slicesRaw || []) as SliceRow[]

    const { count: totalSliceCount, error: countErr } = await admin
      .from('poker_stable_deal_slices')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', dealId)
    if (countErr) throw new Error(countErr.message)
    const backerArticle: 'the' | 'a' = totalSliceCount === 1 ? 'the' : 'a'

    const { data: actorProfile } = await admin
      .from('profiles')
      .select('display_name, handle')
      .eq('user_id', uid)
      .maybeSingle()
    const actorLabel = formatProfileLabel(actorProfile)

    const baselineLabel = fmtMoney(Number(deal.baseline_bankroll))
    const dealLabel = String(deal.label || '').trim()
    const appUrl = resolvePublicAppOrigin()

    const results: Record<string, unknown>[] = []
    let notifiedCount = 0

    for (let guestOrdinal = 0; guestOrdinal < slices.length; guestOrdinal += 1) {
      const slice = slices[guestOrdinal]
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

      let subject = ''
      let text = ''
      let html = ''

      if (kind === 'terms_edited') {
        const beforeSlice = findEditSlice(slice, termsEditBefore?.slices, guestOrdinal)
        const afterSlice = findEditSlice(slice, termsEditAfter?.slices, guestOrdinal)
        if (!afterSlice) {
          results.push({
            slice_id: slice.id,
            notified: false,
            email: { skipped: true, reason: 'no after snapshot for slice' },
            sms: { skipped: true, reason: 'no after snapshot for slice' },
          })
          continue
        }
        ;({ subject, text, html } = formatTermsEditedCopy({
          actorLabel,
          backerArticle,
          beforeDeal: termsEditBefore as TermsEditPayload,
          afterDeal: termsEditAfter as TermsEditPayload,
          beforeSlice,
          afterSlice,
          appUrl,
        }))
      } else {
        const pricingLine = formatPricingLine(slice)
        const exposureLine = formatExposureLine(
          guestExposureFromSliceRow(slice, Number(deal.baseline_bankroll)),
        )
        ;({ subject, text, html } = formatStakeMessageCopy({
          kind,
          actorLabel,
          backerArticle,
          dealLabel,
          baselineLabel,
          actionPct: Number(slice.action_pct),
          pricingLine,
          exposureLine,
          appUrl,
        }))
      }
      const smsText = `${text}\n\n${appUrl}`

      const channels: Record<string, unknown> = { slice_id: slice.id }

      if (hasEmail) {
        channels.email = await sendResendEmail(email, subject, html, text)
      } else {
        channels.email = { skipped: true, reason: 'no guest email' }
      }

      if (hasPhone && phone) {
        channels.sms = await sendTwilioSms(phone, smsText)
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
      kind,
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
