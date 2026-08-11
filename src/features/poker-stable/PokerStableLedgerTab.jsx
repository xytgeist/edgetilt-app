import { useMemo } from 'react'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { sliceDisplayName } from './pokerStableApi.js'

/** @typedef {{ title: string, detail: string }} LedgerKindCopy */

/** @type {Record<string, LedgerKindCopy>} */
const KIND_COPY = {
  deposit: {
    title: 'Deposit',
    detail: 'Manual credit to your backing bankroll.',
  },
  withdraw: {
    title: 'Withdrawal',
    detail: 'Manual debit from your backing bankroll.',
  },
  set_balance: {
    title: 'Set balance',
    detail: 'Backing bankroll set to a new balance.',
  },
  auto_top_up: {
    title: 'Automatic adjustment',
    detail: 'Capital automatically credited to cover a stake funding shortfall.',
  },
  seed_reverse: {
    title: 'Automatic adjustment reversed',
    detail: 'Auto-credited capital removed after the stake offer ended.',
  },
  stake_deploy: {
    title: 'Stake funded',
    detail: 'Capital moved from backing bankroll into the stake.',
  },
  stake_release: {
    title: 'Stake released',
    detail: 'Capital returned to backing bankroll from a released stake.',
  },
  close_return: {
    title: 'Close return',
    detail: 'Stake value returned to backing bankroll on close.',
  },
  markup_refund: {
    title: 'Unused markup',
    detail: 'Unused prepaid markup returned to backing bankroll.',
  },
  settle: {
    title: 'Settle',
    detail: 'Settlement credit or debit on backing bankroll.',
  },
  stake_top_up: {
    title: 'Stake top-up',
    detail: 'Additional capital funded into an open stake.',
  },
  stake_reduction: {
    title: 'Stake reduction',
    detail: 'Capital returned after a stake reduction.',
  },
  manual: {
    title: 'Adjustment',
    detail: 'Backing bankroll adjustment.',
  },
}

function kindCopy(kind) {
  const key = String(kind || 'manual').trim() || 'manual'
  return KIND_COPY[key] || KIND_COPY.manual
}

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Backing bankroll cash ledger (in / out), newest first.
 */
export default function PokerStableLedgerTab({
  adjustments = [],
  horseDeals = [],
  slicesByDeal = {},
  profilesById = {},
  userId,
}) {
  const dealLabelById = useMemo(() => {
    /** @type {Record<string, string>} */
    const map = {}
    for (const deal of horseDeals || []) {
      if (!deal?.id) continue
      const slices = slicesByDeal[deal.id] || []
      const slice =
        slices.find((s) => s.staker_user_id === userId) || slices[0] || {}
      const label =
        String(deal.label || '').trim() ||
        sliceDisplayName(slice, profilesById) ||
        'Stake'
      map[deal.id] = label
    }
    return map
  }, [horseDeals, slicesByDeal, profilesById, userId])

  const rows = useMemo(() => {
    return [...(adjustments || [])]
      .filter((row) => Number(row?.amount) !== 0)
      .sort((a, b) => {
        const ta = new Date(a.occurred_at || a.created_at).getTime()
        const tb = new Date(b.occurred_at || b.created_at).getTime()
        return tb - ta
      })
  }, [adjustments])

  if (!rows.length) {
    return (
      <div data-poker-stable-ledger className="pb-4">
        <p className="py-8 text-center text-sm text-zinc-500">
          No bankroll moves yet. Deposits, automatic adjustments, stake funding,
          and close returns show up here.
        </p>
      </div>
    )
  }

  return (
    <div data-poker-stable-ledger className="pb-4">
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        Every cash move in or out of your liquid backing bankroll ... including
        automatic adjustments when a stake needs more capital than you have
        liquid.
      </p>
      {/* px/py give soft shadows room inside the overflow scroll parent */}
      <div className="space-y-2.5 px-0.5 py-0.5">
        {rows.map((row) => {
          const amount = Number(row.amount) || 0
          const inflow = amount > 0
          const copy = kindCopy(row.kind)
          const note = String(row.note || '').trim()
          const dealLabel = row.deal_id ? dealLabelById[row.deal_id] : null
          const subtitle = note || copy.detail
          return (
            <div
              key={row.id}
              data-poker-stable-ledger-row
              data-elevated-card="surface"
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{copy.title}</div>
                  <div className="mt-0.5 text-xs leading-snug text-zinc-500">
                    {subtitle}
                  </div>
                  {dealLabel ? (
                    <div className="mt-0.5 text-[11px] text-zinc-600">{dealLabel}</div>
                  ) : null}
                  <div className="mt-1 text-[11px] tabular-nums text-zinc-600">
                    {formatWhen(row.occurred_at || row.created_at)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`text-sm font-bold tabular-nums ${
                      inflow ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {inflow ? '+' : '−'}
                    {fmtPoker$(Math.abs(amount))}
                  </div>
                  {row.balance_after != null ? (
                    <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">
                      Bal {fmtPoker$(Number(row.balance_after) || 0)}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
