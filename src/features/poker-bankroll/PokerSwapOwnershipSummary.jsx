import { useMemo } from 'react'
import {
  computeMySideSwapTotalPct,
  computeSwapOwnershipStats,
} from './pokerSwapOwnershipSummary.js'

/**
 * Remaining swap room after stable backing (shown on session details + active swap modal).
 */
export default function PokerSwapOwnershipSummary({
  maxSwapGivePct = 100,
  draftSwaps = [],
  savedSwaps = [],
  incomingAcceptSwap = null,
  userId,
  compact = false,
}) {
  const mySideTotalPct = useMemo(
    () =>
      computeMySideSwapTotalPct({
        draftSwaps,
        savedSwaps,
        incomingAcceptSwap,
        userId,
      }),
    [draftSwaps, savedSwaps, incomingAcceptSwap, userId],
  )

  const { swapCapPct, backingSoldPct, remainingSwapPct, mySideOver } = useMemo(
    () => computeSwapOwnershipStats(maxSwapGivePct, mySideTotalPct),
    [maxSwapGivePct, mySideTotalPct],
  )

  const hasAnySwaps =
    draftSwaps.length > 0 || savedSwaps.length > 0 || Boolean(incomingAcceptSwap)

  return (
    <div
      className={`mb-3 rounded-2xl border px-3 py-2 ${
        mySideOver
          ? 'border-rose-500/40 bg-rose-950/30'
          : compact
            ? 'border-zinc-700/70 bg-zinc-900/50'
            : 'border-cyan-500/25 bg-cyan-950/20'
      }`}
      data-poker-swap-ownership-summary
    >
      {backingSoldPct > 0 ? (
        <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-white/5 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            You keep (after backing)
          </span>
          <span className="text-sm font-bold tabular-nums text-zinc-200">{swapCapPct}%</span>
        </div>
      ) : null}
      {hasAnySwaps ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Your side swapped
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${
              mySideOver ? 'text-rose-300' : 'text-white'
            }`}
          >
            {mySideTotalPct}%
          </span>
        </div>
      ) : null}
      <div
        className={`flex items-baseline justify-between gap-2 ${
          hasAnySwaps ? 'mt-2 border-t border-white/5 pt-2' : ''
        }`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Remaining to swap
        </span>
        <span
          className={`text-base font-bold tabular-nums ${
            mySideOver ? 'text-rose-300' : 'text-cyan-200'
          }`}
        >
          {remainingSwapPct}%
        </span>
      </div>
      {mySideOver ? (
        <p className="mt-1 text-[11px] text-rose-300/90">
          Over your limit ... max {swapCapPct}% is yours to swap
          {backingSoldPct > 0 ? ` (${backingSoldPct}% sold to backers)` : ''}.
        </p>
      ) : null}
    </div>
  )
}
