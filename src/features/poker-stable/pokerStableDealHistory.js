import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { computeDealSettlement, dealTypeLabel } from './pokerStableMath.js'
import { sliceCounterpartyDisplayName } from './pokerStableTerms.js'

/** @param {string[]} names */
function formatBackerList(names) {
  if (!names.length) return 'backers'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/**
 * @param {object} st
 * @param {object} deal
 * @param {object[]} settlementsForDeal
 */
function isCloseSettlement(st, deal, settlementsForDeal) {
  if (deal?.status !== 'settled' || !st?.id) return false
  const latest = [...(settlementsForDeal || [])]
    .filter((row) => row?.created_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  return latest?.id === st.id
}

/**
 * @param {object} args
 * @param {object} args.st
 * @param {object} args.deal
 * @param {object[]} [args.slices]
 * @param {object[]} [args.settlementsForDeal]
 * @param {boolean} [args.personal]
 */
function settlementHistoryEventFromRow({
  st,
  deal,
  slices = [],
  settlementsForDeal = [],
  personal = false,
}) {
  const profit = Number(st.profit_above_baseline) || 0
  const makeup = Number(st.makeup_at_settle) || 0
  const isClose = isCloseSettlement(st, deal, settlementsForDeal)
  const prefix = isClose ? 'Closed stake' : 'Periodic settle'
  const dealLabel = deal?.label?.trim() || dealTypeLabel(deal?.deal_type)

  let detail = ''
  if (personal) {
    const calc = computeDealSettlement(
      {
        ...deal,
        baseline_bankroll: st.baseline_at_settle,
        roll: st.roll_at_settle,
      },
      slices,
      Number(st.rakeback_total) || 0,
    )
    const credit = calc.player_net
    if (credit > 0.005) {
      detail = ` · +${fmtPoker$(credit)} to personal bankroll`
    } else if (makeup > 0.005) {
      detail = ` · ${fmtPoker$(makeup)} makeup cleared`
    } else if (profit > 0.005) {
      detail = ` · ${fmtPoker$(profit)} above baseline`
    } else if (profit < -0.005) {
      detail = ` · ${fmtPoker$(Math.abs(profit))} underwater`
    }
  } else if (makeup > 0.005) {
    detail = ` · ${fmtPoker$(makeup)} makeup cleared`
  } else if (profit > 0.005) {
    detail = ` · ${fmtPoker$(profit)} above baseline`
  } else if (profit < -0.005) {
    detail = ` · ${fmtPoker$(Math.abs(profit))} underwater`
  }

  const labelPart = personal ? ` · ${dealLabel}` : ''
  return {
    kind: isClose ? 'close' : 'settlement',
    text: `${prefix}${labelPart}${detail}`,
  }
}

/**
 * Settlement / close lines for personal bankroll session history (all deals).
 * @param {object} args
 * @param {Record<string, object>} [args.dealsById]
 * @param {Record<string, object[]>} [args.settlementsByDeal]
 * @param {Record<string, object[]>} [args.slicesByDeal]
 * @returns {{ id: string, kind: string, at: string, text: string }[]}
 */
export function buildPersonalSettlementHistoryEvents({
  dealsById = {},
  settlementsByDeal = {},
  slicesByDeal = {},
}) {
  /** @type {{ id: string, kind: string, at: string, text: string }[]} */
  const events = []

  for (const [dealId, settlements] of Object.entries(settlementsByDeal)) {
    const deal = dealsById[dealId]
    if (!deal || !settlements?.length) continue
    const slices = slicesByDeal[dealId] || []

    for (const st of settlements) {
      if (!st?.created_at) continue
      const { kind, text } = settlementHistoryEventFromRow({
        st,
        deal,
        slices,
        settlementsForDeal: settlements,
        personal: true,
      })
      events.push({
        id: `settle-${st.id}`,
        kind,
        at: st.created_at,
        text,
      })
    }
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

/**
 * Player-facing stake deal timeline lines for Bankroll session history.
 * @param {object} args
 * @param {object} args.deal
 * @param {object[]} [args.slices]
 * @param {Record<string, object>} [args.profilesById]
 * @param {object[]} [args.topups]
 * @param {object[]} [args.settlements]
 * @param {string} [args.playerLabel]
 * @returns {{ id: string, kind: string, at: string, text: string }[]}
 */
export function buildStakeDealHistoryEvents({
  deal,
  slices = [],
  profilesById = {},
  topups = [],
  settlements = [],
  playerLabel = 'You',
}) {
  if (!deal?.id) return []

  /** @type {{ id: string, kind: string, at: string, text: string }[]} */
  const events = []
  const orderedSlices = [...slices].sort(
    (a, b) => Number(a.slice_index ?? 0) - Number(b.slice_index ?? 0),
  )
  const backerNames = orderedSlices
    .filter((s) => s.status !== 'declined')
    .map((s) => sliceCounterpartyDisplayName(s, profilesById))

  if (deal.created_at && backerNames.length) {
    events.push({
      id: `offer-${deal.id}`,
      kind: 'offer',
      at: deal.created_at,
      text: `${playerLabel} offered stake to ${formatBackerList(backerNames)}`,
    })
  }

  const dealCreatedMs = deal.created_at ? new Date(deal.created_at).getTime() : 0

  for (const slice of orderedSlices) {
    const name = sliceCounterpartyDisplayName(slice, profilesById)
    const at = slice.responded_at || slice.created_at
    if (!at) continue

    if (slice.status === 'active' && slice.counterparty_kind === 'user') {
      const respondedMs = new Date(at).getTime()
      if (dealCreatedMs && respondedMs > dealCreatedMs + 1500) {
        events.push({
          id: `accept-${slice.id}`,
          kind: 'accept',
          at,
          text: `${name} accepted stake`,
        })
      }
    } else if (slice.status === 'declined') {
      events.push({
        id: `decline-${slice.id}`,
        kind: 'decline',
        at,
        text: `${name} declined stake`,
      })
    }
  }

  for (const topup of topups) {
    if (!topup?.created_at) continue
    const amt = Number(topup.amount)
    if (!Number.isFinite(amt) || amt <= 0) continue
    events.push({
      id: `topup-${topup.id}`,
      kind: 'topup',
      at: topup.created_at,
      text: `Re-up ${fmtPoker$(amt)}`,
    })
  }

  for (const st of settlements) {
    if (!st?.created_at) continue
    const { kind, text } = settlementHistoryEventFromRow({
      st,
      deal,
      slices,
      settlementsForDeal: settlements,
      personal: false,
    })
    events.push({
      id: `settle-${st.id}`,
      kind,
      at: st.created_at,
      text,
    })
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
