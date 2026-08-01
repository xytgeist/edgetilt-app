import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { sliceDisplayName } from './pokerStableApi.js'

export function pricingModeLabel(mode) {
  return mode === 'markup' ? 'Markup' : 'Profit split'
}

export function rakebackModeLabel(mode) {
  if (mode === 'all_to_stake') return '100% to stake'
  if (mode === 'custom') return 'Custom split'
  return 'Disabled'
}

export function sliceTermsSummary(slice, profilesById = {}) {
  const name = sliceDisplayName(slice, profilesById)
  const action = `${slice.action_pct}% action`
  const pricing =
    slice.pricing_mode === 'markup'
      ? `Markup ${slice.markup_rate}x`
      : `Player keeps ${slice.player_profit_pct}% of profit`
  const rake = rakebackModeLabel(slice.rakeback_mode)
  const rakeDetail =
    slice.rakeback_mode === 'custom' && slice.rakeback_player_pct != null
      ? ` · Player rakeback ${slice.rakeback_player_pct}%`
      : ''
  return { name, action, pricing, rake: `${rake}${rakeDetail}` }
}

export function dealHasEdgeStakerSlices(slices = []) {
  return slices.some(
    (slice) =>
      slice?.counterparty_kind === 'user' ||
      slice?.counterpartyKind === 'user' ||
      Boolean(slice?.staker_user_id || slice?.stakerUserId),
  )
}

/** Player may edit deal terms when pending, or active with guest-only backers. */
export function stakeeCanEditDealTerms(deal, slices = [], { hasProposal = false } = {}) {
  if (!deal || hasProposal) return false
  if (deal.status === 'pending') return true
  if (deal.status === 'active' && !dealHasEdgeStakerSlices(slices)) return true
  return false
}

export function canReassignGuestSlice({ deal, slice, userId, hasProposal = false }) {
  if (!deal || !slice || hasProposal) return false
  if (deal.stakee_user_id !== userId) return false
  if (!['pending', 'active'].includes(deal.status)) return false
  return slice.counterparty_kind === 'guest' || slice.counterpartyKind === 'guest'
}

export function dealTermsHeader(deal) {
  const parts = []
  if (deal?.label) parts.push(deal.label)
  if (deal?.baseline_bankroll != null) {
    parts.push(`Baseline ${fmtPoker$(Number(deal.baseline_bankroll) || 0)}`)
  }
  if (deal?.is_migration) {
    parts.push('Migration entry')
    if (deal.starting_roll != null) parts.push(`Roll ${fmtPoker$(Number(deal.starting_roll) || 0)}`)
  }
  return parts.join(' · ')
}

/** @param {object} sliceRow @param {Record<string, object>} profilesById */
export function sliceRowToFormSlice(sliceRow, profilesById = {}) {
  const isGuest =
    sliceRow.counterparty_kind === 'guest' || sliceRow.counterpartyKind === 'guest'
  const base = {
    actionPct:
      sliceRow.action_pct != null
        ? String(sliceRow.action_pct)
        : sliceRow.actionPct != null
          ? String(sliceRow.actionPct)
          : '',
    pricingMode: sliceRow.pricing_mode || sliceRow.pricingMode || 'profit_split',
    playerProfitPct:
      sliceRow.player_profit_pct != null
        ? String(sliceRow.player_profit_pct)
        : sliceRow.playerProfitPct != null
          ? String(sliceRow.playerProfitPct)
          : '',
    markupRate:
      sliceRow.markup_rate != null
        ? String(sliceRow.markup_rate)
        : sliceRow.markupRate != null
          ? String(sliceRow.markupRate)
          : '',
    rakebackMode: sliceRow.rakeback_mode || sliceRow.rakebackMode || 'disabled',
    rakebackPlayerPct:
      sliceRow.rakeback_player_pct != null
        ? String(sliceRow.rakeback_player_pct)
        : sliceRow.rakebackPlayerPct != null
          ? String(sliceRow.rakebackPlayerPct)
          : '',
  }
  if (isGuest) {
    return {
      ...base,
      sliceId: sliceRow.id || null,
      wasGuest: true,
      handle: '',
      selectedProfile: null,
      guestLabel: sliceRow.guest_label || sliceRow.guestLabel || '',
      guestPhone: sliceRow.guest_phone || sliceRow.guestPhone || '',
      guestEmail: sliceRow.guest_email || sliceRow.guestEmail || '',
      isGuest: true,
    }
  }
  const stakerId = sliceRow.staker_user_id || sliceRow.stakerUserId
  const profile = stakerId ? profilesById[stakerId] || null : null
  return {
    ...base,
    sliceId: sliceRow.id || null,
    wasGuest: false,
    handle: profile?.handle ? String(profile.handle).replace(/^@+/, '') : '',
    selectedProfile: profile,
    guestLabel: '',
    guestPhone: '',
    guestEmail: '',
    isGuest: false,
    stakerUserId: stakerId,
  }
}

export function buildTermsPayload({
  label,
  baseline,
  isMigration,
  startingRoll,
  stakeWidePl,
  lifetimePl,
  slices,
}) {
  return {
    deal: {
      label: label?.trim() || null,
      baseline_bankroll: baseline,
      starting_roll: isMigration ? startingRoll : baseline,
      is_migration: isMigration,
      stake_wide_starting_pl: stakeWidePl,
      lifetime_pl_display: lifetimePl,
    },
    slices,
  }
}

export function termsPayloadToFormState(payload, profilesById = {}) {
  const deal = payload?.deal || {}
  const sliceRows = Array.isArray(payload?.slices) ? payload.slices : []
  return {
    label: deal.label || '',
    baseline:
      deal.baseline_bankroll != null ? String(deal.baseline_bankroll) : '',
    isMigration: Boolean(deal.is_migration),
    startingRoll: deal.starting_roll != null ? String(deal.starting_roll) : '',
    stakeWidePl:
      deal.stake_wide_starting_pl != null ? String(deal.stake_wide_starting_pl) : '',
    lifetimePl:
      deal.lifetime_pl_display != null ? String(deal.lifetime_pl_display) : '',
    slices: sliceRows.map((sl) => sliceRowToFormSlice(sl, profilesById)),
  }
}
