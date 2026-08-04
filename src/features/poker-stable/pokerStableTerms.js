import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { formatMoneyInputValue } from '../../utils/moneyInputFormat.js'
import {
  computeDealMakeup,
  dealHasAcceptedBackerSlice,
  dealTypeLabel,
  isOngoingDealType,
  stakeDealIsLiveForStakee,
} from './pokerStableMath.js'

export { dealHasAcceptedBackerSlice, stakeDealIsLiveForStakee } from './pokerStableMath.js'

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
  if (handle) return `@${handle}`
  const inviteLabel = String(slice.guest_label || slice.guestLabel || '').trim()
  if (inviteLabel) return inviteLabel.split(/\s+/)[0] || inviteLabel
  return 'Stake'
}

/** Edge profile picker / locked typeahead: "Joey K (@smokewagon)". */
export function edgeProfileDisplayName(profile) {
  if (!profile) return ''
  const displayName = String(profile.display_name || '').trim()
  const handle = profile.handle ? String(profile.handle).replace(/^@+/, '') : ''
  if (displayName && handle) return `${displayName} (@${handle})`
  if (displayName) return displayName
  if (handle) return `@${handle}`
  return ''
}

/** Horse / player name on a deal (Edge user or guest stakee). */
export function dealStakeeDisplayName(deal, profilesById = {}) {
  const guestLabel = deal?.stakee_guest_label || deal?.stakeeGuestLabel
  if (guestLabel) return String(guestLabel).trim() || 'Guest player'
  const stakeeId = deal?.stakee_user_id
  const profile = stakeeId ? profilesById[stakeeId] : null
  return edgeProfileDisplayName(profile) || 'Player'
}

/** Lead backer who proposed a horse deal (`deal.staker_user_id`). */
export function dealLeadBackerDisplayName(deal, profilesById = {}) {
  const stakerId = deal?.staker_user_id
  if (!stakerId) return ''
  return edgeProfileDisplayName(profilesById[stakerId]) || 'Backer'
}

/** Terms sheet: "Joey K (@smokewagon)" or guest name only. */
/** Slices still waiting on backer accept/decline (player stake card). */
export function pendingBackerAcceptanceSlices(deal, slices = []) {
  if (!deal) return []
  if (deal.status === 'revoked' || deal.status === 'declined' || deal.status === 'settled') {
    return []
  }
  return slices.filter((s) => s.status === 'pending')
}

/** Stable horse card: pending co-backer slices an active backer can nudge (excludes viewer). */
export function pendingBackerNudgeTargetsForActiveBacker(deal, slices = [], viewerUserId) {
  if (!deal || !viewerUserId) return []
  if (!dealHasAcceptedBackerSlice(deal, slices)) return []
  const viewerActive = (slices || []).some(
    (s) => s.staker_user_id === viewerUserId && s.status === 'active',
  )
  if (!viewerActive) return []
  return pendingBackerAcceptanceSlices(deal, slices).filter(
    (s) => s.staker_user_id !== viewerUserId,
  )
}

/** Player Bankroll hero badge: stake is live (see {@link stakeDealIsLiveForStakee}). */
export function stakeDealShowsOnStakeBadge(deal, slices = []) {
  return stakeDealIsLiveForStakee(deal, slices)
}

/** Player Bankroll stake hero badge variant (`data-poker-stake-hero-badge`). */
export function stakeHeroBadgeVariant(deal, slices = []) {
  if (!deal) return null
  if (deal.status === 'revoked') return 'revoked'
  if (stakeeBankrollShowsClosedCarouselCard(deal)) return 'closed'
  if (deal.status === 'declined') return 'declined'
  if (stakeDealIsLiveForStakee(deal, slices)) return 'active'
  if (deal.status === 'pending') return 'pending'
  return null
}

export function stakeHeroBadgeLabel(deal, slices = []) {
  switch (stakeHeroBadgeVariant(deal, slices)) {
    case 'revoked':
      return 'Revoked'
    case 'closed':
      return 'Closed'
    case 'declined':
      return 'Declined'
    case 'pending':
      return 'Pending'
    default:
      return 'On stake'
  }
}

/** Stable horse carousel status pill when deal is live vs still pending. */
export function stakeHorseCardStatusLabel(deal, slices = []) {
  if (stakeDealIsLiveForStakee(deal, slices)) return 'Active'
  if (deal?.status === 'pending') return 'Pending'
  return deal?.status || 'Unknown'
}

export function stakeHorseCardStatusTone(deal, slices = []) {
  if (stakeDealIsLiveForStakee(deal, slices)) {
    return 'bg-amber-500/20 text-amber-300'
  }
  if (deal?.status === 'pending') return 'bg-amber-500/15 text-amber-200/90'
  return 'bg-zinc-700/60 text-zinc-400'
}

export const STAKE_GOES_LIVE_COPY =
  'Once you and at least one backer accept, this stake goes live.'

export function sliceCounterpartyDisplayName(slice, profilesById = {}) {
  if (slice.counterparty_kind === 'guest' || slice.counterpartyKind === 'guest') {
    return slice.guest_label || slice.guestLabel || 'Guest'
  }
  const stakerId = slice.staker_user_id || slice.stakerUserId
  const profile = stakerId ? profilesById[stakerId] : null
  const profileName = edgeProfileDisplayName(profile)
  if (profileName) return profileName
  const inviteLabel = String(slice.guest_label || slice.guestLabel || '').trim()
  if (inviteLabel) return inviteLabel
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

function dealInviteStakeKindPhrase(dealType) {
  if (dealType === 'cash_backing' || dealType === 'cash_piece') return 'cash game stake'
  if (dealType === 'tournament_package') return 'tournament package stake'
  if (dealType === 'tournament_piece') return 'tournament piece stake'
  const label = dealTypeLabel(dealType)
  return label ? `${label.toLowerCase()} stake` : 'stake'
}

/** One-line invite copy for pending backer horse cards (action, baseline, pricing). */
export function backerSliceInviteSummaryLine(deal, slice, profilesById = {}) {
  const playerName = dealStakeeDisplayName(deal, profilesById)
  const actionPct = formatTermsPct(slice?.action_pct ?? slice?.actionPct)
  const baseline = fmtPoker$(Number(deal?.baseline_bankroll) || 0)
  const stakeKind = dealInviteStakeKindPhrase(deal?.deal_type)
  const pricingMode = slice?.pricing_mode || slice?.pricingMode || 'profit_split'

  let pricingPhrase = 'a profit split'
  if (pricingMode === 'markup') {
    const rate = formatTermsPct(slice?.markup_rate ?? slice?.markupRate)
    pricingPhrase = `a ${rate}x markup`
  } else {
    const playerPct = Number(slice?.player_profit_pct ?? slice?.playerProfitPct)
    const backerPct = Number.isFinite(playerPct) ? 100 - playerPct : null
    if (Number.isFinite(backerPct) && Number.isFinite(playerPct)) {
      pricingPhrase = `a ${formatTermsPct(playerPct)}/${formatTermsPct(backerPct)} player/backer split`
    }
  }

  return `${playerName} has invited you to back ${actionPct}% of a ${baseline} ${stakeKind} @ ${pricingPhrase}`
}

export function dealHasEdgeStakerSlices(slices = []) {
  return slices.some(
    (slice) =>
      slice?.counterparty_kind === 'user' ||
      slice?.counterpartyKind === 'user' ||
      Boolean(slice?.staker_user_id || slice?.stakerUserId),
  )
}

/** Player may edit deal terms when pending, revoked, or active with guest-only backers. */
export function stakeeCanEditDealTerms(deal, slices = [], { hasProposal = false } = {}) {
  if (!deal || hasProposal) return false
  if (deal.status === 'pending' || deal.status === 'revoked') return true
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

/** Backer-initiated stakes: player never manually syncs backer close/settle commits. */
export function stakeeSkipsBackerCommitSync(deal, userId) {
  if (!deal || !userId || deal.stakee_user_id !== userId) return false
  return Boolean(deal.staker_user_id)
}

/** Stakee Bankroll carousel keeps closed stakes until manually archived. */
export function stakeeBankrollShowsClosedCarouselCard(deal) {
  if (!deal?.id || deal.stakee_bankroll_archived_at) return false
  return ['settled', 'closed', 'declined', 'revoked'].includes(deal.status)
}

/** Player may open deal ledger (top-up + settle) on active cash backing. */
export function stakeeCanOpenLedger(deal, { userId, hasProposal = false } = {}) {
  if (!deal || !userId || deal.stakee_user_id !== userId) return false
  if (deal.status !== 'active') return false
  if (deal.deal_type !== 'cash_backing') return false
  if (hasProposal) return false
  if (deal.staker_user_id) return false
  return true
}

/** Player may periodic-settle or close an active/revoked ongoing stake (Bankroll end-stake flow). */
export function stakeeCanSettleStake(deal, _slices = [], { userId, hasProposal = false } = {}) {
  if (!deal || !userId || deal.stakee_user_id !== userId) return false
  if (!['active', 'revoked'].includes(deal.status)) return false
  if (hasProposal) return false
  return isOngoingDealType(deal.deal_type)
}

/** Player or active Edge backer may record top-up / reduce / settle on an active stake. */
export function userCanRecordDealEvent(deal, slices = [], userId) {
  if (!deal || !userId || deal.status !== 'active') return false
  if (deal.stakee_user_id === userId) return true
  return (slices || []).some(
    (s) =>
      s.status === 'active' &&
      s.counterparty_kind === 'user' &&
      s.staker_user_id === userId,
  )
}

/** Player or active Edge backer may record periodic settle / close (when no pending request). */
export function canProposeSettleStake(deal, slices = [], { userId, hasProposal = false } = {}) {
  if (hasProposal) return false
  if (stakeeCanSettleStake(deal, slices, { userId, hasProposal: false })) return true
  if (!deal || !userId) return false
  if (!['active', 'revoked'].includes(deal.status)) return false
  if (!isOngoingDealType(deal.deal_type)) return false
  return slices.some(
    (slice) =>
      slice.status === 'active' &&
      slice.counterparty_kind === 'user' &&
      slice.staker_user_id === userId,
  )
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

/** Periodic settle only when cash backing, not underwater vs baseline, and deal still active. */
export function dealCanPeriodicSettle(deal, dealRoll = null) {
  if (deal?.status === 'revoked') return false
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

/**
 * Archive list badge label — how the stake ended (not redundant "Archived").
 * @param {object | null | undefined} deal
 * @param {object[]} [slices]
 */
export function archivedStakeOutcomeLabel(deal, slices = []) {
  const status = deal?.status
  if (status === 'declined') return 'Declined'
  if (status === 'revoked') return 'Revoked'
  if (status === 'closed') return 'Closed'
  if (status === 'settled') {
    const relevant = (slices || []).filter((s) => s.status !== 'cancelled')
    const hasActive = relevant.some((s) => s.status === 'active')
    if (!hasActive && relevant.some((s) => s.status === 'declined')) return 'Revoked'
    return 'Closed'
  }
  if (status) return status.charAt(0).toUpperCase() + status.slice(1)
  return 'Closed'
}

/** Shared layout for archive outcome badges; colors via data-poker-stake-archive-outcome in index.css. */
export const ARCHIVED_STAKE_OUTCOME_BADGE_CLASS =
  'shrink-0 rounded-md border border-transparent px-2 py-0.5 text-[9px] font-black uppercase tracking-wider'

/** @deprecated Colors live in CSS — use {@link ARCHIVED_STAKE_OUTCOME_BADGE_CLASS}. */
export function archivedStakeOutcomeBadgeClass(_label) {
  return ARCHIVED_STAKE_OUTCOME_BADGE_CLASS
}
