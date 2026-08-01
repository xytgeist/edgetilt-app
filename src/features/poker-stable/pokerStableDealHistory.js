import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { sliceCounterpartyDisplayName } from './pokerStableTerms.js'

/** @param {string[]} names */
function formatBackerList(names) {
  if (!names.length) return 'backers'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
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
    const profit = Number(st.profit_above_baseline) || 0
    const makeup = Number(st.makeup_at_settle) || 0
    let text = 'Settled'
    if (makeup > 0.005) {
      text = `Settled · ${fmtPoker$(makeup)} makeup cleared`
    } else if (profit > 0.005) {
      text = `Settled · ${fmtPoker$(profit)} above baseline`
    } else if (profit < -0.005) {
      text = `Settled · ${fmtPoker$(Math.abs(profit))} underwater`
    }
    events.push({
      id: `settle-${st.id}`,
      kind: 'settlement',
      at: st.created_at,
      text,
    })
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
