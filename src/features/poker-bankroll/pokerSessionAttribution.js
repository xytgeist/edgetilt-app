/**
 * Per-session stake attribution. See docs/poker-stable-spec.md § Bankroll & session attribution.
 */
import { pokerSessionWinLoss } from './pokerBankrollMath.js'
import { sessionSwapSettlementDelta } from './pokerTournamentSwapMath.js'
import { roundMoney, stableNum, sumSliceActionPct } from '../poker-stable/pokerStableMath.js'
import { sliceCounterpartyDisplayName } from '../poker-stable/pokerStableTerms.js'

/**
 * Personal play history: own sessions + merged stake sessions after close.
 * @param {object | null | undefined} session
 * @param {Record<string, object>} [dealsById]
 */
export function isPersonalHistorySession(session, dealsById = {}) {
  if (!session?.deal_id) return true
  return dealsById[session.deal_id]?.status === 'settled'
}

/**
 * Personal metrics (Option B): own sessions + on-stake + merged stake sessions.
 * @param {object | null | undefined} session
 * @param {Record<string, object>} [dealsById]
 */
export function isPersonalMetricSession(session, dealsById = {}) {
  if (!session?.deal_id) return true
  const status = dealsById[session.deal_id]?.status
  return status === 'active' || status === 'pending' || status === 'settled'
}

/**
 * Win/loss for hero stats, sparklines, and stake session card headlines.
 * Stake scope: gross table P/L only (swaps never hit stake roll).
 * Personal scope: player_net_value (stake attribution + swap overlay).
 *
 * @param {object | null | undefined} session
 * @param {object[]} swaps
 * @param {string} userId
 * @param {{ stakeScope?: boolean, deal?: object | null, slices?: object[] }} [opts]
 */
export function sessionMetricWinLoss(session, swaps, userId, opts = {}) {
  const gross = pokerSessionWinLoss(session)
  if (gross == null) return null
  if (opts.stakeScope) return gross

  const swapDelta = sessionSwapSettlementDelta(swaps, session.id, userId)
  if (session?.deal_id && opts.deal) {
    return playerNetSessionValue(session, opts.deal, opts.slices || [], swapDelta)
  }
  return roundMoney(gross + swapDelta)
}

/**
 * @param {object | null | undefined} session
 * @param {object[]} swaps
 * @param {string} userId
 * @param {{ stakeScope?: boolean, dealsById?: Record<string, object>, slicesByDeal?: Record<string, object[]> }} opts
 */
export function resolveSessionMetricWinLoss(session, swaps, userId, opts) {
  const deal =
    !opts.stakeScope && session?.deal_id ? opts.dealsById?.[session.deal_id] ?? null : null
  const slices = deal ? opts.slicesByDeal?.[session.deal_id] || [] : []
  return sessionMetricWinLoss(session, swaps, userId, {
    stakeScope: opts.stakeScope,
    deal,
    slices,
  })
}

/**
 * Player economic share of session gross under deal slice terms (excludes swaps).
 * Personal-scope sessions (no deal) return gross table P/L.
 *
 * @param {object | null | undefined} session
 * @param {object | null | undefined} deal
 * @param {object[]} [slices]
 */
export function playerStakeSessionValue(session, deal, slices = []) {
  const gross = pokerSessionWinLoss(session)
  if (gross == null) return null
  if (!session?.deal_id || !deal) return roundMoney(gross)

  const activeSlices = (slices || []).filter((s) => s.status === 'active')
  const soldPct = sumSliceActionPct(activeSlices)
  const unsoldPct = Math.max(0, 100 - soldPct)

  let playerTotal = 0
  if (unsoldPct > 0) {
    playerTotal += gross * (unsoldPct / 100)
  }

  for (const slice of activeSlices) {
    const actionPct = stableNum(slice.action_pct) / 100
    const grossOnSlice = gross * actionPct
    if (slice.pricing_mode === 'markup') {
      continue
    }
    const playerPct = stableNum(slice.player_profit_pct) / 100
    playerTotal += grossOnSlice * playerPct
  }

  return roundMoney(playerTotal)
}

/**
 * @param {object | null | undefined} session
 * @param {object | null | undefined} deal
 * @param {object[]} [slices]
 * @param {number} [swapDelta=0]
 */
export function playerNetSessionValue(session, deal, slices = [], swapDelta = 0) {
  const stakeValue = playerStakeSessionValue(session, deal, slices)
  if (stakeValue == null) return null
  return roundMoney(stakeValue + stableNum(swapDelta))
}

/**
 * @typedef {{ key: string, role: 'player' | 'backer' | 'stake_roll', label: string, detail?: string, amount: number, sliceId?: string }} SessionAttributionParty
 */

/**
 * Full party breakdown for session detail UI. Amounts sum to gross table P/L.
 *
 * @param {object | null | undefined} session
 * @param {object | null | undefined} deal
 * @param {object[]} [slices]
 * @param {Record<string, object>} [profilesById]
 * @param {number} [swapDelta=0]
 * @returns {{
 *   gross: number | null,
 *   playerStakeValue: number | null,
 *   playerNetValue: number | null,
 *   unsoldActionPct: number,
 *   onStake: boolean,
 *   parties: SessionAttributionParty[],
 * }}
 */
export function computeSessionAttribution(session, deal, slices = [], profilesById = {}, swapDelta = 0) {
  const gross = pokerSessionWinLoss(session)
  const onStake = Boolean(session?.deal_id && deal)

  if (gross == null) {
    return {
      gross: null,
      playerStakeValue: null,
      playerNetValue: null,
      unsoldActionPct: 100,
      onStake,
      parties: [],
    }
  }

  if (!onStake) {
    const playerStakeValue = roundMoney(gross)
    return {
      gross,
      playerStakeValue,
      playerNetValue: playerNetSessionValue(session, deal, slices, swapDelta),
      unsoldActionPct: 100,
      onStake: false,
      parties: [{ key: 'player', role: 'player', label: 'You', amount: playerStakeValue }],
    }
  }

  const activeSlices = (slices || []).filter((s) => s.status === 'active')
  const soldPct = sumSliceActionPct(activeSlices)
  const unsoldPct = Math.max(0, 100 - soldPct)

  /** @type {SessionAttributionParty[]} */
  const parties = [
    {
      key: 'stake_roll',
      role: 'stake_roll',
      label: 'Stake roll',
      detail: 'Gross table result on this deal',
      amount: roundMoney(gross),
    },
  ]

  let playerTotal = 0
  if (unsoldPct > 0.005) {
    const amt = roundMoney(gross * (unsoldPct / 100))
    playerTotal += amt
  }

  for (const slice of activeSlices) {
    const actionPct = stableNum(slice.action_pct)
    const grossOnSlice = roundMoney(gross * (actionPct / 100))
    const name = sliceCounterpartyDisplayName(slice, profilesById)
    let playerFromSlice = 0
    let backerFromSlice = grossOnSlice

    if (slice.pricing_mode === 'markup') {
      playerFromSlice = 0
      backerFromSlice = grossOnSlice
    } else {
      const playerPct = stableNum(slice.player_profit_pct)
      playerFromSlice = roundMoney(grossOnSlice * (playerPct / 100))
      backerFromSlice = roundMoney(grossOnSlice * ((100 - playerPct) / 100))
    }

    playerTotal += playerFromSlice

    if (Math.abs(backerFromSlice) >= 0.005) {
      const detail =
        slice.pricing_mode === 'markup'
          ? `${actionPct}%`
          : `${actionPct}% · ${slice.player_profit_pct ?? '?'}% player split`
      parties.push({
        key: slice.id || name,
        role: 'backer',
        label: name,
        detail,
        amount: backerFromSlice,
        sliceId: slice.id,
      })
    }
  }

  playerTotal = roundMoney(playerTotal)
  parties.splice(1, 0, {
    key: 'player',
    role: 'player',
    label: 'Your share',
    detail:
      unsoldPct > 0.005 && soldPct > 0.005
        ? `${roundMoney(unsoldPct, 1)}% unsold + slice terms`
        : unsoldPct > 0.005
          ? `${roundMoney(unsoldPct, 1)}% unsold action`
          : 'Per backer slice terms',
    amount: playerTotal,
  })

  return {
    gross,
    playerStakeValue: playerTotal,
    playerNetValue: playerNetSessionValue(session, deal, slices, swapDelta),
    unsoldActionPct: roundMoney(unsoldPct, 1),
    onStake: true,
    parties,
  }
}

function wlTone(amount) {
  if (amount == null || Math.abs(amount) < 0.005) return 'text-zinc-400'
  return amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
}

/** @param {number | null | undefined} amount */
export function sessionAttributionAmountClass(amount) {
  return wlTone(amount)
}
