import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { formatMoneyInputValue } from '../../utils/moneyInputFormat.js'
import {
  computeDealMakeup,
  dealHasAcceptedBackerSlice,
  dealTypeLabel,
  isOngoingDealType,
  roundMoney,
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

function profileDisplayNameOnly(profile) {
  const displayName = String(profile?.display_name || '').trim()
  if (displayName) return displayName
  const handle = profile?.handle ? String(profile.handle).replace(/^@+/, '') : ''
  if (handle) return `@${handle}`
  return ''
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

/** Full display name for profit-split / rakeback lines (no @handle suffix). */
function sliceBackerDisplayNameForTerms(slice, profilesById = {}) {
  if (slice.counterparty_kind === 'guest' || slice.counterpartyKind === 'guest') {
    return String(slice.guest_label || slice.guestLabel || '').trim() || 'Guest'
  }
  const stakerId = slice.staker_user_id || slice.stakerUserId
  const fromProfile = profileDisplayNameOnly(stakerId ? profilesById[stakerId] : null)
  if (fromProfile) return fromProfile
  const inviteLabel = String(slice.guest_label || slice.guestLabel || '').trim()
  if (inviteLabel) return inviteLabel
  return sliceBackerShortName(slice, profilesById)
}

function dealStakeeDisplayNameForTerms(deal, profilesById = {}) {
  const guestLabel = deal?.stakee_guest_label || deal?.stakeeGuestLabel
  if (guestLabel) return String(guestLabel).trim() || 'Player'
  const stakeeId = deal?.stakee_user_id
  const fromProfile = profileDisplayNameOnly(stakeeId ? profilesById[stakeeId] : null)
  return fromProfile || 'Player'
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

/**
 * Edge user id to open a Chat DM with from Stable. Null when the counterpart is a
 * guest, missing, or the viewer themself. Both sides must be Edge users.
 * Backer → player (`stakee_user_id`). Player → lead backer (`staker_user_id`).
 * @param {object | null | undefined} deal
 * @param {string | null | undefined} viewerUserId
 */
export function stableDealEdgeChatPeerUserId(deal, viewerUserId) {
  if (!deal || !viewerUserId) return null
  const stakeeId = deal.stakee_user_id || null
  const leadId = deal.staker_user_id || null
  if (stakeeId && stakeeId === viewerUserId) {
    return leadId && leadId !== viewerUserId ? leadId : null
  }
  if (stakeeId && stakeeId !== viewerUserId) return stakeeId
  return null
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
  if (deal.stakee_terms_ack_required) return 'terms_review'
  if (deal.staker_terms_ack_required) return 'counter_sent'
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
    case 'terms_review':
      return 'Review terms'
    case 'counter_sent':
      return 'Counter sent'
    case 'pending':
      return 'Pending'
    default:
      return 'On stake'
  }
}

/** Stable horse carousel status pill when deal is live vs still pending. */
export function stakeHorseCardStatusLabel(deal, slices = []) {
  if (deal?.staker_terms_ack_required && deal?.status === 'pending') return 'Review'
  // Backer proposed revised terms (slice may already be active) ... still Pending until player acks.
  if (deal?.stakee_terms_ack_required && deal?.status === 'pending') return 'Pending'
  if (stakeDealIsLiveForStakee(deal, slices)) return 'Active'
  if (deal?.status === 'pending') return 'Pending'
  return deal?.status || 'Unknown'
}

export function stakeHorseCardStatusTone(deal, slices = []) {
  if (stakeDealIsLiveForStakee(deal, slices)) {
    return 'bg-cyan-500/20 text-cyan-300'
  }
  if (deal?.status === 'pending') return 'bg-zinc-700/60 text-zinc-300'
  return 'bg-zinc-700/60 text-zinc-400'
}

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

const PENDING_PLAY_FOOTER =
  'Until then, you can record sessions (won\'t be visible to backers until they accept). If they do not accept, sessions will be rolled into your personal bankroll and history.'

/**
 * Stakee Bankroll pending helper: initiator acceptance is implicit.
 * Player-initiated names a sole backer; multi-backer / backer-offer copy differs.
 * Pending-play: sessions allowed on player-accepted stakes waiting on backers.
 */
export function stakeGoesLivePendingCopy(deal, slices = [], profilesById = {}) {
  if (!deal) return 'Once a backer accepts, this stake goes live.'

  // Backer Create Stake: lead backer already in; player must accept before logging.
  if (deal.staker_user_id) {
    const pendingCoBackers = (slices || []).filter(
      (s) =>
        s.status === 'pending' &&
        String(s.staker_user_id || s.stakerUserId || '') !== String(deal.staker_user_id),
    )
    if (pendingCoBackers.length > 0) {
      return 'Once you accept, this stake goes live. Other invited backers can still join their slices.'
    }
    return 'Once you accept, this stake goes live.'
  }

  // Player + Stake: waiting on backer(s). Offer size = non-declined slices.
  const offerBackers = (slices || []).filter((s) => s.status !== 'declined')
  if (offerBackers.length === 1) {
    const name = sliceCounterpartyDisplayName(offerBackers[0], profilesById)
    return `Once ${name} accepts, this stake goes live. ${PENDING_PLAY_FOOTER}`
  }
  if (offerBackers.length > 1) {
    return `Once at least one backer accepts the stake terms, the stake will go live with their % of the backing bankroll available. ${PENDING_PLAY_FOOTER}`
  }
  return 'Invite a backer to accept terms before this stake can go live.'
}

/**
 * Player stake card: accepted vs pending backing capital (baseline × action %).
 * @returns {{ accepted: number, pending: number, total: number }}
 */
export function stakeBackingCapitalSplit(deal, slices = []) {
  const baseline = Number(deal?.baseline_bankroll) || 0
  let accepted = 0
  let pending = 0
  for (const slice of slices || []) {
    if (slice.status === 'declined') continue
    const capital = roundMoney(baseline * ((Number(slice.action_pct) || 0) / 100))
    if (slice.status === 'active') accepted = roundMoney(accepted + capital)
    else if (slice.status === 'pending') pending = roundMoney(pending + capital)
  }
  return { accepted, pending, total: roundMoney(accepted + pending) }
}

/** @deprecated Prefer {@link stakeGoesLivePendingCopy} with deal + slices. */
export const STAKE_GOES_LIVE_COPY = 'Once a backer accepts, this stake goes live.'

/**
 * @param {object} slice
 * @param {Record<string, object>} [profilesById]
 * @param {{ deal?: object | null, playerName?: string | null }} [opts]
 */
export function sliceTermsSummary(slice, profilesById = {}, opts = {}) {
  const name = sliceCounterpartyDisplayName(slice, profilesById)
  const backerName = sliceBackerDisplayNameForTerms(slice, profilesById)
  const playerName =
    String(opts.playerName || '').trim() ||
    (opts.deal ? dealStakeeDisplayNameForTerms(opts.deal, profilesById) : '') ||
    'Player'
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
          ? `${backerName} - ${formatTermsPct(backerPct)}% | ${playerName} - ${formatTermsPct(playerPct)}%`
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
        value: `Stake - ${formatTermsPct(stakeRb)}% | ${playerName} - ${formatTermsPct(playerRb)}%`,
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

/**
 * Player Bankroll hero copy for a pending backer Create Stake offer.
 * Example: "Edge Lord (@edgelord) wants to stake you $74,000 @ 50/50 player/backer split. Once you accept…"
 */
export function stakeeBackerOfferHeroCopy(deal, slices = [], profilesById = {}) {
  const backerName = dealLeadBackerDisplayName(deal, profilesById) || 'A backer'
  const amount = fmtPoker$(Number(deal?.baseline_bankroll) || 0)
  const leadId = deal?.staker_user_id
  const slice =
    (leadId
      ? (slices || []).find((s) => String(s.staker_user_id || s.stakerUserId || '') === String(leadId))
      : null) ||
    (slices || []).find((s) => s.status !== 'declined') ||
    null
  const pricingMode = slice?.pricing_mode || slice?.pricingMode || 'profit_split'

  let termsPhrase = 'a profit split'
  if (pricingMode === 'markup') {
    const rate = formatTermsPct(slice?.markup_rate ?? slice?.markupRate)
    termsPhrase = `${rate}x markup`
  } else {
    const playerPct = Number(slice?.player_profit_pct ?? slice?.playerProfitPct)
    const backerPct = Number.isFinite(playerPct) ? 100 - playerPct : null
    if (Number.isFinite(playerPct) && Number.isFinite(backerPct)) {
      termsPhrase = `${formatTermsPct(playerPct)}/${formatTermsPct(backerPct)} player/backer split`
    }
  }

  return `${backerName} wants to stake you ${amount} @ ${termsPhrase}. Once you accept, this stake goes live.`
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
export function stakeeCanEditDealTerms(deal, slices = [], { hasProposal: _hasProposal = false } = {}) {
  // Allow re-edit while a counterparty proposal is pending (Accept / Decline / Offer new terms).
  if (!deal) return false
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

/** Backer-initiated stakes: player skips top-up/reduce sync; periodic/close settle still requires review. */
export function stakeeSkipsBackerCommitSync(deal, userId, commit = null) {
  if (!deal || !userId || deal.stakee_user_id !== userId) return false
  if (!deal.staker_user_id) return false
  if (commit) {
    const kind = commit.event_kind || commit.eventKind
    return kind !== 'periodic_settle' && kind !== 'close_settle'
  }
  return true
}

/** @param {string | null | undefined} kind */
export function isSettleCommitKind(kind) {
  return kind === 'periodic_settle' || kind === 'close_settle'
}

/** Short date for settle queue / Needs attn (e.g. Aug 5, 2026). */
export function formatPokerStableCommitDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Pending periodic/close settle commits on a deal, oldest first (commit queue order).
 * @returns {object[]}
 */
export function pendingSettleCommitsForDeal(commits, dealId) {
  if (!dealId) return []
  return (commits || [])
    .filter((row) => row.deal_id === dealId && isSettleCommitKind(row.event_kind))
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime()
      const tb = new Date(b.created_at || 0).getTime()
      return ta - tb
    })
}

/** Head of the settle Commit queue (oldest unsynced settle), or null. */
export function pendingSettleCommitForDeal(commits, dealId) {
  return pendingSettleCommitsForDeal(commits, dealId)[0] || null
}

/** Shown when Periodic settlement / Close stake are blocked pending Commit. */
export const SETTLE_BLOCKED_PENDING_COMMIT_MESSAGE =
  'Awaiting settlement · Commit the current settlement first.'

/** True when this viewer still owes a settle Commit on the deal. */
export function settleBlockedByPendingCommit(commits, dealId) {
  return pendingSettleCommitsForDeal(commits, dealId).length > 0
}

/** @deprecated Use pendingSettleCommitForDeal */
export function stakeePendingSettleCommitForDeal(commits, dealId) {
  return pendingSettleCommitForDeal(commits, dealId)
}

/**
 * Stakee Bankroll hero roll: hold pre-settle roll until the player commits a counterparty settle.
 * @param {object} args
 */
export function stakeeDisplayDealRoll({
  deal,
  userId,
  dealProfile,
  pendingSettleCommit = null,
  settlements = [],
  startingRollFallback = 0,
}) {
  const stored = dealProfile != null ? Number(dealProfile.overall_bankroll) || 0 : startingRollFallback
  if (!deal || !userId || deal.stakee_user_id !== userId || !pendingSettleCommit) {
    return stored
  }
  const settlement = (settlements || []).find((row) => row.id === pendingSettleCommit.ref_id)
  if (settlement?.roll_at_settle != null) {
    return Number(settlement.roll_at_settle) || 0
  }
  return stored
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

/**
 * Player Bankroll Terms icon → Manage sheet (full deal detail tabs are redundant on Bankroll).
 * Pending / proposal / revoked flows still use the Stake terms sheet.
 */
export function stakeeBankrollTermsOpensManageSheet(deal, { userId, hasProposal = false } = {}) {
  if (!deal || !userId || deal.stakee_user_id !== userId) return false
  if (hasProposal) return false
  if (stakeeBankrollShowsClosedCarouselCard(deal)) return false
  return deal.status === 'active'
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
