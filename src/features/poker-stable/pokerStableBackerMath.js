import { dealTypeLabel, roundMoney, stakeDealIsLiveForStakee } from './pokerStableMath.js'
import { pokerSessionWinLoss } from '../poker-bankroll/pokerBankrollMath.js'

/**
 * Backer's slice capital is deployed (debited from backing bankroll), not pending hold.
 * Same gate as player Bankroll: stake live = player accepted + at least one backer accepted.
 * @param {object} deal
 * @param {object} slice
 * @param {object[]} [slices]
 */
export function backerSliceCapitalIsDeployed(deal, slice, slices = []) {
  if (!deal || !slice || slice.status !== 'active') return false
  return stakeDealIsLiveForStakee(deal, slices)
}

function isBackerSettleCommitKind(kind) {
  return kind === 'close_settle' || kind === 'periodic_settle'
}

/**
 * Deal ids where this viewer still owes a periodic/close Commit (books not updated yet).
 * @param {object[]} [pendingCommits]
 * @returns {Set<string>}
 */
export function pendingSettleDealIdSet(pendingCommits = []) {
  /** @type {Set<string>} */
  const ids = new Set()
  for (const row of pendingCommits || []) {
    if (!row?.deal_id) continue
    if (!isBackerSettleCommitKind(row.event_kind)) continue
    ids.add(String(row.deal_id))
  }
  return ids
}

/** Oldest pending settle Commit for a deal (from the viewer's pending list). */
function oldestPendingSettleCommitForDeal(pendingCommits, dealId) {
  if (!dealId) return null
  const rows = (pendingCommits || [])
    .filter((row) => String(row.deal_id) === String(dealId) && isBackerSettleCommitKind(row.event_kind))
    .slice()
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
  return rows[0] || null
}

/**
 * Capital still out on a slice until the backer Commits a close/periodic settle.
 * Live stakes use the normal deploy gate; settled deals stay open while Commit is pending.
 * @param {object} deal
 * @param {object} slice
 * @param {object[]} [slices]
 * @param {Set<string> | null} [pendingSettleDealIds]
 */
export function backerSliceCapitalStillOpen(deal, slice, slices = [], pendingSettleDealIds = null) {
  if (backerSliceCapitalIsDeployed(deal, slice, slices)) return true
  if (!deal?.id || !slice || slice.status !== 'active') return false
  if (!pendingSettleDealIds?.has(String(deal.id))) return false
  return deal.status === 'settled' || deal.status === 'closed'
}

/**
 * Deal roll for portfolio MTM while a settle Commit is pending.
 * apply_settlement resets deal bankroll to baseline immediately … keep roll_at_settle until Commit.
 * @param {object} args
 */
export function backerDisplayDealRollProfile({
  deal,
  bankrollProfile,
  pendingCommits = [],
  settlements = [],
}) {
  const pending = oldestPendingSettleCommitForDeal(pendingCommits, deal?.id)
  if (pending && (deal?.status === 'settled' || deal?.status === 'closed')) {
    const settlement = (settlements || []).find((row) => row.id === pending.ref_id)
    if (settlement?.roll_at_settle != null) {
      return { ...(bankrollProfile || {}), overall_bankroll: Number(settlement.roll_at_settle) || 0 }
    }
  }
  return bankrollProfile
}

/**
 * Backer's slice capital is reserved as a pending hold (not yet debited).
 * Unaccepted invites (pending slices) do not reserve funds … Create Stake /
 * Accept tops up any liquid shortfall then commits capital. Hold applies after
 * Accept while the deal is not live yet (e.g. waiting on the other party).
 * @param {object} deal
 * @param {object} slice
 * @param {object[]} [slices]
 */
export function backerSliceCapitalIsPendingHold(deal, slice, slices = []) {
  if (!deal || !slice || slice.status === 'declined' || slice.status === 'cancelled') return false
  // Received invites stay off bankroll until Accept (no invented pending hold).
  if (slice.status === 'pending') return false
  if (slice.status === 'active' && !stakeDealIsLiveForStakee(deal, slices)) return true
  return false
}

/**
 * Backer's face stake capital for one slice (baseline × action %).
 * Portfolio / MTM basis … does not include tournament markup fee.
 * @param {object} deal
 * @param {object} slice
 */
export function backerSliceAllocatedCapital(deal, slice) {
  const baseline = Number(deal?.baseline_bankroll) || 0
  const pct = Number(slice?.action_pct) || 0
  return roundMoney(baseline * (pct / 100))
}

/**
 * Amount the backer pays / has reserved for a slice (face × markup for tournament markup).
 * @param {object} deal
 * @param {object} slice
 */
export function backerSlicePaidCapital(deal, slice) {
  const face = backerSliceAllocatedCapital(deal, slice)
  const mode = slice?.pricing_mode || slice?.pricingMode
  if (deal?.deal_type !== 'tournament_package' || mode !== 'markup') return face
  const rate = Number(deal?.markup_rate ?? slice?.markup_rate ?? slice?.markupRate)
  if (!Number.isFinite(rate) || rate < 1) return face
  return roundMoney(face * rate)
}

/** Markup fee portion of paid capital (paid − face). */
export function backerSliceMarkupFee(deal, slice) {
  return roundMoney(backerSlicePaidCapital(deal, slice) - backerSliceAllocatedCapital(deal, slice))
}

/**
 * Total buy-in + re-entry + add-on on stake sessions (markup basis).
 * @param {object[]} [sessions]
 */
export function dealTournamentBuyins(sessions = []) {
  let total = 0
  for (const s of sessions || []) {
    total = roundMoney(
      total +
        (Number(s?.buy_in) || 0) +
        (Number(s?.rebuy_amount) || 0) +
        (Number(s?.addon_amount) || 0),
    )
  }
  return total
}

/**
 * Prepaid markup vs buy-in-earned markup for a tournament slice.
 * @param {object} deal
 * @param {object} slice
 * @param {number} buyins
 * @returns {{ fee: number, applied: number, unused: number }}
 */
export function backerSliceMarkupApplied(deal, slice, buyins = 0) {
  const fee = Math.max(0, backerSliceMarkupFee(deal, slice))
  const baseline = Number(deal?.baseline_bankroll ?? deal?.baselineBankroll) || 0
  if (fee <= 0.005 || baseline <= 0.005 || deal?.deal_type !== 'tournament_package') {
    return { fee, applied: fee, unused: 0 }
  }
  const used = Math.min(Math.max(0, Number(buyins) || 0), baseline)
  const applied = roundMoney(fee * (used / baseline))
  const unused = roundMoney(Math.max(0, fee - applied))
  return { fee, applied, unused }
}

/**
 * Sum of unused prepaid markup across active slices (player claw / backer refund total).
 * @param {object} deal
 * @param {object[]} [slices]
 * @param {number} [buyins]
 */
export function dealUnusedMarkupTotal(deal, slices = [], buyins = 0) {
  let total = 0
  for (const slice of slices || []) {
    if (slice?.status && slice.status !== 'active') continue
    const { unused } = backerSliceMarkupApplied(deal, slice, buyins)
    total = roundMoney(total + unused)
  }
  return total
}

/** Capital-flow ledger kinds that change the backing pool for TWR / reconstructed liquid. */
export const BACKER_CAPITAL_ADJUSTMENT_KINDS = new Set([
  'deposit',
  'withdraw',
  'set_balance',
  'auto_top_up',
  'seed_reverse',
  'manual',
])

/**
 * True when a ledger row is a capital top-up / withdrawal (not stake deploy / settle / close).
 * Legacy rows without `kind` count as capital (`manual`).
 * @param {object} row
 */
export function isBackerCapitalAdjustment(row) {
  const kind = String(row?.kind || 'manual').trim() || 'manual'
  return BACKER_CAPITAL_ADJUSTMENT_KINDS.has(kind)
}

/**
 * Sum of capital Edit → Adjust / auto top-up rows (deposits +, withdrawals −).
 * Excludes stake_deploy, close_return, settle, markup_refund, etc.
 * @param {object[]} adjustments
 */
export function computeBackerManualAdjustmentTotal(adjustments = []) {
  let total = 0
  for (const row of adjustments) {
    if (!isBackerCapitalAdjustment(row)) continue
    total = roundMoney(total + (Number(row?.amount) || 0))
  }
  return total
}

/**
 * Capital deployed on accepted (active) stakes only — baseline × action %.
 * Pending offers do not reduce backing bankroll (they use pendingHold instead).
 */
export function computeBackerActiveAllocatedCapital({
  deals = [],
  slicesByDeal = {},
  userId,
  pendingSettleDealIds = null,
}) {
  if (!userId) return 0
  const pendingIds = pendingSettleDealIds || new Set()
  let total = 0
  for (const deal of deals) {
    const awaitingSettleCommit = pendingIds.has(String(deal.id))
    if (
      deal.status !== 'active' &&
      deal.status !== 'pending' &&
      !(awaitingSettleCommit && (deal.status === 'settled' || deal.status === 'closed'))
    ) {
      continue
    }
    const dealSlices = slicesByDeal[deal.id] || []
    const slices = dealSlices.filter(
      (s) => s.staker_user_id === userId && s.status !== 'declined',
    )
    for (const slice of slices) {
      if (!backerSliceCapitalStillOpen(deal, slice, dealSlices, pendingIds)) continue
      total = roundMoney(total + backerSliceAllocatedCapital(deal, slice))
    }
  }
  return total
}

/**
 * Hero backing bankroll: manual deposits/withdrawals ± settlements − open active stakes.
 * Pending stakes are excluded (shown as a separate pending-hold annotation).
 */
export function computeBackerBackingBankroll({
  adjustments = [],
  realizedBackingPl = 0,
  activeAllocatedCapital = 0,
  storedBankrollBalance = 0,
  pendingHold = 0,
}) {
  const capitalRows = (adjustments || []).filter(isBackerCapitalAdjustment)
  const manual = computeBackerManualAdjustmentTotal(adjustments)
  if (capitalRows.length) {
    return roundMoney(manual + roundMoney(realizedBackingPl) - roundMoney(activeAllocatedCapital))
  }
  // Stored balance may still reflect legacy pending allocation debits; pending holds are
  // annotated separately on the hero and must not reduce backing bankroll or portfolio.
  const stored = roundMoney(storedBankrollBalance)
  const hold = roundMoney(pendingHold)
  if (hold > 0 && stored < hold) {
    // Legacy rows may still store pending allocation as a bankroll debit.
    return roundMoney(stored + hold)
  }
  return stored
}

/**
 * Capital reserved until the stake is live (player + at least one backer accepted).
 * Sum of baseline × action % for the viewer's accepted-but-not-live slices.
 * Pending invite slices are excluded (no bankroll reservation until Accept).
 */
export function computeBackerPendingHold({ deals = [], slicesByDeal = {}, userId }) {
  if (!userId) return 0
  let pendingHold = 0
  for (const deal of deals) {
    if (!['pending', 'active'].includes(deal.status)) continue
    const dealSlices = slicesByDeal[deal.id] || []
    const slices = dealSlices.filter(
      (s) => s.staker_user_id === userId && s.status !== 'declined',
    )
    for (const slice of slices) {
      if (!backerSliceCapitalIsPendingHold(deal, slice, dealSlices)) continue
      // Reserve what will actually leave backing bankroll (includes markup premium).
      pendingHold = roundMoney(pendingHold + backerSlicePaidCapital(deal, slice))
    }
  }
  return pendingHold
}

/**
 * Liquid backing bankroll minus pending stake holds (for new Create Stake capacity).
 */
export function computeBackerAvailableBankroll(liquidBankroll, pendingHold) {
  return roundMoney(roundMoney(liquidBankroll) - roundMoney(pendingHold))
}

/**
 * Mark-to-market stake value for backer's slice (roll × action % share of deal).
 * @param {object} deal
 * @param {object} slice
 * @param {object | null | undefined} dealRoll profile row
 * @param {object[]} [sessions]
 */
/** Session impact on stake roll: active sessions debit costs immediately. */
function dealSessionRollDelta(session) {
  if (!session) return 0
  const buyIn = Number(session.buy_in) || 0
  const rebuy = Number(session.rebuy_amount) || 0
  const addon = Number(session.addon_amount) || 0
  const cost = buyIn + rebuy + addon
  if (session.status === 'active') return roundMoney(-cost)
  const wl = pokerSessionWinLoss(session)
  return wl != null ? roundMoney(wl) : 0
}

export function resolveDealOverallRoll(deal, dealRoll, sessions = []) {
  if (dealRoll != null && Number.isFinite(Number(dealRoll.overall_bankroll))) {
    return Number(dealRoll.overall_bankroll)
  }
  const base = Number(deal?.starting_roll) || Number(deal?.baseline_bankroll) || 0
  let sessionPl = 0
  for (const session of sessions) {
    if (session.deal_id !== deal?.id) continue
    sessionPl = roundMoney(sessionPl + dealSessionRollDelta(session))
  }
  return roundMoney(base + sessionPl)
}

export function enrichBankrollByDealFromSessions(deals = [], bankrollByDeal = {}, sessions = []) {
  const out = { ...(bankrollByDeal || {}) }
  for (const deal of deals) {
    const existing = out[deal.id]
    if (existing != null && Number.isFinite(Number(existing.overall_bankroll))) continue
    out[deal.id] = {
      deal_id: deal.id,
      overall_bankroll: resolveDealOverallRoll(deal, null, sessions),
    }
  }
  return out
}

function backerSliceBackerProfitPct(slice) {
  const playerPct = Number(slice?.player_profit_pct) || 50
  return slice?.pricing_mode === 'markup' ? 100 : 100 - playerPct
}

function backerSliceActionFraction(slice) {
  return (Number(slice?.action_pct) || 0) / 100
}

/**
 * Deal roll after completed sessions through `throughSessionId` (inclusive), chronological.
 * @param {object} deal
 * @param {object[]} sessions
 * @param {string} [throughSessionId]
 */
function resolveDealRollThroughSession(deal, sessions = [], throughSessionId = null) {
  const base = Number(deal?.starting_roll) || Number(deal?.baseline_bankroll) || 0
  const completed = (sessions || [])
    .filter((s) => s.deal_id === deal?.id && s.status !== 'active')
    .sort(
      (a, b) =>
        new Date(a.end_at || a.updated_at || a.start_at || 0).getTime() -
        new Date(b.end_at || b.updated_at || b.start_at || 0).getTime(),
    )
  let roll = base
  for (const session of completed) {
    const wl = pokerSessionWinLoss(session)
    if (wl != null) roll = roundMoney(roll + wl)
    if (throughSessionId && session.id === throughSessionId) break
  }
  return roll
}

/**
 * Backer's economic P/L on the stake vs baseline (signed), after action % and profit split.
 * Underwater (roll ≤ baseline): backers bear the full action-weighted drawdown; player is in makeup.
 * Above baseline: profit split applies to profit above baseline only.
 */
export function backerSliceEconomicPlShare(deal, slice, dealRoll, sessions = []) {
  const baseline = Number(deal?.baseline_bankroll) || 0
  const roll = resolveDealOverallRoll(deal, dealRoll, sessions)
  const actionFraction = backerSliceActionFraction(slice)
  const delta = roundMoney(roll - baseline)

  if (delta <= 0) {
    return roundMoney(delta * actionFraction)
  }

  const backerProfitPct = backerSliceBackerProfitPct(slice)
  return roundMoney(delta * actionFraction * (backerProfitPct / 100))
}

/**
 * Mark-to-market value of backer's slice: deployed capital + economic P/L vs baseline.
 */
export function backerSliceStakeValue(deal, slice, dealRoll, sessions = []) {
  return roundMoney(
    backerSliceAllocatedCapital(deal, slice) +
      backerSliceEconomicPlShare(deal, slice, dealRoll, sessions),
  )
}

/**
 * Backer's gross share of one completed stake session (session W/L × action % only).
 * @param {object} deal
 * @param {object} slice
 * @param {object} session
 */
export function backerSliceSessionShare(deal, slice, session) {
  const wl = pokerSessionWinLoss(session)
  if (wl == null) return 0
  const pct = Number(slice?.action_pct) || 0
  return roundMoney(wl * (pct / 100))
}

/**
 * Backer's economic share of one completed stake session.
 * While roll is at or below baseline, backers take the full action-weighted session W/L (makeup).
 */
export function backerSliceSessionEconomicShare(deal, slice, session, sessions = []) {
  const wl = pokerSessionWinLoss(session)
  if (wl == null) return 0
  const actionFraction = backerSliceActionFraction(slice)
  const baseline = Number(deal?.baseline_bankroll) || 0
  const rollAfter = resolveDealRollThroughSession(deal, sessions, session?.id)

  if (rollAfter <= baseline) {
    return roundMoney(wl * actionFraction)
  }

  const backerProfitPct = backerSliceBackerProfitPct(slice)
  return roundMoney(wl * actionFraction * (backerProfitPct / 100))
}

/**
 * Backer's unsettled upside share of profit above baseline on an active deal (floored at 0).
 */
export function backerSliceEstimatedShare(deal, slice, dealRoll, sessions = []) {
  return roundMoney(Math.max(0, backerSliceEconomicPlShare(deal, slice, dealRoll, sessions)))
}

export function viewerActiveBackingSlice(dealId, slicesByDeal, userId) {
  return (slicesByDeal[dealId] || []).find(
    (s) => s.staker_user_id === userId && s.status === 'active',
  )
}

function viewerBackingSlice(dealId, slicesByDeal, userId) {
  return viewerActiveBackingSlice(dealId, slicesByDeal, userId)
}

function formatTrendLabel(iso) {
  if (!iso) return 'n/a'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'n/a'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Portfolio + per-horse cumulative session share (active + closed stakes).
 * Session performance only ... bankroll adjustments do not affect this series.
 * Only the viewer's active slices count (pending invites excluded).
 */
export function computeBackerPortfolioTrendChart({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  userId,
}) {
  const deals = [...horseDeals]
  /** @type {Record<string, number>} */
  const perfByDeal = {}
  /** @type {Record<string, number[]>} */
  const horseSeries = {}
  for (const deal of deals) {
    perfByDeal[deal.id] = 0
    horseSeries[deal.id] = [0]
  }

  const events = []
  for (const deal of deals) {
    const slice = viewerBackingSlice(deal.id, slicesByDeal, userId)
    if (!slice) continue
    for (const session of sessions) {
      if (session.deal_id !== deal.id) continue
      events.push({
        deal,
        slice,
        session,
        t: new Date(session.start_at || session.created_at).getTime(),
      })
    }
  }
  events.sort((a, b) => a.t - b.t)

  const labels = ['Start']
  const portfolio = [0]

  for (const ev of events) {
    const share = backerSliceSessionEconomicShare(ev.deal, ev.slice, ev.session, sessions)
    perfByDeal[ev.deal.id] = roundMoney(perfByDeal[ev.deal.id] + share)
    let port = 0
    for (const deal of deals) {
      port = roundMoney(port + (perfByDeal[deal.id] || 0))
    }
    labels.push(formatTrendLabel(ev.session.start_at || ev.session.created_at))
    portfolio.push(port)
    for (const deal of deals) {
      horseSeries[deal.id].push(perfByDeal[deal.id] || 0)
    }
  }

  return { labels, portfolio, horseSeries, deals }
}

/**
 * Total cumulative economic session share (last point on portfolio trend).
 */
export function computeBackerSessionShareTotal({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  userId,
}) {
  const { portfolio } = computeBackerPortfolioTrendChart({
    horseDeals,
    sessions,
    slicesByDeal,
    userId,
  })
  if (!portfolio?.length) return 0
  return roundMoney(portfolio[portfolio.length - 1])
}

/**
 * Unrealized horse performance P/L ÷ current capital at risk.
 * @returns {number | null} percent, or null when at risk is zero
 */
export function computeBackerAtRiskReturnPct(unrealizedPerformancePl, capitalAtRisk) {
  const atRisk = roundMoney(capitalAtRisk)
  if (atRisk <= 0) return null
  return roundMoney((roundMoney(unrealizedPerformancePl) / atRisk) * 100)
}

/**
 * Time-weighted return on manual backing pool (Edit → Adjust bankroll boundaries).
 * Numerator: session share $ in each sub-period. Denominator: manual pool at period start.
 * @returns {number | null} percent, or null when not computable
 */
export function computeBackerTwrPct({
  horseDeals = [],
  sessions = [],
  slicesByDeal = {},
  userId,
  adjustments = [],
  liquidBankroll = 0,
  realizedBackingPl = 0,
}) {
  /** @type {{ t: number, kind: 'session', share: number }[]} */
  const sessionEvents = []
  for (const deal of horseDeals) {
    const slice = viewerBackingSlice(deal.id, slicesByDeal, userId)
    if (!slice) continue
    for (const session of sessions) {
      if (session.deal_id !== deal.id) continue
      const t = new Date(session.start_at || session.created_at).getTime()
      if (Number.isNaN(t)) continue
      sessionEvents.push({
        t,
        kind: 'session',
        share: backerSliceSessionEconomicShare(deal, slice, session, sessions),
      })
    }
  }

  /** @type {{ t: number, kind: 'adjust', amount: number }[]} */
  const adjustEvents = (adjustments || [])
    .filter(isBackerCapitalAdjustment)
    .map((row) => ({
      t: new Date(row.occurred_at || row.created_at).getTime(),
      kind: 'adjust',
      amount: roundMoney(row.amount),
    }))
    .filter((ev) => !Number.isNaN(ev.t) && ev.amount !== 0)

  const events = [...sessionEvents, ...adjustEvents].sort((a, b) => a.t - b.t)
  if (!events.length) return null

  const openingManualPool = roundMoney(
    Math.max(0, roundMoney(liquidBankroll) - roundMoney(realizedBackingPl)),
  )

  let manualPool = 0
  let periodSessionPl = 0
  let twrFactor = 1
  let sawAdjust = adjustEvents.length > 0
  let closedThroughFirstAdjust = false

  function closePeriod() {
    let pool = manualPool
    if (pool <= 0 && periodSessionPl !== 0 && !closedThroughFirstAdjust) {
      pool = openingManualPool
    }
    if (pool > 0 && periodSessionPl !== 0) {
      twrFactor *= 1 + periodSessionPl / pool
    }
    periodSessionPl = 0
  }

  for (const ev of events) {
    if (ev.kind === 'session') {
      periodSessionPl = roundMoney(periodSessionPl + ev.share)
      continue
    }
    closePeriod()
    closedThroughFirstAdjust = true
    manualPool = roundMoney(manualPool + ev.amount)
    if (manualPool < 0) manualPool = 0
  }

  closePeriod()

  if (!sawAdjust) {
    const estimatedManualPool = roundMoney(
      Math.max(0, roundMoney(liquidBankroll) - roundMoney(realizedBackingPl)),
    )
    const totalSessionPl = computeBackerSessionShareTotal({
      horseDeals,
      sessions,
      slicesByDeal,
      userId,
    })
    if (estimatedManualPool <= 0) return null
    return roundMoney((totalSessionPl / estimatedManualPool) * 100)
  }

  if (twrFactor === 1 && periodSessionPl === 0) {
    return 0
  }

  return roundMoney((twrFactor - 1) * 100)
}

/**
 * @param {object} args
 * @param {object[]} args.deals
 * @param {Record<string, object[]>} args.slicesByDeal
 * @param {string} args.userId
 * @param {Record<string, object>} args.bankrollByDeal
 * @param {number} args.storedBankrollBalance
 * @param {number} [args.realizedPl]
 * @param {object[]} [args.adjustments]
 * @param {object[]} [args.sessions]
 */
export function computeBackerPortfolioMetrics({
  deals,
  slicesByDeal,
  userId,
  bankrollByDeal,
  storedBankrollBalance,
  liquidBankroll,
  realizedPl = 0,
  adjustments = [],
  sessions = [],
  pendingCommits = [],
  settlementsByDeal = {},
}) {
  let capitalAtRisk = 0
  let stakeValueMtm = 0
  let rollExposure = 0
  let activeHorseCount = 0
  let pendingCommitCount = 0

  const pendingSettleDealIds = pendingSettleDealIdSet(pendingCommits)
  const pendingHold = computeBackerPendingHold({ deals, slicesByDeal, userId })
  const activeAllocatedCapital = computeBackerActiveAllocatedCapital({
    deals,
    slicesByDeal,
    userId,
    pendingSettleDealIds,
  })
  const backingBankroll = computeBackerBackingBankroll({
    adjustments,
    realizedBackingPl: realizedPl,
    activeAllocatedCapital,
    storedBankrollBalance: storedBankrollBalance ?? liquidBankroll ?? 0,
    pendingHold,
  })

  for (const deal of deals) {
    const awaitingSettleCommit = pendingSettleDealIds.has(String(deal.id))
    if (
      !['active', 'pending'].includes(deal.status) &&
      !(awaitingSettleCommit && (deal.status === 'settled' || deal.status === 'closed'))
    ) {
      continue
    }

    const dealSlices = slicesByDeal[deal.id] || []
    const slices = dealSlices.filter(
      (s) => s.staker_user_id === userId && s.counterparty_kind === 'user',
    )
    if (!slices.length) continue

    const roll = backerDisplayDealRollProfile({
      deal,
      bankrollProfile: bankrollByDeal[deal.id],
      pendingCommits,
      settlements: settlementsByDeal[deal.id] || [],
    })

    for (const slice of slices) {
      if (slice.status !== 'active' && slice.status !== 'pending') continue

      if (backerSliceCapitalStillOpen(deal, slice, dealSlices, pendingSettleDealIds)) {
        // At-risk basis includes markup fee; stake MTM stays on face capital.
        capitalAtRisk = roundMoney(capitalAtRisk + backerSlicePaidCapital(deal, slice))
        activeHorseCount += 1
        stakeValueMtm = roundMoney(
          stakeValueMtm + backerSliceStakeValue(deal, slice, roll, sessions),
        )
        rollExposure = roundMoney(rollExposure + resolveDealOverallRoll(deal, roll, sessions))
      }

      if (slice.status === 'pending') pendingCommitCount += 1
    }
  }

  const portfolioValue = roundMoney(Number(backingBankroll) + stakeValueMtm)

  return {
    liquidBankroll: backingBankroll,
    portfolioValue,
    capitalAtRisk,
    stakeValueMtm,
    rollExposure,
    activeHorseCount,
    pendingCommitCount,
    pendingHold,
    activeAllocatedCapital,
    availableBankroll: computeBackerAvailableBankroll(backingBankroll, pendingHold),
    realizedBackingPl: roundMoney(realizedPl),
  }
}

/**
 * Portfolio hero metrics including TWR and at-risk return (requires sessions + adjustments).
 */
export function computeBackerPortfolioPerformanceMetrics({
  deals,
  slicesByDeal,
  userId,
  bankrollByDeal,
  storedBankrollBalance,
  liquidBankroll,
  realizedPl = 0,
  horseDeals = [],
  sessions = [],
  adjustments = [],
  pendingCommits = [],
  settlementsByDeal = {},
}) {
  const base = computeBackerPortfolioMetrics({
    deals,
    slicesByDeal,
    userId,
    bankrollByDeal,
    storedBankrollBalance: storedBankrollBalance ?? liquidBankroll ?? 0,
    realizedPl,
    adjustments,
    sessions,
    pendingCommits,
    settlementsByDeal,
  })

  const sessionShareTotal = computeBackerSessionShareTotal({
    horseDeals,
    sessions,
    slicesByDeal,
    userId,
  })

  return {
    ...base,
    sessionShareTotal,
    atRiskReturnPct: computeBackerAtRiskReturnPct(
      roundMoney(base.stakeValueMtm - base.capitalAtRisk),
      base.capitalAtRisk,
    ),
    twrPct: computeBackerTwrPct({
      horseDeals,
      sessions,
      slicesByDeal,
      userId,
      adjustments,
      liquidBankroll: base.liquidBankroll,
      realizedBackingPl: realizedPl,
    }),
  }
}

/**
 * Active + pending deals for horse carousel; closed until backer archives, then history.
 */
export function backerViewerSlices(deal, slices = [], userId) {
  return (slices || []).filter((s) => s.staker_user_id === userId && s.status !== 'declined')
}

/** Viewer slice rows that count for closed-deal archive state (includes declined on terminal deals). */
export function backerStableArchiveSlices(deal, slices = [], userId) {
  if (!userId) return []
  const terminal = ['settled', 'closed', 'declined', 'revoked'].includes(deal?.status)
  return (slices || []).filter((s) => {
    if (s.staker_user_id !== userId) return false
    if (terminal) return true
    return s.status !== 'declined'
  })
}

/** True when the backer soft-deleted this closed stake from Stable history. */
export function backerStableDealIsHidden(deal, slices = [], userId) {
  if (!deal?.id || !userId) return false
  const mine = backerStableArchiveSlices(deal, slices, userId)
  if (!mine.length) return false
  return mine.every((s) => Boolean(s.stable_hidden_at))
}

/** Backer Stable carousel keeps closed stakes until manually archived (slice-level). */
export function backerStableShowsClosedCarouselCard(deal, slices = [], userId) {
  if (!deal?.id || !userId) return false
  if (!['settled', 'closed', 'declined', 'revoked'].includes(deal.status)) return false
  // Backer declined a player-initiated offer ... card should disappear for the decliner.
  if (deal.status === 'declined' && !deal.staker_user_id) return false
  if (backerStableDealIsHidden(deal, slices, userId)) return false
  const mine = backerStableArchiveSlices(deal, slices, userId)
  if (!mine.length && deal.staker_user_id !== userId) return false
  if (!mine.length) return deal.staker_user_id === userId
  return mine.some((s) => !s.stable_archived_at)
}

/** Disambiguate duplicate stake labels (e.g. repeated test deals) with created date. */
export function backerStableDealDisplayLabel(deal, deals = []) {
  const base = deal?.label?.trim() || dealTypeLabel(deal?.deal_type) || 'Cash backing'
  const normalized = base.toLowerCase()
  const dupes = (deals || []).filter((row) => {
    const other = row?.label?.trim() || dealTypeLabel(row?.deal_type) || 'Cash backing'
    return other.toLowerCase() === normalized
  })
  if (dupes.length <= 1) return base
  const createdAt = deal?.created_at
  if (!createdAt) return base
  const stamp = new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `${base} · ${stamp}`
}

export function partitionBackerDeals(deals, slicesByDeal, userId) {
  /** @type {object[]} */
  const active = []
  /** @type {object[]} */
  const history = []

  for (const deal of deals) {
    const dealSlices = slicesByDeal[deal.id] || []
    const mySlices = backerViewerSlices(deal, dealSlices, userId)
    if (!mySlices.length && deal.staker_user_id !== userId) continue

    if (['active', 'pending'].includes(deal.status)) {
      active.push(deal)
      continue
    }

    if (['settled', 'closed', 'declined', 'revoked'].includes(deal.status)) {
      if (backerStableDealIsHidden(deal, dealSlices, userId)) continue
      if (backerStableShowsClosedCarouselCard(deal, dealSlices, userId)) {
        active.push(deal)
      } else {
        history.push(deal)
      }
    }
  }

  active.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  history.sort((a, b) => String(b.settled_at || b.updated_at || '').localeCompare(String(a.settled_at || a.updated_at || '')))

  return { activeDeals: active, historyDeals: history }
}
