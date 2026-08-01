import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { formatMoneyInputValue } from '../../utils/moneyInputFormat.js'
import { computeDealMakeup, isOngoingDealType } from './pokerStableMath.js'

export function pricingModeLabel(mode) {
  return mode === 'markup' ? 'Markup' : 'Profit split'
}

export function rakebackModeLabel(mode) {
  if (mode === 'all_to_stake') return '100% to stake'
  if (mode === 'custom') return 'Custom split'
  return 'Disabled'
}

function formatTermsPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function sliceBackerShortName(slice, profilesById = {}) {
  if (slice.counterparty_kind === 'guest' || slice.counterpartyKind === 'guest') {
    return slice.guest_label || slice.guestLabel || 'Guest'
  }
  const stakerId = slice.staker_user_id || slice.stakerUserId
  const profile = stakerId ? profilesById[stakerId] : null
  const displayName = profile?.display_name?.trim()
  if (displayName) {
    const first = displayName.split(/\s+/)[0]
    return first || displayName
  }
  const handle = profile?.handle ? String(profile.handle).replace(/^@+/, '') : ''
  return handle ? `@${handle}` : 'Stake'
}

/** Terms sheet: "Joey K (@smokewagon)" or guest name only. */
export function sliceCounterpartyDisplayName(slice, profilesById = {}) {
  if (slice.counterparty_kind === 'guest' || slice.counterpartyKind === 'guest') {
    return slice.guest_label || slice.guestLabel || 'Guest'
  }
  const stakerId = slice.staker_user_id || slice.stakerUserId
  const profile = stakerId ? profilesById[stakerId] : null
  const displayName = profile?.display_name?.trim()
  const handle = profile?.handle ? String(profile.handle).replace(/^@+/, '') : ''
  if (displayName && handle) return `${displayName} (@${handle})`
  if (displayName) return displayName
  if (handle) return `@${handle}`
  return 'Backer'
}

export function sliceTermsSummary(slice, profilesById = {}) {
  const name = sliceCounterpartyDisplayName(slice, profilesById)
  const backerShort = sliceBackerShortName(slice, profilesById)
  const actionPct = formatTermsPct(slice.action_pct ?? slice.actionPct)
  const pricingMode = slice.pricing_mode || slice.pricingMode || 'profit_split'
  const rakeMode = slice.rakeback_mode || slice.rakebackMode || 'disabled'

  /** @type {{ label: string, value: string }[]} */
  const lines = [{ label: 'Action', value: `${actionPct}%` }]

  if (pricingMode === 'markup') {
    const rate = slice.markup_rate ?? slice.markupRate
    lines.push({ label: 'Markup', value: `${formatTermsPct(rate)}x` })
  } else {
    const playerPct = Number(slice.player_profit_pct ?? slice.playerProfitPct)
    const backerPct = Number.isFinite(playerPct) ? 100 - playerPct : null
    lines.push({
      label: 'Profit split',
      value:
        Number.isFinite(backerPct) && Number.isFinite(playerPct)
          ? `${backerShort} - ${formatTermsPct(backerPct)}% | Player - ${formatTermsPct(playerPct)}%`
          : '—',
    })
  }

  if (rakeMode === 'all_to_stake') {
    lines.push({ label: 'Rakeback', value: '100% to Stake' })
  } else if (rakeMode === 'custom') {
    const playerRb = Number(slice.rakeback_player_pct ?? slice.rakebackPlayerPct)
    const stakeRb = Number.isFinite(playerRb) ? 100 - playerRb : null
    if (Number.isFinite(stakeRb) && Number.isFinite(playerRb)) {
      lines.push({
        label: 'Rakeback',
        value: `Stake - ${formatTermsPct(stakeRb)}% | Player - ${formatTermsPct(playerRb)}%`,
      })
    }
  }

  return { name, lines }
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

/** Player may delete before any Edge backer has accepted (guest-only stakes included). */
export function stakeDealCanBeCancelled(deal, slices = [], { userId } = {}) {
  if (!deal || !userId || deal.stakee_user_id !== userId) return false
  if (!['pending', 'active'].includes(deal.status)) return false
  const hasActiveEdgeSlice = slices.some(
    (slice) =>
      (slice.counterparty_kind === 'user' ||
        slice.counterpartyKind === 'user' ||
        slice.staker_user_id ||
        slice.stakerUserId) &&
      slice.status === 'active',
  )
  return !hasActiveEdgeSlice
}

/** Player may periodic-settle or close an active ongoing stake (Bankroll end-stake flow). */
export function stakeeCanSettleStake(deal, _slices = [], { userId, hasProposal = false } = {}) {
  if (!deal || !userId || deal.stakee_user_id !== userId) return false
  if (deal.status !== 'active') return false
  if (hasProposal) return false
  return isOngoingDealType(deal.deal_type)
}

/** Rakeback applies to online stakes only (cash or tournament package). */
export function dealAllowsRakeback(deal) {
  return deal?.venue_kind === 'online'
}

/** True when deal is online and any active slice has rakeback enabled. */
export function dealHasRakebackEnabled(slices = [], deal = null) {
  if (deal && !dealAllowsRakeback(deal)) return false
  return (slices || []).some((slice) => {
    if (slice.status === 'cancelled' || slice.status === 'declined') return false
    const mode = slice.rakeback_mode || slice.rakebackMode || 'disabled'
    return mode !== 'disabled'
  })
}

/** Periodic settle applies to cash backing only; tournament packages close out once. */
export function dealAllowsPeriodicSettle(deal) {
  return deal?.deal_type === 'cash_backing'
}

/** @param {object | null | undefined} deal @param {{ overall_bankroll?: number } | number | null | undefined} dealRoll */
export function dealRollValue(deal, dealRoll = null) {
  if (dealRoll != null && typeof dealRoll === 'object' && dealRoll.overall_bankroll != null) {
    return Number(dealRoll.overall_bankroll) || 0
  }
  if (typeof dealRoll === 'number' && Number.isFinite(dealRoll)) return dealRoll
  return Number(deal?.starting_roll ?? deal?.baseline_bankroll) || 0
}

/** True when cash-backing roll is below baseline (makeup owed). */
export function dealIsInMakeup(deal, dealRoll = null) {
  if (!dealHasMakeup(deal)) return false
  const baseline = Number(deal?.baseline_bankroll) || 0
  const roll = dealRollValue(deal, dealRoll)
  return computeDealMakeup({ baseline_bankroll: baseline, roll }) > 0.005
}

/** Periodic settle only when cash backing and not underwater vs baseline. */
export function dealCanPeriodicSettle(deal, dealRoll = null) {
  if (!dealAllowsPeriodicSettle(deal)) return false
  return !dealIsInMakeup(deal, dealRoll)
}

/** Cash backing tracks makeup vs baseline; tournament packages do not. */
export function dealHasMakeup(deal) {
  return deal?.deal_type !== 'tournament_package'
}

export function dealTermsMeta(deal) {
  const parts = []
  if (deal?.baseline_bankroll != null) {
    parts.push(`Baseline ${fmtPoker$(Number(deal.baseline_bankroll) || 0)}`)
  }
  if (deal?.is_migration) {
    parts.push('Migration entry')
    if (deal.starting_roll != null) parts.push(`Roll ${fmtPoker$(Number(deal.starting_roll) || 0)}`)
  }
  return parts.join(' · ')
}

/** @deprecated use dealTermsMeta — label is shown separately in terms UI */
export function dealTermsHeader(deal) {
  return dealTermsMeta(deal)
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
      deal.baseline_bankroll != null
        ? formatMoneyInputValue(String(deal.baseline_bankroll))
        : '',
    isMigration: Boolean(deal.is_migration),
    startingRoll:
      deal.starting_roll != null ? formatMoneyInputValue(String(deal.starting_roll)) : '',
    stakeWidePl:
      deal.stake_wide_starting_pl != null
        ? formatMoneyInputValue(String(deal.stake_wide_starting_pl), { allowNegative: true })
        : '',
    lifetimePl:
      deal.lifetime_pl_display != null
        ? formatMoneyInputValue(String(deal.lifetime_pl_display), { allowNegative: true })
        : '',
    slices: sliceRows.map((sl) => sliceRowToFormSlice(sl, profilesById)),
  }
}
