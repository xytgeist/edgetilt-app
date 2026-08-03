import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { dealTypeLabel } from './pokerStableMath.js'
import { dealLeadBackerDisplayName, sliceTermsSummary } from './pokerStableTerms.js'
import { venueKindLabel } from '../poker-bankroll/pokerStakeeOnboarding.js'

function previewDealLabel(preview) {
  return preview?.deal_label?.trim() || dealTypeLabel(preview?.deal_type) || 'Cash backing'
}

/** Guest player claim preview → offer details props. */
export function guestStakeeClaimOfferDetails(preview) {
  if (!preview) return null
  const label = previewDealLabel(preview)
  const backerName = preview.backer_label || 'Your backer'
  const baseline = Number(preview.baseline_bankroll) || 0
  const actionSold = Number(preview.action_sold_pct) || 0

  return {
    label,
    rows: [
      { label: 'Backer', value: backerName },
      { label: 'Deal type', value: dealTypeLabel(preview.deal_type) },
      { label: 'Venue', value: venueKindLabel(preview.venue_kind) },
      { label: 'Baseline bankroll', value: fmtPoker$(baseline) },
      { label: 'Action sold', value: `${actionSold}%` },
    ],
    sliceSummaries: [],
    notes: preview.notes,
  }
}

/** Guest backer claim preview → offer details props. */
export function guestBackerClaimOfferDetails(preview) {
  if (!preview) return null
  const label = previewDealLabel(preview)
  const playerName = preview.player_label || 'Player'
  const baseline = Number(preview.baseline_bankroll) || 0
  const actionPct = Number(preview.action_pct) || 0
  const slice = {
    counterparty_kind: 'guest',
    guest_label: preview.guest_label || preview.guest_email || 'You',
    action_pct: preview.action_pct,
    pricing_mode: preview.pricing_mode,
    player_profit_pct: preview.player_profit_pct,
    markup_rate: preview.markup_rate,
    rakeback_mode: preview.rakeback_mode,
    rakeback_player_pct: preview.rakeback_player_pct,
  }

  return {
    label,
    rows: [
      { label: 'Player', value: playerName },
      { label: 'Deal type', value: dealTypeLabel(preview.deal_type) },
      { label: 'Venue', value: venueKindLabel(preview.venue_kind) },
      { label: 'Baseline bankroll', value: fmtPoker$(baseline) },
      { label: 'Your action', value: `${actionPct}%` },
    ],
    sliceSummaries: [sliceTermsSummary(slice)],
    notes: preview.notes,
  }
}

/** Deal + slices from Bankroll onboarding → offer details props. */
export function stakeOfferOnboardingDetails(deal, slices = [], profilesById = {}) {
  if (!deal) return null
  const label = deal.label?.trim() || dealTypeLabel(deal.deal_type) || 'Cash backing'
  const backerName = dealLeadBackerDisplayName(deal, profilesById) || 'Your backer'
  const actionSold = (slices || []).reduce(
    (sum, slice) => sum + Number(slice.action_pct ?? slice.actionPct ?? 0),
    0,
  )

  return {
    label,
    rows: [
      { label: 'Backer', value: backerName },
      { label: 'Deal type', value: dealTypeLabel(deal.deal_type) },
      { label: 'Venue', value: venueKindLabel(deal.venue_kind) },
      { label: 'Baseline bankroll', value: fmtPoker$(Number(deal.baseline_bankroll) || 0) },
      { label: 'Action sold', value: `${actionSold}%` },
    ],
    sliceSummaries: (slices || []).map((slice) => sliceTermsSummary(slice, profilesById)),
    notes: deal.notes,
  }
}
