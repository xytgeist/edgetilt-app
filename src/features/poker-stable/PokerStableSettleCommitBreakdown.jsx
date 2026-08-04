import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { settlementBackerCredit } from './pokerStableDealHistory.js'
import { dealTypeLabel, stableNum } from './pokerStableMath.js'
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

/** Player review of a counterparty-recorded periodic or close settle commit. */
function PlayerSettleCommitReview({
  deal,
  settlement,
  calc,
  isCloseSettle = false,
}) {
  const baselineAtSettle = stableNum(settlement.baseline_at_settle)
  const rollAtSettle = stableNum(settlement.roll_at_settle)
  const profitAbove = stableNum(settlement.profit_above_baseline)
  const makeupAtSettle = stableNum(settlement.makeup_at_settle)
  const stakeReduction = stableNum(settlement.stake_reduction_total)
  const baselineAfter = Math.max(0, baselineAtSettle - stakeReduction)
  const showMakeup = dealHasMakeup(deal)
  const playerCredit = stableNum(calc.player_net)
  const label = deal?.label?.trim() || dealTypeLabel(deal?.deal_type)

  return (
    <div data-poker-stable-player-settle-review className="mb-4 space-y-4">
      <p className="text-sm text-zinc-300">
        <span className="font-semibold text-white">{label}</span>
        {' · '}
        Roll {fmtPoker$(rollAtSettle)} · Baseline {fmtPoker$(baselineAtSettle)}
      </p>

      <div
        data-poker-stable-settle-commit-summary
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

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/30 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80">
          Credit to personal bankroll
        </div>
        <div
          className={`mt-1 text-xl font-black tabular-nums ${
            playerCredit >= 0 ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          {playerCredit >= 0 ? '+' : ''}
          {fmtPoker$(playerCredit)}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          {isCloseSettle
            ? `Commit adds this to your personal Poker bankroll, archives the stake, and moves its sessions onto your personal timeline.`
            : `Commit adds this to your personal Poker bankroll.`}
        </p>
      </div>

      {isCloseSettle ? (
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/40 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Stake after commit
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            This stake closes. Roll was {fmtPoker$(rollAtSettle)} at settlement; it will no longer
            appear on your active stake carousel.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/40 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Stake card after commit
          </div>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">Now (until you commit)</span>
              <span className="font-bold tabular-nums text-white">{fmtPoker$(rollAtSettle)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">After commit</span>
              <span className="font-bold tabular-nums text-emerald-300">
                {fmtPoker$(baselineAfter)}
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Stake roll resets to {fmtPoker$(baselineAtSettle)}
            {stakeReduction > 0.005
              ? `, then reduces to ${fmtPoker$(baselineAfter)}`
              : ''}
            . The stake stays open for more sessions.
          </p>
        </div>
      )}
    </div>
  )
}

/** Backer review of a counterparty-recorded settle commit. */
function BackerSettleCommitReview({
  deal,
  settlement,
  lines = [],
  slices = [],
  profilesById = {},
  viewerUserId = null,
}) {
  const viewerSlice =
    (slices || []).find(
      (slice) =>
        slice.status === 'active' &&
        slice.counterparty_kind === 'user' &&
        slice.staker_user_id === viewerUserId,
    ) || null
  const viewerLine = viewerSlice
    ? (lines || []).find((line) => line.slice_id === viewerSlice.id) || null
    : null
  const viewerBackerCredit =
    viewerSlice && settlement
      ? settlementBackerCredit(settlement, deal, viewerSlice, viewerLine)
      : 0

  if (!viewerSlice) {
    return (
      <p className="mb-4 rounded-2xl border border-zinc-700/80 bg-zinc-900/50 px-3 py-2 text-xs leading-relaxed text-zinc-400">
        Commit applies this settlement to your books.
      </p>
    )
  }

  return (
    <div data-poker-stable-backer-settle-review className="mb-4 space-y-3">
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
    </div>
  )
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

  if (isStakee) {
    return (
      <PlayerSettleCommitReview
        deal={deal}
        settlement={settlement}
        calc={calc}
        isCloseSettle={isCloseSettle}
      />
    )
  }

  return (
    <BackerSettleCommitReview
      deal={deal}
      settlement={settlement}
      lines={lines}
      slices={slices}
      profilesById={profilesById}
      viewerUserId={viewerUserId}
    />
  )
}
