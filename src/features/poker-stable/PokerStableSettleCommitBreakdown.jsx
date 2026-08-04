import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { settlementBackerCredit } from './pokerStableDealHistory.js'
import { stableNum } from './pokerStableMath.js'
import { sliceDisplayName } from './pokerStableApi.js'
import { dealHasMakeup } from './pokerStableTerms.js'
import { STABLE_BACKER_BANKROLL_PHRASE } from './pokerStableBooksCopy.js'

function sliceTermsLabel(slice) {
  if (!slice) return ''
  const action = `${stableNum(slice.action_pct)}% action`
  if (slice.pricing_mode === 'markup') {
    return `${action} · ${stableNum(slice.markup_rate)}× markup`
  }
  return `${action} · ${stableNum(slice.player_profit_pct)}% player split`
}

/** @param {object} line */
function playerSliceSettleDelta(line) {
  const amt = stableNum(line.total_owed)
  return line.direction === 'player_to_staker' ? -amt : amt
}

/**
 * Money breakdown for reviewing a counterparty-recorded periodic/close settle commit.
 */
export default function PokerStableSettleCommitBreakdown({
  deal,
  settlement,
  lines = [],
  calc,
  slices = [],
  profilesById = {},
  isStakee = false,
  isCloseSettle = false,
  viewerUserId = null,
}) {
  if (!settlement || !calc) return null

  const baselineAtSettle = stableNum(settlement.baseline_at_settle)
  const rollAtSettle = stableNum(settlement.roll_at_settle)
  const profitAbove = stableNum(settlement.profit_above_baseline)
  const makeupAtSettle = stableNum(settlement.makeup_at_settle)
  const rakebackTotal = stableNum(settlement.rakeback_total)
  const stakeReduction = stableNum(settlement.stake_reduction_total)
  const baselineAfter = Math.max(0, baselineAtSettle - stakeReduction)
  const showMakeup = dealHasMakeup(deal) && makeupAtSettle > 0.005
  const playerCredit = stableNum(calc.player_net)

  const viewerSlice =
    !isStakee && viewerUserId
      ? (slices || []).find(
          (slice) =>
            slice.status === 'active' &&
            slice.counterparty_kind === 'user' &&
            slice.staker_user_id === viewerUserId,
        ) || null
      : null
  const viewerLine = viewerSlice
    ? (lines || []).find((line) => line.slice_id === viewerSlice.id) || null
    : null
  const viewerBackerCredit =
    viewerSlice && settlement
      ? settlementBackerCredit(settlement, deal, viewerSlice, viewerLine)
      : 0

  return (
    <div data-poker-stable-settle-commit-breakdown className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Roll at settle
          </div>
          <div className="mt-1 text-sm font-bold tabular-nums text-white">
            {fmtPoker$(rollAtSettle)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Baseline at settle
          </div>
          <div className="mt-1 text-sm font-bold tabular-nums text-white">
            {fmtPoker$(baselineAtSettle)}
          </div>
        </div>
      </div>

      <div
        className={`grid gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-3 text-center ${
          showMakeup ? 'grid-cols-2' : 'grid-cols-1'
        }`}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Profit above baseline
          </div>
          <div
            className={`mt-1 text-base font-bold tabular-nums ${
              profitAbove >= 0 ? 'text-emerald-400' : 'text-zinc-300'
            }`}
          >
            {fmtPoker$(profitAbove)}
          </div>
        </div>
        {showMakeup ? (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Makeup</div>
            <div className="mt-1 text-base font-bold tabular-nums text-amber-300/90">
              {fmtPoker$(makeupAtSettle)}
            </div>
          </div>
        ) : null}
      </div>

      {isStakee && profitAbove > 0.005 && lines.length ? (
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/40 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Backer shares from profit
          </div>
          <div className="space-y-2">
            {lines.map((line) => {
              const slice = slices.find((row) => row.id === line.slice_id)
              if (!slice) return null
              const playerDelta = playerSliceSettleDelta(line)
              const profitShare = stableNum(line.profit_share)
              const rakebackShare = stableNum(line.rakeback_share)
              return (
                <div
                  key={line.id || line.slice_id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                >
                  <div className="text-sm font-semibold text-zinc-100">
                    {sliceDisplayName(slice, profilesById)}
                  </div>
                  <div className="text-[11px] text-zinc-500">{sliceTermsLabel(slice)}</div>
                  {profitShare > 0.005 ? (
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-400">Profit share to backer</span>
                      <span className="font-semibold tabular-nums text-rose-300">
                        −{fmtPoker$(profitShare)}
                      </span>
                    </div>
                  ) : null}
                  {rakebackShare > 0.005 ? (
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-400">Rakeback share to backer</span>
                      <span className="font-semibold tabular-nums text-rose-300">
                        −{fmtPoker$(rakebackShare)}
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-400">Your net on this slice</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        playerDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {playerDelta >= 0 ? '+' : '−'}
                      {fmtPoker$(Math.abs(playerDelta))}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {rakebackTotal > 0.005 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Total rakeback in this settle: {fmtPoker$(rakebackTotal)}
            </p>
          ) : null}
        </div>
      ) : null}

      {!isStakee && viewerSlice ? (
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-cyan-300/80">
            Credit to {STABLE_BACKER_BANKROLL_PHRASE}
          </div>
          <div
            className={`mt-1 text-xl font-black tabular-nums ${
              viewerBackerCredit >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {viewerBackerCredit >= 0 ? '+' : '−'}
            {fmtPoker$(Math.abs(viewerBackerCredit))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Your slice: {sliceDisplayName(viewerSlice, profilesById)} · {sliceTermsLabel(viewerSlice)}
          </p>
        </div>
      ) : null}

      {isStakee ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/30 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80">
            Credit to personal bankroll
          </div>
          <div
            className={`mt-1 text-xl font-black tabular-nums ${
              playerCredit >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {playerCredit >= 0 ? '+' : '−'}
            {fmtPoker$(Math.abs(playerCredit))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            {isCloseSettle
              ? 'Commit credits your personal Poker bankroll, closes the stake, and moves its sessions onto your personal timeline.'
              : `Commit credits your personal Poker bankroll. Stake roll resets to ${fmtPoker$(baselineAtSettle)}`}
            {stakeReduction > 0.005
              ? `, then reduces to ${fmtPoker$(baselineAfter)}`
              : ''}
            {!isCloseSettle ? ' and the stake stays open for more sessions.' : ''}
          </p>
        </div>
      ) : null}

      {stakeReduction > 0.005 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
          Stake reduction: {fmtPoker$(stakeReduction)}. Baseline after commit:{' '}
          {fmtPoker$(baselineAfter)}.
        </div>
      ) : null}
    </div>
  )
}
