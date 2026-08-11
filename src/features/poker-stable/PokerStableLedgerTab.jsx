import { useMemo } from 'react'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { sliceDisplayName } from './pokerStableApi.js'
import { isBackerCapitalAdjustment } from './pokerStableBackerMath.js'

const KIND_LABELS = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  set_balance: 'Set balance',
  auto_top_up: 'Auto top-up',
  seed_reverse: 'Top-up reversed',
  stake_deploy: 'Stake funded',
  stake_release: 'Stake released',
  close_return: 'Close return',
  markup_refund: 'Unused markup',
  settle: 'Settle',
  stake_top_up: 'Stake top-up',
  stake_reduction: 'Stake reduction',
  manual: 'Adjustment',
}

function kindLabel(kind) {
  const key = String(kind || 'manual').trim() || 'manual'
  return KIND_LABELS[key] || 'Adjustment'
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
          No bankroll moves yet. Deposits, auto top-ups, stake funding, and close
          returns show up here.
        </p>
      </div>
    )
  }

  return (
    <div data-poker-stable-ledger className="pb-4">
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        Every cash move in or out of your liquid backing bankroll ... including
        automatic top-ups when you fund a stake.
      </p>
      <div className="space-y-2">
        {rows.map((row) => {
          const amount = Number(row.amount) || 0
          const inflow = amount > 0
          const dealLabel = row.deal_id ? dealLabelById[row.deal_id] : null
          const subtitle =
            String(row.note || '').trim() ||
            (dealLabel ? dealLabel : isBackerCapitalAdjustment(row) ? 'Capital' : 'Stake activity')
          return (
            <div
              key={row.id}
              data-poker-stable-ledger-row
              data-elevated-card="surface"
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
                    {kindLabel(row.kind)}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div>
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
