/**
 * Notify guest backers on a Poker Stable cash stake offer, terms edit, deletion, or session complete.
 *
 * body.kind:
 *   - offer (default): player created stake terms
 *   - terms_edited: player edited stake terms (requires terms_edit.before / terms_edit.after)
 *   - deleted: player deleted the stake (call before DB delete)
 *   - session_complete: player completed a stake session (requires session_id)
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

async function createGuestStakeeClaimUrl(
  admin: ReturnType<typeof createBillingAdmin>,
  dealId: string,
  guestEmail: string | null,
): Promise<string> {
  const raw = randomToken()
  const tokenHash = await sha256Hex(raw)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error: tokErr } = await admin.from('poker_stable_guest_stakee_claim_tokens').insert({
    deal_id: dealId,
    token_hash: tokenHash,
    guest_email: guestEmail,
    expires_at: expiresAt,
  })
  if (tokErr) throw new Error(tokErr.message)
  return `${resolvePublicAppOrigin()}/poker-stake-claim?token=${raw}`
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

function formatGuestStakeeOfferCopy(args: {
  actorLabel: string
  guestName: string
  dealLabel: string
  baselineLabel: string
  actionSoldPct: number
  pricingLine: string
  claimUrl: string
}): { subject: string; text: string; html: string } {
  const guestName = args.guestName.trim() || 'there'
  const introPlain = `${args.actorLabel} invited you to a backing stake on Edgetilt.com as the player.`
  const nameLine = `Name of stake: ${args.dealLabel || '—'}`
  const stakeLine = `Total stake: ${args.baselineLabel}`
  const actionLine = `Action sold: ${formatPct(args.actionSoldPct)}%`
  const detailLines = [nameLine, stakeLine, actionLine, args.pricingLine]
  const footer = formatEmailFooter()
  const text = `Hi ${guestName},\n\n${introPlain}\n\n${detailLines.join('\n')}\n\nOpen your claim link to create a free Edge account and review the stake:\n${args.claimUrl}\n\n${footer.text}`

  const safeActor = escapeHtml(args.actorLabel)
  const safeGuest = escapeHtml(guestName)
  const safeUrl = escapeHtml(args.claimUrl)
  const introHtml = `${safeActor} invited you to a backing stake on <a href="${safeUrl}" style="color:#0891b2;">Edgetilt.com</a> as the player.`
  const detailsHtml = detailLines.map((line) => escapeHtml(line)).join('<br>')
  const bodyHtml = [
    transactionalEmailParagraph(`Hi ${safeGuest},`),
    transactionalEmailParagraph(introHtml),
    transactionalEmailParagraph(detailsHtml, { marginBottom: '0' }),
  ].join('')

  const subject = `${args.actorLabel} invited you to a stake: ${args.dealLabel || 'Untitled'}`
  const html = wrapTransactionalEmailHtml({
    title: subject,
    headline: 'Backing stake invitation',
    bodyHtml,
    appUrl: args.claimUrl,
    cta: { label: 'Claim stake', href: args.claimUrl },
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

type SessionRow = {
  id: string
  user_id: string
  deal_id: string | null
  status: string
  session_type: string
  venue_kind: string | null
  venue_name: string | null
  start_at: string
  end_at: string | null
  buy_in: number
  rebuy_amount: number | null
  addon_amount: number | null
  cash_out: number | null
  bounty_winnings: number | null
  tournament_name: string | null
  game_variant: string | null
  small_blind: number | null
  big_blind: number | null
  third_blind: number | null
  finish_place: number | null
}

function pokerSessionWinLoss(session: SessionRow): number | null {
  if (session.cash_out == null) return null
  const cost =
    (Number(session.buy_in) || 0) +
    (Number(session.rebuy_amount) || 0) +
    (Number(session.addon_amount) || 0)
  const out = Number(session.cash_out) + (Number(session.bounty_winnings) || 0)
  return Math.round((out - cost) * 100) / 100
}

function computeSliceStakeImpact(gross: number, slice: SliceRow): number {
  const actionPct = Number(slice.action_pct)
  if (!Number.isFinite(actionPct) || actionPct <= 0) return 0
  return Math.round(gross * (actionPct / 100) * 100) / 100
}

function computeSliceBackerShare(gross: number, slice: SliceRow): number {
  const grossOnSlice = computeSliceStakeImpact(gross, slice)
  if (slice.pricing_mode === 'markup') {
    return grossOnSlice
  }
  const playerPct = Number(slice.player_profit_pct)
  const backerPct = Number.isFinite(playerPct) ? 100 - playerPct : 100
  return Math.round(grossOnSlice * (backerPct / 100) * 100) / 100
}

function formatCashBlindPart(value: unknown): string | null {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) return null
  if (/^\d+$/.test(raw)) return String(parseInt(raw, 10))
  if (/^0\.\d+$/.test(raw)) return raw.slice(1)
  if (/^\.\d+$/.test(raw)) return raw
  if (/^\d+\.\d+$/.test(raw)) return raw
  if (Number.isInteger(num)) return String(num)
  const s = String(num)
  return s.startsWith('0.') ? s.slice(1) : s
}

function formatSessionStakesLabel(session: SessionRow): string {
  if (session.session_type === 'tournament') {
    const bi = Number(session.buy_in)
    const biStr = Number.isFinite(bi) ? fmtMoney(bi) : ''
    const name = String(session.tournament_name || '').trim()
    if (name && biStr) return `${biStr} · ${name}`
    if (name) return name
    if (biStr) return `${biStr} buy-in`
    return 'Tournament'
  }
  const sb = formatCashBlindPart(session.small_blind)
  const bb = formatCashBlindPart(session.big_blind)
  const third = formatCashBlindPart(session.third_blind)
  if (sb && bb) {
    if (third) return `$${sb}/${bb}/${third}`
    return `$${sb}/${bb}`
  }
  return String(session.game_variant || 'Cash game')
}

function formatSessionMetaLine(session: SessionRow): string {
  const bits: string[] = []
  bits.push(session.session_type === 'tournament' ? 'Tourney' : 'Cash')
  bits.push(
    session.venue_kind === 'online' ? 'Online' : session.venue_kind === 'club' ? 'Club' : 'Live',
  )
  if (session.venue_name) bits.push(String(session.venue_name))
  return bits.join(' · ')
}

function formatSessionDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatSessionCompleteCopy(args: {
  actorLabel: string
  dealLabel: string
  sessionStakes: string
  sessionMeta: string
  sessionDate: string
  gross: number
  stakeImpact: number
  backerShare: number
  actionPct: number
  appUrl: string
}): { subject: string; text: string; html: string } {
  const grossLabel = fmtMoney(args.gross)
  const stakeImpactLabel = fmtMoney(args.stakeImpact)
  const shareLabel = fmtMoney(args.backerShare)
  const introPlain = `${args.actorLabel} completed a stake session on Edgetilt.com.`
  const detailLines = [
    `Stake: ${args.dealLabel || '—'}`,
    `Session stakes: ${args.sessionStakes}`,
    `${args.sessionMeta} · ${args.sessionDate}`,
    `Table result: ${grossLabel}`,
    `Stake impact: ${stakeImpactLabel}`,
    `Your share (${formatPct(args.actionPct)}%): ${shareLabel}`,
  ]
  const footer = formatEmailFooter()
  const text = `${introPlain}\n\n${detailLines.join('\n')}\n\n${footer.text}`

  const safeActor = escapeHtml(args.actorLabel)
  const safeUrl = escapeHtml(args.appUrl)
  const introHtml = `${safeActor} completed a stake session on <a href="${safeUrl}" style="color:#0891b2;">Edgetilt.com</a>.`
  const detailsHtml = detailLines.map((line) => escapeHtml(line)).join('<br>')
  const bodyHtml = [
    transactionalEmailParagraph(introHtml),
    transactionalEmailParagraph(detailsHtml, { marginBottom: '0' }),
  ].join('')

  const subject = `${args.actorLabel} completed a session · ${shareLabel} your share`
  const html = wrapTransactionalEmailHtml({
    title: subject,
    headline: 'Stake session completed',
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
  staker_user_id: string | null
  stakee_user_id: string | null
  stakee_guest_label: string | null
  stakee_guest_email: string | null
  stakee_guest_phone: string | null
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
      session_id?: string
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
    let kind: 'offer' | 'deleted' | 'terms_edited' | 'session_complete' | 'guest_stakee_offer' =
      'offer'
    if (kindRaw === 'deleted') kind = 'deleted'
    else if (kindRaw === 'terms_edited') kind = 'terms_edited'
    else if (kindRaw === 'session_complete') kind = 'session_complete'
    else if (kindRaw === 'guest_stakee_offer') kind = 'guest_stakee_offer'

    const sessionId = String(body.session_id || '').trim()
    if (kind === 'session_complete' && !sessionId) {
      return jsonResponse({ error: 'session_id is required for session_complete.' }, 400)
    }

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
      .select(
        'id, staker_user_id, stakee_user_id, stakee_guest_label, stakee_guest_email, stakee_guest_phone, status, label, baseline_bankroll',
      )
      .eq('id', dealId)
      .maybeSingle()
    if (dealErr) throw new Error(dealErr.message)
    if (!dealRaw) return jsonResponse({ error: 'Deal not found.' }, 404)
    const deal = dealRaw as DealRow

    if (deal.status === 'cancelled') {
      return jsonResponse({ error: 'Deal is cancelled.' }, 400)
    }

    const uid = auth.user.id
    const isStakee = deal.stakee_user_id === uid
    const isLeadStaker = deal.staker_user_id === uid

    if (kind === 'guest_stakee_offer') {
      if (!isLeadStaker || deal.stakee_user_id) {
        return jsonResponse(
          { error: 'Only the proposing backer can notify a guest player on this stake.' },
          403,
        )
      }

      const { data: actorProfile } = await admin
        .from('profiles')
        .select('display_name, handle')
        .eq('user_id', uid)
        .maybeSingle()
      const actorLabel = formatProfileLabel(actorProfile)

      const email = String(deal.stakee_guest_email || '')
        .trim()
        .toLowerCase()
      const phone = normalizePhone(String(deal.stakee_guest_phone || ''))
      const hasEmail = Boolean(email && isValidEmail(email))
      const hasPhone = Boolean(phone)

      const { data: sliceRowsRaw, error: sliceLoadErr } = await admin
        .from('poker_stable_deal_slices')
        .select(
          'action_pct, pricing_mode, player_profit_pct, markup_rate, slice_index, status',
        )
        .eq('deal_id', dealId)
        .neq('status', 'declined')
        .order('slice_index', { ascending: true })
      if (sliceLoadErr) throw new Error(sliceLoadErr.message)
      const sliceRows = sliceRowsRaw || []
      const actionSoldPct = sliceRows.reduce(
        (sum, row) => sum + Number(row.action_pct || 0),
        0,
      )
      const leadSlice = (sliceRows[0] || null) as SliceRow | null
      const pricingLine = leadSlice ? formatPricingLine(leadSlice) : 'Profit split'
      const baselineLabel = fmtMoney(Number(deal.baseline_bankroll))
      const dealLabel = String(deal.label || '').trim()
      const guestName = String(deal.stakee_guest_label || '').trim()
      let claimUrl = resolvePublicAppOrigin()
      if (hasEmail) {
        try {
          claimUrl = await createGuestStakeeClaimUrl(admin, dealId, email)
        } catch (e) {
          console.warn('[poker-stable-notify] guest stakee claim token failed', e)
        }
      }

      if (!hasEmail && !hasPhone) {
        return jsonResponse({
          ok: true,
          kind,
          deal_id: dealId,
          notified_count: 0,
          guest_stakee: {
            notified: false,
            email: { skipped: true, reason: 'no guest email' },
            sms: { skipped: true, reason: 'no guest phone' },
          },
        })
      }

      const { subject, text, html } = formatGuestStakeeOfferCopy({
        actorLabel,
        guestName,
        dealLabel,
        baselineLabel,
        actionSoldPct,
        pricingLine,
        claimUrl,
      })
      const smsText = `${text}\n\n${claimUrl}`

      const channels: Record<string, unknown> = {}
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

      return jsonResponse({
        ok: true,
        kind,
        deal_id: dealId,
        notified_count: sent ? 1 : 0,
        guest_stakee: { ...channels, notified: sent },
      })
    }

    if (!isStakee) {
      return jsonResponse({ error: 'Only the player can notify guest backers on this stake.' }, 403)
    }

    const { data: actorProfile } = await admin
      .from('profiles')
      .select('display_name, handle')
      .eq('user_id', uid)
      .maybeSingle()
    const actorLabel = formatProfileLabel(actorProfile)

    if (kind === 'session_complete') {
      const { data: sessionRaw, error: sessionErr } = await admin
        .from('poker_bankroll_sessions')
        .select(
          'id, user_id, deal_id, status, session_type, venue_kind, venue_name, start_at, end_at, buy_in, rebuy_amount, addon_amount, cash_out, bounty_winnings, tournament_name, game_variant, small_blind, big_blind, third_blind, finish_place',
        )
        .eq('id', sessionId)
        .maybeSingle()
      if (sessionErr) throw new Error(sessionErr.message)
      if (!sessionRaw) return jsonResponse({ error: 'Session not found.' }, 404)
      const session = sessionRaw as SessionRow

      if (session.user_id !== uid) {
        return jsonResponse({ error: 'Only the session owner can notify on this session.' }, 403)
      }
      if (session.deal_id !== dealId) {
        return jsonResponse({ error: 'Session does not belong to this stake.' }, 400)
      }
      if (session.status !== 'completed') {
        return jsonResponse({ error: 'Session is not completed.' }, 400)
      }

      const gross = pokerSessionWinLoss(session)
      if (gross == null) {
        return jsonResponse({ error: 'Session has no result to notify.' }, 400)
      }

      let sliceQuery = admin
        .from('poker_stable_deal_slices')
        .select(
          'id, slice_index, counterparty_kind, guest_email, guest_phone, guest_label, action_pct, pricing_mode, player_profit_pct, markup_rate, status',
        )
        .eq('deal_id', dealId)
        .eq('counterparty_kind', 'guest')
        .eq('status', 'active')
        .order('slice_index', { ascending: true })

      if (sliceIdFilter.length) {
        sliceQuery = sliceQuery.in('id', sliceIdFilter)
      }

      const { data: slicesRaw, error: sliceErr } = await sliceQuery
      if (sliceErr) throw new Error(sliceErr.message)
      const slices = (slicesRaw || []) as SliceRow[]

      const dealLabel = String(deal.label || '').trim()
      const sessionStakes = formatSessionStakesLabel(session)
      const sessionMeta = formatSessionMetaLine(session)
      const sessionDate = formatSessionDate(session.end_at || session.start_at)
      const appUrl = resolvePublicAppOrigin()

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

        const stakeImpact = computeSliceStakeImpact(gross, slice)
        const backerShare = computeSliceBackerShare(gross, slice)
        const { subject, text, html } = formatSessionCompleteCopy({
          actorLabel,
          dealLabel,
          sessionStakes,
          sessionMeta,
          sessionDate,
          gross,
          stakeImpact,
          backerShare,
          actionPct: Number(slice.action_pct),
          appUrl,
        })
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
        session_id: sessionId,
        notified_count: notifiedCount,
        slices: results,
      })
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
