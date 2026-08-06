import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { backerSliceSessionEconomicShare } from './pokerStableBackerMath.js'
import { isBackerInitiatedBackingDeal } from './pokerStableApi.js'
import {
  computeDealSettlement,
  computeSliceSettleShares,
  dealTypeLabel,
  roundMoney,
} from './pokerStableMath.js'
import {
  dealLeadBackerDisplayName,
  dealStakeeDisplayName,
  sliceCounterpartyDisplayName,
} from './pokerStableTerms.js'

/**
 * Personal bankroll credit from one settle/close row (matches settle RPC: credit only when profit above baseline).
 * @param {object} st
 * @param {object} deal
 * @param {object[]} [slices]
 */
export function settlementPlayerPersonalCredit(st, deal, slices = []) {
  const profit = Number(st?.profit_above_baseline) || 0
  if (profit <= 0.005) return 0
  const calc = computeDealSettlement(
    {
      ...deal,
      baseline_bankroll: st.baseline_at_settle,
      roll: st.roll_at_settle,
    },
    slices,
    Number(st.rakeback_total) || 0,
  )
  return calc.player_net
}

/**
 * Total personal bankroll delta from every settle event on an archived stake (periodic + close).
 * @param {object} args
 * @param {object} args.deal
 * @param {object[]} [args.slices]
 * @param {object[]} [args.settlements]
 */
export function archivedStakePersonalBankrollNet({ deal, slices = [], settlements = [] }) {
  return archivedStakePersonalBankrollBreakdown({ deal, slices, settlements }).total
}

/**
 * Per-settlement personal bankroll credits + running total (oldest first).
 * @param {object} args
 * @param {object} args.deal
 * @param {object[]} [args.slices]
 * @param {object[]} [args.settlements]
 * @returns {{ total: number, items: { id: string, at: string, kind: string, label: string, credit: number }[] }}
 */
export function archivedStakePersonalBankrollBreakdown({ deal, slices = [], settlements = [] }) {
  /** @type {{ id: string, at: string, kind: string, label: string, credit: number }[]} */
  const items = []
  const ordered = [...(settlements || [])]
    .filter((st) => st?.created_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  for (const st of ordered) {
    const credit = settlementPlayerPersonalCredit(st, deal, slices)
    const isClose = isCloseSettlement(st, deal, settlements)
    items.push({
      id: st.id,
      at: st.created_at,
      kind: isClose ? 'close' : 'settlement',
      label: isClose ? 'Close settle' : 'Periodic settle',
      credit: roundMoney(credit),
    })
  }

  const total = roundMoney(items.reduce((sum, row) => sum + row.credit, 0))
  return { total, items }
}

/**
 * Backer's slice on a deal (viewer as staker).
 * @param {object[]} [slices]
 * @param {string} [viewerUserId]
 */
export function viewerBackingSlice(slices = [], viewerUserId) {
  if (!viewerUserId) return null
  return (
    (slices || []).find(
      (s) => s.staker_user_id === viewerUserId && s.status !== 'declined' && s.status !== 'cancelled',
    ) || null
  )
}

/**
 * Backer backing-bankroll credit from one settlement row (matches settle RPC slice loop).
 * @param {object} st
 * @param {object} deal
 * @param {object} slice
 * @param {object} [line] optional persisted settlement line for this slice
 */
export function settlementBackerCredit(st, deal, slice, line = null) {
  if (!st || !slice) return 0
  if (line) {
    let credit = roundMoney(
      (Number(line.profit_share) || 0) + (Number(line.rakeback_share) || 0),
    )
    if (line.direction === 'staker_to_player') credit = -credit
    return credit
  }

  const profit = Number(st.profit_above_baseline) || 0
  const shares = computeSliceSettleShares(slice, profit, Number(st.rakeback_total) || 0)
  let credit = roundMoney(shares.profitShare + shares.rakebackShare)
  if (shares.totalOwed < 0) credit = -credit
  return credit
}

/**
 * Per-settlement backing credits for one backer's slice + running total (oldest first).
 * @param {object} args
 * @param {object} args.deal
 * @param {object[]} [args.slices]
 * @param {object[]} [args.settlements]
 * @param {string} [args.viewerUserId]
 * @param {Record<string, object[]>} [args.settlementLinesBySettlement]
 */
export function archivedStakeBackerEconomicsBreakdown({
  deal,
  slices = [],
  settlements = [],
  viewerUserId,
  settlementLinesBySettlement = {},
}) {
  const slice = viewerBackingSlice(slices, viewerUserId)
  if (!slice) return { total: 0, items: [], slice: null }

  /** @type {{ id: string, at: string, kind: string, label: string, credit: number }[]} */
  const items = []
  const ordered = [...(settlements || [])]
    .filter((st) => st?.created_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  for (const st of ordered) {
    const lines = settlementLinesBySettlement[st.id] || []
    const line = lines.find((row) => row.slice_id === slice.id) || null
    const credit = settlementBackerCredit(st, deal, slice, line)
    const isClose = isCloseSettlement(st, deal, settlements)
    items.push({
      id: st.id,
      at: st.created_at,
      kind: isClose ? 'close' : 'settlement',
      label: isClose ? 'Close settle' : 'Periodic settle',
      credit: roundMoney(credit),
    })
  }

  const total = roundMoney(items.reduce((sum, row) => sum + row.credit, 0))
  return { total, items, slice }
}

/** @param {object} args */
export function archivedStakeBackerSessionShareTotal({ deal, slices = [], sessions = [], viewerUserId }) {
  const slice = viewerBackingSlice(slices, viewerUserId)
  if (!slice || !deal?.id) return 0
  return roundMoney(
    (sessions || [])
      .filter((s) => s.deal_id === deal.id && s.status !== 'active')
      .reduce((sum, session) => sum + backerSliceSessionEconomicShare(deal, slice, session, sessions), 0),
  )
}

/** @param {string[]} names */
function formatBackerList(names) {
  const unique = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))]
  if (!unique.length) return 'backers'
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
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
    const credit = settlementPlayerPersonalCredit(st, deal, slices)
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
 * @param {Record<string, object[]>} [args.ledgerEntriesByDeal]
 * @returns {{ id: string, kind: string, at: string, text: string }[]}
 */
export function buildPersonalSettlementHistoryEvents({
  dealsById = {},
  settlementsByDeal = {},
  slicesByDeal = {},
  ledgerEntriesByDeal = {},
  viewerUserId = null,
}) {
  /** @type {{ id: string, kind: string, at: string, text: string }[]} */
  const events = []

  for (const [dealId, settlements] of Object.entries(settlementsByDeal)) {
    const deal = dealsById[dealId]
    if (!deal || !settlements?.length) continue
    const slices = slicesByDeal[dealId] || []
    const ledgerEntries = ledgerEntriesByDeal[dealId] || []
    const ledgerBySettlement = {}
    for (const entry of ledgerEntries) {
      if (viewerUserId && entry.user_id !== viewerUserId) continue
      if (entry.settlement_id) ledgerBySettlement[entry.settlement_id] = entry.message
    }

    for (const st of settlements) {
      if (!st?.created_at) continue
      const ledgerText = ledgerBySettlement[st.id]
      if (ledgerText) {
        const isClose = isCloseSettlement(st, deal, settlements)
        events.push({
          id: `settle-${st.id}`,
          kind: isClose ? 'close' : 'settlement',
          at: st.created_at,
          text: ledgerText,
        })
        continue
      }
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
 * @param {object[]} [args.reductions]
 * @param {object[]} [args.settlements]
 * @param {object[]} [args.ledgerEntries]
 * @param {string} [args.playerUserId]
 * @param {string} [args.viewerUserId]
 * @returns {{ id: string, kind: string, at: string, text: string }[]}
 */
export function buildStakeDealHistoryEvents({
  deal,
  slices = [],
  profilesById = {},
  topups = [],
  reductions = [],
  settlements = [],
  ledgerEntries = [],
  playerUserId,
  viewerUserId,
  playerLabel = 'You',
}) {
  if (!deal?.id) return []

  const stakeeId = playerUserId || deal.stakee_user_id
  const viewerId = viewerUserId || stakeeId
  const backerInitiated = isBackerInitiatedBackingDeal(deal)
  const viewerIsStakee = Boolean(viewerId && deal.stakee_user_id && viewerId === deal.stakee_user_id)
  const viewerIsLeadBacker = Boolean(viewerId && deal.staker_user_id && viewerId === deal.staker_user_id)
  const ledgerBySettlement = {}
  for (const entry of ledgerEntries) {
    if (!entry?.settlement_id || entry.user_id !== stakeeId) continue
    ledgerBySettlement[entry.settlement_id] = entry.message
  }

  /** @type {{ id: string, kind: string, at: string, text: string }[]} */
  const events = []
  for (const entry of ledgerEntries) {
    if (!entry?.created_at || !entry?.message) continue
    if (entry.entry_kind === 'session_deleted' || entry.entry_kind === 'sessions_detached') {
      events.push({
        id: `ledger-${entry.id}`,
        kind: entry.entry_kind,
        at: entry.created_at,
        text: entry.message,
      })
    }
  }
  const orderedSlices = [...slices].sort(
    (a, b) => Number(a.slice_index ?? 0) - Number(b.slice_index ?? 0),
  )
  const backerNames = orderedSlices
    .filter((s) => s.status !== 'declined')
    .map((s) => sliceCounterpartyDisplayName(s, profilesById))
  const leadBackerName = dealLeadBackerDisplayName(deal, profilesById) || formatBackerList(backerNames)
  const stakeeName = dealStakeeDisplayName(deal, profilesById)

  if (deal.created_at && backerNames.length) {
    if (backerInitiated) {
      if (viewerIsLeadBacker) {
        events.push({
          id: `offer-${deal.id}`,
          kind: 'offer',
          at: deal.created_at,
          text: `You offered stake to ${stakeeName}`,
        })
      } else if (viewerIsStakee && deal.status === 'pending') {
        events.push({
          id: `offer-${deal.id}`,
          kind: 'offer',
          at: deal.created_at,
          text: `${leadBackerName} offered you a backing stake`,
        })
      }
    } else {
      events.push({
        id: `offer-${deal.id}`,
        kind: 'offer',
        at: deal.created_at,
        text: `${playerLabel} offered stake to ${formatBackerList(backerNames)}`,
      })
    }
  }

  if (
    backerInitiated &&
    deal.responded_at &&
    (deal.status === 'active' || deal.status === 'settled')
  ) {
    if (viewerIsStakee) {
      events.push({
        id: `stakee-accept-${deal.id}`,
        kind: 'accept',
        at: deal.responded_at,
        text: `You accepted stake terms with ${leadBackerName}`,
      })
    } else if (viewerIsLeadBacker) {
      events.push({
        id: `stakee-accept-${deal.id}`,
        kind: 'accept',
        at: deal.responded_at,
        text: `${stakeeName} accepted your stake terms`,
      })
    }
  }

  const dealCreatedMs = deal.created_at ? new Date(deal.created_at).getTime() : 0

  for (const slice of orderedSlices) {
    const name = sliceCounterpartyDisplayName(slice, profilesById)
    const at = slice.responded_at || slice.created_at
    if (!at) continue

    if (slice.status === 'active' && slice.counterparty_kind === 'user') {
      if (backerInitiated && slice.staker_user_id === deal.staker_user_id) continue
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

  for (const reduction of reductions) {
    if (!reduction?.created_at) continue
    const amt = Number(reduction.amount)
    if (!Number.isFinite(amt) || amt <= 0) continue
    events.push({
      id: `reduction-${reduction.id}`,
      kind: 'reduction',
      at: reduction.created_at,
      text: `Reduce stake ${fmtPoker$(amt)}`,
    })
  }

  for (const st of settlements) {
    if (!st?.created_at) continue
    const ledgerText = ledgerBySettlement[st.id]
    if (ledgerText) {
      const isClose = isCloseSettlement(st, deal, settlements)
      events.push({
        id: `settle-${st.id}`,
        kind: isClose ? 'close' : 'settlement',
        at: st.created_at,
        text: ledgerText,
      })
      continue
    }
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

  if (deal.status === 'revoked' && deal.responded_at) {
    const revokedSlice = orderedSlices.find(
      (slice) =>
        slice.status === 'declined' &&
        slice.responded_at &&
        slice.counterparty_kind === 'user',
    )
    const revokerName = revokedSlice
      ? sliceCounterpartyDisplayName(revokedSlice, profilesById)
      : 'Backer'
    events.push({
      id: `revoke-${deal.id}`,
      kind: 'revoke',
      at: deal.responded_at,
      text: `${revokerName} revoked stake`,
    })
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

/**
 * Full archived stake timeline: sessions + deal events, newest first.
 * @param {object} args
 * @param {object} args.deal
 * @param {object[]} [args.slices]
 * @param {Record<string, object>} [args.profilesById]
 * @param {object[]} [args.topups]
 * @param {object[]} [args.reductions]
 * @param {object[]} [args.settlements]
 * @param {object[]} [args.sessions]
 * @param {string} [args.playerLabel]
 * @param {string} [args.viewerUserId]
 * @returns {{ id: string, kind: string, at: string, text?: string, session?: object }[]}
 */
export function buildFullStakeArchiveTimeline({
  deal,
  slices = [],
  profilesById = {},
  topups = [],
  reductions = [],
  settlements = [],
  sessions = [],
  playerLabel = 'You',
  viewerUserId,
}) {
  const events = buildStakeDealHistoryEvents({
    deal,
    slices,
    profilesById,
    topups,
    reductions,
    settlements,
    playerLabel,
    viewerUserId,
  })
  /** @type {{ id: string, kind: string, at: string, text?: string, session?: object }[]} */
  const items = events.map((event) => ({
    id: event.id,
    kind: event.kind,
    at: event.at,
    text: event.text,
  }))
  for (const session of sessions) {
    const at = session.end_at || session.start_at
    if (!at) continue
    items.push({
      id: `session-${session.id}`,
      kind: 'session',
      at,
      session,
    })
  }
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
